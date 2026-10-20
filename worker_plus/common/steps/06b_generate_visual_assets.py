"""Generate approved planned assets before drafting their surrounding sections."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from common.helpers import write_text
from common.visual_render import render_chart

TITLE = "Generate planned visual assets"


def is_chart_kind(value: object) -> bool:
    normalized = str(value or "").strip().lower()
    return normalized in {"chart", "graph"} or "نمودار" in normalized or "گراف" in normalized


def manifest_issues(payload: object, visuals: list[dict[str, Any]], workspace: Path) -> list[str]:
    if not isinstance(payload, dict) or not isinstance(payload.get("figures"), list):
        return ["final/figures/manifest.json must contain a figures array"]
    issues: list[str] = []
    figures = payload["figures"]
    by_id: dict[str, dict[str, Any]] = {}
    for index, item in enumerate(figures, start=1):
        if not isinstance(item, dict):
            issues.append(f"figures[{index}] must be an object")
            continue
        identifier = str(item.get("id") or f"figures[{index}]")
        if identifier in by_id:
            issues.append(f"{identifier}: duplicate manifest id")
        by_id[identifier] = item
        for key in ("id", "path", "kind", "target_section", "caption", "source_or_assumption", "reasoning_value"):
            if not str(item.get(key) or "").strip():
                issues.append(f"{identifier}.{key} is required")
        relative = str(item.get("path") or "")
        target = (workspace / relative).resolve()
        if not target.is_relative_to((workspace / "final" / "figures").resolve()) or target.suffix.lower() != ".png" or not target.is_file() or not target.stat().st_size:
            issues.append(f"{identifier}.path must point to a nonempty PNG in final/figures: {relative}")
    planned_ids = {str(item["id"]) for item in visuals}
    for identifier in sorted(planned_ids - by_id.keys()):
        issues.append(f"planned visual {identifier} is missing from manifest")
    for item in visuals:
        actual = by_id.get(str(item["id"]))
        if not actual:
            continue
        for key in ("kind", "target_section", "caption", "reasoning_value"):
            if str(actual.get(key) or "") != str(item.get(key) or ""):
                issues.append(f"{item['id']}.{key} must match planning/visual_plan.json")
        if is_chart_kind(item.get("kind")) and str(actual.get("path") or "") != str(item.get("rendered_path") or ""):
            issues.append(f"{item['id']}.path must be {item.get('rendered_path')}")
    return issues


def read_manifest(manifest: Path) -> tuple[object, list[str]]:
    try:
        return json.loads(manifest.read_text(encoding="utf-8")), []
    except FileNotFoundError:
        return None, ["final/figures/manifest.json was not created"]
    except json.JSONDecodeError as exc:
        return None, [f"final/figures/manifest.json is invalid JSON at line {exc.lineno}, column {exc.colno}: {exc.msg}"]


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
    quality_report = services.workspace / "reports" / "visual_quality_audit.md"
    failed_quality = quality_report.is_file() and quality_report.read_text(encoding="utf-8").lstrip().startswith("STATUS: FAIL")
    # Discard only stale generated metadata/reports when the plan changed; PNGs
    # can be reused or replaced by the generation agent if still appropriate.
    plan_changed = bool(context.get("artifacts", {}).get("visual_plan_changed"))
    if manifest.exists():
        try:
            current_figures = json.loads(manifest.read_text(encoding="utf-8")).get("figures", [])
        except json.JSONDecodeError:
            current_figures = []
        current_ids = {str(item.get("id")) for item in current_figures if isinstance(item, dict)}
        if failed_quality or plan_changed or current_ids != planned_ids:
            manifest.unlink()
            if report.exists():
                report.unlink()
    charts = [item for item in visuals if isinstance(item, dict) and is_chart_kind(item.get("kind"))]
    for item in charts:
        safe_id = "".join(char if char.isalnum() or char in "-_" else "_" for char in str(item["id"]))
        item["rendered_path"] = f"final/figures/{safe_id}.png"
        render_chart(item, services.workspace / item["rendered_path"])
    if len(charts) == len(visuals):
        figures = [
            {
                "id": item["id"], "path": item["rendered_path"], "kind": item["kind"],
                "target_section": item["target_section"], "caption": item["caption"],
                "source_or_assumption": item["plot_spec"]["source_note"],
                "reasoning_value": item["reasoning_value"],
            }
            for item in charts
        ]
        manifest.parent.mkdir(parents=True, exist_ok=True)
        manifest.write_text(json.dumps({"figures": figures}, ensure_ascii=False, indent=2), encoding="utf-8")
        write_text(report, "# Visual assets\n\nCharts rendered from the approved numeric plot specifications.\n")
        context["artifacts"]["visual_manifest"] = str(manifest.relative_to(services.workspace))
        context["artifacts"]["visual_generation_report"] = str(report.relative_to(services.workspace))
        return
    prompt = f"""بر اساس نقشهٔ بصری تأییدشده در `{plan.relative_to(services.workspace)}`، فایل‌های PNG حرفه‌ای را پیش از نگارش متن بساز. هر فایل در `final/figures/` باشد و `final/figures/manifest.json` با آرایهٔ `figures` ساخته شود. {'نقشه نسبت به نسخهٔ قبلی تغییر کرده است؛ شکل‌های غیرعددی را نیز با نقشهٔ جدید دوباره تولید کن.' if plan_changed else ''}

نمودارهای عددیِ موجود در `final/figures/` از `plot_spec` ساخته شده‌اند؛ آن‌ها را تغییر نده. فقط شکل‌های غیرعددی طرح را بساز و metadata همهٔ شکل‌ها را در manifest ثبت کن. هر مورد manifest باید `id`، `path`، `kind`، `target_section`، `caption`، `source_or_assumption` و `reasoning_value` داشته و دقیقاً با visual plan منطبق باشد. از دادهٔ ساختگی استفاده نکن. نمودارهای مفهومی باید صریحاً چنین برچسبی داشته باشند. PNGها را خودت بصری بررسی کن؛ کیفیت حرفه‌ای، برچسب فارسی خوانا، واحد/منبع قابل رؤیت و ارتباط مستقیم با ادعا الزامی است. گزارش FAIL قبلی در `reports/visual_quality_audit.md` را نیز بخوان و عیب‌های آن را تکرار نکن. پاسخ نهایی فقط گزارش کوتاه باشد."""
    payload, read_issues = read_manifest(manifest)
    issues = read_issues or manifest_issues(payload, visuals, services.workspace)
    unchanged_attempts = 0
    for attempt in range(1, 4):
        if not issues:
            break
        previous = manifest.read_bytes() if manifest.exists() else None
        response = report if attempt == 1 else services.workspace / "reports" / f"visual_generation_repair_{attempt}.md"
        response.parent.mkdir(parents=True, exist_ok=True)
        if response.exists():
            response.unlink()
        repair_prompt = prompt + "\n\nمشکل‌های دقیق اعتبارسنجی که همین اجرا باید رفع کند:\n" + "\n".join("- " + issue for issue in issues)
        services.run_codex(repair_prompt, response)
        payload, read_issues = read_manifest(manifest)
        issues = read_issues or manifest_issues(payload, visuals, services.workspace)
        if issues and (manifest.read_bytes() if manifest.exists() else None) == previous:
            unchanged_attempts += 1
            if unchanged_attempts >= 2:
                raise RuntimeError("Visual generation made no progress: " + "; ".join(issues))
            issues.append("The previous repair made no file changes; edit final/figures/manifest.json directly on the next attempt")
        else:
            unchanged_attempts = 0
    if issues:
        raise RuntimeError("Visual manifest remains invalid after targeted repairs: " + "; ".join(issues))
    context["artifacts"]["visual_manifest"] = str(manifest.relative_to(services.workspace))
    context["artifacts"]["visual_generation_report"] = str(report.relative_to(services.workspace))
