"""Plan one order-specific revision and invalidate only generated downstream artifacts."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import re
import shutil
from typing import Any

from common.helpers import write_json


PRESENTATION_STAGES = (
    ("05a_analyze_customer_sources", ("استخراج منبع", "استخراج متن", "فایل منبع ناخوانا", "source extraction")),
    ("05c_research_evidence", ("موازنه", "مدل مالی", "جریان نقد", "فرمول", "محاسبه", "ماتریس",
                                "حساسیت", "کتابنامه", "فهرست منابع", "ارجاع", "استناد", "شاهد",
                                "npv", "irr", "capex", "opex", "mass balance")),
    ("06_build_thesis_plan", ("تعداد اسلاید", "ساختار ارائه", "سناریوی ارائه", "پوشش موضوع", "ترتیب اسلاید")),
    ("06a_plan_visuals", ("نمودار", "شکل", "فلوچارت", "نقشه", "جدول", "chart")),
    ("07_generate_content", ("اسلاید", "یادداشت سخنران", "عنوان", "نتیجه", "جمع‌بندی", "خوانایی",
                             "راست‌به‌چپ", "rtl", "bidi", "pdf")),
)


def choose_restart_stage(order_type: str, requested_prompt: str, stages: list[str],
                         model_suggestion: str | None = None) -> tuple[str, str]:
    """Choose the earliest stage that can regenerate the requested order artifact."""
    if "07_generate_content" not in stages:
        raise ValueError("Generation stage is unavailable")
    text = requested_prompt.casefold()
    rules = PRESENTATION_STAGES if order_type == "ارائه و پاورپوینت" else (
        ("05c_research_evidence", ("منبع", "محاسبه", "تحلیل", "فرمول", "داده", "استناد")),
        ("06_build_thesis_plan", ("ساختار", "فصل", "طرح")),
        ("07_generate_content", ("متن", "جدول", "نمودار", "نتیجه")),
    )
    matches = [(stage, terms) for stage, terms in rules if stage in stages and any(term in text for term in terms)]
    rule_stage = min((stage for stage, _ in matches), key=stages.index) if matches else "07_generate_content"
    safe_suggestion = model_suggestion if model_suggestion in stages and stages.index(model_suggestion) >= stages.index("05a_analyze_customer_sources") else None
    chosen = min((stage for stage in (rule_stage, safe_suggestion) if stage), key=stages.index)
    reason = ("درخواست اصلاح شامل تحلیل یا استناد منبع است؛ بازسازی از نخستین مرحلهٔ وابسته انجام می‌شود."
              if stages.index(chosen) <= stages.index("05c_research_evidence") else
              "درخواست اصلاح از مرحلهٔ طرح یا تولید محتوا به بعد اعمال می‌شود.")
    return chosen, reason


def prepare_presentation_revision(workspace: Path, workspace_root: Path, order_id: str,
                                  job_id: str, start_stage: str, stages: list[str]) -> Path:
    """Snapshot the current result, then clear reusable model responses from the restart stage onward."""
    workspace = workspace.resolve()
    root = workspace_root.resolve()
    if not workspace.is_relative_to(root) or not re.fullmatch(r"[0-9a-f-]{36}", job_id, re.I):
        raise ValueError("Order revision has an unsafe workspace or job identifier")
    if start_stage not in stages:
        raise ValueError("Unknown order revision stage")
    context = json.loads((workspace / "order_context.json").read_text(encoding="utf-8"))
    if context.get("order_id") != order_id or context.get("order", {}).get("order_type") != "ارائه و پاورپوینت":
        raise ValueError("Revision workspace does not match the presentation order")
    if not context.get("completed_steps") or "10_validate_and_publish" not in context["completed_steps"]:
        raise ValueError("Order revision requires a completed local presentation")

    from_stage = stages.index(start_stage)
    all_outputs = [
        "order_context.json", "reports/execution_graph.json",
        "planning/presentation_topics.json", "planning/presentation_claims.proposed.json",
        "planning/presentation_claims.json", "planning/presentation_analysis.proposed.json",
        "planning/presentation_analysis.json", "planning/presentation_evidence.json",
        "planning/presentation_outline.proposed.json", "planning/presentation_outline.json",
        "planning/presentation_visuals.json", "final/presentation.json",
        "drafts/presentation_last_valid.json", "reports/stage_checks/presentation_generation.json",
        "final/final.pptx", "final/final.pdf", "final/sample.pptx", "final/sample.pdf",
        "reports/ai_reviews.json",
    ]
    invalidate = {
        "05a_analyze_customer_sources": ["extracted/presentation_sources.json", "extracted/presentation_sources.proposed.json"],
        "05c_research_evidence": all_outputs[2:8],
        "06_build_thesis_plan": all_outputs[8:10],
        "06a_plan_visuals": all_outputs[10:11],
        "07_generate_content": all_outputs[11:14],
    }
    to_clear: list[str] = []
    for stage, paths in invalidate.items():
        if stage in stages and from_stage <= stages.index(stage):
            to_clear.extend(paths)
    to_clear = list(dict.fromkeys(to_clear))
    snapshot = root / "review_versions" / order_id / job_id
    if snapshot.exists():
        raise ValueError("This order revision already has a saved snapshot")
    snapshot.mkdir(parents=True)
    manifest: dict[str, Any] = {"order_id": order_id, "job_id": job_id, "restart_stage": start_stage, "files": []}
    for relative in dict.fromkeys([*all_outputs, *to_clear]):
        source = (workspace / relative).resolve()
        if not source.is_relative_to(workspace) or not source.is_file() or source.is_symlink():
            continue
        target = snapshot / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
        manifest["files"].append({"path": relative, "sha256": hashlib.sha256(source.read_bytes()).hexdigest()})
    write_json(snapshot / "manifest.json", manifest)
    for relative in to_clear:
        target = (workspace / relative).resolve()
        if target.is_relative_to(workspace) and target.is_file() and not target.is_symlink():
            target.unlink()
    return snapshot
