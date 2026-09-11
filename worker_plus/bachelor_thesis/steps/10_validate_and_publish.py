from typing import Any
from utils.api import submit_sample, submit_final
from utils.helpers import archive_workspace, write_text

TITLE = "Validate and publish — اعتبارسنجی و انتشار"

def run(context: dict[str, Any], services: Any) -> None:
    docx = services.workspace / context["artifacts"]["docx"]
    if not docx.exists() or docx.stat().st_size == 0:
        raise RuntimeError("DOCX output is missing")
    order_id = context["order_id"]
    if services.args.offline:
        context["status"] = "dry_run_complete"
        context["artifacts"]["archive"] = str(archive_workspace(services.workspace, order_id))
        return
    if context["mode"] == "sample":
        submit_sample(services.config, order_id, docx, "Worker Plus sample generated; awaiting customer approval.")
        context["status"] = "sample_pending_customer_approval"
    else:
        write_text(services.workspace / "final" / "README.md", "# Final package\n\nPrepared by Worker Plus for human review.\n")
        files = {"deliverable_source": services.workspace / context["artifacts"]["source"], "docx_file": docx, "compliance_report": services.workspace / "reports" / "compliance_report.md", "reference_usage_report": services.workspace / "reports" / "reference_usage_report.md", "human_review_checklist": services.workspace / "reports" / "human_review_checklist.md", "final_readme": services.workspace / "final" / "README.md"}
        submit_final(services.config, order_id, files, "Worker Plus completed the review package.")
        context["status"] = "worker_done_pending_approval"
    context["artifacts"]["archive"] = str(archive_workspace(services.workspace, order_id))
