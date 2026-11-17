"""Build the Telegram captions for the six-service catalog."""
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "telegram/integration"))
from channel_format import CONFIG, format_post

OUTPUT = ROOT / "telegram/content/2026-11-17"
SERVICES = json.loads((ROOT / "frontend/src/lib/service-catalog.json").read_text(encoding="utf-8"))
SLUGS = {
    "bachelor_thesis": "bachelor-thesis", "master_thesis": "master-thesis", "proposal": "proposal",
    "research_assignment": "research-assignment", "presentation": "presentation", "editing": "editing",
}


def amount(value):
    return f"{value:,}".translate(str.maketrans("0123456789,", "۰۱۲۳۴۵۶۷۸۹٬"))


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    body = ["<b>✦ تعرفه خدمات دانشیار</b>"]
    for service in SERVICES:
        unit = "صفحه" if service["unit"] == "page" else "اسلاید"
        body.append(f'<b>{service["label"]}</b>\nهر {unit} {amount(service["price_per_unit_toman"])} تومان')
    body.append(f'مبلغ نهایی بر اساس حجم و جزئیات سفارش تعیین می‌شود.\n'
                f'<a href="{CONFIG["sample_post"]["url"]}">مشاهده نمونه‌کارها</a>')
    pricing = format_post("\n\n".join(body), ["#تعرفه_خدمات", "#ویراستاری", "#پایان_نامه", "#پاورپوینت"])
    assert len(re.sub(r"<[^>]+>", "", pricing).encode("utf-16-le")) // 2 <= 1024
    (OUTPUT / "pricing-caption.html").write_text(pricing, encoding="utf-8")

    site = CONFIG["contact"]["website"]
    links = [f'• <a href="{site}/sample/{SLUGS[item["order_type"]]}.pdf">{item["label"]}</a>' for item in SERVICES]
    body = "<b>📎 نمونه‌کارها</b>\n\n۲۰٪ ابتدایی خروجی‌ها را در قالب PDF ببینید.\n\n" + "\n\n".join(links)
    (OUTPUT / "samples.html").write_text(format_post(body, ["#نمونه_کار", "#ویراستاری"]), encoding="utf-8")


if __name__ == "__main__":
    main()
