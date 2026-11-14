"""Prepare a code-rendered Persian price poster and the saved channel caption."""
import json
from pathlib import Path
import shutil
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "telegram/integration"))
from channel_format import format_post

FOLDER = ROOT / "telegram/content/2026-11-09"
SERVICES = [
    ("پایان‌نامه کارشناسی", 200000, 30, "صفحه"),
    ("پایان‌نامه کارشناسی ارشد", 250000, 60, "صفحه"),
    ("پروپوزال پایان‌نامه", 200000, 20, "صفحه"),
    ("تحقیق دانشگاهی", 150000, 15, "صفحه"),
    ("ارائه و پاورپوینت", 300000, 15, "اسلاید"),
]


def fa(number, grouped=True):
    return (f"{number:,}" if grouped else str(number)).replace(",", "٬").translate(str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹"))


def main():
    FOLDER.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(ROOT / "frontend/public/fonts/Iranian Sans.ttf", FOLDER / "pricing-font.ttf")
    shutil.copyfile(ROOT / "frontend/public/images/daneshyar-logo.png", FOLDER / "pricing-logo.png")
    rows = []
    caption_rows = []
    for index, (title, rate, quantity, unit) in enumerate(SERVICES, 1):
        rows.append(f'''<article class="service">
          <div class="service-top">
            <div class="service-name"><span class="index">{fa(index, False)}</span><h2>{title}</h2></div>
            <div class="price"><span class="amount">{fa(rate)}</span><span class="currency">تومان / هر {unit}</span></div>
          </div>
          <div class="estimate"><span class="quantity">برآورد {fa(quantity, False)} {unit}</span><span class="total">حدود <b>{fa(rate * quantity)}</b> <span>تومان</span></span></div>
        </article>''')
        caption_rows.append(f"<b>{title}</b>\nهر {unit}: {fa(rate)} تومان")

    html = '''<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>تعرفه خدمات دانشیار</title>
<style>
@font-face{font-family:Iranian;src:url('pricing-font.ttf')}*{box-sizing:border-box}html,body{margin:0;width:1080px;height:1440px}body{font-family:Iranian,Tahoma,sans-serif;color:#edf3f4;background:#101f28;-webkit-font-smoothing:antialiased}.poster{width:1080px;height:1440px;position:relative;overflow:hidden;padding:56px 60px;background:radial-gradient(ellipse at 95% 0%,#1b4549 0,transparent 48%),radial-gradient(ellipse at 0% 100%,#1b303b 0,transparent 48%),#101f28}.poster:before{content:'';position:absolute;inset:20px;border:1px solid #a7c2bf20;border-radius:26px;pointer-events:none}.brand{display:flex;align-items:center;justify-content:space-between}.brand-name{display:flex;gap:16px;align-items:center}.logo{width:64px;height:64px;object-fit:contain;background:#eaf2ee;border:1px solid #ffffff30;border-radius:16px;padding:5px}.name{font-size:31px;font-weight:bold}.slogan{font-size:16px;color:#bdd1d0;margin-top:4px}.badge{font-size:17px;color:#a3e0d7;border:1px solid #9bd5c63a;padding:10px 19px;border-radius:999px;background:#8bd3c00b}h1{font-size:54px;line-height:1.6;margin:31px 0 0;font-weight:bold;letter-spacing:-1px}h1 span{color:#f5d68d}.intro{font-size:21px;color:#b5c6cd;margin:4px 0 27px;line-height:1.9}.services{display:grid;gap:16px}.service{height:164px;overflow:hidden;border:1px solid #aec9d225;border-radius:18px;background:linear-gradient(110deg,#ffffff03,#ffffff07);padding:21px 26px 0;box-shadow:0 9px 24px #00000010}.service-top{display:flex;align-items:center;justify-content:space-between;gap:20px;height:73px}.service-name{display:flex;align-items:center;gap:16px}.index{width:39px;height:39px;display:flex;align-items:center;justify-content:center;border:1px solid #a7dfd52e;background:#a7dfd50b;border-radius:12px;color:#9ddbd1;font-size:20px}h2{margin:0;font-size:28px;font-weight:bold;line-height:1.8}.price{display:flex;flex-direction:column;align-items:flex-end;flex-shrink:0;gap:4px}.amount{font-size:40px;line-height:1.1;font-weight:bold;color:#f5d68d;font-variant-numeric:tabular-nums}.currency{font-size:16px;color:#b0c1c8;line-height:1.7}.estimate{margin-top:14px;border-top:1px solid #c7d5d817;display:flex;align-items:center;justify-content:space-between;height:53px;font-size:19px}.quantity{color:#9ddbd1}.total{color:#b6c6cd;display:flex;align-items:baseline;gap:9px}.total b{font-size:24px;color:#e6f0f2;font-variant-numeric:tabular-nums}.total span{font-size:17px}.note{margin-top:25px;padding:18px 22px;border-radius:14px;border:1px solid #f5d68d22;background:#f5d68d05;color:#c7d2d6;font-size:18px;line-height:1.9}.note strong{color:#f5d68d;font-weight:normal}.bottom{display:flex;justify-content:space-between;align-items:center;margin-top:25px;font-size:18px;color:#98b4b7}.bottom .line{width:72px;height:2px;background:#cfb77c}.bottom span{display:flex;align-items:center;gap:16px}
</style></head><body><main class="poster">
<header><div class="brand"><div class="brand-name"><img class="logo" src="pricing-logo.png" alt="لوگوی دانشیار"><div><div class="name">دانشیار</div><div class="slogan">همراه مسیر دانشگاهی شما</div></div></div><div class="badge">راهنمای هزینه‌ها</div></div>
<h1><span>تعرفه</span> خدمات دانشگاهی</h1><p class="intro">نرخ هر صفحه یا اسلاید، همراه با برآورد هزینهٔ نمونه</p></header>
<section class="services">''' + "\n".join(rows) + '''</section>
<div class="note"><strong>همهٔ مبالغ به تومان است.</strong><br>برآوردها برای تعداد درج‌شده‌اند؛ مبلغ نهایی پس از بررسی جزئیات سفارش مشخص می‌شود.</div>
<footer class="bottom"><span><i class="line"></i>از ایده تا تحویل</span><span>نمونه‌کارها در پست پین‌شدهٔ کانال</span></footer>
</main></body></html>'''
    (FOLDER / "pricing-poster.html").write_text(html, encoding="utf-8")
    body = "<b>✦ تعرفه خدمات دانشیار</b>\n\n" + "\n\n".join(caption_rows)
    body += '\n\nبرآورد هزینهٔ نمونه در تصویر آمده است. مبلغ نهایی پس از بررسی جزئیات سفارش مشخص می‌شود.\n<a href="https://t.me/daneshyar_samples/12">مشاهده نمونه‌کارها</a>'
    caption = format_post(body, ["#تعرفه_خدمات", "#پایان_نامه", "#پروپوزال", "#پاورپوینت"])
    (FOLDER / "pricing-caption.html").write_text(caption, encoding="utf-8")
    # Telegram's limit applies to parsed text rather than HTML markup.
    import re
    plain = re.sub(r"<[^>]+>", "", caption)
    units = len(plain.encode("utf-16-le")) // 2
    assert units <= 1024, units
    assert plain.endswith("\n\u2060")
    print(json.dumps({"caption_utf16_units": units, "poster": str(FOLDER / "pricing-poster.html")}, ensure_ascii=True))


if __name__ == "__main__":
    main()
