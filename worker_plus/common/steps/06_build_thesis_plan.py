from typing import Any
import json
from common.helpers import write_text
from common.deliverable_policy import deliverable_contract
from common.page_budget import page_budget

TITLE = "Build thesis plan"

def run(context: dict[str, Any], services: Any) -> None:
    title = context["order"].get("title") or services.profile.DISPLAY_NAME
    admin_rules_path = services.workspace / context["artifacts"]["admin_internal_rules"]
    admin_rules = admin_rules_path.read_text(encoding="utf-8")
    contract = services.workspace / context["artifacts"]["order_execution_contract"]
    evidence = services.workspace / context["artifacts"]["research_evidence"]
    decision_contract = deliverable_contract(context["order"])
    rules_path = services.workspace / context["artifacts"].get("university_rules", "extracted/university_rules.json")
    rules = json.loads(rules_path.read_text(encoding="utf-8")) if rules_path.exists() else None
    budget = page_budget(context["order"], rules=rules)
    section_name = "بخش" if context["order"].get("order_type") == "تحقیق دانشگاهی" else "فصل"
    evidence_limit = ("اگر شاهد از زمینه‌ای متفاوت به کار رفته، تفاوت زمینه و محدودیت تعمیم را در همان بخش توضیح بده." if section_name == "بخش" else "اگر دادهٔ ایران یافت نشده، کشور جانشین و محدودیت انتقال باید در همان بخش ذکر شود.")
    deliverable_lines = [
        f"\n\n## ماتریس اجباری {section_name}‌ها و خروجی‌ها",
        "",
        "هر ردیف باید در outline نهایی به یک بخش اجرایی متصل شود. بخشی که فقط روش را توضیح دهد ناقص است.",
        "",
    ]
    deliverable_lines.extend(
        f"- **{item['id']}**: {item['question']} — روش: {item['method']} — خروجی قابل پذیرش: {item['output']}"
        for item in decision_contract["deliverables"]
    )
    plan = (
        services.profile.build_plan(title, admin_rules)
        + (f"\n\n## بودجهٔ حجم\n\nنسخهٔ نهایی شامل جلد، همهٔ فهرست‌ها، متن، شکل‌ها، جدول‌ها و منابع باید {budget['minimum']} تا {budget['maximum']} صفحهٔ PDF واقعی باشد. برآورد اولیه: {budget['reserved_nonbody_pages']} صفحه جلد/چکیده/فهرست/منابع، {budget['reserved_visual_pages']} صفحه شکل، {budget['reserved_table_pages']} صفحه جدول و {budget['estimated_text_pages']} صفحه متن اصلی. کل Markdown را نزدیک {budget['suggested_content_words']} واژه و حداکثر {budget['maximum_content_words']} واژه برنامه‌ریزی کن. برای {section_name}‌های محتوایی سهم تقریبی تعیین کن؛ بیشترین فضا را به محاسبه، مقایسه و نتیجهٔ خروجی‌های اجباری بده. {section_name}‌ها و جدول‌های هم‌پوشان را ادغام کن؛ برای هر خروجی اجباری شاهد و نتیجه نگه دار. بخش فرعی صرفاً برای افزایش حجم اضافه نکن.\n" if budget else "")
        + "\n\n## قرارداد اجرایی سفارش\n\n"
        + contract.read_text(encoding="utf-8")
        + "\n".join(deliverable_lines)
        + f"\n\n## پژوهش اجراشده\n\nبرای هر بخش از `{evidence.relative_to(services.workspace)}` و `research/analysis.md` داده، محاسبه و نتیجهٔ موجود را بیاور. {evidence_limit}\n"
    )
    write_text(services.workspace / "planning" / "outline.md", plan)
    write_text(services.workspace / "planning" / "chapter_plan.md", plan)
    context["artifacts"]["plan"] = "planning/outline.md"
