from typing import Any
from common.helpers import write_text

TITLE = "Resolve mandatory source rules"

def run(context: dict[str, Any], services: Any) -> None:
    contract = services.workspace / context["artifacts"]["source_contract"]
    text = contract.read_text(encoding="utf-8")
    admin_rules_path = services.workspace / context["artifacts"]["admin_internal_rules"]
    admin_rules = admin_rules_path.read_text(encoding="utf-8")
    resolved = (
        "# قرارداد اجرایی منابع و دستورات سفارش\n\n"
        "این قرارداد در تمام مراحل طرح‌ریزی، تولید، بازبینی و ممیزی اجباری است. "
        "یادداشت‌های داخلی مدیر، دستور اختصاصی همین سفارش هستند. شیوه‌نامه رسمی دانشگاه بر نمونه‌ها و فایل‌های تکمیلی مقدم است؛ "
        "هر تعارض واقعی یا دستور ناممکن باید به‌جای نادیده‌گرفتن، موجب FAIL شود.\n\n"
        + admin_rules + "\n\n" + text
    )
    target = services.workspace / "extracted" / "resolved_source_rules.md"
    write_text(target, resolved)
    context["artifacts"]["resolved_source_rules"] = str(target.relative_to(services.workspace))
