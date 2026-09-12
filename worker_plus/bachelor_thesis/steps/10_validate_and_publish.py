import importlib
import json
from typing import Any
from utils.api import submit_sample, submit_final
from utils.helpers import archive_workspace, write_json, write_text

TITLE = "Validate and publish"

REPAIRABLE_LAYOUT_ERRORS = (
    "Persian runs do not use the required font",
    "Persian paragraphs have invalid direction or alignment",
    "Persian runs are missing RTL direction",
    "Word RTL enforcement left",
    "Word reports",
    "cover page spacing audit failed",
    "cover typography audit failed",
    "cover layout audit failed",
    "top-level sections missing required page break",
)


def repair_layout(context: dict[str, Any], services: Any, source: Any, docx: Any, rules: dict[str, Any]) -> None:
    """Restart at packaging (step 12), then replay every dependent formatter."""
    for module_name in (
        "steps.09_package_docx",
        "steps.09b_polish_cover",
        "steps.10b_finalize_persian_pagination",
        "steps.10c_verify_persian_pagination",
    ):
        importlib.import_module(module_name).run(context, services)


def _append_before_references(source: str, addition: str) -> str:
    """Keep the single, reviewed reference list at the end of the source."""
    body, marker, references = source.partition("# منابع")
    suffix = marker + references if marker else ""
    return body.rstrip() + "\n\n" + addition.strip() + "\n\n" + suffix


def complete_page_target(context: dict[str, Any], services: Any, source: Any, docx: Any, rules: dict[str, Any]) -> int | None:
    """Add genuine analytical sections until Word itself reports the requested size.

    A word-count estimate is only used to size a continuation request.  It is never
    used as the pass condition: every iteration rebuilds the DOCX and asks Word for
    its rendered page count.
    """
    order = context["order"]
    if context["mode"] == "sample" or order.get("quantity_type") != "pages":
        return None
    required_pages = int(order.get("quantity_value") or 0)
    if required_pages <= 0:
        return None

    progress_path = services.workspace / "reports" / "stage_checks" / "page_completion.json"
    progress: list[dict[str, int]] = []
    for attempt in range(1, 13):
        # Packaging on every pass makes this a rendered-Word feedback loop rather
        # than a blind batch of text generation.
        services.write_docx(source, docx, order.get("title") or "پایان‌نامه کارشناسی", rules, order)
        actual_pages = services.count_docx_pages(docx)
        progress.append({"attempt": attempt, "actual_pages": actual_pages, "required_pages": required_pages})
        write_json(progress_path, {"passed": actual_pages >= required_pages, "attempts": progress})
        if actual_pages >= required_pages:
            return actual_pages

        missing_pages = required_pages - actual_pages
        # The safety margin absorbs page-flow variation caused by headings/tables;
        # this requests substantive content, never blank pages or forced breaks.
        batch_words = max(3000, missing_pages * 560)
        continuation = services.workspace / "drafts" / f"page_completion_{attempt}.md"
        if continuation.exists():
            continuation.unlink()
        prompt = f"""برای پایان‌نامه کارشناسی «{order.get('title')}» یک بخش تحلیلیِ جدید، دقیق و غیرتکراری حدود {batch_words} واژه بنویس تا کمبود {missing_pages} صفحهٔ واقعی Word جبران شود.

فقط Markdown با ## و ### و پاراگراف‌های کامل بده؛ «# منابع» یا فهرست منابع نساز. فقط از استنادهای موجود [1] تا [7] استفاده کن و هیچ داده، آمار، نتیجه، مجوز یا منبع جعلی نساز. تمرکز را بر ابعاد تکمیلیِ پروژهٔ طراحی کارخانه بگذار: تحلیل زنجیره تأمین PET، مشخصات و کنترل خوراک، طراحی فرایند و موازنه‌های مفهومی، انتخاب و ظرفیت‌سنجی تجهیزات، جانمایی و جریان مواد، برنامه‌ریزی تولید و کنترل کیفیت، HSE، مجوزها و انطباق، بازار و تدارکات، ساختار سازمانی و نیروی انسانی، مدیریت ریسک، سناریوهای مالیِ مبتنی بر فرض‌های شفاف و برنامه اجرا. از مطالب قبلی تکرار نکن. از ابزار فایل و shell استفاده نکن؛ فقط متن نهایی را بده."""
        services.run_codex(prompt, continuation)
        addition = continuation.read_text(encoding="utf-8").strip() if continuation.exists() else ""
        if not addition:
            raise RuntimeError("Page-completion continuation was empty")
        source.write_text(_append_before_references(source.read_text(encoding="utf-8"), addition), encoding="utf-8")

    raise RuntimeError(
        f"Rendered Word page target was not reached after {len(progress)} content-extension attempts "
        f"({progress[-1]['actual_pages']}/{required_pages})"
    )

def run(context: dict[str, Any], services: Any) -> None:
    docx = services.workspace / context["artifacts"]["docx"]
    if not docx.exists() or docx.stat().st_size == 0:
        raise RuntimeError("DOCX output is missing")
    source = services.workspace / context["artifacts"]["source"]
    rules = json.loads((services.workspace / context["artifacts"]["university_rules"]).read_text(encoding="utf-8"))
    complete_page_target(context, services, source, docx, rules)
    repair_attempts: list[dict[str, Any]] = []
    for attempt in range(1, 4):
        try:
            services.validate_docx(source, docx, rules, services.workspace / "reports" / "stage_checks" / "docx_quality.json", context["mode"], context["order"])
            repair_attempts.append({"attempt": attempt, "result": "passed"})
            break
        except RuntimeError as error:
            message = str(error)
            repairable = any(marker in message for marker in REPAIRABLE_LAYOUT_ERRORS)
            repair_attempts.append({"attempt": attempt, "result": "failed", "repairable": repairable, "restart_step": 12, "error": message})
            if not repairable or attempt == 3:
                write_json(services.workspace / "reports" / "stage_checks" / "docx_quality_repair.json", {"passed": False, "attempts": repair_attempts})
                raise
            repair_layout(context, services, source, docx, rules)
    else:
        raise RuntimeError("DOCX quality validation did not complete")
    write_json(services.workspace / "reports" / "stage_checks" / "docx_quality_repair.json", {"passed": True, "attempts": repair_attempts})
    order_id = context["order_id"]
    pdf = services.workspace / "final" / ("sample.pdf" if context["mode"] == "sample" else "final.pdf")
    word_name = services.workspace / "final" / ("sample.docx" if context["mode"] == "sample" else "final.docx")
    if docx != word_name:
        word_name.write_bytes(docx.read_bytes())
    services.export_pdf(word_name, pdf)
    if services.args.offline:
        context["status"] = "dry_run_complete"
        context["artifacts"]["archive"] = str(archive_workspace(services.workspace, order_id))
        return
    if context["mode"] == "sample":
        submit_sample(services.config, order_id, word_name, pdf, "Worker Plus sample generated; awaiting customer approval.")
        context["status"] = "sample_pending_customer_approval"
    else:
        files = {"docx_file": word_name, "pdf_file": pdf}
        submit_final(services.config, order_id, files, "Worker Plus completed the review package.")
        context["status"] = "worker_done_pending_approval"
    context["artifacts"]["archive"] = str(archive_workspace(services.workspace, order_id))
