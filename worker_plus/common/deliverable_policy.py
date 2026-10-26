"""Configurable, domain-aware deliverable contracts and deterministic content checks."""
from __future__ import annotations

import re
from typing import Any


GUIDANCE_PHRASES = (
    "می‌توان بررسی کرد", "می توان بررسی کرد", "برای برآورد باید", "برای محاسبه باید",
    "پیشنهاد می‌شود در آینده", "پیشنهاد می شود در آینده", "داده لازم برای",
    "می‌تواند از دو مسیر", "می تواند از دو مسیر", "لازم است بررسی شود",
)


FACTORY_MARKERS = (
    "کارخانه", "احداث واحد", "ایجاد واحد", "امکان سنجی", "امکان‌سنجی",
    "طرح توجیهی", "طراحی واحد", "تولید صنعتی", "جانمایی", "چیدمان",
)


def classify_project(order: dict[str, Any]) -> str:
    if str(order.get("order_type") or "") == "تحقیق دانشگاهی":
        return "course_research"
    corpus = " ".join(str(order.get(key) or "") for key in (
        "title", "abstract", "keywords", "notes", "field_of_study", "methodology",
    )).lower()
    if any(marker in corpus for marker in FACTORY_MARKERS):
        return "factory_design"
    order_type = str(order.get("order_type") or "")
    if "پروپوزال" in order_type:
        return "proposal"
    if "ارائه" in order_type or "پاورپوینت" in order_type:
        return "presentation"
    return "academic_research"


BASE_DELIVERABLES = [
    {
        "id": "problem_conclusion",
        "question": "مسئله اصلی چیست و گزارش در پایان چه پاسخ قابل دفاعی به آن می‌دهد؟",
        "evidence": "منابع معتبر و ورودی‌های سفارش",
        "method": "تحلیل و تلفیق شواهد",
        "output": "پاسخ روشن، محدودیت‌ها و نتیجه نهایی",
    },
    {
        "id": "traceable_evidence",
        "question": "کدام شواهد از ادعاهای اصلی پشتیبانی می‌کنند؟",
        "evidence": "منبع قابل ردیابی برای ادعاهای علمی، آماری و مقرراتی",
        "method": "ماتریس ادعا-شاهد و کنترل استناد",
        "output": "ادعاهای مستند و فهرست منابع منطبق",
    },
]


FACTORY_DELIVERABLES = [
    {"id": "market_demand", "question": "تقاضای محصول و صنایع مصرف‌کننده چه میزان‌اند؟", "evidence": "داده رسمی یا صنعتی دارای سال و جغرافیا", "method": "محاسبه تقاضا با فرمول، داده جانشین یا سناریو", "output": "برآورد عددی تقاضا و بازار هدف"},
    {"id": "feedstock", "question": "خوراک کافی با چه مقدار، قیمت و ریسکی قابل تأمین است؟", "evidence": "آمار تولید/پسماند، تأمین‌کنندگان یا داده جانشین", "method": "موازنه دسترسی و سناریوی تأمین", "output": "ظرفیت قابل اتکا و راهبرد تأمین"},
    {"id": "technology_selection", "question": "کدام فناوری باید انتخاب شود؟", "evidence": "گزینه‌های واقعی و معیارهای فنی-اقتصادی", "method": "مقایسه و امتیازدهی شفاف", "output": "فناوری منتخب و دلایل انتخاب"},
    {"id": "capacity_equipment", "question": "ظرفیت و تجهیزات موردنیاز چیست؟", "evidence": "موازنه جرم، زمان کار و ظرفیت نامی", "method": "ظرفیت‌سنجی", "output": "تعداد، ظرفیت و مشخصات اصلی تجهیزات"},
    {"id": "layout", "question": "فضا و چیدمان پیشنهادی چیست؟", "evidence": "جریان مواد، روابط فعالیت و مساحت‌ها", "method": "OPC/BOM، From-To، Relationship Chart یا SLP متناسب", "output": "مساحت و طرح بلوکی چیدمان"},
    {"id": "economics", "question": "طرح در چه شرایطی توجیه‌پذیر است؟", "evidence": "فرض‌های قیمت، ظرفیت، CAPEX و OPEX", "method": "سناریو، نقطه سربه‌سر و شاخص مالی متناسب", "output": "نتیجه اقتصادی و تحلیل حساسیت"},
    {"id": "implementation", "question": "طرح چگونه اجرا و کنترل می‌شود؟", "evidence": "فعالیت‌ها، وابستگی‌ها، مجوزها و ریسک‌ها", "method": "WBS، زمان‌بندی و ثبت ریسک", "output": "برنامه اجرای مرحله‌ای و نقاط تصمیم"},
]

COURSE_RESEARCH_DELIVERABLES = [
    {"id": "research_question", "question": "پرسش مشخص این تحقیق در چارچوب درس چیست؟", "evidence": "شرح سفارش، زمینه درس و ادبیات معتبر موضوع", "method": "تعیین دامنه، معیار بررسی و پرسش قابل پاسخ", "output": "پرسش و دامنه روشن و مرتبط با درس"},
    {"id": "method_application", "question": "روش اعلام‌شده چگونه روی شواهد این موضوع اجرا می‌شود؟", "evidence": "منابع و داده‌های قابل ردیابی متناسب با روش", "method": "اجرای مقایسه، تحلیل یا محاسبه متناسب با روش سفارش", "output": "یافته‌های مشخص همراه با محدودیت و نتیجه"},
]


def deliverable_contract(order: dict[str, Any]) -> dict[str, Any]:
    project_type = classify_project(order)
    deliverables = [dict(item) for item in BASE_DELIVERABLES]
    if project_type == "factory_design":
        deliverables.extend(dict(item) for item in FACTORY_DELIVERABLES)
    elif project_type == "course_research":
        deliverables.extend(dict(item) for item in COURSE_RESEARCH_DELIVERABLES)
    return {
        "project_type": project_type,
        "academic_level": str(order.get("degree") or order.get("order_type") or "نامشخص"),
        "deliverables": deliverables,
        "completion_rule": "هر خروجی باید شاهد، اجرای روش و نتیجه مشخص داشته باشد؛ شرح روش به تنهایی پذیرفته نیست.",
        "missing_data_rule": (
            "منبع مستقیم و مرتبط با پرسش و دامنهٔ جغرافیایی سفارش جست‌وجو شود؛ اگر دامنهٔ جغرافیایی تعیین نشده، منبع معتبر بین‌المللی نیز مستقیم است. دادهٔ جانشین با تفاوت زمینه و محدودیت تعمیم مشخص شود؛ فرض یا مثال محاسباتی با برچسب روشن از یافتهٔ تجربی جدا باشد. روش و نتیجه اجرا شود؛ متن پرکننده ممنوع است."
            if project_type == "course_research" else
            "ابتدا جست‌وجوی وب برای دادهٔ ایران؛ در نبود آن دادهٔ معتبر کشور/زمینهٔ دیگر با ذکر نبود دادهٔ ایران، نام جغرافیا و محدودیت تعمیم؛ سپس فرض طراحی و سناریوی شفاف با ثبت جست‌وجوهای ناموفق. محاسبه و نتیجه اجرا شود؛ متن پرکننده ممنوع است."
        ),
    }


def heading_duplicates(markdown: str) -> list[str]:
    normalized: dict[str, int] = {}
    for heading in re.findall(r"(?m)^#{1,3}\s+(.+?)\s*$", markdown):
        key = re.sub(r"[\s\u200c:؛،,.()]+", " ", heading).strip().lower()
        # Repeated generic headings are dangerous even when prefixed by a chapter label.
        key = re.sub(r"^(?:فصل\s+\S+\s*)", "", key).strip()
        normalized[key] = normalized.get(key, 0) + 1
    return sorted(key for key, count in normalized.items() if count > 1 and key not in {"مقدمه"})


def deterministic_content_issues(markdown: str, contract: dict[str, Any]) -> list[str]:
    issues: list[str] = []
    if any(phrase in markdown for phrase in GUIDANCE_PHRASES):
        issues.append("متن دارای عبارت‌های راهنماگونه به‌جای اجرای تحلیل است")
    duplicates = heading_duplicates(markdown)
    if duplicates:
        issues.append("عنوان یا بخش تکراری: " + "، ".join(duplicates[:6]))
    if contract.get("project_type") == "factory_design":
        checks = {
            "market_demand": (r"تقاضا", r"\d|[۰-۹]"),
            "technology_selection": (r"فناوری|تکنولوژی", r"منتخب|انتخاب شد|پیشنهاد نهایی"),
            "capacity_equipment": (r"تجهیزات", r"تعداد|ظرفیت"),
            "layout": (r"چیدمان|جانمایی", r"OPC|BOM|From[- ]?To|SLP|نمودار رابطه|طرح بلوکی|مساحت"),
        }
        for deliverable_id, patterns in checks.items():
            if not all(re.search(pattern, markdown, re.I) for pattern in patterns):
                issues.append(f"خروجی اجباری {deliverable_id} فاقد شاهد نتیجه‌محور است")
    return issues
