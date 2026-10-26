from pathlib import Path
import tempfile
import unittest

from common.helpers import archive_workspace


class WorkspaceArchiveTests(unittest.TestCase):
    def test_active_order_directory_is_preserved_when_archiving_in_place(self):
        with tempfile.TemporaryDirectory() as directory:
            workspace = Path(directory) / 'order_example'
            (workspace / 'final').mkdir(parents=True)
            output = workspace / 'final' / 'final.pdf'
            output.write_bytes(b'existing customer output')
            self.assertEqual(archive_workspace(workspace, 'example'), workspace)
            self.assertEqual(output.read_bytes(), b'existing customer output')

    def test_legacy_shared_workspace_still_archives_to_order_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            workspace = Path(directory) / 'in_progress'
            workspace.mkdir()
            (workspace / 'order_context.json').write_text('{"order_id":"example"}')
            target = archive_workspace(workspace, 'example')
            self.assertEqual(target, workspace.parent / 'order_example')
            self.assertEqual((target / 'order_context.json').read_bytes(), (workspace / 'order_context.json').read_bytes())


if __name__ == '__main__':
    unittest.main()
