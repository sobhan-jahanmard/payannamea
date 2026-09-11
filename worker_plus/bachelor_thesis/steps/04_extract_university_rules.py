from typing import Any
from utils.helpers import write_json

TITLE = "Extract university rules"

def run(context: dict[str, Any], services: Any) -> None:
    order = context["order"]
    rules = {"university": order.get("university"), "language": order.get("language"), "citation_style": order.get("academic_style"), "status": "needs_uploaded_guideline_review"}
    write_json(services.workspace / "extracted" / "university_rules.json", rules)
    context["artifacts"]["university_rules"] = "extracted/university_rules.json"
