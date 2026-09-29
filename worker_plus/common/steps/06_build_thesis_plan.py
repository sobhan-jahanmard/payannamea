from typing import Any
from common.helpers import write_text
from common.deliverable_policy import deliverable_contract

TITLE = "Build thesis plan"

def run(context: dict[str, Any], services: Any) -> None:
    title = context["order"].get("title") or services.profile.DISPLAY_NAME
    admin_rules_path = services.workspace / context["artifacts"]["admin_internal_rules"]
    admin_rules = admin_rules_path.read_text(encoding="utf-8")
    contract = services.workspace / context["artifacts"]["order_execution_contract"]
    decision_contract = deliverable_contract(context["order"])
    deliverable_lines = [
        "\n\n## ماتریس اجباری فصل‌ها و خروجی‌ها",
        "",
        "هر ردیف باید در outline نهایی به یک بخش اجرایی متصل شود. بخشی که فقط روش را توضیح دهد ناقص است.",
        "",
    ]
    deliverable_lines.extend(
        f"- **{item['id']}**: {item['question']} — روش: {item['method']} — خروجی قابل پذیرش: {item['output']}"
        for item in decision_contract["deliverables"]
    )
    plan = (
        services.profile.build_plan(title, admin_rules)
        + "\n\n## قرارداد اجرایی سفارش\n\n"
        + contract.read_text(encoding="utf-8")
        + "\n".join(deliverable_lines)
    )
    write_text(services.workspace / "planning" / "outline.md", plan)
    write_text(services.workspace / "planning" / "chapter_plan.md", plan)
    context["artifacts"]["plan"] = "planning/outline.md"
