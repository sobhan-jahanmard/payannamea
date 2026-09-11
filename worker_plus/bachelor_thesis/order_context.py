from __future__ import annotations

from pathlib import Path
from typing import Any

from utils.helpers import write_json


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
    write_json(context_path(workspace), context)
