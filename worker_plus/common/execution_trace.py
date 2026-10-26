"""Persistent execution attempts, including retries and manual resumptions."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _append(trace: dict[str, Any], step: str, stages: list[str], status: str, *, inferred: bool = False,
            session_id: str | None = None, reason: str = "", error: str = "") -> dict[str, Any]:
    previous = trace["nodes"][-1] if trace["nodes"] else None
    lane = int(previous["lane"]) if previous else 0
    branch = bool(previous and (stages.index(step) <= stages.index(previous["step"]) or previous["status"] in {"failed", "paused", "interrupted"}))
    if branch:
        lane += 1
    node = {"id": f"attempt-{len(trace['nodes']) + 1}", "step": step, "lane": lane, "status": status,
            "started_at": None if inferred else now(), "finished_at": None, "inferred": inferred,
            "session_id": session_id, "error": error}
    trace["nodes"].append(node)
    if previous:
        kind = "retry" if branch else "forward"
        if reason in {"resume", "manual", "repackage"} and branch:
            kind = reason
        trace["edges"].append({"id": f"edge-{len(trace['edges']) + 1}", "source": previous["id"], "target": node["id"],
                               "kind": kind, "created_at": None if inferred else now(), "inferred": inferred})
    trace["updated_at"] = now()
    return node


def ensure_trace(context: dict[str, Any], stages: list[str]) -> dict[str, Any]:
    existing = context.get("execution_trace")
    if isinstance(existing, dict) and existing.get("version") == 1 and existing.get("order_id") in {None, context.get("order_id")}:
        existing["order_id"] = context.get("order_id")
        return existing
    trace: dict[str, Any] = {"version": 1, "trace_id": str(uuid4()), "order_id": context.get("order_id"),
                             "created_at": now(), "updated_at": now(), "sessions": [], "nodes": [], "edges": [],
                             "legacy_inferred": False}
    context["execution_trace"] = trace
    if isinstance(existing, dict) and existing.get("order_id") not in {None, context.get("order_id")}:
        return trace
    # Old contexts contain failure/restart pairs, but not timestamps or complete
    # attempt logs. Mark reconstructed paths explicitly instead of claiming
    # that they were observed live.
    cursor = 0
    for failure in context.get("recovery_history") or []:
        failed = failure.get("failed_step")
        if failed not in stages:
            continue
        end = stages.index(failed)
        for index in range(min(cursor, end), end):
            _append(trace, stages[index], stages, "succeeded", inferred=True)
        paused = failure.get("kind") == "file_access" or "usage limit" in str(failure.get("error") or "").lower()
        _append(trace, failed, stages, "paused" if paused else "failed", inferred=True, error=str(failure.get("error") or ""))
        restart = failure.get("restart_step")
        cursor = stages.index(restart) if restart in stages else end
    completed = set(context.get("completed_steps") or [])
    pending = next((index for index, stage in enumerate(stages) if stage not in completed), len(stages))
    for index in range(cursor, pending):
        _append(trace, stages[index], stages, "succeeded", inferred=True)
    current = context.get("current_step")
    if current in stages and (not trace["nodes"] or trace["nodes"][-1]["step"] != current):
        _append(trace, current, stages, "interrupted", inferred=True)
    trace["legacy_inferred"] = bool(trace["nodes"])
    return trace


def begin_session(context: dict[str, Any], stages: list[str], mode: str) -> str:
    trace = ensure_trace(context, stages)
    for node in trace["nodes"]:
        if node["status"] == "running":
            node.update(status="interrupted", finished_at=now())
    session = {"id": str(uuid4()), "started_at": now(), "mode": mode}
    trace["sessions"].append(session)
    return session["id"]


def begin_attempt(context: dict[str, Any], stages: list[str], step: str, session_id: str) -> str:
    trace = ensure_trace(context, stages)
    mode = next((session["mode"] for session in trace["sessions"] if session["id"] == session_id), "run")
    return _append(trace, step, stages, "running", session_id=session_id, reason=mode)["id"]


def finish_attempt(context: dict[str, Any], attempt_id: str, status: str, error: str = "") -> None:
    trace = context["execution_trace"]
    node = next(item for item in trace["nodes"] if item["id"] == attempt_id)
    node.update(status=status, error=error, finished_at=now())
    trace["updated_at"] = now()
