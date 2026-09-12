import json
from typing import Any

TITLE = "Package DOCX"

def run(context: dict[str, Any], services: Any) -> None:
    source = services.workspace / context["artifacts"]["source"]
    output = services.workspace / "final" / ("sample.docx" if context["mode"] == "sample" else "deliverable.docx")
    rules = json.loads((services.workspace / context["artifacts"]["university_rules"]).read_text(encoding="utf-8"))
    services.write_docx(source, output, context["order"].get("title") or "پایان‌نامه کارشناسی", rules, context["order"])
    context["artifacts"]["docx"] = str(output.relative_to(services.workspace))
