from __future__ import annotations

from pathlib import Path
from typing import Any

from common.helpers import write_json


def context_path(workspace: Path) -> Path:
    return workspace / "order_context.json"


def new_context(workspace: Path, mode: str) -> dict[str, Any]:
    return {"order_id": None, "mode": mode, "status": "starting", "workspace": str(workspace), "completed_steps": [], "current_step": None, "order": {}, "artifacts": {}, "errors": []}


def load(workspace: Path) -> dict[str, Any]:
    path = context_path(workspace)
    if not path.exists():
        raise RuntimeError(f"Missing context: {path}")
    import json
    return json.loads(path.read_text(encoding="utf-8"))


def save(workspace: Path, context: dict[str, Any]) -> None:
    trace = context.get("execution_trace")
    if isinstance(trace, dict):
        trace["order_id"] = context.get("order_id")
    write_json(context_path(workspace), context)
    if isinstance(trace, dict):
        write_json(workspace / "reports" / "execution_graph.json", trace)
        # Keep the final archived graph in sync after the publishing stage has
        # copied its workspace, before the final attempt could be marked done.
        archive = context.get("artifacts", {}).get("archive")
        if archive and context.get("order_id") and context.get("status") in {"dry_run_complete", "completed", "worker_done_pending_approval", "sample_pending_customer_approval"}:
            target = Path(archive).resolve()
            expected = workspace.parent / f"order_{context['order_id']}"
            if target == expected.resolve() and target.is_dir():
                write_json(target / "reports" / "execution_graph.json", trace)
                write_json(context_path(target), context)
