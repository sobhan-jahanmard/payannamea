import json
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from uuid import uuid4

import ai_review
from common.runner import STEPS
from common.order_revision import choose_restart_stage


class AiReviewTests(unittest.TestCase):
    def test_review_requires_a_bounded_score_and_actionable_report(self):
        config = SimpleNamespace(codex_bin="codex", codex_model="model", codex_home=None)
        def respond(_command, **_kwargs):
            target = Path(_kwargs["cwd"]) / "review-result.json"
            target.write_text(json.dumps({"score": 16.5, "report": "گزارش " * 20,
                                          "fix_prompt": "اصلاح همین سفارش " * 15,
                                          "subscores": {"source_coverage": 4, "analysis_reproducibility": 4,
                                              "numeric_fidelity": 4, "structure_readability": 2.5, "assumptions_gaps": 2},
                                          "inspected_file_ids": ["F1", "F2"],
                                          "evidence_citations": [{"source_locator": "[F1:line-1; pages=unknown]", "output_locator": "[F2:line-1; pages=unknown]"}] * 2}, ensure_ascii=False), encoding="utf-8")
            return SimpleNamespace(returncode=0, stdout="")
        with patch.object(ai_review, "prepare_review", return_value=(["evidence/F1.txt"], ["evidence/F2.txt"])), \
             patch.object(ai_review, "review_packet", return_value=("Inline source and output text", [], {"F1", "F2"}, {"F1:line-1"}, {"F2:line-1"})), \
             patch.object(ai_review.subprocess, "run", side_effect=respond):
            result = ai_review.run_review(config, {"id": "job-1", "action": "review"})
        self.assertEqual(16.5, result["score"])
        def invalid(_command, **_kwargs):
            target = Path(_kwargs["cwd"]) / "review-result.json"
            target.write_text(json.dumps({"score": 21, "report": "گزارش " * 20,
                                          "fix_prompt": "اصلاح " * 20}, ensure_ascii=False), encoding="utf-8")
            return SimpleNamespace(returncode=0, stdout="")
        with patch.object(ai_review, "prepare_review", return_value=(["evidence/F1.txt"], ["evidence/F2.txt"])), \
             patch.object(ai_review, "review_packet", return_value=("Inline source and output text", [], {"F1", "F2"}, {"F1:line-1"}, {"F2:line-1"})), \
             patch.object(ai_review.subprocess, "run", side_effect=invalid):
            with self.assertRaisesRegex(ValueError, "score outside 0–20"):
                ai_review.run_review(config, {"id": "job-1", "action": "review"})
        with self.assertRaisesRegex(ValueError, "not all supplied files acknowledged"):
            ai_review.validate_review_response({"score": 0, "report": "دسترسی ممکن نشد. " * 10,
                "fix_prompt": "دسترسی به فایل‌ها را فعال کنید. " * 10,
                "subscores": {"source_coverage": 0, "analysis_reproducibility": 0,
                    "numeric_fidelity": 0, "structure_readability": 0, "assumptions_gaps": 0},
                "inspected_file_ids": [], "evidence_citations": []},
                {"F1", "F2"}, {"F1:line-1"}, {"F2:line-1"})

    def test_downloads_original_and_generated_files_with_distinct_roles(self):
        job = {"id": "job-1", "order": {"student_number": "12345", "files": [{"id": "input-1"}]}, "files": [
            {"id": "input-1", "name": "source.txt", "type": "information_source"},
            {"id": "output-1", "name": "result.txt", "type": "final"}]}
        with TemporaryDirectory() as folder, patch.object(ai_review, "_request") as request:
            request.side_effect = [SimpleNamespace(content=b"Source text with the factual claim."),
                                   SimpleNamespace(content=b"Generated result with the claim.")]
            inputs, outputs = ai_review.prepare_review(SimpleNamespace(worker_id="worker-plus-1"), job, Path(folder))
            self.assertEqual(["evidence/F1.txt"], inputs)
            self.assertEqual(["evidence/F2.txt"], outputs)
            manifest = json.loads((Path(folder) / "manifest.json").read_text(encoding="utf-8"))
            self.assertEqual("12345", manifest["order"]["student_number"])
            self.assertEqual(["input", "output"], [file["role"] for file in manifest["files"]])
            self.assertTrue((Path(folder) / "inputs/input-1.txt").is_file())
            self.assertTrue((Path(folder) / "outputs/output-1.txt").is_file())
            packet, images, ids, input_locators, output_locators = ai_review.review_packet(Path(folder))
            self.assertIn("Source text with the factual claim.", packet)
            self.assertIn("Generated result with the claim.", packet)
            self.assertEqual([], images)
            self.assertEqual({"F1", "F2"}, ids)
            self.assertEqual({"F1:line-1"}, input_locators)
            self.assertEqual({"F2:line-1"}, output_locators)

    def test_fix_uses_review_as_order_guidance_and_restarts_at_source_analysis(self):
        with TemporaryDirectory() as folder:
            root = Path(folder)
            workspace = root / "order_order-1"
            workspace.mkdir()
            context_path = workspace / "order_context.json"
            context_path.write_text(json.dumps({"order_id": "order-1", "status": "dry_run_complete",
                "completed_steps": STEPS, "order": {"order_type": "ارائه و پاورپوینت"}}), encoding="utf-8")
            for name in ("planning/presentation_claims.proposed.json", "planning/presentation_outline.proposed.json",
                         "final/presentation.json", "final/final.pptx"):
                path = workspace / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("old output", encoding="utf-8")
            config = SimpleNamespace(workspace_root=root, codex_bin="codex", codex_model="model",
                                     codex_home=None)
            job_id = str(uuid4())
            guidance = "برای همین سفارش موازنه جرم و مدل مالی را با منبع اصلی بازسازی کن."
            job = {"id": job_id, "order_id": "order-1", "order": {"order_type": "ارائه و پاورپوینت"},
                   "action": "fix", "status": "running", "local": True, "local_workspace": str(workspace),
                   "requested_prompt": guidance, "parent": {"report": "موازنه جرم ناقص است.",
                   "fix_prompt": guidance, "suggested_restart_stage": "07_generate_content"}}
            history = workspace / "reports" / "ai_reviews.json"
            history.parent.mkdir(parents=True)
            history.write_text(json.dumps({"jobs": [job]}, ensure_ascii=False), encoding="utf-8")

            def finish_run(_command, **_kwargs):
                self.assertIn(guidance, _kwargs["input"])
                self.assertIn("کد الگوریتم را ویرایش نکن", _kwargs["input"])
                context = json.loads(context_path.read_text(encoding="utf-8"))
                context["status"] = "dry_run_complete"
                context_path.write_text(json.dumps(context), encoding="utf-8")
                return SimpleNamespace(returncode=0)

            with patch.object(ai_review.subprocess, "run", side_effect=finish_run) as run:
                result = ai_review.run_fix(config, job)
            self.assertEqual("05c_research_evidence", result["restart_stage_id"])
            self.assertEqual([], result["applied_files"])
            command = run.call_args.args[0]
            self.assertEqual(str(STEPS.index("05c_research_evidence") + 1), command[command.index("--step") + 1])
            self.assertEqual("order_order-1", json.loads((root / "active.json").read_text(encoding="utf-8"))["path"])
            self.assertFalse((workspace / "planning/presentation_claims.proposed.json").exists())
            self.assertFalse((workspace / "planning/presentation_outline.proposed.json").exists())
            self.assertFalse((workspace / "final/presentation.json").exists())
            self.assertTrue((workspace / "final/final.pptx").exists())
            snapshot = Path(result["snapshot_path"])
            self.assertTrue((snapshot / "final/presentation.json").is_file())
            self.assertTrue((snapshot / "order_context.json").is_file())
            self.assertEqual("completed", json.loads((workspace / "reports/order_revisions" / f"{job_id}.json").read_text(encoding="utf-8"))["status"])

    def test_restart_stage_uses_first_dependency_and_edited_prompt(self):
        stage, _ = choose_restart_stage("ارائه و پاورپوینت",
            "منابع و موازنه جرم را تطبیق بده و نمودار بساز", STEPS, "07_generate_content")
        self.assertEqual("05c_research_evidence", stage)
        stage, _ = choose_restart_stage("ارائه و پاورپوینت", "فقط خوانایی اسلاید را اصلاح کن", STEPS)
        self.assertEqual("07_generate_content", stage)

    def test_local_review_reads_original_and_output_without_backend_and_persists_result(self):
        with TemporaryDirectory() as folder:
            root = Path(folder)
            workspace = root / "in_progress"
            source = workspace / "input" / "files" / "information_source__source.txt"
            output = workspace / "final" / "final.docx"
            source.parent.mkdir(parents=True)
            output.parent.mkdir(parents=True)
            source.write_text("Original thesis evidence", encoding="utf-8")
            output.write_bytes(b"Generated document")
            (workspace / "order_context.json").write_text(json.dumps({"order_id": "order-1", "order": {
                "title": "Research", "order_type": "تحقیق دانشگاهی", "files": [{
                    "id": "input-1", "original_name": "source.txt", "file_type": "information_source",
                    "size_bytes": source.stat().st_size}]}}), encoding="utf-8")
            archive = root / "order_order-1"
            archive.mkdir()
            (archive / "order_context.json").write_text('{"order_id":"order-1"}', encoding="utf-8")
            job = {"id": "review-1", "order_id": "order-1", "action": "review", "status": "queued",
                   "created_at": "2026-10-25T00:00:00Z"}
            ai_review._local_history_path(workspace).parent.mkdir(parents=True)
            ai_review._local_history_path(workspace).write_text(json.dumps({"jobs": [job]}), encoding="utf-8")
            config = SimpleNamespace(workspace_root=root)
            prepared = ai_review._local_job(config, workspace, job)
            with TemporaryDirectory() as review_folder, patch.object(ai_review, "_request", side_effect=AssertionError("backend called")), \
                 patch.object(ai_review, "extract_source", return_value={"segments": [{"id": "p1", "text": "readable"}]}):
                inputs, outputs = ai_review.prepare_review(config, prepared, Path(review_folder))
                self.assertEqual(1, len(inputs))
                self.assertEqual(1, len(outputs))
                manifest = json.loads((Path(review_folder) / "manifest.json").read_text(encoding="utf-8"))
                self.assertEqual(["input", "output"], [item["role"] for item in manifest["files"]])
            with patch.object(ai_review, "run_review", return_value={"status": "completed", "score": 15,
                    "report": "Source gaps verified.", "fix_prompt": "Improve source checks."}):
                ai_review.run_local_job(config, workspace, "review-1")
            saved = ai_review._local_jobs(workspace)[0]
            self.assertEqual("completed", saved["status"])
            self.assertEqual(15, saved["score"])
            self.assertIsNotNone(saved["finished_at"])
            self.assertEqual("completed", ai_review._local_jobs(archive)[0]["status"])
            for location in (workspace, archive):
                trace = json.loads((location / "order_context.json").read_text(encoding="utf-8"))["execution_trace"]
                self.assertEqual(15, trace["review_events"][0]["score"])


if __name__ == "__main__":
    unittest.main()
