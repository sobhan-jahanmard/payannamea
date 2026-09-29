"""Resolve uploaded order files locally before considering a backend download."""
from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any


def safe_name(value: object, fallback: str = "source.bin") -> str:
    return Path(str(value or fallback)).name.replace("..", "_")


def target_name(item: dict[str, Any]) -> str:
    kind = safe_name(item.get("file_type"), "file")
    return f"{kind}__{safe_name(item.get('original_name') or item.get('stored_name'))}"


def _usable(path: Path, item: dict[str, Any]) -> bool:
    if not path.is_file() or path.stat().st_size <= 0:
        return False
    expected = int(item.get("size_bytes") or 0)
    return not expected or path.stat().st_size == expected


def local_candidates(workspace: Path, workspace_root: Path, order_id: str, item: dict[str, Any]) -> list[Path]:
    original = safe_name(item.get("original_name") or item.get("stored_name"))
    stored = safe_name(item.get("stored_name") or original)
    candidates: list[Path] = []
    for key in ("local_path", "file_path", "path"):
        if item.get(key):
            candidates.append(Path(str(item[key])).expanduser())
    candidates.extend([
        workspace / "input" / "files" / target_name(item),
        workspace / "input" / "files" / original,
        workspace / "input" / "files" / stored,
        workspace_root / f"order_{order_id}" / "input" / "files" / target_name(item),
        workspace_root / f"order_{order_id}" / "input" / "files" / original,
        workspace_root / f"order_{order_id}" / "input" / "files" / stored,
        workspace_root / f"order_{order_id}" / "extracted" / "customer_sources" / original,
        workspace_root / f"order_{order_id}" / "extracted" / "customer_sources" / stored,
    ])
    # Keep ordering deterministic and avoid resolving broad/globbed paths.
    unique: list[Path] = []
    seen: set[str] = set()
    for candidate in candidates:
        key = str(candidate.resolve(strict=False)).lower()
        if key not in seen:
            seen.add(key)
            unique.append(candidate)
    return unique


def materialize_local_file(workspace: Path, workspace_root: Path, order_id: str, item: dict[str, Any], target: Path) -> Path | None:
    for candidate in local_candidates(workspace, workspace_root, order_id, item):
        if not _usable(candidate, item):
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        if candidate.resolve() != target.resolve():
            shutil.copy2(candidate, target)
        return target
    return None
