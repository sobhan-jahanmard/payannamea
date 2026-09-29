from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from common.input_files import materialize_local_file, target_name


class InputFileResolutionTests(unittest.TestCase):
    def test_reuses_archived_order_file_without_network(self) -> None:
        root = Path(tempfile.mkdtemp())
        order_id = "abc-123"
        item = {
            "file_type": "university_guideline",
            "original_name": "guide.pdf",
            "stored_name": "uuid.pdf",
            "size_bytes": 7,
        }
        archived = root / f"order_{order_id}" / "input" / "files" / target_name(item)
        archived.parent.mkdir(parents=True)
        archived.write_bytes(b"content")
        workspace = root / "in_progress"
        target = workspace / "input" / "files" / target_name(item)
        result = materialize_local_file(workspace, root, order_id, item, target)
        self.assertEqual(result, target)
        self.assertEqual(target.read_bytes(), b"content")

    def test_rejects_wrong_sized_stale_file(self) -> None:
        root = Path(tempfile.mkdtemp())
        item = {"file_type": "source", "original_name": "same.pdf", "size_bytes": 8}
        target = root / "in_progress" / "input" / "files" / target_name(item)
        target.parent.mkdir(parents=True)
        target.write_bytes(b"old")
        self.assertIsNone(materialize_local_file(root / "in_progress", root, "new-order", item, target))


if __name__ == "__main__":
    unittest.main()
