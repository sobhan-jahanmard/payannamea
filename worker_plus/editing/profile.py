from pathlib import Path

ORDER_TYPE = DISPLAY_NAME = "ویراستاری"


def source_file(order):
    sources = [item for item in order.get("files", []) if item.get("file_type") == "information_source"]
    if (len(sources) != 1 or Path(str(sources[0].get("original_name") or "")).suffix.lower() != ".docx"
            or int(sources[0].get("size_bytes") or 0) < 1):
        raise ValueError("برای ویراستاری یک فایل اصلی Word با پسوند DOCX لازم است.")
    return sources[0]


def validate_order(order):
    source_file(order)
    if not str(order.get("title") or "").strip():
        raise ValueError("عنوان متن ویراستاری الزامی است.")
    if order.get("quantity_type") not in {None, "pages"}:
        raise ValueError("حجم ویراستاری برحسب صفحه است.")
