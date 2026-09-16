from __future__ import annotations

import hashlib
import re
from typing import Any

from common.helpers import write_json, write_text

TITLE = "Audit source-rule compliance"

_DIGIT_TO_ASCII = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")


def canonical_number(value: str) -> str:
    """Compare citation identifiers independently of their digit glyphs."""
    return value.translate(_DIGIT_TO_ASCII)

def persian_word_count(text: str) -> int:
    return len(re.findall(r"[آ-ی]{2,}", text))


def evaluate(context: dict[str, Any], services: Any) -> tuple[bool, list[tuple[str, str, str]]]:
    source = services.workspace / context["artifacts"]["source"]
    contract = services.workspace / context["artifacts"]["resolved_source_rules"]
    checks: list[tuple[str, str, str]] = []
    source_text = source.read_text(encoding="utf-8") if source.exists() else ""
    contract_text = contract.read_text(encoding="utf-8") if contract.exists() else ""

    blocked_markers = ("محیط اجرای فایل", "دسترسی محیط", "قرارداد Markdownی تولید نکردم")
    contract_ok = bool(contract_text.strip()) and not any(marker in contract_text for marker in blocked_markers)
    checks.append(("قرارداد منابع قابل‌خواندن و بدون خطای زیرساختی است", "PASS" if contract_ok else "FAIL", str(contract.relative_to(services.workspace))))

    admin_notes = [str(note.get("note") or "").strip() for note in context["order"].get("review_notes", []) if str(note.get("note") or "").strip()]
    admin_rules_ok = all(note in contract_text for note in admin_notes)
    checks.append((
        f"تمام {len(admin_notes)} یادداشت داخلی مدیر در قرارداد اجباری ثبت شده‌اند",
        "PASS" if admin_rules_ok else "FAIL",
        context["artifacts"].get("admin_internal_rules", "extracted/admin_internal_rules.md"),
    ))

    minimum_words = 6000
    source_ok = source.exists() and persian_word_count(source_text) >= minimum_words
    checks.append((f"متن خروجی دست‌کم {minimum_words} واژهٔ فارسی دارد", "PASS" if source_ok else "FAIL", str(source.relative_to(services.workspace))))

    structure_ok = "# منابع" in source_text and not any(marker in source_text for marker in ("TODO", "TBD", "[NEEDS"))
    checks.append(("ساختار منابع و نبود placeholderها", "PASS" if structure_ok else "FAIL", "# منابع / TODO / TBD / [NEEDS"))

    citations = {canonical_number(value) for value in re.findall(r"\[([0-9۰-۹٠-٩]+)\]", source_text)}
    references = source_text.partition("# منابع")[2].translate(_DIGIT_TO_ASCII)
    references_ok = not citations or all(
        re.search(rf"(?:^|\n)\s*(?:\[{re.escape(number)}\]|{re.escape(number)}[.)])", references)
        for number in citations
    )
    checks.append(("استنادهای متن در فهرست منابع قابل‌ردیابی‌اند", "PASS" if references_ok else "FAIL", ", ".join(sorted(citations)) or "بدون استناد شماره‌ای"))

    return all(status == "PASS" for _, status, _ in checks), checks


def write_report(report: Any, passed: bool, checks: list[tuple[str, str, str]]) -> None:
    lines = ["STATUS: PASS" if passed else "STATUS: FAIL", "", "| قانون | وضعیت | شاهد |", "|---|---|---|"]
    lines.extend(f"| {rule} | {status} | `{evidence}` |" for rule, status, evidence in checks)
    write_text(report, "\n".join(lines) + "\n")


def repair_source(context: dict[str, Any], services: Any, failed_rules: list[str], attempt: int) -> None:
    """Ask Codex to make a minimal, evidence-preserving repair in the source file."""
    source = services.workspace / context["artifacts"]["source"]
    contract = services.workspace / context["artifacts"]["resolved_source_rules"]
    response = services.workspace / "reports" / "stage_checks" / f"source_compliance_repair_{attempt}.md"
    if response.exists():
        response.unlink()
    before = hashlib.sha256(source.read_bytes()).hexdigest() if source.exists() else ""
    rules = "\n".join(f"- {rule}" for rule in failed_rules)
    prompt = f"""فایل Markdown نهایی در `{source.relative_to(services.workspace)}` در ممیزی منابع رد شده است. با ابزار فایل، همین فایل را مستقیماً ویرایش کن؛ متن کامل را در پاسخ بازنویسی نکن.

فقط این خطاها را با کمترین تغییر لازم اصلاح کن:
{rules}

قرارداد منابع در `{contract.relative_to(services.workspace)}` و منابع آپلودشدهٔ مشتری در `extracted/customer_sources/` هستند. قواعد قطعی:
1) بخش `# منابع` باید وجود داشته باشد.
2) هر ارجاع عددی در متن مانند `[1]` باید دقیقاً یک مدخل قابل‌ردیابی با همان شماره در بخش منابع داشته باشد؛ قالب مجاز آغاز خط `[{1}]` یا `{1}.` است.
3) هر `TODO`، `TBD` و `[NEEDS` را حذف یا با متن نهاییِ مستند جایگزین کن.
4) منبع یا داده جعلی نساز. اگر برای یک استناد منبع معتبر در فایل‌ها وجود ندارد، آن استناد و ادعای وابسته را به یک فرض/پیشنهادِ صریح و بدون استناد تبدیل کن.
5) ساختار، حجم، شکل‌ها و محتوای درستِ فعلی را حفظ کن. پس از ویرایش فقط یک تأیید کوتاه بده.
"""
    services.run_codex(prompt, response)
    after = hashlib.sha256(source.read_bytes()).hexdigest() if source.exists() else ""
    if not after or after == before:
        raise RuntimeError("Source-compliance repair made no change to deliverable_source.md")


def run(context: dict[str, Any], services: Any) -> None:
    report = services.workspace / "reports" / "source_compliance_audit.md"
    attempts: list[dict[str, Any]] = []
    for attempt in range(1, 4):
        passed, checks = evaluate(context, services)
        write_report(report, passed, checks)
        failed_rules = [rule for rule, status, _ in checks if status != "PASS"]
        attempts.append({"attempt": attempt, "passed": passed, "failed_rules": failed_rules})
        if passed:
            write_json(services.workspace / "reports" / "stage_checks" / "source_compliance_repair.json", {"passed": True, "attempts": attempts})
            context["artifacts"]["source_compliance_audit"] = str(report.relative_to(services.workspace))
            return
        if attempt < 3:
            repair_source(context, services, failed_rules, attempt)

    write_json(services.workspace / "reports" / "stage_checks" / "source_compliance_repair.json", {"passed": False, "attempts": attempts})
    raise RuntimeError("Independent source-rule audit failed after 2 repair attempts; publication is blocked")
