from __future__ import annotations

import json
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

from common import runner
from common.helpers import write_json
from common.order_context import load, new_context, save


class FileAccessRecoveryTests(unittest.TestCase):
    def test_manual_retry_keeps_the_consecutive_error_count(self) -> None:
        class StopError(RuntimeError):
            retryable = False

        with TemporaryDirectory() as directory:
            root = Path(directory)
            workspace = root / "in_progress"
            workspace.mkdir()
            failure = {"failed_step": runner.STEPS[8], "restart_step": runner.STEPS[8], "error": "Protected input changed"}
            context = new_context(workspace, "full")
            context.update(order_id="repeat-fixture", status="failed", completed_steps=runner.STEPS[:8],
                           errors=[failure["error"]], recovery_history=[dict(failure), dict(failure)])
            save(workspace, context)
            services = Mock()
            services.cleanup_run.return_value = {"released_docx_targets": [], "terminated_automation_word_pids": []}
            stage = Mock(TITLE="Evidence")
            stage.run.side_effect = StopError(failure["error"])
            handler = SimpleNamespace(TITLE="Handle failure", run=lambda context, _services: context.update(status="failed"))
            def module(name):
                return handler if name.endswith(runner.FAILURE_STEP) else stage
            with patch.object(runner, "load_config", return_value=SimpleNamespace(workspace_root=root)), patch.object(runner, "Services", return_value=services), patch.object(runner.sys, "argv", ["run.py", "--step", "9", "--offline"]), patch.object(runner.importlib, "import_module", side_effect=module):
                with self.assertRaises(SystemExit):
                    runner.main()
            self.assertEqual(3, load(workspace)["recovery_history"][-1]["same_error_count"])

    def test_blocked_code_repair_does_not_replay_the_failed_stage(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            workspace = root / "in_progress"
            workspace.mkdir()
            failure = {"failed_step": runner.STEPS[8], "restart_step": runner.STEPS[8], "error": "Protected input changed"}
            context = new_context(workspace, "full")
            context.update(order_id="blocked-repair", status="failed", completed_steps=runner.STEPS[:8],
                           errors=[failure["error"]], active_failure=failure, recovery_history=[failure])
            save(workspace, context)
            config = SimpleNamespace(workspace_root=root, codex_bin="codex", codex_model="test", codex_home=None)
            with patch.object(runner, "load_config", return_value=config), patch.object(runner, "Services"), patch.object(runner.sys, "argv", ["run.py", "--step", "9", "--offline", "--auto-repair"]), patch("common.auto_repair.repair_worker_code", return_value={"status": "blocked", "reason": "Required evidence is unavailable"}), patch.object(runner.importlib, "import_module") as execute:
                runner.main()
            saved = load(workspace)
            self.assertEqual("paused", saved["status"])
            self.assertEqual(failure, saved["active_failure"])
            self.assertEqual("blocked", saved["execution_trace"]["repair_events"][-1]["status"])
            self.assertEqual([], saved["errors"])
            execute.assert_not_called()

    def test_locked_file_does_not_rewind_any_stage(self) -> None:
        for step in ("09_package_docx", "10_validate_and_publish"):
            with self.subTest(step=step):
                self.assertEqual(step, runner.STEPS[runner.recovery_start(step, PermissionError("Permission denied: final.docx"))])
        self.assertTrue(runner.is_file_access_error(RuntimeError("File is being used by another process")))
        self.assertTrue(runner.is_file_access_error(RuntimeError("[WinError 5] Access is denied: order_context.json")))
        self.assertFalse(runner.is_file_access_error(RuntimeError("AI visual quality audit failed")))

    def test_json_save_retries_temporary_reader_lock(self) -> None:
        with TemporaryDirectory() as directory:
            target = Path(directory) / "order_context.json"
            write_json(target, {"status": "old"})
            real_replace = Path.replace
            attempts = []

            def replace(source, destination):
                attempts.append(source)
                if len(attempts) < 3:
                    raise PermissionError("Access is denied")
                return real_replace(source, destination)

            with patch.object(Path, "replace", replace), patch("common.helpers.time.sleep") as sleep:
                write_json(target, {"status": "saved"})
            self.assertEqual({"status": "saved"}, json.loads(target.read_text(encoding="utf-8")))
            self.assertEqual(2, sleep.call_count)
            self.assertEqual([], list(target.parent.glob("*.tmp")))

            with patch.object(Path, "replace", side_effect=PermissionError("Access is denied")), patch("common.helpers.time.sleep"):
                with self.assertRaises(PermissionError):
                    write_json(target, {"status": "must not replace"})
            self.assertEqual({"status": "saved"}, json.loads(target.read_text(encoding="utf-8")))
            self.assertEqual([], list(target.parent.glob("*.tmp")))

    def test_raw_stage_three_failure_keeps_feedback_on_repair_and_skips_code_agent(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            workspace = root / "in_progress"
            workspace.mkdir()
            steps = runner.STEPS[:3]
            error = "[WinError 5] Access is denied: order_context.json.tmp -> order_context.json"
            context = new_context(workspace, "full")
            context.update(order_id="raw-stage-three", status="failed", current_step=steps[2], completed_steps=steps[:2], errors=[error])
            save(workspace, context)
            services = Mock()
            services.cleanup_run.return_value = {"released_docx_targets": [], "terminated_automation_word_pids": []}
            stage = Mock(TITLE="Check intake")
            visited = []

            def complete(context, _services):
                visited.append(context["current_step"])
                if context["current_step"] == runner.STEPS[-1]:
                    context["status"] = "dry_run_complete"
                else:
                    context["completed_steps"] = runner.STEPS[:-1].copy()

            stage.run.side_effect = complete
            with patch.object(runner, "load_config", return_value=SimpleNamespace(workspace_root=root)), patch.object(runner, "Services", return_value=services), patch.object(runner.sys, "argv", ["run.py", "--step", "3", "--offline", "--auto-repair", "--operator-note", "Fix and continue"]), patch.object(runner.importlib, "import_module", return_value=stage), patch("common.auto_repair.repair_worker_code") as repair:
                runner.main()
            saved = load(workspace)
            self.assertEqual("dry_run_complete", saved["status"])
            self.assertEqual(error, saved["recovery_history"][-1]["error"])
            self.assertEqual("file_access", saved["recovery_history"][-1]["kind"])
            self.assertEqual("03_check_intake", saved["recovery_history"][-1]["restart_step"])
            repair.assert_not_called()
            services.run_codex.assert_not_called()
            self.assertEqual(["03_check_intake", runner.STEPS[-1]], visited)

    def test_failure_saving_stage_start_is_recorded_as_a_pause(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            workspace = root / "in_progress"
            workspace.mkdir()
            context = new_context(workspace, "full")
            context.update(order_id="stage-start-save", completed_steps=runner.STEPS[:-1], status="in_progress")
            save(workspace, context)
            services = Mock()
            services.cleanup_run.return_value = {"released_docx_targets": [], "terminated_automation_word_pids": []}
            stage = Mock(TITLE="Final package")
            failed_once = False

            def save_with_lock(workspace, context):
                nonlocal failed_once
                if context.get("current_step") == runner.STEPS[-1] and not failed_once:
                    failed_once = True
                    raise PermissionError("Access is denied: order_context.json")
                save(workspace, context)

            with patch.object(runner, "load_config", return_value=SimpleNamespace(workspace_root=root)), patch.object(runner, "Services", return_value=services), patch.object(runner, "save", side_effect=save_with_lock), patch.object(runner.sys, "argv", ["run.py", "--resume", "--offline"]), patch.object(runner.importlib, "import_module", return_value=stage):
                runner.main()
            paused = load(workspace)
            self.assertEqual("paused", paused["status"])
            self.assertEqual("file_access", paused["active_failure"]["kind"])
            self.assertEqual("paused", paused["execution_trace"]["nodes"][-1]["status"])
            stage.run.assert_not_called()

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
