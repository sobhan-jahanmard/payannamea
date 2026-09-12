from typing import Any
from utils.helpers import write_json, write_text
from utils.thesis_rules import resolve_thesis_rules

TITLE = "Extract university rules"

def run(context: dict[str, Any], services: Any) -> None:
    order = context["order"]
    rules = resolve_thesis_rules(context["artifacts"].get("input_files", []), order.get("academic_style"))
    admin_notes = [
        {
            "id": note.get("id"),
            "author": note.get("author") or "مدیر",
            "created_at": note.get("created_at"),
            "instruction": str(note.get("note") or "").strip(),
        }
        for note in order.get("review_notes", [])
        if str(note.get("note") or "").strip()
    ]
    rules.update({
        "university": order.get("university"),
        "language": order.get("language"),
        "admin_internal_instructions": admin_notes,
    })
    write_json(services.workspace / "extracted" / "university_rules.json", rules)
    admin_rules = [
        "# قواعد اجباری اختصاصی مدیر",
        "",
        "تمام یادداشت‌های زیر دستور اجرایی اجباری همین سفارش هستند و باید در طرح، تولید، بازبینی و خروجی نهایی رعایت شوند.",
    ]
    if admin_notes:
        for index, note in enumerate(admin_notes, 1):
            admin_rules.extend(["", f"## دستور مدیر {index}", "", note["instruction"]])
    else:
        admin_rules.extend(["", "برای این سفارش یادداشت داخلی مدیر ثبت نشده است."])
    admin_path = services.workspace / "extracted" / "admin_internal_rules.md"
    write_text(admin_path, "\n".join(admin_rules).rstrip() + "\n")
    context["artifacts"]["university_rules"] = "extracted/university_rules.json"
    context["artifacts"]["admin_internal_rules"] = str(admin_path.relative_to(services.workspace))
