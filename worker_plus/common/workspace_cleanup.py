"""Delete only the active local run selected by the desktop application."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import stat
import sys
import uuid
from pathlib import Path

from common.execution_lock import execution_lock


def _is_link(path: Path) -> bool:
    metadata = path.lstat()
    return stat.S_ISLNK(metadata.st_mode) or bool(
        getattr(metadata, "st_file_attributes", 0) & getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0)
    )


def _count_and_check_files(root: Path, selected: Path) -> int:
    current = root
    for part in selected.relative_to(root).parts:
        current /= part
        if _is_link(current):
            raise ValueError(f"پاک‌سازی مسیر دارای لینک یا junction مجاز نیست: {current}")
    count = 0
    for directory, names, files in os.walk(selected, followlinks=False):
        for name in names + files:
            path = Path(directory) / name
            if _is_link(path):
                raise ValueError(f"پاک‌سازی مسیر دارای لینک یا junction مجاز نیست: {path}")
        count += len(files)
    return count


def cleanup(order_id: str, workspace: str) -> dict[str, object]:
    root = Path(__file__).resolve().parents[1] / "workspace"
    root = root.resolve()
    with execution_lock(root):
        pointer = json.loads((root / "active.json").read_text(encoding="utf-8"))
        relative = Path(pointer["path"])
        if relative.is_absolute() or ".." in relative.parts or relative.parts not in (("in_progress",),) and not (
            len(relative.parts) == 2 and relative.parts[0] == "runs" and relative.parts[1] not in ("", ".", "..")
        ):
            raise ValueError("مسیر اجرای فعال معتبر نیست.")
        selected = root / relative
        if not selected.is_dir() or selected.resolve() != Path(workspace).resolve():
            raise ValueError("مسیر انتخاب‌شده با اجرای فعال یکسان نیست.")
        if not selected.resolve().is_relative_to(root):
            raise ValueError("مسیر اجرا خارج از workspace است.")
        file_count = _count_and_check_files(root, selected)
        context = json.loads((selected / "order_context.json").read_text(encoding="utf-8"))
        if not order_id or context.get("order_id") != order_id:
            raise ValueError("شناسه سفارش با اجرای فعال یکسان نیست.")
        tombstone = selected.with_name(f".cleanup-{selected.name}-{uuid.uuid4().hex}")
        selected.rename(tombstone)
        try:
            shutil.rmtree(tombstone)
        except OSError as exc:
            try:
                tombstone.rename(selected)
            except OSError:
                raise RuntimeError(f"پاک‌سازی کامل نشد؛ پوشهٔ موقت را بررسی کنید: {tombstone}") from exc
            raise RuntimeError(f"پاک‌سازی کامل نشد؛ فایل باز را ببندید و دوباره تلاش کنید: {exc}") from exc
        return {"reset": True, "files_removed": file_count, "workspace": str(selected)}


def main() -> None:
    parser = argparse.ArgumentParser(description="Clean the active Worker Plus run")
    parser.add_argument("--order-id", required=True)
    parser.add_argument("--workspace", required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(cleanup(args.order_id, args.workspace), ensure_ascii=False))
    except (OSError, ValueError, KeyError, TypeError, RuntimeError) as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1) from exc


if __name__ == "__main__":
    main()
