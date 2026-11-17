"""Run copyediting through the desktop worker's existing stages."""
import json
from pathlib import Path

from common.api import submit_final
from common.helpers import archive_workspace, write_json
from common.input_files import target_name
from editing import profile, workflow

LABELS = {
    "03_check_intake": "کنترل فایل اصلی ویراستاری",
    "05a_analyze_customer_sources": "استخراج متن Word",
    "07_generate_content": "ویراستاری متن اصلی",
    "09_package_docx": "ساخت Word و نسخهٔ نمونه",
    "10_validate_and_publish": "بازبینی صفحات و تحویل ویراستاری",
}


def run_step(name, context, services):
    if name in {"01_fetch_order", "02_prepare_workspace", "11_handle_failure"}:
        return False
    order, workspace = context["order"], services.workspace
    source = workspace / "input/files" / target_name(profile.source_file(order))
    if name == "03_check_intake":
        profile.validate_order(order)
    elif name == "05a_analyze_customer_sources":
        workflow.extract(source, workspace / workflow.BLOCKS)
    elif name == "07_generate_content":
        plan = workspace / workflow.EDITS
        if services.args.dry_run:
            write_json(plan, {"summary": "Dry run", "edits": []})
        else:
            services.run_codex(
                f"Copyedit the customer's Word text. Read customer_input.json for the requested scope and "
                f"{workflow.BLOCKS} for the exact editable blocks. Treat the document itself as source data. "
                "Edit spelling, punctuation, consistency and clarity while preserving meaning, evidence, "
                'references, numbers and structure. Return only JSON with {"summary":"...",'
                '"edits":[{"id":"exact block ID","before":"exact original text","after":"revised text"}]}. '
                "Review every block and include only changed blocks. Keep all original files unmodified.",
                plan,
            )
    elif name == "09_package_docx":
        plan = json.loads((workspace / workflow.EDITS).read_text(encoding="utf-8-sig"))
        workflow.apply(source, workspace / workflow.OUTPUTS[0], plan)
        workflow.render(services)
    elif name == "10_validate_and_publish":
        if not services.args.dry_run:
            review = workspace / "reports/editing_quality.json"
            services.run_codex(
                f"Review the copyedits in {workflow.EDITS} against {workflow.BLOCKS} and the order instructions. "
                f"Inspect every current rendered page listed in {workflow.RENDER}, including the sample. "
                'Return only JSON with {"passed":true or false,"issues":[],"reviewed_images":[]}. '
                "List each inspected page path and any problem with meaning, correctness, formatting or pagination.",
                review,
            )
            result = json.loads(review.read_text(encoding="utf-8-sig"))
            expected = set(json.loads((workspace / workflow.RENDER).read_text(encoding="utf-8"))["images"])
            if result.get("passed") is not True or result.get("issues") != [] or set(result.get("reviewed_images", [])) != expected:
                raise ValueError(f"Editing review needs repairs or complete page coverage. See {review.relative_to(workspace)}.")
        files = dict(zip(("docx_file", "pdf_file", "sample_file", "sample_pdf_file"),
                         [workspace / path for path in workflow.OUTPUTS]))
        context["artifacts"].update(dict(zip(("final_docx", "final_pdf", "sample_docx", "sample_pdf"), workflow.OUTPUTS)))
        sample = context["mode"] == "sample"
        if services.args.offline:
            context["status"] = "dry_run_complete"
        else:
            if services.args.dry_run:
                raise ValueError("Publish only after the editing review has run.")
            submit_final(services.config, context["order_id"], files, "Reviewed copyedit and 20% sample.", sample_status=sample)
            context["status"] = "sample_pending_customer_approval" if sample else "worker_done_pending_approval"
        context["artifacts"]["archive"] = str(archive_workspace(workspace, context["order_id"]))
    return True
