from typing import Any
from utils.api import fail_order

TITLE = "Handle failure"

def run(context: dict[str, Any], services: Any) -> None:
    reason = context["errors"][-1] if context.get("errors") else "Unknown worker failure"
    if context.get("order_id") and not services.args.offline:
        fail_order(services.config, context["order_id"], reason)
    context["status"] = "failed"
