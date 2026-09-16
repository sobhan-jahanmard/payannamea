"""Turn every meaningful intake field into an explicit, auditable worker contract."""
from __future__ import annotations

from typing import Any

from common.helpers import write_json, write_text
from common.visual_policy import visual_requirements

TITLE = "Build order execution contract"

CONTENT_FIELDS = {
    "order_type": "نوع خروجی و ساختار تخصصی",
    "degree": "سطح علمی و لحن",
    "field_of_study": "دامنه و واژگان تخصصی",
    "methodology": "روش پژوهش و شیوه تحلیل",
    "language": "زبان تمام متن، شکل‌ها و برچسب‌ها",
    "academic_style": "سبک citation و فهرست منابع",
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
    }
    write_json(services.workspace / "planning" / "order_execution_contract.json", contract)
    lines = ["# قرارداد اجرایی سفارش", "", "این قرارداد در طرح، تولید، کنترل و انتشار اجباری است.", "", "## داده‌های مؤثر"]
    lines.extend(f"- **{key}**: {CONTENT_FIELDS[key]} — `{value}`" for key, value in active.items())
    lines.extend(["", "## الزام بصری", f"- مبنای حجم: {visual_policy['page_equivalent']} صفحهٔ معادل", f"- حداقل شکل معنادار: {visual_policy['minimum_total_visuals']}", f"- حداقل نمودار/گراف: {visual_policy['minimum_charts_or_graphs']}", f"- سیاست تراکم: {visual_policy['basis']}", "- نمودار تزئینی، خالی، بدون منبع یا بدون ارتباط روشن با استدلال سفارش مردود است.", "- هر شکل باید عنوان، منبع/فرض شفاف، ارجاع در متن و تأیید بصری AI داشته باشد."])
    write_text(services.workspace / "planning" / "order_execution_contract.md", "\n".join(lines) + "\n")
    context["artifacts"]["order_execution_contract"] = "planning/order_execution_contract.md"
    context["artifacts"]["order_execution_contract_json"] = "planning/order_execution_contract.json"
