from common.profile_support import build_plan as _build_plan, validate_order as _validate_order
from bachelor_thesis.utils.thesis_rules import resolve_thesis_rules

ORDER_TYPE = "تحقیق دانشگاهی"
DISPLAY_NAME = "تحقیق دانشگاهی"
REQUIRED_FIELDS = ("title", "instructor_name", "course_name")

def validate_order(order): _validate_order(order, ORDER_TYPE)
def build_plan(title, admin_rules):
    shared_plan = _build_plan(DISPLAY_NAME, title, "").replace("فصل و زیربخش", "بخش و زیربخش")
    return shared_plan + "\n\nساختار خروجی یک گزارش پژوهشی برای درس است: چکیده، مقدمه و پرسش، روش، یافته‌ها و تحلیل، بحث و نتیجه‌گیری، منابع. بخش‌ها را متناسب با حجم سفارش تنظیم کن؛ عنوان فصل‌های پایان‌نامه یا عبارت دریافت درجه به کار نبر.\n\n" + admin_rules


def resolve_rules(files):
    # Share the proven PDF guideline extraction and typography with the thesis.
    rules = resolve_thesis_rules(files)
    rules["cover"].update({"source": "course research report default", "sequence": ["university", "faculty_department", "course", "title", "student", "instructor"]})
    rules["page"]["border"]["enabled"] = False
    rules["quality"]["min_full_words"] = 1200
    return rules
