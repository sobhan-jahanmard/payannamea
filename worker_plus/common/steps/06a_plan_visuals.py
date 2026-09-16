"""Plan visual evidence before prose so visuals are part of the argument."""
from __future__ import annotations

import json
from typing import Any

from common.helpers import write_text
from common.visual_policy import visual_requirements

TITLE = "Plan section-level visuals"


def is_chart_kind(value: object) -> bool:
    """Accept the schema enum and natural Persian labels emitted by the planner."""
    normalized = str(value or "").strip().lower()
    return normalized in {"chart", "graph"} or "نمودار" in normalized or "گراف" in normalized


def run(context: dict[str, Any], services: Any) -> None:
    order = context["order"]
    policy = visual_requirements(order)
    required = int(policy["minimum_total_visuals"])
    chart_required = int(policy["minimum_charts_or_graphs"])
    plan = services.workspace / "planning" / "visual_plan.json"
    report = services.workspace / "reports" / "visual_planning.md"
    if not required:
        plan.write_text(json.dumps({"visuals": []}, ensure_ascii=False, indent=2), encoding="utf-8")
        write_text(report, "# Visual planning\n\nNo visual asset was requested.\n")
        context["artifacts"]["visual_plan"] = str(plan.relative_to(services.workspace))
        return
    # A resumed workspace may contain an earlier, lower-density plan. Replan it
    # automatically rather than silently accepting yesterday's one-figure plan.
    if plan.exists():
        try:
            old_visuals = json.loads(plan.read_text(encoding="utf-8")).get("visuals", [])
        except json.JSONDecodeError:
            old_visuals = []
        if len(old_visuals) < required or sum(is_chart_kind(item.get("kind")) for item in old_visuals if isinstance(item, dict)) < chart_required:
            plan.unlink()
            if report.exists():
                report.unlink()
            context["artifacts"]["visual_plan_changed"] = True
    contract = services.workspace / context["artifacts"]["order_execution_contract"]
    outline = services.workspace / context["artifacts"]["plan"]
    sources = context["artifacts"]["resolved_source_rules"]
    prompt = f"""پیش از تولید متن، نقشهٔ بصری حرفه‌ای سفارش «{order.get('title')}» را بساز. قرارداد سفارش در `{contract.relative_to(services.workspace)}`، طرح فصل‌ها در `{outline.relative_to(services.workspace)}` و قرارداد منابع در `{sources}` است.

دقیقاً حداقل {required} عنصر بصری لازم است و دست‌کم {chart_required} مورد باید `chart` یا `graph` باشد. این تعداد بر اساس {policy['page_equivalent']} صفحهٔ معادل و سیاست تراکم سفارش محاسبه شده است. ترکیب انواع را هوشمندانه انتخاب کن: نمودار داده‌محور فقط با دادهٔ معتبر، نمودار فرایند/معماری برای توضیح ساختار، و تصویر/شمای مفهومی فقط وقتی به استدلال کمک می‌کند. فایل `planning/visual_plan.json` را با آرایهٔ `visuals` بساز. هر مورد باید `id`، `kind`، `target_section`، `claim_supported`، `data_or_source`, `reasoning_value` و `caption` داشته باشد. `target_section` باید عنوان بخش مشخصی از طرح باشد.

تنها عناصر بصری که یک ادعای مشخص را توضیح می‌دهند انتخاب کن. نمودار عددی فقط با دادهٔ معتبر؛ در فقدان آن، نمودار مفهومی/فرایندی دقیق با برچسب «تحلیل مفهومی» مجاز است. شکل تزئینی یا نمودار خالی ممنوع است. پاسخ نهایی فقط گزارش کوتاه باشد."""
    services.run_codex(prompt, report)
    try:
        visuals = json.loads(plan.read_text(encoding="utf-8")).get("visuals", [])
    except (FileNotFoundError, json.JSONDecodeError) as exc:
        raise RuntimeError("Visual planner did not create valid planning/visual_plan.json") from exc
    needed = ("id", "kind", "target_section", "claim_supported", "data_or_source", "reasoning_value", "caption")
    if not isinstance(visuals, list) or len(visuals) < required or any(not isinstance(item, dict) or any(not str(item.get(key) or "").strip() for key in needed) for item in visuals):
        raise RuntimeError("Visual plan is incomplete; every visual needs section, claim, evidence, and purpose")
    chart_count = sum(is_chart_kind(item.get("kind")) for item in visuals)
    if chart_count < chart_required:
        raise RuntimeError(f"Visual plan has too few charts/graphs ({chart_count}/{chart_required})")
    context["artifacts"]["visual_plan"] = str(plan.relative_to(services.workspace))
    context["artifacts"]["visual_planning_report"] = str(report.relative_to(services.workspace))
