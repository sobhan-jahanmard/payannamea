from typing import Any
from common.api import claim_oldest, fetch_order_read_only, heartbeat
from common.profiles import profile_for

TITLE = "Fetch order"

def run(context: dict[str, Any], services: Any) -> None:
    if services.args.offline:
        if services.args.order_id:
            order = fetch_order_read_only(services.config, services.args.order_id)
            services.profile = profile_for(order)
            services.profile.validate_order(order)
            context.update({"order_id": order["id"], "order": order, "status": "in_progress"})
            return
        context.update({
            "order_id": "offline-test-order",
            "order": {
                "id": "offline-test-order", "title": "نمونهٔ آزمایشی پایان‌نامه کارشناسی",
                "faculty": "دانشکده آزمایشی", "advisor_name": "استاد راهنما",
                "university": "دانشگاه آزمایشی", "language": "فارسی",
                "academic_style": "APA 7", "order_type": "پایان‌نامه کارشناسی", "files": [], "references": [],
            },
            "status": "in_progress",
        })
        services.profile = profile_for(context["order"])
        return
    payload = claim_oldest(services.config, services.args.order_id, services.args.redo)
    order = payload["customerInput"]
    services.profile = profile_for(order)
    services.profile.validate_order(order)
    context.update({"order_id": order["id"], "order": order, "status": "in_progress"})
    heartbeat(services.config, order["id"], "Worker Plus started the order.")
