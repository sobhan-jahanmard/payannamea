"""Generate approved planned assets before drafting their surrounding sections."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from common.helpers import write_text

TITLE = "Generate planned visual assets"


def is_chart_kind(value: object) -> bool:
    normalized = str(value or "").strip().lower()
    return normalized in {"chart", "graph"} or "نمودار" in normalized or "گراف" in normalized


def run(context: dict[str, Any], services: Any) -> None:
    plan = services.workspace / context["artifacts"]["visual_plan"]
    visuals = json.loads(plan.read_text(encoding="utf-8")).get("visuals", [])
    manifest = services.workspace / "final" / "figures" / "manifest.json"
    report = services.workspace / "reports" / "visual_generation.md"
    if not visuals:
        manifest.parent.mkdir(parents=True, exist_ok=True)
        manifest.write_text(json.dumps({"figures": []}, ensure_ascii=False, indent=2), encoding="utf-8")
        write_text(report, "# Visual assets\n\nNo visual asset was requested.\n")
        context["artifacts"]["visual_manifest"] = str(manifest.relative_to(services.workspace))
        return
    planned_ids = {str(item["id"]) for item in visuals if isinstance(item, dict) and item.get("id")}
    # Discard only stale generated metadata/reports when the plan changed; PNGs
    # can be reused or replaced by the generation agent if still appropriate.
    if manifest.exists():
        try:
            current_figures = json.loads(manifest.read_text(encoding="utf-8")).get("figures", [])
        except json.JSONDecodeError:
            current_figures = []
        current_ids = {str(item.get("id")) for item in current_figures if isinstance(item, dict)}
        if not planned_ids.issubset(current_ids):
            manifest.unlink()
            if report.exists():
                report.unlink()
    prompt = f"""بر اساس نقشهٔ بصری تأییدشده در `{plan.relative_to(services.workspace)}`، فایل‌های PNG حرفه‌ای را پیش از نگارش متن بساز. هر فایل در `final/figures/` باشد و `final/figures/manifest.json` با آرایهٔ `figures` ساخته شود.

هر مورد manifest باید `id`، `path`، `kind`، `target_section`، `caption`، `source_or_assumption` و `reasoning_value` داشته و دقیقاً با visual plan منطبق باشد. از دادهٔ ساختگی استفاده نکن. نمودارهای مفهومی باید صریحاً چنین برچسبی داشته باشند. PNGها را خودت بصری بررسی کن؛ کیفیت حرفه‌ای، برچسب فارسی خوانا و ارتباط مستقیم با ادعا الزامی است. پاسخ نهایی فقط گزارش کوتاه باشد."""
    services.run_codex(prompt, report)
    try:
        figures = json.loads(manifest.read_text(encoding="utf-8")).get("figures", [])
    except (FileNotFoundError, json.JSONDecodeError) as exc:
        raise RuntimeError("Visual generation did not create valid final/figures/manifest.json") from exc
    actual_ids = {str(item.get("id")) for item in figures if isinstance(item, dict)}
    if not planned_ids.issubset(actual_ids):
        raise RuntimeError("Not every planned visual was generated")
    planned_chart_count = sum(is_chart_kind(item.get("kind")) for item in visuals if isinstance(item, dict))
    actual_chart_count = sum(is_chart_kind(item.get("kind")) for item in figures if isinstance(item, dict))
    if actual_chart_count < planned_chart_count:
        raise RuntimeError(f"Generated figures have too few charts/graphs ({actual_chart_count}/{planned_chart_count})")
    for item in figures:
        if not isinstance(item, dict) or not all(str(item.get(key) or "").strip() for key in ("id", "path", "kind", "target_section", "caption", "source_or_assumption", "reasoning_value")):
            raise RuntimeError("Visual manifest item is incomplete")
        path = services.workspace / str(item["path"])
        if path.suffix.lower() != ".png" or not path.is_file() or not path.stat().st_size:
            raise RuntimeError(f"Visual file is missing or not PNG: {item.get('path')}")
    context["artifacts"]["visual_manifest"] = str(manifest.relative_to(services.workspace))
    context["artifacts"]["visual_generation_report"] = str(report.relative_to(services.workspace))
