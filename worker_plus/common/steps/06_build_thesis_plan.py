from typing import Any
from common.helpers import write_text

TITLE = "Build thesis plan"

def run(context: dict[str, Any], services: Any) -> None:
    title = context["order"].get("title") or services.profile.DISPLAY_NAME
    admin_rules_path = services.workspace / context["artifacts"]["admin_internal_rules"]
    admin_rules = admin_rules_path.read_text(encoding="utf-8")
    contract = services.workspace / context["artifacts"]["order_execution_contract"]
    plan = services.profile.build_plan(title, admin_rules) + "\n\n## قرارداد اجرایی سفارش\n\n" + contract.read_text(encoding="utf-8")
    write_text(services.workspace / "planning" / "outline.md", plan)
    write_text(services.workspace / "planning" / "chapter_plan.md", plan)
    context["artifacts"]["plan"] = "planning/outline.md"
