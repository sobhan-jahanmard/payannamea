"""Publish an already completed local package without rebuilding it."""

from __future__ import annotations

from pathlib import Path

from common.api import claim_oldest, fetch_order_read_only, heartbeat, submit_final
from common.order_context import load, save


def publish_local(config, workspace: Path, expected_order_id: str) -> None:
    context = load(workspace)
    order_id = context.get("order_id")
    if not order_id or order_id != expected_order_id:
        raise ValueError("The selected order does not match the active local workspace.")
    if context.get("status") != "dry_run_complete" or "10_validate_and_publish" not in context.get("completed_steps", []):
        raise ValueError("Only a completed, unpublished local package can be published.")

    presentation = context.get("order", {}).get("order_type") == "ارائه و پاورپوینت"
    editable_name = "final.pptx" if presentation else "final.docx"
    sample_name = "sample.pptx" if presentation else "sample.docx"
    files = {
        "pptx_file" if presentation else "docx_file": workspace / "final" / editable_name,
        "pdf_file": workspace / "final" / "final.pdf",
        "sample_file": workspace / "final" / sample_name,
        "sample_pdf_file": workspace / "final" / "sample.pdf",
    }
    for path in files.values():
        if not path.is_file() or path.stat().st_size == 0:
            raise ValueError(f"Local package file is missing or empty: {path.name}")

    # Check the order before claiming it; a different order type would receive
    # an incompatible package. The claim itself provides the required server lock.
    remote_order = fetch_order_read_only(config, order_id)
    if remote_order.get("order_type") != context["order"].get("order_type"):
        raise ValueError("The server order type changed after the local run.")
    claim_oldest(config, order_id, redo=True)
    heartbeat(config, order_id, "Publishing the completed local package without regeneration.")
    sample_status = context.get("mode") == "sample"
    submit_final(config, order_id, files, "Published existing local files without regeneration.", sample_status=sample_status)

    context["status"] = "sample_pending_customer_approval" if sample_status else "worker_done_pending_approval"
    context["offline"] = False
    context["current_step"] = None
    save(workspace, context)
    print("Local package published successfully; files were not regenerated.", flush=True)
