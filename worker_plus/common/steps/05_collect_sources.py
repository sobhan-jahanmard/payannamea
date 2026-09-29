from __future__ import annotations

from pathlib import Path
from typing import Any

from common.helpers import write_json, write_text
from common.input_files import materialize_local_file, safe_name, target_name

TITLE = "Collect required sources"

def run(context: dict[str, Any], services: Any) -> None:
    order = context["order"]
    source_dir = services.workspace / "extracted" / "customer_sources"
    source_dir.mkdir(parents=True, exist_ok=True)
    records: list[dict[str, Any]] = []
    for file in order.get("files", []):
        name = safe_name(file.get("original_name") or file.get("stored_name"))
        target = source_dir / name
        if not target.exists():
            input_target = services.workspace / "input" / "files" / target_name(file)
            local = materialize_local_file(
                services.workspace, services.config.workspace_root, str(context["order_id"]), file, input_target,
            )
            if local is not None:
                target.write_bytes(local.read_bytes())
        if not target.exists() or not target.stat().st_size:
            raise RuntimeError(f"Uploaded source {name} is not available in the prepared local inputs")
        records.append({"id": file.get("id"), "name": name, "type": file.get("file_type"), "path": str(target.relative_to(services.workspace)), "size_bytes": target.stat().st_size, "required": True})
    references = order.get("references", [])
    write_json(services.workspace / "extracted" / "references.json", {"references": references, "uploaded_sources": records})
    write_text(services.workspace / "reports" / "reference_usage_report.md", f"# Reference Usage Report\n\n- {len(references)} structured reference(s) supplied with the order.\n- {len(records)} uploaded source file(s) are mandatory drafting inputs.\n")
    context["artifacts"]["references"] = "extracted/references.json"
    context["artifacts"]["customer_sources"] = "extracted/customer_sources"
