from __future__ import annotations

from pathlib import Path
from typing import Any

from common.api import download_file
from common.helpers import write_json, write_text

TITLE = "Collect required sources"

def run(context: dict[str, Any], services: Any) -> None:
    order = context["order"]
    source_dir = services.workspace / "extracted" / "customer_sources"
    source_dir.mkdir(parents=True, exist_ok=True)
    records: list[dict[str, Any]] = []
    for file in order.get("files", []):
        name = Path(str(file.get("original_name") or file.get("stored_name") or "source.bin")).name.replace("..", "_")
        target = source_dir / name
        url = file.get("url")
        if not url:
            raise RuntimeError(f"Uploaded source {name} has no download URL")
        if not target.exists():
            download_file(services.config, str(url), target)
        if not target.exists() or not target.stat().st_size:
            raise RuntimeError(f"Uploaded source {name} could not be downloaded")
        records.append({"id": file.get("id"), "name": name, "type": file.get("file_type"), "path": str(target.relative_to(services.workspace)), "size_bytes": target.stat().st_size, "required": True})
    references = order.get("references", [])
    write_json(services.workspace / "extracted" / "references.json", {"references": references, "uploaded_sources": records})
    write_text(services.workspace / "reports" / "reference_usage_report.md", f"# Reference Usage Report\n\n- {len(references)} structured reference(s) supplied with the order.\n- {len(records)} uploaded source file(s) are mandatory drafting inputs.\n")
    context["artifacts"]["references"] = "extracted/references.json"
    context["artifacts"]["customer_sources"] = "extracted/customer_sources"
