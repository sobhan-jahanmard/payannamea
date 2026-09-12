from __future__ import annotations

import re
from copy import deepcopy
from pathlib import Path
from typing import Any

from pypdf import PdfReader


# Conservative fallback only. An uploaded, readable university guideline always wins.
DEFAULT_THESIS_RULES: dict[str, Any] = {
    "source": "worker_default",
    "language": "fa",
    "page": {"size": "A4", "right_cm": 3.0, "left_cm": 3.0, "top_cm": 2.5, "bottom_cm": 2.5, "border": {"enabled": True, "color": "808080", "size": 6, "space": 16}},
    "font": {"persian": "B Nazanin", "latin": "Times New Roman", "body_pt": 14, "heading_1_pt": 16, "heading_2_pt": 15, "heading_3_pt": 14, "table_pt": 11},
    "paragraph": {"line_spacing": 1.5, "first_line_cm": 0.7, "space_after_pt": 8, "alignment": "justify"},
    "cover": {
        "source": "Ferdowsi University of Mashhad thesis template (Overleaf)",
        "sequence": ["university", "faculty_department", "degree_field", "title", "student", "supervisor", "consultant"],
        "top_space_pt": 84,
        "line_spacing": 1.5,
        "institution_pt": 21,
        "metadata_pt": 14,
        "degree_pt": 15,
        "title_pt": 28,
        "student_pt": 19,
        "student_block_before_pt": 100,
        "supervisor_pt": 13,
        "institution_after_pt": 10,
        "faculty_after_pt": 15,
        "degree_after_pt": 20,
        "title_after_pt": 24,
        "student_after_pt": 24,
        "supervisor_after_pt": 16,
    },
    "captions": {"table_position": "above", "figure_position": "below", "font_pt": 11},
    "references": {"style": "IEEE", "single_spaced": True},
    "quality": {"min_sample_words": 900, "min_full_words": 5000, "require_citations": True, "require_reference_list": True},
}


def _pdf_text(path: Path) -> str:
    try:
        return "\n".join((page.extract_text() or "") for page in PdfReader(path).pages)
    except Exception:
        return ""


def _readable(text: str) -> bool:
    # Some Persian PDFs extract presentation-form escapes instead of usable text.
    return len(re.findall(r"[آ-ی]", text)) > 80 and "uF" not in text


def _extract_explicit_overrides(text: str) -> dict[str, Any]:
    overrides: dict[str, Any] = {}
    font = re.search(r"(?:فونت|قلم)\s*[:：]?\s*(B\s*Nazanin|Nazanin|BNazanin)", text, re.I)
    if font:
        overrides.setdefault("font", {})["persian"] = "B Nazanin"
    for key, patterns in {
        "body_pt": [r"(?:متن|بدنه).*?(\d{1,2})\s*(?:pt|پوینت)", r"(\d{1,2})\s*(?:pt|پوینت).*?(?:متن|بدنه)"],
        "line_spacing": [r"فاصله\s*(?:بین\s*)?خطوط.*?(1(?:\.5|/5)|2)"],
    }.items():
        for pattern in patterns:
            hit = re.search(pattern, text, re.I | re.S)
            if hit:
                value = float(hit.group(1).replace("/", "."))
                group = "font" if key == "body_pt" else "paragraph"
                overrides.setdefault(group, {})[key] = int(value) if key == "body_pt" else value
                break
    return overrides


def resolve_thesis_rules(files: list[str], citation_style: str | None) -> dict[str, Any]:
    rules = deepcopy(DEFAULT_THESIS_RULES)
    rules["references"]["style"] = citation_style or rules["references"]["style"]
    evidence: list[dict[str, str]] = []
    for raw in files:
        path = Path(raw)
        if path.suffix.lower() != ".pdf":
            continue
        text = _pdf_text(path)
        if not _readable(text):
            evidence.append({"file": path.name, "result": "unreadable_pdf_text; defaults retained; manual/OCR review required"})
            continue
        overrides = _extract_explicit_overrides(text)
        for group, values in overrides.items():
            rules[group].update(values)
        evidence.append({"file": path.name, "result": "readable; explicit rules extracted", "overrides": str(overrides)})
    rules["guideline_evidence"] = evidence
    rules["requires_manual_guideline_review"] = any("unreadable" in item["result"] for item in evidence)
    return rules
