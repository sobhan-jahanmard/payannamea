from pathlib import Path
import json
import subprocess
import tempfile
import unittest

from common.auto_repair import repair_worker_code


class AutoRepairTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="auto-repair-test-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.source = self.root / "source"
        self.workspace = self.root / "workspace"
        self.workspace.mkdir()
        self._write(self.workspace / "order_context.json", '{"order_id":"fixture"}')
        self.module = self.source / "presentation" / "assurance.py"
        self._write(self.module, "def value():\n    return 1\n")
        self._write(self.source / "presentation" / "__init__.py", "")
        self._write(self.source / "tests" / "test_presentation_assurance.py",
                    "import unittest\nfrom presentation.assurance import value\n"
                    "class Gate(unittest.TestCase):\n    def test_value(self):\n        self.assertEqual(value(), 2)\n")

    @staticmethod
    def _write(path, value):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(value, encoding="utf-8")

    def _repair(self, invoke):
        return repair_worker_code(self.source, self.workspace, "ارائه و پاورپوینت",
                                  "05c_research_evidence", {"error": "fixture validation failed"},
                                  "codex", "test-model", invoke=invoke)

    def test_tested_stage_patch_is_applied(self):
        def agent(_command, sandbox, _prompt, _env):
            self._write(sandbox / "presentation" / "assurance.py", "def value():\n    return 2\n")
            return subprocess.CompletedProcess([], 0, "")

        result = self._repair(agent)
        self.assertEqual("applied", result["status"])
        self.assertEqual(["presentation/assurance.py"], result["files"])
        self.assertIn("return 2", self.module.read_text(encoding="utf-8"))

    def test_failing_test_or_unrelated_code_is_not_applied(self):
        def failing_agent(_command, sandbox, _prompt, _env):
            self._write(sandbox / "presentation" / "assurance.py", "def value():\n    return 3\n")
            return subprocess.CompletedProcess([], 0, "")

        self.assertEqual("rejected", self._repair(failing_agent)["status"])
        self.assertIn("return 1", self.module.read_text(encoding="utf-8"))

        def unrelated_agent(_command, sandbox, _prompt, _env):
            self._write(sandbox / "common" / "runner.py", "# unrelated change\n")
            return subprocess.CompletedProcess([], 0, "")

        self.assertEqual("rejected", self._repair(unrelated_agent)["status"])
        self.assertFalse((self.source / "common" / "runner.py").exists())

    def test_artifact_only_diagnosis_keeps_code_untouched(self):
        def agent(command, _sandbox, _prompt, _env):
            report = Path(command[command.index("--output-last-message") + 1])
            report.write_text("Inspected the stage code; only the order artifact requires correction.", encoding="utf-8")
            return subprocess.CompletedProcess([], 0, "")

        self.assertEqual("no_code_change", self._repair(agent)["status"])
        self.assertIn("return 1", self.module.read_text(encoding="utf-8"))

    def test_blocked_file_tools_fall_back_to_supplied_code_and_host_verification(self):
        prompts = []

        def agent(command, _sandbox, prompt, _env):
            prompts.append(prompt)
            report = Path(command[command.index("--output-last-message") + 1])
            if len(prompts) == 1:
                reply = "Diagnosis is blocked by the managed workspace policy. I could not inspect the source."
            else:
                self.assertIn("Do not call tools", prompt)
                self.assertIn("def value():", prompt)
                reply = json.dumps({"status": "ready", "edits": [{"file": "presentation/assurance.py", "old": "    return 1", "new": "    return 2"}], "explanation": "Fix the supplied reusable function."})
            report.write_text(reply, encoding="utf-8")
            return subprocess.CompletedProcess(command, 0, "")

        self.assertEqual("applied", self._repair(agent)["status"])
        self.assertEqual(2, len(prompts))
        self.assertIn("return 2", self.module.read_text(encoding="utf-8"))

    def test_unavailable_diagnosis_is_blocked_not_no_code_change(self):
        calls = []

        def agent(command, _sandbox, _prompt, _env):
            calls.append(command)
            report = Path(command[command.index("--output-last-message") + 1])
            report.write_text("I could not inspect the source because of policy." if len(calls) == 1 else
                              json.dumps({"status": "blocked", "edits": [], "explanation": "The necessary module is absent from the packet."}), encoding="utf-8")
            return subprocess.CompletedProcess(command, 0, "")

        result = self._repair(agent)
        self.assertEqual("blocked", result["status"])
        self.assertEqual(2, len(calls))
        self.assertIn("return 1", self.module.read_text(encoding="utf-8"))

    def test_failed_verification_is_fed_back_and_retried(self):
        calls = []

        def agent(_command, sandbox, prompt, _env):
            calls.append(prompt)
            value = 3 if len(calls) == 1 else 2
            self._write(sandbox / "presentation" / "assurance.py", f"def value():\n    return {value}\n")
            return subprocess.CompletedProcess([], 0, "")

        self.assertEqual("applied", self._repair(agent)["status"])
        self.assertEqual(2, len(calls))
        self.assertIn("failed verification", calls[1])
        self.assertIn("return 2", self.module.read_text(encoding="utf-8"))

    def test_verification_retry_keeps_the_same_codex_thread(self):
        commands = []
        remembered = []
        thread = "22222222-2222-4222-8222-222222222222"

        def agent(command, sandbox, _prompt, _env):
            commands.append(command)
            value = 3 if len(commands) == 1 else 2
            self._write(sandbox / "presentation" / "assurance.py", f"def value():\n    return {value}\n")
            return subprocess.CompletedProcess(command, 0, json.dumps({"type": "thread.started", "thread_id": thread}))

        result = repair_worker_code(self.source, self.workspace, "ارائه و پاورپوینت",
                                    "05c_research_evidence", {"error": "fixture validation failed"},
                                    "codex", "test-model", invoke=agent, on_thread=remembered.append)
        self.assertEqual("applied", result["status"])
        self.assertEqual([thread, thread], remembered)
        self.assertNotIn("resume", commands[0])
        self.assertIn("resume", commands[1])

    def test_review_repair_uses_inline_code_and_exact_tested_edits(self):
        prompts = []
        def agent(command, _sandbox, prompt, _env):
            prompts.append(prompt)
            report = Path(command[command.index("--output-last-message") + 1])
            report.write_text(json.dumps({"edits": [{"file": "presentation/assurance.py",
                "old": "    return 1", "new": "    return 2"}],
                "explanation": "Reusable change verified by the presentation test."}), encoding="utf-8")
            return subprocess.CompletedProcess([], 0, "")
        result = repair_worker_code(self.source, self.workspace, "ارائه و پاورپوینت",
                                    "07_generate_content", {"error": "review"}, "codex", "test-model",
                                    invoke=agent, review_guidance="Fix the general calculation algorithm.")
        self.assertEqual("applied", result["status"])
        self.assertIn("Do not call tools", prompts[0])
        self.assertIn("def value():", prompts[0])
        self.assertIn("return 2", self.module.read_text(encoding="utf-8"))

    def test_review_repair_rejects_unmatched_snippet(self):
        def agent(command, _sandbox, _prompt, _env):
            report = Path(command[command.index("--output-last-message") + 1])
            report.write_text(json.dumps({"edits": [{"file": "presentation/assurance.py",
                "old": "    return 99", "new": "    return 2"}]}), encoding="utf-8")
            return subprocess.CompletedProcess([], 0, "")
        result = repair_worker_code(self.source, self.workspace, "ارائه و پاورپوینت",
                                    "07_generate_content", {"error": "review"}, "codex", "test-model",
                                    invoke=agent, review_guidance="Fix the general calculation algorithm.")
        self.assertEqual("rejected", result["status"])
        self.assertIn("return 1", self.module.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
