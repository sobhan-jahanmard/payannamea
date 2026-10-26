from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from common.local_publish import publish_local
from common.order_context import load, save


class LocalPublishTests(unittest.TestCase):
    def test_uploads_existing_files_without_regeneration(self) -> None:
        with TemporaryDirectory() as directory:
            workspace = Path(directory) / "in_progress"
            final = workspace / "final"
            final.mkdir(parents=True)
            for name in ("final.docx", "final.pdf", "sample.docx", "sample.pdf"):
                (final / name).write_bytes(f"local version of {name}".encode())
            context = {
                "order_id": "order-1", "order": {"order_type": "تحقیق دانشگاهی"},
                "status": "dry_run_complete", "mode": "full",
                "completed_steps": ["10_validate_and_publish"],
            }
            save(workspace, context)
            before = {path.name: path.read_bytes() for path in final.iterdir()}
            with patch("common.local_publish.fetch_order_read_only", return_value={"order_type": "تحقیق دانشگاهی"}), \
                 patch("common.local_publish.claim_oldest") as claim, \
                 patch("common.local_publish.heartbeat") as heartbeat, \
                 patch("common.local_publish.submit_final") as submit:
                publish_local(SimpleNamespace(), workspace, "order-1")
            claim.assert_called_once()
            heartbeat.assert_called_once()
            self.assertEqual(before, {path.name: path.read_bytes() for path in final.iterdir()})
            uploaded = submit.call_args.args[2]
            self.assertEqual({"docx_file", "pdf_file", "sample_file", "sample_pdf_file"}, set(uploaded))
            self.assertEqual("worker_done_pending_approval", load(workspace)["status"])

    def test_missing_file_blocks_server_claim(self) -> None:
        with TemporaryDirectory() as directory:
            workspace = Path(directory) / "in_progress"
            workspace.mkdir()
            save(workspace, {
                "order_id": "order-1", "order": {"order_type": "تحقیق دانشگاهی"},
                "status": "dry_run_complete", "completed_steps": ["10_validate_and_publish"],
            })
            with patch("common.local_publish.claim_oldest") as claim:
                with self.assertRaisesRegex(ValueError, "missing or empty"):
                    publish_local(SimpleNamespace(), workspace, "order-1")
            claim.assert_not_called()


if __name__ == "__main__":
    unittest.main()
