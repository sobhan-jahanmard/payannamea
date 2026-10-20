import importlib
import io
import json
import subprocess
import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from unittest.mock import patch

from common.runner import STEPS, build_parser, error_fingerprint, read_operator_note, recovery_start


class VisualRecoveryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.stage = importlib.import_module("common.steps.06a_plan_visuals")
        self.chart = {
            "id": "V01", "kind": "chart", "target_section": "بازار", "claim_supported": "ظرفیت",
            "data_or_source": "Full traceable source and assumptions", "reasoning_value": "Comparison",
            "caption": "ظرفیت", "plot_spec": {"title": "ظرفیت", "x_labels": ["A", "B"],
                                           "y_values": [1, 2], "y_unit": "tonnes/year", "source_note": "x" * 171},
        }
        self.diagram = {
            "id": "V02", "kind": "diagram", "target_section": "فرایند", "claim_supported": "جریان",
            "data_or_source": "Process ledger", "reasoning_value": "Explains flow", "caption": "فرایند",
        }

    def _context(self) -> dict:
        return {
            "order": {"quantity_type": "pages", "quantity_value": 20, "requires_charts": True},
            "artifacts": {"order_execution_contract": "planning/contract.md", "plan": "planning/outline.md",
                          "resolved_source_rules": "sources.md", "research_evidence": "research/evidence.json"},
        }

    def test_repair_uses_exact_validation_feedback_and_keeps_candidate(self) -> None:
        with TemporaryDirectory() as directory:
            workspace = Path(directory)
            plan = workspace / "planning" / "visual_plan.json"
            plan.parent.mkdir()
            plan.write_text(json.dumps({"visuals": [self.chart, self.diagram]}), encoding="utf-8")
            calls = []

            def run_codex(prompt: str, target: Path) -> None:
                calls.append((prompt, plan.exists()))
                self.assertIn("source_note has 171 characters; maximum 170", prompt)
                payload = json.loads(plan.read_text(encoding="utf-8"))
                payload["visuals"][0]["plot_spec"]["source_note"] = "Source, 2024, Iran; scenario assumption"
                plan.write_text(json.dumps(payload), encoding="utf-8")
                target.write_text("Repaired", encoding="utf-8")

            context = self._context()
            self.stage.run(context, SimpleNamespace(workspace=workspace, run_codex=run_codex))
            self.assertEqual(1, len(calls))
            self.assertTrue(calls[0][1])
            self.assertTrue(context["artifacts"]["visual_plan_changed"])

    def test_no_progress_stops_with_specific_error(self) -> None:
        with TemporaryDirectory() as directory:
            workspace = Path(directory)
            plan = workspace / "planning" / "visual_plan.json"
            plan.parent.mkdir()
            plan.write_text(json.dumps({"visuals": [self.chart, self.diagram]}), encoding="utf-8")

            def run_codex(prompt: str, target: Path) -> None:
                target.write_text("No change", encoding="utf-8")

            with self.assertRaisesRegex(RuntimeError, "made no progress.*source_note has 171 characters"):
                self.stage.run(self._context(), SimpleNamespace(workspace=workspace, run_codex=run_codex))

    def test_recovery_keeps_distinct_visual_ids_and_retries_generation_locally(self) -> None:
        self.assertNotEqual(
            error_fingerprint("06a_plan_visuals", RuntimeError("Chart V01 failed")),
            error_fingerprint("06a_plan_visuals", RuntimeError("Chart V02 failed")),
        )
        self.assertEqual("06b_generate_visual_assets", STEPS[recovery_start("06b_generate_visual_assets")])

    def test_desktop_operator_note_stdin_flag_is_accepted(self) -> None:
        args = build_parser().parse_args(["--step", "11", "--offline", "--operator-note-stdin"])
        self.assertEqual(11, args.step)
        self.assertTrue(args.operator_note_stdin)
        self.assertEqual("تلاش دوباره", read_operator_note(args, io.BytesIO("  تلاش دوباره\n".encode("utf-8"))))
        with self.assertRaisesRegex(SystemExit, "valid UTF-8"):
            read_operator_note(args, io.BytesIO(b"\x81"))

    def test_desktop_utf8_pipe_survives_json_save(self) -> None:
        with TemporaryDirectory() as directory:
            target = Path(directory) / "context.json"
            script = (
                "import sys; from pathlib import Path; "
                "from common.runner import build_parser, read_operator_note; "
                "from common.helpers import write_json; "
                "args = build_parser().parse_args(['--step', '11', '--operator-note-stdin']); "
                "write_json(Path(sys.argv[1]), {'operator_note': read_operator_note(args, sys.stdin.buffer)})"
            )
            note = "اصلاح نمودار، منبع معتبر و جغرافیای ایران؛ ۱۴۰۵"
            result = subprocess.run([sys.executable, "-c", script, str(target)], input=note.encode("utf-8"),
                                    cwd=Path(__file__).resolve().parents[1], capture_output=True, check=False)
            self.assertEqual(0, result.returncode, result.stderr.decode("utf-8", errors="replace"))
            self.assertEqual(note, json.loads(target.read_text(encoding="utf-8"))["operator_note"])

    def test_missing_manifest_is_repaired_in_generation_stage(self) -> None:
        generation = importlib.import_module("common.steps.06b_generate_visual_assets")
        with TemporaryDirectory() as directory:
            workspace = Path(directory)
            plan = workspace / "planning" / "visual_plan.json"
            plan.parent.mkdir()
            chart = json.loads(json.dumps(self.chart))
            chart["plot_spec"]["source_note"] = "Source, 2024, Iran"
            plan.write_text(json.dumps({"visuals": [chart, self.diagram]}), encoding="utf-8")
            calls = []

            def render_chart(item: dict, target: Path) -> None:
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(b"PNG")

            def run_codex(prompt: str, target: Path) -> None:
                calls.append(prompt)
                self.assertIn("manifest.json was not created", prompt)
                diagram_path = workspace / "final" / "figures" / "V02.png"
                diagram_path.write_bytes(b"PNG")
                figures = []
                for item in (chart, self.diagram):
                    figures.append({"id": item["id"], "path": f"final/figures/{item['id']}.png",
                                    "kind": item["kind"], "target_section": item["target_section"],
                                    "caption": item["caption"], "reasoning_value": item["reasoning_value"],
                                    "source_or_assumption": item.get("plot_spec", {}).get("source_note", "Process ledger")})
                (workspace / "final" / "figures" / "manifest.json").write_text(json.dumps({"figures": figures}), encoding="utf-8")
                target.write_text("Generated", encoding="utf-8")

            context = {"artifacts": {"visual_plan": "planning/visual_plan.json"}}
            with patch.object(generation, "render_chart", render_chart):
                generation.run(context, SimpleNamespace(workspace=workspace, run_codex=run_codex))
            self.assertEqual(1, len(calls))
            self.assertEqual("final/figures/manifest.json", context["artifacts"]["visual_manifest"].replace("\\", "/"))

    def _run_placement(self, directory, pass_after, stale_status="STATUS: FAIL"):
        stage = importlib.import_module("common.steps.07a_validate_visual_placement")
        workspace = Path(directory)
        figures = workspace / "final" / "figures"
        figures.mkdir(parents=True)
        (figures / "manifest.json").write_text(json.dumps({"figures": [
            {"id": "V01", "path": "final/figures/V01.png"}
        ]}), encoding="utf-8")
        (workspace / "final" / "source.md").write_text("# Section\n![Chart](figures/V01.png)", encoding="utf-8")
        reports = workspace / "reports"
        (reports / "stage_checks").mkdir(parents=True)
        audit = reports / "visual_argument_audit.md"
        audit.write_text(stale_status, encoding="utf-8")
        for attempt in range(1, 7):
            (reports / "stage_checks" / f"visual_argument_repair_{attempt}.md").write_text("Old repair", encoding="utf-8")
        calls = {"audit": 0, "repair": 0}

        def run_codex(prompt, target):
            # Match the production cache behavior so stale files cannot hide
            # a skipped audit or repair in this regression test.
            if target.exists() and target.read_text(encoding="utf-8").strip():
                return
            if target == audit:
                calls["audit"] += 1
                status = "PASS" if calls["repair"] >= pass_after else "FAIL"
                target.write_text(f"STATUS: {status}\nCurrent audit", encoding="utf-8")
            else:
                calls["repair"] += 1
                target.write_text("Current repair", encoding="utf-8")

        context = {"artifacts": {"source": "final/source.md"}}
        services = SimpleNamespace(workspace=workspace, run_codex=run_codex)
        return stage, context, services, calls

    def test_placement_reaudits_after_sixth_repair_despite_cached_reports(self):
        with TemporaryDirectory() as directory:
            stage, context, services, calls = self._run_placement(directory, 6)
            stage.run(context, services)
            self.assertEqual({"audit": 7, "repair": 6}, calls)
            self.assertIn("visual_argument_audit", context["artifacts"])

    def test_placement_does_not_trust_old_pass(self):
        with TemporaryDirectory() as directory:
            stage, context, services, calls = self._run_placement(directory, 1, "STATUS: PASS")
            stage.run(context, services)
            self.assertEqual({"audit": 2, "repair": 1}, calls)

    def test_placement_stops_after_bounded_fresh_attempts(self):
        with TemporaryDirectory() as directory:
            stage, context, services, calls = self._run_placement(directory, 100)
            with self.assertRaisesRegex(RuntimeError, "remained unresolved"):
                stage.run(context, services)
            self.assertEqual({"audit": 7, "repair": 6}, calls)
            self.assertNotIn("visual_argument_audit", context["artifacts"])


if __name__ == "__main__":
    unittest.main()
