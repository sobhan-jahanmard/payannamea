from typing import Any
from utils.helpers import write_text

TITLE = "Generate content — تولید متن"

def run(context: dict[str, Any], services: Any) -> None:
    order = context["order"]
    is_sample = context["mode"] == "sample"
    scope = "یک نمونهٔ چندصفحه‌ای شامل چکیده، فهرست و بخش‌هایی از فصل اول و یک فصل محتوایی" if is_sample else "بستهٔ کامل منطبق با طرح مصوب"
    target = services.workspace / "final" / ("sample_source.md" if is_sample else "deliverable_source.md")
    prompt = f"برای پایان‌نامه کارشناسی با عنوان «{order.get('title')}»، {scope} آماده کن. از داده یا منبع ساختگی استفاده نکن. متن را بدون TODO در فایل `{target.relative_to(services.workspace)}` بنویس."
    services.run_codex(prompt, target)
    if not target.exists() or not target.read_text(encoding="utf-8").strip():
        raise RuntimeError(f"Codex did not create {target.relative_to(services.workspace)}")
    context["artifacts"]["source"] = str(target.relative_to(services.workspace))
