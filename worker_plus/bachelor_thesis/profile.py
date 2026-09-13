from .utils.thesis_rules import resolve_thesis_rules as resolve_rules
from common.profile_support import build_plan as _build_plan, validate_order as _validate_order

ORDER_TYPE = "پایان‌نامه کارشناسی"
DISPLAY_NAME = "پایان‌نامه کارشناسی"
REQUIRED_FIELDS = ("title", "faculty", "advisor_name")

def validate_order(order): _validate_order(order, ORDER_TYPE)
def build_plan(title, admin_rules): return _build_plan(DISPLAY_NAME, title, admin_rules)
