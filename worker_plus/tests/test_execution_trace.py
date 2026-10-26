from __future__ import annotations

import importlib
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest

from common.execution_trace import begin_attempt, begin_session, ensure_trace, finish_attempt
from common.order_context import load, new_context, save
from common.runner import STEPS


class ExecutionTraceTests(unittest.TestCase):
    def test_retries_are_distinct_parallel_paths_and_survive_reload(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            context = new_context(root, "full")
            context["order_id"] = "trace-order"
            session = begin_session(context, STEPS, "run")
            for stage in STEPS:
                attempt = begin_attempt(context, STEPS, stage, session)
                finish_attempt(context, attempt, "failed" if stage == STEPS[-1] else "succeeded", "output problem" if stage == STEPS[-1] else "")
            for _ in range(2):
                for stage in STEPS[16:]:
                    attempt = begin_attempt(context, STEPS, stage, session)
                    finish_attempt(context, attempt, "failed" if stage == STEPS[-1] else "succeeded")
            save(root, context)
            trace = load(root)["execution_trace"]
            self.assertEqual(34, len(trace["nodes"]))
            self.assertEqual({0, 1, 2}, {node["lane"] for node in trace["nodes"]})
            branches = [edge for edge in trace["edges"] if edge["kind"] == "retry"]
            self.assertEqual(2, len(branches))
            by_id = {node["id"]: node for node in trace["nodes"]}
            for edge in branches:
                self.assertEqual(STEPS[-1], by_id[edge["source"]]["step"])
                self.assertEqual(STEPS[16], by_id[edge["target"]]["step"])
            self.assertEqual(trace, json.loads((root / "reports/execution_graph.json").read_text(encoding="utf-8")))

    def test_interrupted_attempt_and_resume_are_retained(self):
        context = {"order_id": "trace-order"}
        session = begin_session(context, STEPS, "run")
        first = begin_attempt(context, STEPS, STEPS[6], session)
        session = begin_session(context, STEPS, "resume")
        second = begin_attempt(context, STEPS, STEPS[6], session)
        finish_attempt(context, second, "paused", "file locked")
        self.assertNotEqual(first, second)
        self.assertEqual(["interrupted", "paused"], [node["status"] for node in context["execution_trace"]["nodes"]])
        self.assertEqual("resume", context["execution_trace"]["edges"][-1]["kind"])

    def test_legacy_recovery_is_marked_inferred_and_not_duplicated(self):
        context = {"order_id": "trace-order", "completed_steps": STEPS[:16], "recovery_history": [
            {"failed_step": STEPS[-1], "restart_step": STEPS[16], "error": "first error"},
            {"failed_step": STEPS[-1], "restart_step": STEPS[16], "error": "second error"},
        ]}
        trace = ensure_trace(context, STEPS)
        self.assertTrue(trace["legacy_inferred"])
        self.assertEqual(28, len(trace["nodes"]))
        self.assertTrue(all(node["inferred"] and node["started_at"] is None for node in trace["nodes"]))
        self.assertIs(trace, ensure_trace(context, STEPS))
        self.assertEqual(28, len(trace["nodes"]))
        context["order_id"] = "another-order"
        self.assertEqual([], ensure_trace(context, STEPS)["nodes"])

    def test_workspace_preparation_cannot_erase_the_trace(self):
        stage = importlib.import_module("common.steps.02_prepare_workspace")
        with TemporaryDirectory() as directory:
            root = Path(directory)
            context = new_context(root, "full")
            context.update(order_id="trace-order", order={"files": []})
            session = begin_session(context, STEPS, "run")
            attempt = begin_attempt(context, STEPS, STEPS[0], session)
            finish_attempt(context, attempt, "succeeded")
            begin_attempt(context, STEPS, STEPS[1], session)
            save(root, context)
            services = SimpleNamespace(workspace=root, args=SimpleNamespace(resume=False, offline=True))
            stage.run(context, services)
            save(root, context)
            stored = json.loads((root / "reports/execution_graph.json").read_text(encoding="utf-8"))
            self.assertEqual(2, len(stored["nodes"]))
            self.assertEqual("trace-order", stored["order_id"])


if __name__ == "__main__":
    unittest.main()
