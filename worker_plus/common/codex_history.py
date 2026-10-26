"""Persist Codex turns beside the execution attempt that requested them."""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from common.order_context import save


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def begin_call(context: dict[str, Any], workspace: Path, attempt_id: str, step: str,
               target: Path, prompt: str) -> dict[str, Any]:
    trace = context["execution_trace"]
    attempt = next(node for node in trace["nodes"] if node["id"] == attempt_id)
    call_id = str(uuid4())
    directory = workspace / "reports" / "codex_calls"
    directory.mkdir(parents=True, exist_ok=True)
    prompt_path = directory / f"{call_id}.prompt.md"
    prompt_path.write_text(prompt, encoding="utf-8")
    (directory / f"{call_id}.events.jsonl").write_text("", encoding="utf-8")
    previous_thread = context.setdefault("codex_threads", {}).get(step)
    call = {
        "id": call_id, "step": step, "scope": step, "attempt_id": attempt_id,
        "thread_id": previous_thread, "continued": bool(previous_thread),
        "target": target.relative_to(workspace).as_posix(),
        "prompt_path": prompt_path.relative_to(workspace).as_posix(),
        "events_path": f"reports/codex_calls/{call_id}.events.jsonl",
        "started_at": _now(), "finished_at": None, "status": "running",
        "response": "", "error": "",
    }
    attempt.setdefault("codex_calls", []).append(call)
    trace["updated_at"] = _now()
    save(workspace, context)
    return call


def remember_thread(context: dict[str, Any], workspace: Path, call: dict[str, Any], thread_id: str) -> None:
    if call.get("thread_id") == thread_id:
        return
    call["thread_id"] = thread_id
    context.setdefault("codex_threads", {})[call["scope"]] = thread_id
    context["execution_trace"]["updated_at"] = _now()
    save(workspace, context)


def finish_call(context: dict[str, Any], workspace: Path, call: dict[str, Any], *,
                status: str, response: str = "", error: str = "") -> None:
    call.update(status=status, response=response[:3000], error=error[:3000], finished_at=_now())
    context["execution_trace"]["updated_at"] = _now()
    save(workspace, context)
