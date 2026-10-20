"""Turn every meaningful intake field into an explicit, auditable worker contract."""
from __future__ import annotations

from typing import Any
import json

from common.helpers import write_json, write_text
from common.visual_policy import visual_requirements
from common.deliverable_policy import deliverable_contract
from common.page_budget import page_budget

TITLE = "Build order execution contract"

CONTENT_FIELDS = {
    "order_type": "نوع خروجی و ساختار تخصصی",
    "degree": "سطح علمی و لحن",
    "field_of_study": "دامنه و واژگان تخصصی",
    "methodology": "روش پژوهش و شیوه تحلیل",
    "language": "زبان تمام متن، شکل‌ها و برچسب‌ها",
    "title": "موضوع محوری و عنوان خروجی",
    "student_name": "اطلاعات جلد",
    "title_english": "عنوان انگلیسی در صورت نیاز",
    "abstract": "مسئله، محدوده و چکیدهٔ ورودی",
    "keywords": "کلیدواژه‌ها و محورهای پوشش",
    "university": "قواعد دانشگاه و اطلاعات جلد",
    "faculty": "اطلاعات جلد و ساختار دانشگاهی",
    "department": "اطلاعات جلد و زمینه تخصصی",
    "advisor_name": "جلد",
    "consultant_name": "جلد",
    "instructor_name": "جلد و زمینه درس",
    "course_name": "هدف و زمینه درس",
    "quantity_type": "واحد هدف خروجی",
    "quantity_value": "حداقل حجم/تعداد واقعی خروجی",
    "requires_charts": "الزام نمودار/گراف حرفه‌ای و دارای محتوا",
    "notes": "دستورهای اختصاصی مشتری",
    "references": "منابع ساخت‌یافتهٔ اجباری و نحوهٔ استفاده از آن‌ها",
    "files": "فایل‌های آپلودشدهٔ اجباری و قواعد استخراج‌شده از آن‌ها",
}


def run(context: dict[str, Any], services: Any) -> None:
    order = context["order"]
    active = {key: order.get(key) for key in CONTENT_FIELDS if order.get(key) not in (None, "", False, 0)}
    visual_policy = visual_requirements(order)
    deliverables = deliverable_contract(order)
    rules_path = services.workspace / context["artifacts"].get("university_rules", "extracted/university_rules.json")
    rules = json.loads(rules_path.read_text(encoding="utf-8")) if rules_path.exists() else None
    budget = page_budget(order, rules=rules)
    contract = {
        "order_id": order["id"],
        "content_inputs": active,
        "metadata_only": ["correspondence_email", "student_number", "moarref_code", "deadline", "payment_status"],
        "visual_policy": visual_policy,
        "chart_required": bool(order.get("requires_charts")),
        "visual_quality_gate": {
            "require_real_subject_matter": True,
            "prohibit_decorative_or_empty_charts": True,
            "require_source_or_explicit_assumptions": True,
            "require_caption_and_in_text_reference": True,
            "require_ai_visual_review_of_asset_and_rendered_page": True,
        },
        "deliverable_contract": deliverables,
        "page_budget": budget,
        "research_policy": {
            "web_research_required": True,
            "search_order": ["exact Iranian data", "relevant foreign or adjacent-context data", "explicit design assumption"],
            "source_record": ["URL", "publisher", "geography", "year", "retrieved date", "extracted fact and unit"],
            "proxy_disclosure": "If Iranian data is unavailable, state that explicitly and name the proxy country and transfer limit.",
            "completion": "Execute the calculations and decisions; a method description alone is insufficient.",
        },
    }
    write_json(services.workspace / "planning" / "order_execution_contract.json", contract)
    lines = ["# قرارداد اجرایی سفارش", "", "این قرارداد در طرح، تولید، کنترل و انتشار اجباری است.", "", "## داده‌های مؤثر"]
    lines.extend(f"- **{key}**: {CONTENT_FIELDS[key]} — `{value}`" for key, value in active.items())
    lines.extend(["", "## الزام بصری", f"- مبنای حجم: {visual_policy['page_equivalent']} صفحهٔ معادل", f"- حداقل شکل معنادار: {visual_policy['minimum_total_visuals']}", f"- حداقل نمودار/گراف: {visual_policy['minimum_charts_or_graphs']}", f"- سیاست تراکم: {visual_policy['basis']}", "- نمودار تزئینی، خالی، بدون منبع یا بدون ارتباط روشن با استدلال سفارش مردود است.", "- هر شکل باید عنوان، منبع/فرض شفاف، ارجاع در متن و تأیید بصری AI داشته باشد."])
    if budget:
        lines.extend(["", "## بودجهٔ صفحات تحویلی", f"- حداقل: {budget['minimum']} صفحهٔ PDF واقعی", f"- سقف مجاز: {budget['maximum']} صفحهٔ PDF واقعی، با احتساب جلد، فهرست‌ها، شکل‌ها، جدول‌ها و منابع", f"- برآورد صفحات: {budget['reserved_nonbody_pages']} صفحه برای جلد، چکیده، فهرست‌ها و منابع؛ {budget['reserved_visual_pages']} صفحه برای شکل‌ها؛ {budget['reserved_table_pages']} صفحه برای جدول‌ها؛ {budget['estimated_text_pages']} صفحه برای متن اصلی", f"- برآورد متن: حدود {budget['suggested_content_words']} واژه برای کل Markdown و سقف اولیهٔ {budget['maximum_content_words']} واژه", "- پس از نهایی‌شدن نقشهٔ بصری، سهم متن با تعداد واقعی شکل‌ها دوباره محاسبه می‌شود. شمارش صفحات Word و PDF پس از صفحه‌آرایی معیار نهایی است.", "- حجم مازاد با ادغام و تلخیص تکرارها اصلاح می‌شود؛ شاهد، محاسبه و نتیجهٔ خروجی‌های اجباری نباید حذف شوند."])
    lines.extend(["", "## قرارداد خروجی تصمیم‌محور", f"- نوع پروژه: `{deliverables['project_type']}`", f"- سطح علمی: `{deliverables['academic_level']}`", f"- قاعده تکمیل: {deliverables['completion_rule']}", f"- کمبود داده: {deliverables['missing_data_rule']}"])
    lines.extend(["", "## الزام پژوهش وب", "- دادهٔ هر خروجی ابتدا از صفحهٔ واقعی وب استخراج و با URL، ناشر، سال، جغرافیا و واحد ثبت شود.", "- نبود دادهٔ ایران باید با جست‌وجوی ثبت‌شده اثبات و در متن اعلام شود؛ دادهٔ کشور دیگر با نام کشور و محدودیت تعمیم به‌کار رود.", "- پس از استخراج، محاسبه/مقایسه و نتیجهٔ مشخص اجرا شود؛ شرح روش به‌تنهایی خروجی نیست."])
    for item in deliverables["deliverables"]:
        lines.append(f"- **{item['id']}** — پرسش: {item['question']} | شاهد: {item['evidence']} | روش: {item['method']} | خروجی: {item['output']}")
    write_text(services.workspace / "planning" / "order_execution_contract.md", "\n".join(lines) + "\n")
    context["artifacts"]["order_execution_contract"] = "planning/order_execution_contract.md"
    context["artifacts"]["order_execution_contract_json"] = "planning/order_execution_contract.json"
