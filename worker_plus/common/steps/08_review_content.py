from typing import Any
from common.helpers import write_text

TITLE = "Review content"

def run(context: dict[str, Any], services: Any) -> None:
    source = services.workspace / context["artifacts"]["source"]
    text = source.read_text(encoding="utf-8")
    prohibited = [marker for marker in ("TODO", "TBD", "[NEEDS") if marker in text]
    if prohibited:
        raise RuntimeError("Generated text contains placeholders: " + ", ".join(prohibited))
    admin_notes = [note for note in context["order"].get("review_notes", []) if str(note.get("note") or "").strip()]
    admin_audit = services.workspace / "reports" / "admin_instruction_audit.md"
    if admin_notes:
        if admin_audit.exists():
            admin_audit.unlink()
        contract = services.workspace / context["artifacts"]["resolved_source_rules"]
        prompt = f"""متن {services.profile.DISPLAY_NAME} در `{source.relative_to(services.workspace)}` و قرارداد قواعد اجباری در `{contract.relative_to(services.workspace)}` را ممیزی کن.

تمرکز اصلی روی بخش «قواعد اجباری اختصاصی مدیر» است. تک‌تک یادداشت‌های مدیر را با شاهد مشخص از متن خروجی بررسی کن. صرف وجود یادداشت در قرارداد، رعایت آن محسوب نمی‌شود. اگر هر دستور اجرا نشده، ناقص، متناقض یا بدون شاهد است، STATUS: FAIL بده. در غیر این صورت STATUS: PASS بده. پاسخ فقط یک گزارش Markdown کوتاه شامل خط اول وضعیت و جدول «دستور | وضعیت | شاهد» باشد. هیچ فایلی را تغییر نده."""
        services.run_codex(prompt, admin_audit)
        audit_text = admin_audit.read_text(encoding="utf-8") if admin_audit.exists() else ""
        if not audit_text.lstrip().startswith("STATUS: PASS"):
            raise RuntimeError("Mandatory admin-instruction audit failed; generation must be corrected before publication")
        context["artifacts"]["admin_instruction_audit"] = str(admin_audit.relative_to(services.workspace))
    write_text(
        services.workspace / "reports" / "compliance_report.md",
        "# Compliance Report\n\nPASS — no raw placeholder marker found.\n\n"
        f"Mandatory admin instructions included in the governing contract: {len(admin_notes)}.\n",
    )
