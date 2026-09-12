import json
from typing import Any

from utils.helpers import write_json


TITLE = "Polish cover layout"


def run(context: dict[str, Any], services: Any) -> None:
    """Apply the institutional cover specification without touching research data."""
    docx = services.workspace / context["artifacts"]["docx"]
    if not docx.exists():
        raise RuntimeError("DOCX output is missing before cover-layout polishing")
    rules = json.loads((services.workspace / context["artifacts"]["university_rules"]).read_text(encoding="utf-8"))
    services.polish_cover(docx, rules, context["order"])
    write_json(
        services.workspace / "reports" / "stage_checks" / "cover_layout.json",
        {"applied": True, "sequence": rules.get("cover", {}).get("sequence", ["university", "faculty_department", "degree_field", "title", "student", "supervisor", "consultant"]), "rules": rules.get("cover", {})},
    )
