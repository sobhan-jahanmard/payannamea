import importlib
import json
from typing import Any
from docx import Document
from common.api import submit_final
from common.helpers import archive_workspace, write_json, write_text
from common.visual_policy import visual_requirements

TITLE = "Validate and publish"

REPAIRABLE_LAYOUT_ERRORS = (
    "Persian runs do not use the required font",
    "Persian paragraphs have invalid direction or alignment",
    # Covers both the singular and plural validator wording.
    "Persian run",
    "Persian body paragraphs are not justified",
    "Word RTL enforcement left",
    "Word reports",
    "cover page spacing audit failed",
    "cover typography audit failed",
    "cover layout audit failed",
    "top-level sections missing required page break",
    "table of contents",
)


def repair_layout(context: dict[str, Any], services: Any, source: Any, docx: Any, rules: dict[str, Any]) -> None:
    """Restart at packaging (step 12), then replay every dependent formatter."""
    for module_name in (
        "common.steps.09_package_docx",
        "common.steps.09b_polish_cover",
        "common.steps.10b_finalize_persian_pagination",
        "common.steps.10c_verify_persian_pagination",
    ):
        importlib.import_module(module_name).run(context, services)


def _append_before_references(source: str, addition: str) -> str:
    """Keep the single, reviewed reference list at the end of the source."""
    body, marker, references = source.partition("# منابع")
    suffix = marker + references if marker else ""
    return body.rstrip() + "\n\n" + addition.strip() + "\n\n" + suffix


def _is_chart_kind(value: object) -> bool:
    normalized = str(value or "").strip().lower()
    return normalized in {"chart", "graph"} or "نمودار" in normalized or "گراف" in normalized


def enforce_visual_policy(context: dict[str, Any], services: Any, source: Any, docx: Any) -> None:
    """Recheck visual density at the publication boundary, including resumed runs."""
    policy = visual_requirements(context["order"])
    required_total = int(policy["minimum_total_visuals"])
    required_charts = int(policy["minimum_charts_or_graphs"])
    if not required_total and not required_charts:
        return

    plan = services.workspace / context["artifacts"].get("visual_plan", "planning/visual_plan.json")
    manifest = services.workspace / context["artifacts"].get("visual_manifest", "final/figures/manifest.json")
    try:
        visuals = json.loads(plan.read_text(encoding="utf-8")).get("visuals", [])
    except (FileNotFoundError, json.JSONDecodeError):
        visuals = []
    try:
        figures = json.loads(manifest.read_text(encoding="utf-8")).get("figures", [])
    except (FileNotFoundError, json.JSONDecodeError):
        figures = []

    source_text = source.read_text(encoding="utf-8") if source.exists() else ""
    valid_figures = [item for item in figures if isinstance(item, dict)]
    manifest_charts = sum(_is_chart_kind(item.get("kind")) for item in valid_figures)
    referenced = []
    existing = []
    for item in valid_figures:
        raw_path = str(item.get("path") or "")
        asset = services.workspace / raw_path
        relative_from_final = raw_path.replace("\\", "/")
        if relative_from_final.startswith("final/"):
            relative_from_final = relative_from_final[len("final/"):]
        existing.append(bool(raw_path) and asset.is_file() and asset.stat().st_size > 0)
        referenced.append(bool(raw_path) and f"]({relative_from_final})" in source_text)
    inline_shapes = len(Document(docx).inline_shapes) if docx.exists() else 0

    failures = []
    if len(visuals) < required_total:
        failures.append(f"visual plan {len(visuals)}/{required_total}")
    if len(valid_figures) < required_total:
        failures.append(f"generated figures {len(valid_figures)}/{required_total}")
    if manifest_charts < required_charts:
        failures.append(f"charts/graphs {manifest_charts}/{required_charts}")
    if sum(existing) < required_total:
        failures.append(f"existing PNG assets {sum(existing)}/{required_total}")
    if sum(referenced) < required_total:
        failures.append(f"figures referenced in source {sum(referenced)}/{required_total}")
    if inline_shapes < required_total:
        failures.append(f"figures embedded in DOCX {inline_shapes}/{required_total}")

    report_path = services.workspace / "reports" / "stage_checks" / "visual_policy_gate.json"
    write_json(report_path, {
        "passed": not failures,
        "policy": policy,
        "observed": {
            "planned": len(visuals), "generated": len(valid_figures),
            "charts_or_graphs": manifest_charts, "existing_assets": sum(existing),
            "source_references": sum(referenced), "docx_inline_shapes": inline_shapes,
        },
        "failures": failures,
    })
    if failures:
        raise RuntimeError("Visual policy gate failed: " + "; ".join(failures))


def complete_page_target(context: dict[str, Any], services: Any, source: Any, docx: Any, rules: dict[str, Any]) -> int | None:
    """Add genuine analytical sections until Word itself reports the requested size.

    A word-count estimate is only used to size a continuation request.  It is never
    used as the pass condition: every iteration rebuilds the DOCX and asks Word for
    its rendered page count.
    """
    order = context["order"]
    if order.get("quantity_type") != "pages":
        return None
    required_pages = int(order.get("quantity_value") or 0)
    if required_pages <= 0:
        return None

    progress_path = services.workspace / "reports" / "stage_checks" / "page_completion.json"
    progress: list[dict[str, int]] = []
    for attempt in range(1, 13):
        # Packaging on every pass makes this a rendered-Word feedback loop rather
        # than a blind batch of text generation.
        services.write_docx(source, docx, order.get("title") or services.profile.DISPLAY_NAME, rules, order)
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
        prompt = f"""برای {services.profile.DISPLAY_NAME} «{order.get('title')}» یک بخش تحلیلیِ جدید، دقیق و غیرتکراری حدود {batch_words} واژه بنویس تا کمبود {missing_pages} صفحهٔ واقعی Word جبران شود.

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


def audit_visual_quality(context: dict[str, Any], services: Any, pdf: Any) -> None:
    """Require a vision-capable AI review of the asset itself and its final layout."""
    order = context["order"]
    required = int(visual_requirements(order)["minimum_total_visuals"])
    if not required:
        return
    manifest = services.workspace / context["artifacts"].get("visual_manifest", "final/figures/manifest.json")
    if not manifest.exists():
        raise RuntimeError("Required visuals have no manifest for visual quality review")
    services.render_pdf_pages(pdf, services.workspace / "reports" / "rendered_pages")
    report = services.workspace / "reports" / "visual_quality_audit.md"
    prompt = f"""ممیزی بصری اجباری سفارش «{order.get('title')}» را انجام بده. manifest تصاویر در `{manifest.relative_to(services.workspace)}`، خود PNGها در `final/figures/` و صفحات رندرشدهٔ PDF در `reports/rendered_pages/` هستند.

هر PNG و صفحهٔ PDF حاوی آن را با ابزار مشاهدهٔ تصویر بررسی کن. خط اول پاسخ دقیقاً `STATUS: PASS` یا `STATUS: FAIL` باشد و سپس جدولی با ستون‌های «شکل | کیفیت حرفه‌ای | محتوای واقعی/منبع | خوانایی و RTL | تناسب با استدلال | صفحهٔ PDF | نتیجه» بده.

فقط وقتی PASS بده که همهٔ شکل‌ها حرفه‌ای، خوانا، دارای برچسب درست، بدون برش/هم‌پوشانی، و مفید برای استدلال باشند. نمودار یا گراف تزئینی، خالی، بی‌محتوا، کلیشه‌ای، بدون داده/منبع/فرض روشن، یا نامرتبط با موضوع باید FAIL شود؛ صرف زیبا بودن برای PASS کافی نیست. بررسی کن که نمودار واقعاً ادعای قابل‌فهم و مرتبطی را منتقل می‌کند، نه اینکه فقط برای پُرکردن صفحه اضافه شده باشد. نمودار الزامی: {'بله' if order.get('requires_charts') else 'خیر'}."""
    services.run_codex(prompt, report)
    text = report.read_text(encoding="utf-8") if report.exists() else ""
    if not text.lstrip().startswith("STATUS: PASS"):
        raise RuntimeError("AI visual quality audit failed; publication is blocked")
    context["artifacts"]["visual_quality_audit"] = str(report.relative_to(services.workspace))

def run(context: dict[str, Any], services: Any) -> None:
    docx = services.workspace / context["artifacts"]["docx"]
    if not docx.exists() or docx.stat().st_size == 0:
        raise RuntimeError("DOCX output is missing")
    source = services.workspace / context["artifacts"]["source"]
    rules = json.loads((services.workspace / context["artifacts"]["university_rules"]).read_text(encoding="utf-8"))
    enforce_visual_policy(context, services, source, docx)
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
    pdf = services.workspace / "final" / "final.pdf"
    word_name = services.workspace / "final" / "final.docx"
    if docx != word_name:
        word_name.write_bytes(docx.read_bytes())
    pdf_font = rules["font"]["persian"]
    services.export_pdf(word_name, pdf, pdf_font)
    audit_visual_quality(context, services, pdf)
    sample_docx = services.workspace / "final" / "sample.docx"
    sample_pdf = services.workspace / "final" / "sample.pdf"
    full_pages, sample_pages = services.create_first_half_sample(word_name, sample_docx)
    services.export_pdf(sample_docx, sample_pdf, pdf_font)
    context["artifacts"].update({
        "final_docx": str(word_name.relative_to(services.workspace)),
        "final_pdf": str(pdf.relative_to(services.workspace)),
        "sample_docx": str(sample_docx.relative_to(services.workspace)),
        "sample_pdf": str(sample_pdf.relative_to(services.workspace)),
    })
    write_json(services.workspace / "reports" / "stage_checks" / "sample_excerpt.json", {
        "full_pages": full_pages, "sample_pages": sample_pages, "source": "first half of rendered final.docx pages",
    })
    if services.args.offline:
        context["status"] = "dry_run_complete"
        context["artifacts"]["archive"] = str(archive_workspace(services.workspace, order_id))
        return
    is_sample_status = context["mode"] == "sample"
    files = {"docx_file": word_name, "pdf_file": pdf, "sample_file": sample_docx, "sample_pdf_file": sample_pdf}
    submit_final(
        services.config,
        order_id,
        files,
        "Worker generated the full and first-half sample review package.",
        sample_status=is_sample_status,
    )
    context["status"] = "sample_pending_customer_approval" if is_sample_status else "worker_done_pending_approval"
    context["artifacts"]["archive"] = str(archive_workspace(services.workspace, order_id))
