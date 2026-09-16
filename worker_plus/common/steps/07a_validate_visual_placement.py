"""Confirm prose and planned visual evidence were integrated section by section."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

TITLE = "Validate visual placement and argument"


def _missing_integrations(source_text: str, figures: list[dict[str, Any]]) -> list[dict[str, Any]]:
    missing: list[dict[str, Any]] = []
    for item in figures:
        relative = str(Path(str(item["path"])).relative_to("final")).replace("\\", "/")
        image_offset = source_text.find(f"]({relative})")
        # A planner uses outline labels, while the finished manuscript often
        # expands them into numbered chapter headings.  Require a real heading
        # before the image; semantic placement is then checked by the AI audit
        # below instead of rejecting valid chapter-title variants by string match.
        has_preceding_heading = image_offset >= 0 and any(
            line.lstrip().startswith("#")
            for line in source_text[:image_offset].splitlines()
        )
        if image_offset < 0 or not has_preceding_heading:
            missing.append(item)
    return missing


def run(context: dict[str, Any], services: Any) -> None:
    manifest = services.workspace / context["artifacts"].get("visual_manifest", "final/figures/manifest.json")
    if not manifest.exists():
        return
    source = services.workspace / context["artifacts"]["source"]
    figures = json.loads(manifest.read_text(encoding="utf-8")).get("figures", [])
    if not figures:
        return
    source_text = source.read_text(encoding="utf-8")
    missing = _missing_integrations(source_text, figures)
    if missing:
        repair_report = services.workspace / "reports" / "visual_integration_repair.md"
        prompt = f"""یکپارچه‌سازی ناقص شکل‌ها را در متن `{source.relative_to(services.workspace)}` اصلاح کن. شکل‌های آماده و manifest در `{manifest.relative_to(services.workspace)}` هستند.

برای هر شکل موجود در manifest که در متن درج نشده یا `target_section` آن با heading واقعی متن هم‌خوان نیست، یک بخش منطقی و تخصصی از متن را انتخاب کن، دو پاراگراف تحلیلی پیش و پس از آن بنویس، و شکل را با `![caption](figures/name.png)` در همان بخش درج کن. شکل نباید تزئینی باشد؛ پاراگراف‌ها باید دقیقاً ادعای `reasoning_value` را شرح دهند. سپس در manifest مقدار `target_section` را به متن دقیق heading همان بخش در Markdown تغییر بده. هیچ تصویر جدیدی نساز و هیچ داده‌ای جعل نکن. در پایان پاسخ فقط گزارش کوتاه بده."""
        services.run_codex(prompt, repair_report)
        figures = json.loads(manifest.read_text(encoding="utf-8")).get("figures", [])
        source_text = source.read_text(encoding="utf-8")
        missing = _missing_integrations(source_text, figures)
        if missing:
            ids = ", ".join(str(item.get("id")) for item in missing)
            raise RuntimeError(f"Planned visuals remain unintegrated after repair: {ids}")
        context["artifacts"]["visual_integration_repair"] = str(repair_report.relative_to(services.workspace))
    report = services.workspace / "reports" / "visual_argument_audit.md"
    for attempt in range(1, 7):
        prompt = f"""متن تولیدشده در `{source.relative_to(services.workspace)}` و manifest شکل‌ها در `{manifest.relative_to(services.workspace)}` را با هم ممیزی کن.

برای تک‌تک شکل‌ها بررسی کن که دقیقاً در بخش هدف برنامه‌ریزی‌شده آمده، متن قبل/بعد آن به شکل ارجاع می‌دهد، و شکل واقعاً همان ادعا را پشتیبانی می‌کند. اگر شکل تزئینی، مستقل از استدلال، تکراری، بی‌محتوا یا بدون توضیح منبع/فرض باشد FAIL بده. خط اول باید دقیقاً `STATUS: PASS` یا `STATUS: FAIL` و سپس جدول «شکل | بخش | ادعای پشتیبانی‌شده | شاهد متن | نتیجه» باشد."""
        services.run_codex(prompt, report)
        if report.read_text(encoding="utf-8").lstrip().startswith("STATUS: PASS"):
            break
        repair = services.workspace / "reports" / "stage_checks" / f"visual_argument_repair_{attempt}.md"
        repair_prompt = f"""گزارش `{report.relative_to(services.workspace)}` را بخوان و همهٔ موارد FAIL را در متن `{source.relative_to(services.workspace)}` و در صورت نیاز manifest `{manifest.relative_to(services.workspace)}` مستقیم اصلاح کن. شکل‌ها را به بخش درست منتقل کن، ارجاع و تحلیل واقعی قبل و بعدشان را کامل کن و داده یا منبع جدید جعل نکن. فایل تصویر جدید نساز. خروجی فقط گزارش کوتاه تعمیر باشد."""
        services.run_codex(repair_prompt, repair)
    else:
        raise RuntimeError("Visual argument/placement audit remained unresolved after recovery loop")
    context["artifacts"]["visual_argument_audit"] = str(report.relative_to(services.workspace))
