"""Plan visual evidence before prose so visuals are part of the argument."""
from __future__ import annotations

import json
import math
from typing import Any

from common.helpers import write_text
from common.page_budget import page_budget
from common.visual_policy import visual_requirements

TITLE = "Plan section-level visuals"


def is_chart_kind(value: object) -> bool:
    """Accept the schema enum and natural Persian labels emitted by the planner."""
    normalized = str(value or "").strip().lower()
    return normalized in {"chart", "graph"} or "نمودار" in normalized or "گراف" in normalized


def visual_plan_issues(payload: object, required: int, maximum: int, chart_required: int) -> list[str]:
    """Return actionable errors for the planner instead of one ambiguous gate error."""
    if not isinstance(payload, dict) or not isinstance(payload.get("visuals"), list):
        return ["visual_plan.json must contain a visuals array"]
    visuals = payload["visuals"]
    issues: list[str] = []
    if not required <= len(visuals) <= maximum:
        issues.append(f"visuals count is {len(visuals)}; expected {required}–{maximum}")
    needed = ("id", "kind", "target_section", "claim_supported", "data_or_source", "reasoning_value", "caption")
    seen: set[str] = set()
    charts = 0
    for index, item in enumerate(visuals, start=1):
        if not isinstance(item, dict):
            issues.append(f"visuals[{index}] must be an object")
            continue
        identifier = str(item.get("id") or f"visuals[{index}]").strip()
        if identifier in seen:
            issues.append(f"{identifier}: duplicate id")
        seen.add(identifier)
        for key in needed:
            if not str(item.get(key) or "").strip():
                issues.append(f"{identifier}.{key} is required")
        if not is_chart_kind(item.get("kind")):
            continue
        charts += 1
        spec = item.get("plot_spec")
        if not isinstance(spec, dict):
            issues.append(f"{identifier}.plot_spec is required for a chart/graph")
            continue
        for key in ("title", "y_unit", "source_note"):
            if not str(spec.get(key) or "").strip():
                issues.append(f"{identifier}.plot_spec.{key} is required")
        note = str(spec.get("source_note") or "")
        if len(note) > 170:
            issues.append(f"{identifier}.plot_spec.source_note has {len(note)} characters; maximum 170. Keep the full citation in data_or_source and a concise source/year/geography/assumption here")
        labels, values = spec.get("x_labels"), spec.get("y_values")
        if not isinstance(labels, list) or not isinstance(values, list) or not 2 <= len(labels) == len(values) <= 12:
            issues.append(f"{identifier}.plot_spec needs 2–12 matching x_labels and y_values")
        else:
            if any(not str(label).strip() for label in labels):
                issues.append(f"{identifier}.plot_spec.x_labels contains an empty label")
            if any(isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) for value in values):
                issues.append(f"{identifier}.plot_spec.y_values must contain finite numbers")
    if charts < chart_required:
        issues.append(f"chart/graph count is {charts}; minimum {chart_required}")
    return issues


def read_plan(plan: Any) -> tuple[object, list[str]]:
    try:
        return json.loads(plan.read_text(encoding="utf-8")), []
    except FileNotFoundError:
        return None, ["planning/visual_plan.json was not created"]
    except json.JSONDecodeError as exc:
        return None, [f"planning/visual_plan.json is invalid JSON at line {exc.lineno}, column {exc.colno}: {exc.msg}"]


def run(context: dict[str, Any], services: Any) -> None:
    order = context["order"]
    policy = visual_requirements(order)
    required = int(policy["minimum_total_visuals"])
    chart_required = int(policy["minimum_charts_or_graphs"])
    explicit_count = int(order.get("visual_count") or order.get("chart_count") or 0)
    maximum = max(required, explicit_count, math.ceil(int(policy["page_equivalent"]) / 10))
    rules_path = services.workspace / context["artifacts"].get("university_rules", "extracted/university_rules.json")
    rules = json.loads(rules_path.read_text(encoding="utf-8")) if rules_path.exists() else None
    budget = page_budget(order, required, rules)
    plan = services.workspace / "planning" / "visual_plan.json"
    report = services.workspace / "reports" / "visual_planning.md"
    if not required:
        plan.write_text(json.dumps({"visuals": []}, ensure_ascii=False, indent=2), encoding="utf-8")
        write_text(report, "# Visual planning\n\nNo visual asset was requested.\n")
        context["artifacts"]["visual_plan"] = str(plan.relative_to(services.workspace))
        return
    # Preserve an invalid candidate so a repair can target its exact defects.
    quality_report = services.workspace / "reports" / "visual_quality_audit.md"
    failed_quality = quality_report.is_file() and quality_report.read_text(encoding="utf-8").lstrip().startswith("STATUS: FAIL")
    contract = services.workspace / context["artifacts"]["order_execution_contract"]
    outline = services.workspace / context["artifacts"]["plan"]
    sources = context["artifacts"]["resolved_source_rules"]
    evidence = context["artifacts"]["research_evidence"]
    prompt = f"""پیش از تولید متن، نقشهٔ بصری حرفه‌ای سفارش «{order.get('title')}» را بساز. قرارداد سفارش در `{contract.relative_to(services.workspace)}`، طرح فصل‌ها در `{outline.relative_to(services.workspace)}`، شواهد پژوهش اجراشده در `{evidence}` و قرارداد منابع در `{sources}` است. {'گزارش FAIL بصری قبلی در reports/visual_quality_audit.md را بخوان و علت‌های آن را در طرح تازه رفع کن.' if failed_quality else ''}

بین {required} تا {maximum} عنصر بصری لازم است و دست‌کم {chart_required} مورد باید `chart` یا `graph` باشد. {f"کل خروجی باید حدود {budget['minimum']} تا {budget['maximum']} صفحه باشد؛ برای {required} شکل حدود {budget['reserved_visual_pages']} صفحه از بودجه کنار گذاشته شده و هر شکل اضافی فضای متن را کم می‌کند." if budget else ''} برای هر تحلیل یک شکل نساز؛ چند نتیجه مرتبط را در یک شکل خوانا جمع کن و باقی را در جدول و متن نگه دار. این تعداد بر اساس {policy['page_equivalent']} صفحهٔ معادل و سیاست تراکم سفارش محاسبه شده است. ترکیب انواع را هوشمندانه انتخاب کن: نمودار داده‌محور فقط با دادهٔ معتبر، نمودار فرایند/معماری برای توضیح ساختار، و تصویر/شمای مفهومی فقط وقتی به استدلال کمک می‌کند. فایل `planning/visual_plan.json` را با آرایهٔ `visuals` بساز. هر مورد باید `id`، `kind`، `target_section`، `claim_supported`، `data_or_source`, `reasoning_value` و `caption` داشته باشد. `target_section` باید عنوان بخش مشخصی از طرح باشد.

برای هر chart/graph فیلد `plot_spec` با `title` (عنوان کوتاه)، `x_labels` (حداکثر ۱۲ برچسب کوتاه)، `y_values` (اعداد هم‌تعداد)، `y_unit` و `source_note` بنویس. `source_note` حداکثر ۱۷۰ نویسه باشد و فقط منبع کوتاه، سال، جغرافیا و فرض اصلی را نشان دهد؛ ارجاع و توضیح کامل را در `data_or_source` نگه دار. داده‌ها را از جدول یا محاسبهٔ اجراشده در ledger بردار، نه شناسهٔ داخلی مانند `analysis:A01`. نمودار باید فقط یک پیام و واحد روشن داشته باشد؛ فهرست بلند شاخص‌های نامرتبط را در یک محور نریز. اگر دادهٔ عددی لازم نداری، نوع را `diagram` بگذار. متن فارسی کوتاه و قابل‌نمایش انتخاب کن. شکل تزئینی یا نمودار خالی ممنوع است. پاسخ نهایی فقط گزارش کوتاه باشد."""
    before = plan.read_bytes() if plan.exists() else None
    if not plan.exists():
        # run_codex caches a nonempty report, so remove only its stale response.
        report.parent.mkdir(parents=True, exist_ok=True)
        if report.exists():
            report.unlink()
        services.run_codex(prompt, report)
    payload, read_issues = read_plan(plan)
    issues = read_issues or visual_plan_issues(payload, required, maximum, chart_required)
    if failed_quality and not issues:
        issues = ["Previous visual quality audit failed; revise this plan using reports/visual_quality_audit.md"]
    unchanged_attempts = 0
    for attempt in range(1, 4):
        if not issues:
            break
        previous = plan.read_bytes() if plan.exists() else None
        repair_report = services.workspace / "reports" / f"visual_planning_repair_{attempt}.md"
        repair_report.parent.mkdir(parents=True, exist_ok=True)
        if repair_report.exists():
            repair_report.unlink()
        repair_prompt = f"""نقشهٔ موجود در `planning/visual_plan.json` را با کمترین تغییر لازم اصلاح کن. قرارداد سفارش، طرح فصل‌ها و شواهد پژوهش را حفظ کن. هیچ داده یا منبعی جعل نکن. مشکل‌های دقیق اعتبارسنجی:
{chr(10).join('- ' + issue for issue in issues)}

{('گزارش کیفیت قبلی را در reports/visual_quality_audit.md بخوان و عیب‌های محتوایی آن را نیز رفع کن.' if failed_quality else '')}
حد مجاز `plot_spec.source_note` دقیقاً ۱۷۰ نویسه است. منبع مفصل را در `data_or_source` حفظ کن. فایل JSON را مستقیم اصلاح کن و دوباره با همین شروط بررسی کن. پاسخ نهایی فقط گزارش کوتاه باشد."""
        services.run_codex(repair_prompt, repair_report)
        payload, read_issues = read_plan(plan)
        issues = read_issues or visual_plan_issues(payload, required, maximum, chart_required)
        if failed_quality and not issues and (plan.read_bytes() if plan.exists() else None) == previous:
            issues = ["Previous visual quality audit failed, but the visual plan was not revised"]
        if issues and (plan.read_bytes() if plan.exists() else None) == previous:
            unchanged_attempts += 1
            if unchanged_attempts >= 2:
                raise RuntimeError("Visual planner made no progress: " + "; ".join(issues))
            issues.append("The previous repair made no file changes; edit planning/visual_plan.json directly on the next attempt")
        else:
            unchanged_attempts = 0
    if issues:
        raise RuntimeError("Visual plan remains invalid after targeted repairs: " + "; ".join(issues))
    if before != plan.read_bytes():
        context["artifacts"]["visual_plan_changed"] = True
    context["artifacts"]["visual_plan"] = str(plan.relative_to(services.workspace))
    context["artifacts"]["visual_planning_report"] = str(report.relative_to(services.workspace))
