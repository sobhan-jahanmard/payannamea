from typing import Any
from utils.helpers import write_json
from utils.thesis_rules import resolve_thesis_rules

TITLE = "Extract university rules"

def run(context: dict[str, Any], services: Any) -> None:
    order = context["order"]
    rules = resolve_thesis_rules(context["artifacts"].get("input_files", []), order.get("academic_style"))
    rules.update({"university": order.get("university"), "language": order.get("language")})
    write_json(services.workspace / "extracted" / "university_rules.json", rules)
    context["artifacts"]["university_rules"] = "extracted/university_rules.json"
