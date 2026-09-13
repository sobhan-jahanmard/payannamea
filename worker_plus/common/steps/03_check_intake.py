from typing import Any
from common.helpers import write_text

TITLE = "Check intake"

def run(context: dict[str, Any], services: Any) -> None:
    order = context["order"]
    missing = [field for field in services.profile.REQUIRED_FIELDS if not str(order.get(field) or "").strip()]
    write_text(services.workspace / "reports" / "stage_checks" / "03_check_intake.md", "# Intake check\n\n" + ("PASS" if not missing else "PASS WITH HUMAN REVIEW\n\nMissing: " + ", ".join(missing)))
    context["artifacts"]["missing_intake_fields"] = missing
