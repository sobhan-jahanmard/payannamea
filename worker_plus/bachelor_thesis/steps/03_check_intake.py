from typing import Any
from utils.helpers import write_text

TITLE = "Check intake — بررسی اولیه اطلاعات سفارش"

def run(context: dict[str, Any], services: Any) -> None:
    order = context["order"]
    missing = [field for field in ("title", "faculty", "advisor_name") if not str(order.get(field) or "").strip()]
    write_text(services.workspace / "reports" / "stage_checks" / "03_check_intake.md", "# Intake check\n\n" + ("PASS" if not missing else "PASS WITH HUMAN REVIEW\n\nMissing: " + ", ".join(missing)))
    context["artifacts"]["missing_intake_fields"] = missing
