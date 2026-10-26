from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Any


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent,
                                     prefix=path.name + ".", suffix=".tmp", delete=False) as stream:
        temporary = Path(stream.name)
        try:
            json.dump(value, stream, ensure_ascii=False, indent=2)
        except Exception:
            stream.close()
            temporary.unlink(missing_ok=True)
            raise
    try:
        for attempt in range(8):
            try:
                temporary.replace(path)
                return
            except PermissionError:
                if attempt == 7:
                    raise
                time.sleep(min(.02 * 2 ** attempt, .2))
    finally:
        temporary.unlink(missing_ok=True)


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def archive_workspace(workspace: Path, order_id: str) -> Path:
    archive = workspace.parent / f"order_{order_id}"
    # A retained order directory may itself be the active workspace. Never
    # delete its contents while trying to archive it onto the same directory.
    if archive.resolve() == workspace.resolve():
        return workspace
    if archive.exists():
        shutil.rmtree(archive)
    shutil.copytree(workspace, archive)
    return archive


def run_command(command: list[str], cwd: Path) -> None:
    result = subprocess.run(command, cwd=str(cwd), check=False)
    if result.returncode:
        raise RuntimeError(f"Command exited with code {result.returncode}: {' '.join(command)}")
