from typing import Any
from utils.helpers import write_text

TITLE = "Review content"

def run(context: dict[str, Any], services: Any) -> None:
    source = services.workspace / context["artifacts"]["source"]
    text = source.read_text(encoding="utf-8")
    prohibited = [marker for marker in ("TODO", "TBD", "[NEEDS") if marker in text]
    if prohibited:
        raise RuntimeError("Generated text contains placeholders: " + ", ".join(prohibited))
    write_text(services.workspace / "reports" / "compliance_report.md", "# Compliance Report\n\nPASS — no raw placeholder marker found.\n")
