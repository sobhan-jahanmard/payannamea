import json
from importlib import import_module
from typing import Any
from common.helpers import write_json, write_text
from common.deliverable_policy import deliverable_contract, deterministic_content_issues
from common.page_budget import page_budget

TITLE = "Review content"

def run(context: dict[str, Any], services: Any) -> None:
    source = services.workspace / context["artifacts"]["source"]
    text = source.read_text(encoding="utf-8")
    prohibited = [marker for marker in ("TODO", "TBD", "[NEEDS") if marker in text]
    if prohibited:
        raise RuntimeError("Generated text contains placeholders: " + ", ".join(prohibited))
    decision_contract = deliverable_contract(context["order"])
    budget = page_budget(context["order"])
    budget_instruction = f"سفارش {budget['minimum']} صفحه است و PDF نهایی حداکثر {budget['maximum']} صفحه دارد. تکرار، زیربخش و جدول غیرضروری را نیز FAIL کن؛ اصلاح باید فشرده و نتیجه‌محور بماند." if budget else ""
    research_path = services.workspace / context["artifacts"]["research_evidence"]
    research_stage = import_module("common.steps.05c_research_evidence")
    required_research = research_stage.research_deliverables(
        decision_contract["deliverables"],
        (services.workspace / context["artifacts"]["resolved_source_rules"]).read_text(encoding="utf-8"),
    )
    decision_audit = services.workspace / "reports" / "decision_content_audit.md"
    audit_prompt = f"""متن `{source.relative_to(services.workspace)}`، قرارداد خروجی `{context['artifacts']['order_execution_contract']}`، قواعد منابع `{context['artifacts']['resolved_source_rules']}` و پژوهش اجراشده `{research_path.relative_to(services.workspace)}` و `research/analysis.md` را ممیزی کن.

برای تک‌تک deliverableها بررسی کن که متن فقط روش را آموزش نداده و واقعاً دادهٔ وب استخراج‌شده، شاهد قابل ردیابی، اجرای روش، محاسبه/مقایسه، نتیجه مشخص و محدودیت دارد. ادعا و اعداد را با ledger پژوهش تطبیق بده. اگر دادهٔ ایران در ledger یافت نشده، متن باید نبود دادهٔ ایران، کشور جانشین و محدودیت تعمیم را کنار نتیجه روشن کند. تناسب عمق با سطح تحصیلی، نبود تکرار معنایی و قرارگرفتن مطالب قبل از جمع‌بندی را نیز بررسی کن. اگر یک خروجی با عبارت‌های توصیه‌ای، فهرست داده‌های لازم، عدد بدون منشأ یا جزئیات نامرتبط جایگزین شده است FAIL بده. {budget_instruction}

این مرحله فقط محتوای پژوهش در Markdown را ممیزی می‌کند. فایل‌های جداگانهٔ گزارش میانی، Word و PDF در مرحله‌های بسته‌بندی بعدی ساخته می‌شوند؛ نبود آن فایل‌ها را در این مرحله FAIL نده. اما محتوای الزامی آن‌ها، از جمله تحلیل بازار و فنی، صورت سود و زیان، جریان نقد و ترازنامهٔ سناریویی با فرض‌های روشن، باید همین حالا در متن موجود باشد. اگر داده قطعی نیست، محاسبهٔ سناریویی شفاف و برچسب‌دار انجام بده؛ صرف فهرست داده‌های لازم کافی نیست.

خط اول دقیقاً `STATUS: PASS` یا `STATUS: FAIL` و سپس جدول «خروجی محتوایی | شاهد | اجرای روش | نتیجه | وضعیت | اقدام اصلاحی» باشد. هیچ فایلی را تغییر نده."""
    recovery_attempts = []
    for attempt in range(1, 4):
        current_text = source.read_text(encoding="utf-8")
        deterministic_issues = deterministic_content_issues(current_text, decision_contract)
        research = json.loads(research_path.read_text(encoding="utf-8"))
        deterministic_issues.extend(research_stage.evidence_issues(research, required_research))
        if any(item.get("status") == "proxy" for item in research.get("deliverables", [])) and "ایران یافت نشد" not in current_text:
            deterministic_issues.append("دادهٔ جانشین خارجی بدون اعلام نبود دادهٔ ایران ارائه شده است")
        if decision_audit.exists():
            decision_audit.unlink()
        services.run_codex(audit_prompt, decision_audit)
        audit_text = decision_audit.read_text(encoding="utf-8") if decision_audit.exists() else ""
        passed = not deterministic_issues and audit_text.lstrip().startswith("STATUS: PASS")
        recovery_attempts.append({"attempt": attempt, "passed": passed, "issues": deterministic_issues})
        if passed:
            break
        if attempt == 3:
            details = "; ".join(deterministic_issues) if deterministic_issues else "AI decision audit failed"
            write_json(services.workspace / "reports" / "stage_checks" / "decision_content_recovery.json", {"passed": False, "attempts": recovery_attempts})
            raise RuntimeError("Decision-content quality gate failed: " + details)
        repair_report = services.workspace / "reports" / "stage_checks" / f"decision_content_repair_{attempt}.md"
        if repair_report.exists():
            repair_report.unlink()
        repair_prompt = f"""ممیزی `{decision_audit.relative_to(services.workspace)}` و کنترل قطعی زیر نشان می‌دهد متن `{source.relative_to(services.workspace)}` ناقص است:
{chr(10).join('- ' + issue for issue in deterministic_issues) or '- موارد FAIL گزارش ممیزی AI'}

قرارداد `{context['artifacts']['order_execution_contract']}`، شواهد `{research_path.relative_to(services.workspace)}` و محاسبات `research/analysis.md` را بخوان و خود فایل متن را مستقیم اصلاح کن. شناسه‌های خروجی اجباری دفتر شواهد را حذف یا تغییر نام نده؛ یافته‌های تکمیلی را فقط به‌صورت ورودی اضافی بیفزا. فقط بخش‌های محتوایی ناقص را با دادهٔ واقعی وب، شاهد، اجرای روش، محاسبه/مقایسه و نتیجه مشخص تعمیر کن. صورت‌های مالی ناقص را با فرض‌های سناریوییِ صریح، محاسبهٔ قابل‌بازتولید و تراز متوازن تکمیل کن؛ عدد فرضی را آمار واقعی معرفی نکن. برای شکاف شواهد دوباره وب را جست‌وجو کن و ledger پژوهش را نیز اصلاح کن؛ دادهٔ خارجی را با کشور و محدودیت تعمیم اعلام کن. فایل‌های گزارش میانی و Word/PDF در مراحل بعد ساخته می‌شوند؛ در این تعمیر فقط Markdown و در صورت نیاز ledger را اصلاح کن. متن راهنماگونه، داده جعلی، تکرار فصل و افزودن محتوا پس از جمع‌بندی ممنوع است. منبع تازه معتبر را با citation منطبق اضافه کن. {budget_instruction} پاسخ خودت فقط گزارش کوتاه تعمیر باشد."""
        services.run_codex(repair_prompt, repair_report)
    write_json(services.workspace / "reports" / "stage_checks" / "deterministic_content_audit.json", {
        "passed": True,
        "project_type": decision_contract["project_type"],
        "issues": [],
    })
    write_json(services.workspace / "reports" / "stage_checks" / "decision_content_recovery.json", {"passed": True, "attempts": recovery_attempts})
    context["artifacts"]["decision_content_audit"] = str(decision_audit.relative_to(services.workspace))
    admin_notes = [note for note in context["order"].get("review_notes", []) if str(note.get("note") or "").strip()]
    admin_audit = services.workspace / "reports" / "admin_instruction_audit.md"
    if admin_notes:
        contract = services.workspace / context["artifacts"]["resolved_source_rules"]
        attempts = []
        for attempt in range(1, 7):
            if admin_audit.exists():
                admin_audit.unlink()
            prompt = f"""متن {services.profile.DISPLAY_NAME} در `{source.relative_to(services.workspace)}` و قرارداد قواعد اجباری در `{contract.relative_to(services.workspace)}` را ممیزی کن.

تمرکز اصلی روی بخش «قواعد اجباری اختصاصی مدیر» است. تک‌تک یادداشت‌های مدیر را با شاهد مشخص از متن خروجی بررسی کن. صرف وجود یادداشت در قرارداد، رعایت آن محسوب نمی‌شود. اگر هر دستور اجرا نشده، ناقص، متناقض یا بدون شاهد است، STATUS: FAIL بده. در غیر این صورت STATUS: PASS بده. پاسخ فقط یک گزارش Markdown کوتاه شامل خط اول وضعیت و جدول «دستور | وضعیت | شاهد» باشد. هیچ فایلی را تغییر نده."""
            services.run_codex(prompt, admin_audit)
            audit_text = admin_audit.read_text(encoding="utf-8") if admin_audit.exists() else ""
            passed = audit_text.lstrip().startswith("STATUS: PASS")
            attempts.append({"attempt": attempt, "passed": passed})
            if passed:
                break
            repair = services.workspace / "reports" / "stage_checks" / f"admin_instruction_repair_{attempt}.md"
            repair_prompt = f"""ممیزی `{admin_audit.relative_to(services.workspace)}` نشان می‌دهد بعضی دستورهای اجباری مدیر در `{source.relative_to(services.workspace)}` رعایت نشده‌اند. گزارش و قرارداد `{contract.relative_to(services.workspace)}` را بخوان و خود فایل متن را مستقیم و با کمترین تغییر لازم اصلاح کن. همهٔ دستورهای FAIL را واقعاً در محتوا اجرا کن، شاهد روشن ایجاد کن، منابع و شکل‌های درست را حفظ کن و چیزی جعل نکن. فقط گزارش کوتاه تعمیر را در خروجی بنویس."""
            services.run_codex(repair_prompt, repair)
        else:
            write_json(services.workspace / "reports" / "stage_checks" / "admin_instruction_recovery.json", {"passed": False, "attempts": attempts})
            raise RuntimeError("Mandatory admin-instruction audit remained unresolved after recovery loop")
        write_json(services.workspace / "reports" / "stage_checks" / "admin_instruction_recovery.json", {"passed": True, "attempts": attempts})
        context["artifacts"]["admin_instruction_audit"] = str(admin_audit.relative_to(services.workspace))
    write_text(
        services.workspace / "reports" / "compliance_report.md",
        "# Compliance Report\n\nPASS — no raw placeholder marker found.\n\n"
        f"Mandatory admin instructions included in the governing contract: {len(admin_notes)}.\n",
    )
