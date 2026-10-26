from __future__ import annotations

from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

from common import runner
from common.order_context import load, new_context, save


class FileAccessRecoveryTests(unittest.TestCase):
    def test_locked_file_does_not_rewind_any_stage(self) -> None:
        for step in ("09_package_docx", "10_validate_and_publish"):
            with self.subTest(step=step):
                self.assertEqual(step, runner.STEPS[runner.recovery_start(step, PermissionError("Permission denied: final.docx"))])
        self.assertTrue(runner.is_file_access_error(RuntimeError("File is being used by another process")))
        self.assertFalse(runner.is_file_access_error(RuntimeError("AI visual quality audit failed")))

    def test_locked_final_output_pauses_once_and_resumes_only_final_step(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            workspace = root / "in_progress"
            workspace.mkdir()
            context = new_context(workspace, "full")
            context.update({"order_id": "isolated-recovery-fixture", "completed_steps": runner.STEPS[:-1], "status": "in_progress"})
            save(workspace, context)
            services = Mock()
            services.cleanup_run.return_value = {"released_docx_targets": [], "terminated_automation_word_pids": []}
            stage = Mock(TITLE="Final package")
            stage.run.side_effect = PermissionError("Permission denied: final.docx")
            config = SimpleNamespace(workspace_root=root)
            with patch.object(runner, "load_config", return_value=config), patch.object(runner, "Services", return_value=services), patch.object(runner.sys, "argv", ["run.py", "--resume", "--offline"]), patch.object(runner.importlib, "import_module", return_value=stage):
                runner.main()
            paused = load(workspace)
            self.assertEqual("paused", paused["status"])
            self.assertEqual(runner.STEPS[:-1], paused["completed_steps"])
            self.assertEqual("10_validate_and_publish", paused["active_failure"]["restart_step"])
            self.assertEqual("file_access", paused["active_failure"]["kind"])
            self.assertEqual("paused", paused["execution_trace"]["nodes"][-1]["status"])
            self.assertEqual(runner.STEPS[-1], paused["execution_trace"]["nodes"][-1]["step"])
            self.assertEqual(1, stage.run.call_count)
            services.run_codex.assert_not_called()

            def complete(context, services):
                context["status"] = "dry_run_complete"

            stage.run.reset_mock(side_effect=True)
            stage.run.side_effect = complete
            with patch.object(runner, "load_config", return_value=config), patch.object(runner, "Services", return_value=services), patch.object(runner.sys, "argv", ["run.py", "--resume", "--offline", "--operator-note", "Close the locked output and continue"]), patch.object(runner.importlib, "import_module", return_value=stage):
                runner.main()
            completed = load(workspace)
            self.assertEqual("dry_run_complete", completed["status"])
            self.assertEqual(runner.STEPS, completed["completed_steps"])
            self.assertNotIn("deferred_error", completed)
            self.assertEqual("succeeded", completed["execution_trace"]["nodes"][-1]["status"])
            self.assertEqual("resume", completed["execution_trace"]["edges"][-1]["kind"])
            self.assertEqual(1, stage.run.call_count)
            services.run_codex.assert_not_called()


if __name__ == "__main__":
    unittest.main()
