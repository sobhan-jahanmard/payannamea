from pathlib import Path
import shutil
from typing import Any
from common.api import download_file
from common.helpers import write_json, write_text

TITLE = "Prepare workspace"

def run(context: dict[str, Any], services: Any) -> None:
    workspace = services.workspace
    if not services.args.resume:
        for child in workspace.iterdir():
            if child.name != "order_context.json":
                if child.is_dir():
                    shutil.rmtree(child)
                else:
                    child.unlink()
    for relative in ("input/files", "extracted", "planning", "drafts", "final", "reports", "reports/stage_checks"):
        (workspace / relative).mkdir(parents=True, exist_ok=True)
    write_json(workspace / "customer_input.json", context["order"])
    files = []
    for item in context["order"].get("files", []):
        target = workspace / "input" / "files" / f"{item['file_type']}__{item['original_name']}"
        # Downloading an input file is a read-only backend operation.  Offline
        # runs of a real order need the same inputs, but never claim or update it.
        download_file(services.config, item["url"], target)
        files.append(str(target))
    context["artifacts"]["input_files"] = files
    write_text(workspace / "reports" / "human_review_checklist.md", "# Human Review Checklist\n\n- موارد نیازمند بررسی در مرحله‌های بعد ثبت می‌شوند.\n")
