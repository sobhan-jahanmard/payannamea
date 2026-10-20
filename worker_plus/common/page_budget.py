"""A rendered-page range for orders sold by page count."""
from __future__ import annotations

import math
import json
from pathlib import Path
from typing import Any

from common.deliverable_policy import classify_project
from common.visual_policy import visual_requirements

def page_budget(order: dict[str, Any], visual_count: int | None = None, rules: dict[str, Any] | None = None) -> dict[str, int] | None:
    if order.get("quantity_type") != "pages":
        return None
    requested = int(order.get("quantity_value") or 0)
    if requested <= 0:
        return None
    # Reserve one page for small Word/PDF pagination differences. The prose
    # estimate accounts for front matter and the space occupied by planned
    # figures and likely analytical tables before assigning words to body pages.
    maximum = requested + max(3, min(10, math.ceil(requested * 0.20)))
    figures = max(0, int(visual_count)) if visual_count is not None else int(visual_requirements(order)["minimum_total_visuals"])
    tables = max(1, math.ceil(requested / 25), 3 if classify_project(order) == "factory_design" else 1)
    front_matter = 2 + math.ceil(requested / 35) + math.ceil(requested / 50)
    lists = int(figures > 0) + int(tables > 0)
    reserved_nonbody = front_matter + lists
    figure_pages = math.ceil(figures * 0.45)
    table_pages = math.ceil(tables * 0.30)
    text_pages = max(1, requested - reserved_nonbody - figure_pages - table_pages)
    rules = rules or {}
    page = rules.get("page") or {}
    font = rules.get("font") or {}
    paragraph = rules.get("paragraph") or {}
    try:
        width = 21 - float(page.get("right_cm", 3)) - float(page.get("left_cm", 3))
        height = 29.7 - float(page.get("top_cm", 2.5)) - float(page.get("bottom_cm", 2.5))
        body_pt = float(font.get("body_pt", 14))
        line_spacing = float(paragraph.get("line_spacing", 1.5))
        density = (width * height / (15 * 24.7)) * (14 / body_pt) ** 1.7 * (1.5 / line_spacing)
        words_per_text_page = max(140, min(420, round(245 * density)))
    except (TypeError, ValueError, ZeroDivisionError):
        words_per_text_page = 245
    suggested_words = max(400, text_pages * words_per_text_page)
    minimum_words = max(300, math.floor(suggested_words * 0.95))
    return {
        "minimum": requested,
        "maximum": maximum,
        "word_maximum": maximum - 1,
        "minimum_content_words": minimum_words,
        "minimum_persian_words": max(250, math.floor(minimum_words * 0.90)),
        "suggested_content_words": suggested_words,
        "maximum_content_words": suggested_words + max(300, math.ceil(suggested_words * 0.15)),
        "reserved_nonbody_pages": reserved_nonbody,
        "estimated_visuals": figures,
        "estimated_tables": tables,
        "reserved_visual_pages": figure_pages,
        "reserved_table_pages": table_pages,
        "estimated_text_pages": text_pages,
        "words_per_text_page": words_per_text_page,
    }


def planned_page_budget(order: dict[str, Any], visual_plan: Path, rules: dict[str, Any] | None = None) -> dict[str, int] | None:
    """Recalculate the draft budget using the approved visual plan when present."""
    visuals = None
    if visual_plan.exists():
        payload = json.loads(visual_plan.read_text(encoding="utf-8"))
        if isinstance(payload, dict) and isinstance(payload.get("visuals"), list):
            visuals = len(payload["visuals"])
    return page_budget(order, visuals, rules)
