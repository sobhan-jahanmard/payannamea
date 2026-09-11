from typing import Any
from utils.helpers import write_json, write_text

TITLE = "Collect sources"

def run(context: dict[str, Any], services: Any) -> None:
    references = context["order"].get("references", [])
    write_json(services.workspace / "extracted" / "references.json", {"references": references})
    write_text(services.workspace / "reports" / "reference_usage_report.md", "# Reference Usage Report\n\n" + (f"- {len(references)} source(s) supplied with the order.\n" if references else "- No customer references were supplied.\n"))
    context["artifacts"]["references"] = "extracted/references.json"
