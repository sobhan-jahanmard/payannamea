from __future__ import annotations

import json
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from common.execution_trace import begin_attempt, begin_session, finish_attempt
from common.order_context import load, new_context
from common.runner import STEPS, Services


class CodexHistoryTests(unittest.TestCase):
    def test_related_attempt_resumes_saved_thread_and_keeps_audit_files(self):
        with TemporaryDirectory() as directory:
            workspace = Path(directory)
            context = new_context(workspace, "full")
            context.update(order_id="test-order", current_step=STEPS[6])
            session = begin_session(context, STEPS, "run")
            with patch.object(Services, "automation_word_pids", return_value=set()):
                services = Services(SimpleNamespace(codex_bin="codex", codex_model="test", codex_home=None),
                                    SimpleNamespace(dry_run=False, operator_note=""), workspace)
            services.context = context
            services.profile = SimpleNamespace(ORDER_TYPE="ارائه و پاورپوینت")
            thread_id = "11111111-1111-4111-8111-111111111111"
            commands: list[str] = []
            targets = [workspace / "drafts" / "first.md", workspace / "drafts" / "retry.md"]

            def invoke(command, **kwargs):
                commands.append(" ".join(command))
                target = targets[len(commands) - 1]
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text("verified output", encoding="utf-8")
                output = "\n".join((json.dumps({"type": "thread.started", "thread_id": thread_id}),
                                     json.dumps({"type": "item.completed", "item": {"type": "agent_message", "text": "done"}})))
                return subprocess.CompletedProcess(command, 0, output)

            with patch("common.runner.subprocess.run", side_effect=invoke):
                for index, target in enumerate(targets):
                    attempt = begin_attempt(context, STEPS, STEPS[6], session)
                    services.active_attempt_id = attempt
                    services.run_codex(f"prompt {index}", target)
                    finish_attempt(context, attempt, "succeeded")

            self.assertNotIn(" resume ", commands[0])
            self.assertIn(f"resume", commands[1])
            self.assertIn(thread_id, commands[1])
            saved = load(workspace)
            self.assertEqual(thread_id, saved["codex_threads"][STEPS[6]])
            calls = [node["codex_calls"][0] for node in saved["execution_trace"]["nodes"] if node.get("codex_calls")]
            self.assertEqual([False, True], [call["continued"] for call in calls])
            self.assertTrue(all(call["status"] == "succeeded" for call in calls))
            self.assertEqual("prompt 0", (workspace / calls[0]["prompt_path"]).read_text(encoding="utf-8"))
            self.assertIn("thread.started", (workspace / calls[1]["events_path"]).read_text(encoding="utf-8"))

    def test_missing_local_session_starts_a_linked_recovery_turn(self):
        with TemporaryDirectory() as directory:
            workspace = Path(directory)
            context = new_context(workspace, "full")
            context.update(order_id="test-order", current_step=STEPS[6], codex_threads={STEPS[6]: "old-thread"})
            session = begin_session(context, STEPS, "resume")
            attempt = begin_attempt(context, STEPS, STEPS[6], session)
            with patch.object(Services, "automation_word_pids", return_value=set()):
                services = Services(SimpleNamespace(codex_bin="codex", codex_model="test", codex_home=None),
                                    SimpleNamespace(dry_run=False, operator_note=""), workspace)
            services.context = context
            services.active_attempt_id = attempt
            services.profile = SimpleNamespace(ORDER_TYPE="ارائه و پاورپوینت")
            target = workspace / "drafts" / "recovered.md"
            commands = []

            def invoke(command, **kwargs):
                commands.append(" ".join(command))
                if len(commands) == 1:
                    return subprocess.CompletedProcess(command, 1, "session old-thread not found")
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text("recovered", encoding="utf-8")
                return subprocess.CompletedProcess(command, 0, json.dumps({"type": "thread.started", "thread_id": "new-thread"}))

            with patch("common.runner.subprocess.run", side_effect=invoke):
                services.run_codex("repair the output", target)
            self.assertEqual(2, len(commands))
            self.assertIn("resume", commands[0])
            self.assertNotIn("resume", commands[1])
            call = load(workspace)["execution_trace"]["nodes"][-1]["codex_calls"][0]
            self.assertEqual("old-thread", call["resumed_from"])
            self.assertFalse(call["continued"])
            self.assertEqual("new-thread", call["thread_id"])
            self.assertIn("سابقهٔ بازیابی‌شده", (workspace / call["prompt_path"]).read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
