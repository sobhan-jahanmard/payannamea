from typing import Any
from utils.helpers import write_text

TITLE = "Build thesis plan"

def run(context: dict[str, Any], services: Any) -> None:
    title = context["order"].get("title") or "پایان‌نامه کارشناسی"
    admin_rules_path = services.workspace / context["artifacts"]["admin_internal_rules"]
    admin_rules = admin_rules_path.read_text(encoding="utf-8")
    plan = f"# طرح پایان‌نامه: {title}\n\n1. کلیات پژوهش\n2. مبانی نظری و پیشینه\n3. روش پژوهش\n4. تحلیل و بحث (وابسته به دادهٔ تأییدشده)\n5. نتیجه‌گیری و پیشنهادها\n\n## قواعد اجباری طرح\n\n{admin_rules}\n"
    write_text(services.workspace / "planning" / "outline.md", plan)
    write_text(services.workspace / "planning" / "chapter_plan.md", plan)
    context["artifacts"]["plan"] = "planning/outline.md"
