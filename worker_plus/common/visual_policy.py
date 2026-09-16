"""Deterministic visual-density policy, so a checkbox never degrades to one token figure."""
from __future__ import annotations

import math
from typing import Any


def expected_page_equivalent(order: dict[str, Any]) -> int:
    quantity = max(0, int(order.get("quantity_value") or 0))
    unit = str(order.get("quantity_type") or "")
    if unit == "pages":
        return quantity
    if unit == "words":
        return math.ceil(quantity / 350) if quantity else 0
    if unit == "slides":
        # A slide has less room than a Word page but still needs visual pacing.
        return math.ceil(quantity / 2) if quantity else 0
    return 0


def visual_requirements(order: dict[str, Any]) -> dict[str, int | str]:
    pages = expected_page_equivalent(order)
    # Roughly one meaningful visual per 15 pages, with a gentle cap so the
    # academic argument remains primary. A short requested document still gets
    # a visual only when the customer explicitly requested charts/images.
    recommended = min(14, math.ceil(pages / 15)) if pages else 0
    total = max(recommended, 1 if order.get("requires_charts") else 0)
    chart_minimum = math.ceil(pages / 40) if order.get("requires_charts") and pages else (1 if order.get("requires_charts") else 0)
    return {
        "page_equivalent": pages,
        "minimum_total_visuals": total,
        "minimum_charts_or_graphs": chart_minimum,
        "basis": "one meaningful visual per 15 page-equivalents; one chart/graph per 40 page-equivalents when charts are requested",
    }
