from __future__ import annotations

from copy import deepcopy
from typing import Any


DEFAULT_DOCUMENT_RULES: dict[str, Any] = {
    "source": "worker_default",
    "language": "fa",
    "page": {"size": "A4", "right_cm": 3.0, "left_cm": 3.0, "top_cm": 2.5, "bottom_cm": 2.5, "border": {"enabled": True, "color": "808080", "size": 6, "space": 16}},
    "font": {"persian": "B Nazanin", "latin": "Times New Roman", "body_pt": 14, "heading_1_pt": 16, "heading_2_pt": 15, "heading_3_pt": 14, "table_pt": 11},
    "paragraph": {"line_spacing": 1.5, "first_line_cm": 0.7, "space_after_pt": 8, "alignment": "justify"},
    "cover": {"sequence": ["university", "faculty_department", "degree_field", "title", "student", "supervisor", "consultant"], "top_space_pt": 84, "line_spacing": 1.5, "institution_pt": 21, "metadata_pt": 14, "degree_pt": 15, "title_pt": 28, "student_pt": 19, "student_block_before_pt": 100, "supervisor_pt": 13, "institution_after_pt": 10, "faculty_after_pt": 15, "degree_after_pt": 20, "title_after_pt": 24, "student_after_pt": 24, "supervisor_after_pt": 16},
    "captions": {"table_position": "above", "figure_position": "below", "font_pt": 11},
    "references": {"style": "IEEE", "single_spaced": True},
    "quality": {"min_sample_words": 900, "min_full_words": 5000, "require_citations": True, "require_reference_list": True},
}


def document_rules(_: list[str], citation_style: str | None) -> dict[str, Any]:
    rules = deepcopy(DEFAULT_DOCUMENT_RULES)
    rules["references"]["style"] = citation_style or rules["references"]["style"]
    return rules


def build_plan(kind: str, title: str, admin_rules: str) -> str:
    return f"# طرح {kind}: {title}\n\n1. مقدمه و مسئله\n2. مبانی و منابع\n3. روش یا ساختار اجرا\n4. تحلیل و بحث (وابسته به دادهٔ تأییدشده)\n5. جمع‌بندی\n\n## قواعد اجباری طرح\n\n{admin_rules}\n"


def validate_order(order: dict[str, Any], expected_type: str) -> None:
    actual = str(order.get("order_type") or "").strip()
    if actual and actual != expected_type:
        raise RuntimeError(f"This worker handles '{expected_type}', not '{actual}'.")
