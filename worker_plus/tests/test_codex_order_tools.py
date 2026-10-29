"""Behavior checks for conversation-driven tools, isolated from production orders."""
import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from codex_order_tools import BASE, CONTENT, OUTPUTS, OrderTools, hashes, main, signature
from common.helpers import write_json
from presentation.recovery import PresentationAuditError


SOURCE_TEXT = ("Alpha used 10 minutes and Beta used 20 minutes in the supplied classroom comparison. "
               "Only the recorded duration was compared; the source does not establish any broader performance claim.")


def create_fixture(root):
    import fitz
    source = root / "source.pdf"
    with fitz.open() as document:
        page = document.new_page()
        page.insert_textbox(fitz.Rect(50, 50, 550, 220), SOURCE_TEXT, fontsize=12)
        document.save(source)
    order = {"id": "codex-skill-test", "order_type": "ارائه و پاورپوینت", "title": "Recorded duration comparison",
             "course_name": "Classroom methods", "language": "english", "quantity_type": "slides", "quantity_value": 5,
             "files": [{"id": "source-1", "file_type": "information_source", "original_name": "source.pdf",
                        "size_bytes": source.stat().st_size, "local_path": str(source)}]}
    order_file = root / "order.json"
    write_json(order_file, order)
    tool = OrderTools(root / "order-workspace")
    tool.fetch(order_file=order_file)
    tool.prepare()
    tool.extract()
    sources = json.loads((tool.workspace / BASE[2]).read_text(encoding="utf-8"))
    segment = sources["sources"][0]["segments"][0]
    evidence = {"locator": segment["id"], "quote": segment["text"]}
    claims = {"claims": [{"id": "C1", "topic": "overview", "kind": "observed",
                          "statement": "Alpha used 10 minutes and Beta used 20 minutes.",
                          "evidence": evidence, "confidence": "high", "assumptions": [], "limitation": ""}]}
    candidate = root / "claims.json"
    write_json(candidate, claims)
    tool.validate("claims", candidate)
    write_json(root / "analysis.json", {"version": 1, "items": []})
    tool.validate("analysis", root / "analysis.json")
    slides = [{"section": "title", "layout": "title", "title": order["title"],
               "points": ["Classroom methods"], "notes": "Comparison of the recorded durations.", "evidence": []}]
    for section, title in [("problem", "Compare the recorded durations"), ("method", "Compare like units"),
                           ("results", "Alpha used less recorded time"), ("conclusion", "The comparison concerns duration only")]:
        slides.append({"section": section, "layout": "statement", "title": title,
                       "points": ["Alpha: 10 minutes", "Beta: 20 minutes"],
                       "notes": "The source compares recorded duration only; broader performance is not established.",
                       "evidence": [evidence], "claim_ids": ["C1"], "analysis_ids": []})
    slides[3].update({"layout": "chart", "caption": "Recorded duration (minutes)",
                      "chart": {"type": "column", "unit": "minutes", "categories": ["Alpha", "Beta"],
                                "series": [{"name": "Duration", "values": [10, 20]}]}})
    deck = {"slides": slides}
    write_json(root / "slides.json", deck)
    tool.validate("slides", root / "slides.json")
    return tool, order_file, claims, deck


def audit(tool, kind, path, status="PASS", issues=None, snapshot=None):
    value = tool.review_inputs(kind)["inputs"] if snapshot is None else snapshot
    payload = {"reviewed_slides": [1, 2, 3, 4, 5], "issues": issues or []}
    path.write_text(f"STATUS: {status}\nINPUTS_SHA256: " + json.dumps(value) + "\nISSUES_JSON: " + json.dumps(payload)
                    + "\nAll five slides inspected against the current supplied classroom source.\n", encoding="utf-8")
    return path


class CodexOrderToolTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.tool, self.order_file, self.claims, self.deck = create_fixture(self.root)

    def test_fetch_reuses_original_bytes_without_backend_writes(self):
        before = hashes(self.tool.workspace, CONTENT)
        with patch("codex_order_tools.api.claim_oldest") as claim, patch("codex_order_tools.api.submit_final") as upload:
            self.assertTrue(self.tool.fetch(order_file=self.order_file)["reused"])
            claim.assert_not_called()
            upload.assert_not_called()
        self.assertEqual(hashes(self.tool.workspace, CONTENT), before)

    def test_failed_candidates_preserve_valid_claims_analysis_and_slides(self):
        before = hashes(self.tool.workspace, CONTENT)
        invalid = self.root / "wrong-shape.json"
        write_json(invalid, {"version": 1, "items": []})
        with self.assertRaisesRegex(ValueError, "claims array"):
            self.tool.validate("claims", invalid)
        write_json(invalid, self.claims)
        with self.assertRaisesRegex(ValueError, "version 1 and items"):
            self.tool.validate("analysis", invalid)
        broken = copy.deepcopy(self.deck)
        broken["slides"][3]["chart"]["series"][0]["values"][0] = 999
        write_json(invalid, broken)
        with self.assertRaisesRegex(ValueError, "lacks a quoted"):
            self.tool.validate("slides", invalid)
        self.assertEqual(hashes(self.tool.workspace, CONTENT), before)

    def test_slide_edit_invalidates_dependent_review_but_keeps_upstream_checks(self):
        report = audit(self.tool, "content", self.root / "review.md")
        self.tool.review("content", report)
        self.assertTrue(self.tool.current("review_content"))
        changed = copy.deepcopy(self.deck)
        changed["slides"][1]["title"] = "Compare Alpha and Beta"
        candidate = self.root / "changed.json"
        write_json(candidate, changed)
        self.tool.validate("slides", candidate)
        self.assertFalse(self.tool.current("review_content"))
        for kind in ("sources", "claims", "analysis", "slides"):
            self.assertTrue(self.tool.current(kind), kind)

    def test_rejected_review_invalidates_previous_approval(self):
        report = audit(self.tool, "content", self.root / "review.md")
        self.tool.review("content", report)
        audit(self.tool, "content", report, "FAIL", [{"slide": 2, "message": "A specific source discrepancy"}])
        with self.assertRaises(PresentationAuditError):
            self.tool.review("content", report)
        self.assertFalse(self.tool.current("review_content"))

    def test_review_cannot_certify_a_different_model_than_inspected(self):
        report = audit(self.tool, "sources", self.root / "review.md")
        changed = copy.deepcopy(self.deck)
        changed["slides"][1]["title"] = "The current comparison"
        write_json(self.root / "changed.json", changed)
        self.tool.validate("slides", self.root / "changed.json")
        with self.assertRaisesRegex(ValueError, "snapshot missing or stale"):
            self.tool.review("sources", report)

    def test_source_tampering_blocks_downstream_actions(self):
        state = self.tool.state()
        source = next(p for p in state["input_hashes"] if p.startswith("input/"))
        with (self.tool.workspace / source).open("ab") as handle:
            handle.write(b"changed")
        self.assertFalse(self.tool.status()["original_inputs_current"])
        with self.assertRaisesRegex(ValueError, "Original order inputs changed"):
            self.tool.validate("slides")

    def test_unreviewed_package_cannot_publish(self):
        with patch("codex_order_tools.api.claim_oldest") as claim:
            with self.assertRaisesRegex(ValueError, "review_content"):
                self.tool.publish()
            claim.assert_not_called()

    def test_progress_is_saved_for_continuation(self):
        self.tool.progress(3, "Reading the supplied file")
        reopened = OrderTools(self.tool.workspace)
        self.assertEqual(reopened.status()["progress"][0]["step"], 3)
        self.assertTrue(reopened.status()["checks"]["slides"]["current"])

    def test_changed_remote_input_signature_is_detected(self):
        order = json.loads(self.order_file.read_text(encoding="utf-8"))
        changed = copy.deepcopy(order)
        changed["notes"] = "Different requirements"
        self.assertNotEqual(signature(order), signature(changed))

    def test_interrupted_fetch_can_resume_without_overwriting_other_workspaces(self):
        order = json.loads(self.order_file.read_text(encoding="utf-8"))
        order["files"][0]["local_path"] = str(self.root / "not-present.pdf")
        snapshot = self.root / "interrupted-order.json"
        write_json(snapshot, order)
        tool = OrderTools(self.root / "interrupted")
        with self.assertRaisesRegex(ValueError, "Local input missing"):
            tool.fetch(order_file=snapshot)
        order["files"][0]["local_path"] = str(self.root / "source.pdf")
        write_json(snapshot, order)
        tool.fetch(order_file=snapshot)
        self.assertTrue(tool.original_inputs_current())
        self.assertFalse((tool.workspace / "fetch_incomplete.json").exists())

    def test_backend_fetch_uses_get_without_claiming_or_starting_order(self):
        order = json.loads(self.order_file.read_text(encoding="utf-8"))
        order["files"][0]["url"] = "/uploads/source.pdf"
        raw = (self.root / "source.pdf").read_bytes()
        def download(_config, _url, target):
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(raw)
        tool = OrderTools(self.root / "remote-fetch", object())
        with patch("codex_order_tools.api.fetch_order_read_only", return_value=order), \
             patch("codex_order_tools.api.download_file", side_effect=download), \
             patch("codex_order_tools.api.claim_oldest") as claim, patch("codex_order_tools.api.heartbeat") as start:
            tool.fetch("https://example.invalid/admin/orders/codex-skill-test")
            self.assertTrue(tool.original_inputs_current())
            claim.assert_not_called()
            start.assert_not_called()

    def test_unknown_upload_outcome_prevents_automatic_duplicate(self):
        for output in OUTPUTS:
            (self.tool.workspace / output).write_bytes(b"publication transaction fixture")
        order = json.loads(self.order_file.read_text(encoding="utf-8"))
        with patch.object(self.tool, "finalize"), \
             patch("codex_order_tools.api.fetch_order_read_only", return_value=order), \
             patch("codex_order_tools.api.claim_oldest"), patch("codex_order_tools.api.heartbeat"), \
             patch("codex_order_tools.api.submit_final", side_effect=TimeoutError("unknown outcome")) as upload:
            with self.assertRaises(TimeoutError):
                self.tool.publish()
            with self.assertRaisesRegex(ValueError, "outcome is unknown"):
                self.tool.publish()
            self.assertEqual(upload.call_count, 1)

    def test_remote_changes_block_upload_before_claim(self):
        for output in OUTPUTS:
            (self.tool.workspace / output).write_bytes(b"publication transaction fixture")
        order = json.loads(self.order_file.read_text(encoding="utf-8"))
        order["quantity_value"] = 10
        with patch.object(self.tool, "finalize"), \
             patch("codex_order_tools.api.fetch_order_read_only", return_value=order), \
             patch("codex_order_tools.api.claim_oldest") as claim:
            with self.assertRaisesRegex(ValueError, "Remote order inputs changed"):
                self.tool.publish()
            claim.assert_not_called()

    def test_cli_reports_error_in_json(self):
        from contextlib import redirect_stdout
        from io import StringIO
        stream = StringIO()
        with redirect_stdout(stream):
            code = main(["status"])
        self.assertEqual(code, 1)
        self.assertFalse(json.loads(stream.getvalue())["ok"])


if __name__ == "__main__":
    unittest.main()
