from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path
from typing import Any


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(path)


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def archive_workspace(workspace: Path, order_id: str) -> Path:
    archive = workspace.parent / f"order_{order_id}"
    if archive.exists():
        shutil.rmtree(archive)
    shutil.copytree(workspace, archive)
    return archive


def run_command(command: list[str], cwd: Path) -> None:
    result = subprocess.run(command, cwd=str(cwd), check=False)
    if result.returncode:
        raise RuntimeError(f"Command exited with code {result.returncode}: {' '.join(command)}")
