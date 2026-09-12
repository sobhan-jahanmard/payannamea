from __future__ import annotations

import re
from typing import Any

from utils.helpers import write_text

TITLE = "Audit source-rule compliance"

def persian_word_count(text: str) -> int:
    return len(re.findall(r"[آ-ی]{2,}", text))


def run(context: dict[str, Any], services: Any) -> None:
    source = services.workspace / context["artifacts"]["source"]
    contract = services.workspace / context["artifacts"]["resolved_source_rules"]
    report = services.workspace / "reports" / "source_compliance_audit.md"
    checks: list[tuple[str, str, str]] = []
    source_text = source.read_text(encoding="utf-8") if source.exists() else ""
    contract_text = contract.read_text(encoding="utf-8") if contract.exists() else ""

    blocked_markers = ("محیط اجرای فایل", "دسترسی محیط", "قرارداد Markdownی تولید نکردم")
    contract_ok = bool(contract_text.strip()) and not any(marker in contract_text for marker in blocked_markers)
    checks.append(("قرارداد منابع قابل‌خواندن و بدون خطای زیرساختی است", "PASS" if contract_ok else "FAIL", str(contract.relative_to(services.workspace))))

    minimum_words = 1200 if context.get("mode") == "sample" else 6000
    source_ok = source.exists() and persian_word_count(source_text) >= minimum_words
    checks.append((f"متن خروجی دست‌کم {minimum_words} واژهٔ فارسی دارد", "PASS" if source_ok else "FAIL", str(source.relative_to(services.workspace))))

    structure_ok = "# منابع" in source_text and not any(marker in source_text for marker in ("TODO", "TBD", "[NEEDS"))
    checks.append(("ساختار منابع و نبود placeholderها", "PASS" if structure_ok else "FAIL", "# منابع / TODO / TBD / [NEEDS"))

    citations = set(re.findall(r"\[(\d+)\]", source_text))
    references = source_text.partition("# منابع")[2]
    references_ok = not citations or all(
        re.search(rf"(?:^|\n)\s*(?:\[{re.escape(number)}\]|{re.escape(number)}[.)])", references)
        for number in citations
    )
    checks.append(("استنادهای متن در فهرست منابع قابل‌ردیابی‌اند", "PASS" if references_ok else "FAIL", ", ".join(sorted(citations)) or "بدون استناد شماره‌ای"))

    passed = all(status == "PASS" for _, status, _ in checks)
    lines = ["STATUS: PASS" if passed else "STATUS: FAIL", "", "| قانون | وضعیت | شاهد |", "|---|---|---|"]
    lines.extend(f"| {rule} | {status} | `{evidence}` |" for rule, status, evidence in checks)
    write_text(report, "\n".join(lines) + "\n")
    if not passed:
        raise RuntimeError("Independent source-rule audit failed; publication is blocked")
    context["artifacts"]["source_compliance_audit"] = str(report.relative_to(services.workspace))
