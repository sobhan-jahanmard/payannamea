"""Review history and upload retry checks; no network or model calls."""
import copy
from pathlib import Path
import tempfile
import runpy
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from codex_order_tools import OrderTools, OUTPUTS, hashes, signature
from common.helpers import write_json
from common.local_reviews import collect_review_scores, sha, verify_review_scores


ORDER_ID = "local-review-test"
OLD = "20261027T100000Z-aaaaaaaaaa"
NEW = "20261028T100000Z-bbbbbbbbbb"


def make_review(root, run_id, outputs, score=16, incomplete=False):
    bundle = root / "reviews" / run_id
    report = {"order_id": ORDER_ID, "run_id": run_id, "status": "incomplete" if incomplete else "complete",
              "score": None if incomplete else score, "summary": "Independent assessment.",
              "rubric": [] if incomplete else [
                  {"id": key, "score": value, "reason": "Inspected evidence."}
                  for key, value in zip(("accuracy", "requirements", "reasoning", "visual", "delivery", "technical"),
                                        (4, 3, 3, 2, 2, score - 14))],
              "blockers": ["PDF is unreadable."] if incomplete else []}
    write_json(bundle / "reviewer/report.json", report)
    write_json(bundle / "manifest.json", {"order_id": ORDER_ID, "run_id": run_id,
        "files": [{"path": "inputs/" + path, "sha256": digest, "role": "deliverable"} for path, digest in outputs.items()]})
    write_json(bundle / "run_state.json", {"manifest_sha256": sha(bundle / "manifest.json")})
    write_json(bundle / "collection.json", {key: report[key] for key in ("order_id", "run_id", "status", "score")})
    return bundle


class ReviewPublicationTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        for path in OUTPUTS:
            target = self.root / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(b"isolated upload fixture")
        self.outputs = hashes(self.root, OUTPUTS)

    def test_all_grades_include_old_and_incomplete_runs(self):
        make_review(self.root, OLD, {path: "a" * 64 for path in OUTPUTS})
        make_review(self.root, NEW, self.outputs, incomplete=True)
        reviews = collect_review_scores(self.root, ORDER_ID, self.outputs)
        self.assertEqual([row["score"] for row in reviews], [16, None])
        self.assertEqual([row["matches_delivery"] for row in reviews], [False, True])
        self.assertNotIn(str(self.root), str(reviews))

    def test_uncollected_wrong_order_and_changed_assessments_block(self):
        bundle = make_review(self.root, NEW, self.outputs)
        with self.assertRaisesRegex(ValueError, "identity"):
            collect_review_scores(self.root, "another-order", self.outputs)
        (bundle / "collection.json").unlink()
        with self.assertRaisesRegex(ValueError, "collect this review"):
            collect_review_scores(self.root, ORDER_ID, self.outputs)

    def test_verifier_detects_missing_scores_and_changed_rubric(self):
        make_review(self.root, NEW, self.outputs)
        reviews = collect_review_scores(self.root, ORDER_ID, self.outputs)
        with self.assertRaisesRegex(ValueError, "differs"):
            verify_review_scores(reviews, [])
        changed = copy.deepcopy(reviews)
        changed[0]["rubric"][0]["score"] -= 1
        with self.assertRaisesRegex(ValueError, "differs"):
            verify_review_scores(reviews, changed)
        verify_review_scores(reviews, reviews)

    def test_grade_sync_retry_keeps_file_receipt_and_uploads_only_once(self):
        make_review(self.root, NEW, self.outputs)
        tool = OrderTools(self.root)
        order = {"id": ORDER_ID, "order_type": "ارائه و پاورپوینت", "files": []}
        write_json(tool.state_path, {"order_id": ORDER_ID, "order_signature": signature(order)})
        reviews = collect_review_scores(self.root, ORDER_ID, self.outputs)
        with patch.object(tool, "finalize"), \
             patch("codex_order_tools.api.fetch_order_read_only", return_value=order), \
             patch("codex_order_tools.api.claim_oldest"), patch("codex_order_tools.api.heartbeat"), \
             patch("codex_order_tools.api.submit_final") as upload, \
             patch("codex_order_tools.api.sync_review_scores", side_effect=[TimeoutError(), {"reviews": reviews}]) as sync:
            with self.assertRaisesRegex(ValueError, "Files are published"):
                tool.publish()
            self.assertEqual(tool.state()["publication"]["status"], "confirmed")
            self.assertEqual(tool.state()["publication"]["reviews_status"], "pending")
            self.assertTrue(tool.publish()["reused_receipt"])
            self.assertEqual(upload.call_count, 1)
            self.assertEqual(sync.call_count, 2)
            self.assertEqual(sync.call_args.args[2], reviews)
            self.assertEqual(tool.state()["publication"]["reviews_status"], "confirmed")

    def test_online_verifier_checks_grades_and_saves_read_only_receipt(self):
        script = Path(__file__).resolve().parents[2] / "codex_skills/daneshyar-push-local-online/scripts/verify_online.py"
        verify = runpy.run_path(str(script))["verify"]
        make_review(self.root, NEW, self.outputs)
        order = {"id": ORDER_ID, "order_type": "ارائه و پاورپوینت", "files": [],
                 "status": "worker_done_pending_approval"}
        write_json(self.root / "codex_order_state.json", {"order_id": ORDER_ID,
                   "order_signature": signature(order), "input_hashes": {}})
        write_json(self.root / "reports/codex_delivery.json", {"passed": True, "order_id": ORDER_ID, "outputs": self.outputs})
        order["final_outputs"] = [{"id": str(index), "output_type": role,
            "storage_path": f"orders/{ORDER_ID}/final/{Path(path).name}",
            "size_bytes": (self.root / path).stat().st_size}
            for index, (role, path) in enumerate(zip(("pptx", "pdf", "sample", "sample_pdf"), OUTPUTS))]
        response = SimpleNamespace(content=b"isolated upload fixture", status_code=200, raise_for_status=lambda: None)
        reviews = collect_review_scores(self.root, ORDER_ID, self.outputs)
        with patch("common.config.load_config", return_value=SimpleNamespace(backend_url="https://example.invalid")), \
             patch("common.api.fetch_order_read_only", return_value=order), \
             patch("requests.get", return_value=response), \
             patch("common.api.fetch_review_scores", return_value={"reviews": reviews}) as fetch_reviews, \
             patch("common.api.submit_final") as upload, patch("common.api.sync_review_scores") as sync:
            self.assertTrue(verify(self.root, ORDER_ID)["review_scores_verified"])
            self.assertTrue((self.root / "reports/publication_verification.json").is_file())
            fetch_reviews.return_value = {"reviews": []}
            with self.assertRaisesRegex(ValueError, "differs"):
                verify(self.root, ORDER_ID)
            upload.assert_not_called()
            sync.assert_not_called()


if __name__ == "__main__":
    unittest.main()
