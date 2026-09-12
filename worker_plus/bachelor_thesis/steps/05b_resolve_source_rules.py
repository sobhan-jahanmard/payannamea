from typing import Any
from utils.helpers import write_text

TITLE = "Resolve mandatory source rules"

def run(context: dict[str, Any], services: Any) -> None:
    contract = services.workspace / context["artifacts"]["source_contract"]
    text = contract.read_text(encoding="utf-8")
    resolved = "# قرارداد اجرایی منابع\n\nاین قرارداد در تمام مراحل تولید و ممیزی اجباری است. در تعارض، شیوه‌نامه رسمی دانشگاه بر نمونه‌ها و فایل‌های تکمیلی مقدم است؛ تعارض حل‌نشده باید FAIL شود.\n\n" + text
    target = services.workspace / "extracted" / "resolved_source_rules.md"
    write_text(target, resolved)
    context["artifacts"]["resolved_source_rules"] = str(target.relative_to(services.workspace))
