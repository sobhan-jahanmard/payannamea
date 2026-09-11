from typing import Any
from utils.helpers import write_text

TITLE = "Build thesis plan — ساخت طرح پایان‌نامه"

def run(context: dict[str, Any], services: Any) -> None:
    title = context["order"].get("title") or "پایان‌نامه کارشناسی"
    plan = f"# طرح پایان‌نامه: {title}\n\n1. کلیات پژوهش\n2. مبانی نظری و پیشینه\n3. روش پژوهش\n4. تحلیل و بحث (وابسته به دادهٔ تأییدشده)\n5. نتیجه‌گیری و پیشنهادها\n"
    write_text(services.workspace / "planning" / "outline.md", plan)
    write_text(services.workspace / "planning" / "chapter_plan.md", plan)
    context["artifacts"]["plan"] = "planning/outline.md"
