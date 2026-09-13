from typing import Any
import re
from common.helpers import write_text

TITLE = "Generate content"

def run(context: dict[str, Any], services: Any) -> None:
    order = context["order"]
    scope = "بستهٔ کامل منطبق با طرح مصوب"
    volume_rule = "حداقل ۶٬۰۰۰ واژهٔ محتوای فارسی تولید کن. به‌دلیل محدودیت طول پاسخ، متن را فشرده یا خلاصه نکن؛ هر فصل باید چند بخش فرعی و پاراگراف‌های تحلیلی کامل داشته باشد."
    target = services.workspace / "final" / "deliverable_source.md"
    uploaded_sources = context.get("artifacts", {}).get("customer_sources", "extracted/customer_sources")
    source_contract = context.get("artifacts", {}).get("resolved_source_rules", "extracted/resolved_source_rules.md")
    admin_rules = context.get("artifacts", {}).get("admin_internal_rules", "extracted/admin_internal_rules.md")
    prompt = f"""برای {services.profile.DISPLAY_NAME} با عنوان «{order.get('title')}»، {scope} آماده کن.

خروجی باید Markdown آماده‌ی تبدیل به Word باشد، نه توضیح درباره‌ی کار. فقط متن نهایی را بده؛ هیچ مقدمه، عذرخواهی، کدبلاک، TODO یا ادعای انجام‌نداده نیاور. از ابزار فایل، shell یا ویرایش فایل استفاده نکن.

قواعد محتوایی اجباری:
1) ساختار روشن و سلسله‌مراتبی با # برای فصل‌های اصلی و ## برای بخش‌های فرعی؛ عنوان‌ها نباید خالی باشند.
2) برای نمونه: چکیده، کلیدواژه‌ها، «# فهرست مطالب»، مقدمه یا بیان مسئله، بخشی مستدل از مبانی یا امکان‌سنجی، روش و محدودیت‌ها، جمع‌بندی و «# منابع» را بساز. برای نسخه کامل، همه فصل‌های لازم را با همان منطق بساز. زیر «# فهرست مطالب» فقط bulletهای عنوان‌ها را بنویس؛ worker آن‌ها را به لینک‌های قابل‌کلیک به فصل‌ها تبدیل می‌کند. جلد و صفحهٔ عنوان جداگانه نساز؛ worker جلد را از اطلاعات سفارش ایجاد می‌کند. بنابراین خروجی را با «# عنوان پژوهش»، «# عنوان پایان‌نامه» یا تکرار عنوان سفارش آغاز نکن و مستقیم با «# چکیده» شروع کن.
3) هر ادعای علمی، فنی، آماری یا مقرراتی باید یا با منبع واقعی و قابل‌ردیابی پشتیبانی شود یا صریحاً به‌عنوان پیشنهاد یا فرض تحلیل معرفی شود. داده، نتیجه‌ی آزمایش، مجوز یا منبع جعلی نساز.
4) استناد در متن طبق سبک {order.get('academic_style') or 'IEEE'} به صورت [1] باشد و همه شماره‌ها دقیقاً در «# منابع» با مشخصات کتابشناختی کامل و URL یا DOI در صورت وجود بیایند. منبعی که در متن نیامده، وارد فهرست نکن.
5) جدول فقط برای مقایسه یا داده‌ی واقعی یا فرض‌های شفاف باشد. هر جدول یا شکل باید شماره، عنوان، منبع و ارجاع در متن داشته باشد؛ اگر داده‌ی تأییدشده موجود نیست، شکل یا جدول ساختگی نساز.
6) متن فارسی روان، دانشگاهی، بدون تکرار، با پاراگراف‌های کامل و قابل دفاع بنویس؛ برای اعداد و واحدها، روش و فرض‌ها را روشن کن.
7) {volume_rule}

Worker بر اساس شیوه‌نامه، فونت، صفحه‌آرایی و کنترل کیفیت را اعمال می‌کند و پاسخ تو را در `{target.relative_to(services.workspace)}` ذخیره می‌کند."""
    prompt += f"""\n\nمنابع آپلودشدهٔ مشتری در `{uploaded_sources}`، قرارداد یکپارچهٔ قواعد در `{source_contract}` و یادداشت‌های اجباری مدیر در `{admin_rules}` قرار دارند. پیش از نوشتن همه را بررسی کن، تمام بایدها و نبایدها و تک‌تک یادداشت‌های مدیر را رعایت کن و هیچ فایل یا قاعده‌ای را نادیده نگیر. تعارض حل‌نشده یا دستور ناممکن را با ادعای ساختگی پنهان نکن."""
    services.run_codex(prompt, target)
    # Full theses are often longer than one model response. Extend the body in focused batches
    # while preserving the original verified reference list instead of accepting a short package.
    if target.exists():
        requested_pages = int(order.get("quantity_value") or 0) if order.get("quantity_type") == "pages" else 0
        # 360 words/page is deliberately conservative for 14pt, 1.5-line Persian A4 text.
        minimum_words = max(5200, requested_pages * 360)
        for attempt in range(1, 17):
            generated = target.read_text(encoding="utf-8")
            if len(re.findall(r"[آ-یA-Za-z]{2,}", generated)) >= minimum_words:
                break
            continuation = services.workspace / "drafts" / f"continuation_{attempt}.md"
            remaining = minimum_words - len(re.findall(r"[آ-یA-Za-z]{2,}", generated))
            batch_words = min(max(remaining + 300, 1800), 2500)
            continuation_prompt = f"""برای {services.profile.DISPLAY_NAME} «{order.get('title')}» یک بخش تحلیلیِ جدید و غیرتکراری حدود {batch_words} واژه‌ای بنویس تا به نسخهٔ کامل اضافه شود. فقط Markdown شامل ## و ###، پاراگراف و در صورت نیاز جدول واقعی بده. بخش «منابع» یا فهرست منابع نساز؛ فقط از شماره‌های استناد موجود [1] تا [7] استفاده کن و ادعای عددی/فنی بدون منبع یا برچسب فرض نیاور. بر امکان‌سنجی فنی، جریان فرایند، کنترل کیفیت، بازار، مکان‌یابی، نیروی انسانی، HSE، تحلیل مالیِ بدون اعداد ساختگی، ریسک‌ها و برنامه اجرا تمرکز کن. از ابزار فایل و shell استفاده نکن؛ فقط متن نهایی را بده."""
            services.run_codex(continuation_prompt, continuation)
            body, marker, references = generated.partition("# منابع")
            addition = continuation.read_text(encoding="utf-8").strip()
            if not addition:
                break
            write_text(target, body.rstrip() + "\n\n" + addition + "\n\n" + (marker + references if marker else ""))
    if not target.exists() or not target.read_text(encoding="utf-8").strip():
        raise RuntimeError(f"Codex did not create {target.relative_to(services.workspace)}")
    context["artifacts"]["source"] = str(target.relative_to(services.workspace))
