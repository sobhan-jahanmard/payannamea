import json
from pathlib import Path
from common.profile_support import validate_order as _validate_order

ORDER_TYPE = "ارائه و پاورپوینت"
DISPLAY_NAME = "ارائه و پاورپوینت"
REQUIRED_FIELDS = ("title", "course_name")

SOURCE_EXTENSIONS = {".docx", ".pdf", ".pptx", ".txt", ".md"}


def information_sources(order):
    return [item for item in order.get("files", []) if item.get("file_type") == "information_source"
            and Path(str(item.get("original_name") or "")).suffix.lower() in SOURCE_EXTENSIONS
            and int(item.get("size_bytes") or 0) > 0]


def validate_order(order):
    _validate_order(order, ORDER_TYPE)
    from presentation.design import resolve_design
    resolve_design(order)
    if not information_sources(order):
        raise ValueError("برای ارائه و پاورپوینت حداقل یک فایل خواندنی «منبع اطلاعات» الزامی است (DOCX/PDF/PPTX/TXT/MD).")
    if order.get("quantity_type") not in {None, "slides"}:
        raise ValueError("حجم سفارش پاورپوینت باید برحسب اسلاید باشد.")
    if order.get("quantity_value") is not None and not 5 <= int(order["quantity_value"]) <= 100:
        raise ValueError("تعداد اسلاید باید بین ۵ و ۱۰۰ باشد.")


def resolve_rules(_):
    return json.loads(Path(__file__).with_name("defaults.json").read_text(encoding="utf-8"))


def build_plan(title, admin_rules):
    return f"# سناریوی ارائه: {title}\n\nمسئله → هدف → روش → یافته‌ها → تفسیر و محدودیت → جمع‌بندی → منابع و پرسش\n\n{admin_rules}"
