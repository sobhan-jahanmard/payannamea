from typing import Any
from utils.api import claim_oldest, heartbeat

TITLE = "Fetch order — دریافت قدیمی‌ترین سفارش آماده"

def run(context: dict[str, Any], services: Any) -> None:
    if services.args.offline:
        context.update({
            "order_id": "offline-test-order",
            "order": {
                "id": "offline-test-order", "title": "نمونهٔ آزمایشی پایان‌نامه کارشناسی",
                "faculty": "دانشکده آزمایشی", "advisor_name": "استاد راهنما",
                "university": "دانشگاه آزمایشی", "language": "فارسی",
                "academic_style": "APA 7", "files": [], "references": [],
            },
            "status": "in_progress",
        })
        return
    payload = claim_oldest(services.config, services.args.order_id, services.args.redo)
    order = payload["customerInput"]
    context.update({"order_id": order["id"], "order": order, "status": "in_progress"})
    heartbeat(services.config, order["id"], "Worker Plus started the order.")
