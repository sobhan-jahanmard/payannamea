from typing import Any
import re
from common.helpers import write_text
from common.deliverable_policy import deliverable_contract

TITLE = "Generate content"

def run(context: dict[str, Any], services: Any) -> None:
    order = context["order"]
    scope = "بستهٔ کامل منطبق با طرح مصوب"
    volume_rule = "حداقل ۶٬۰۰۰ واژهٔ محتوای فارسی تولید کن. به‌دلیل محدودیت طول پاسخ، متن را فشرده یا خلاصه نکن؛ هر فصل باید چند بخش فرعی و پاراگراف‌های تحلیلی کامل داشته باشد."
    target = services.workspace / "final" / "deliverable_source.md"
    # If a resumed run expanded the visual plan, the old prose was written for a
    # different set of assets. Regenerate it rather than trying to bolt several
    # figures onto a completed argument after the fact.
    if context.get("artifacts", {}).pop("visual_plan_changed", False):
        if target.exists():
            target.unlink()
        for stale in (services.workspace / "drafts").glob("continuation_*.md"):
            stale.unlink()
    uploaded_sources = context.get("artifacts", {}).get("customer_sources", "extracted/customer_sources")
    source_contract = context.get("artifacts", {}).get("resolved_source_rules", "extracted/resolved_source_rules.md")
    admin_rules = context.get("artifacts", {}).get("admin_internal_rules", "extracted/admin_internal_rules.md")
    order_contract = context.get("artifacts", {}).get("order_execution_contract", "planning/order_execution_contract.md")
    visual_plan = context.get("artifacts", {}).get("visual_plan", "planning/visual_plan.json")
    visual_manifest = context.get("artifacts", {}).get("visual_manifest", "final/figures/manifest.json")
    decision_contract = deliverable_contract(order)
    prompt = f"""برای {services.profile.DISPLAY_NAME} با عنوان «{order.get('title')}»، {scope} آماده کن.

خروجی باید Markdown آماده‌ی تبدیل به Word باشد، نه توضیح درباره‌ی کار. فقط متن نهایی را بده؛ هیچ مقدمه، عذرخواهی، کدبلاک، TODO یا ادعای انجام‌نداده نیاور. برای خواندن فایل‌های مرجع نام‌برده حتماً از ابزار فایل یا shell به‌صورت read-only استفاده کن؛ هیچ فایل workspace را نساز، حذف یا ویرایش نکن. متن نهایی پاسخ تو توسط worker در فایل مقصد ذخیره می‌شود.

قواعد محتوایی اجباری:
1) ساختار روشن و سلسله‌مراتبی با # برای فصل‌های اصلی و ## و ### برای بخش‌های فرعی؛ عنوان‌های محتوایی را با کد چندسطحی مانند «۱»، «۱-۱» و «۱-۱-۱» شماره‌گذاری کن. چکیده، فهرست‌ها و منابع از این شماره‌گذاری مستثنا هستند. عنوان‌ها نباید خالی باشند.
2) برای نمونه: چکیده، کلیدواژه‌ها، «# فهرست مطالب»، مقدمه یا بیان مسئله، بخشی مستدل از مبانی یا امکان‌سنجی، روش و محدودیت‌ها، جمع‌بندی و «# منابع» را بساز. برای نسخه کامل، همه فصل‌های لازم را با همان منطق بساز. زیر «# فهرست مطالب» فقط bulletهای عنوان‌ها را بنویس؛ worker آن‌ها را به لینک‌های قابل‌کلیک به فصل‌ها تبدیل می‌کند. جلد و صفحهٔ عنوان جداگانه نساز؛ worker جلد را از اطلاعات سفارش ایجاد می‌کند. بنابراین خروجی را با «# عنوان پژوهش»، «# عنوان پایان‌نامه» یا تکرار عنوان سفارش آغاز نکن و مستقیم با «# چکیده» شروع کن.
3) هر ادعای علمی، فنی، آماری یا مقرراتی باید یا با منبع واقعی و قابل‌ردیابی پشتیبانی شود یا صریحاً به‌عنوان پیشنهاد یا فرض تحلیل معرفی شود. داده، نتیجه‌ی آزمایش، مجوز یا منبع جعلی نساز.
4) استناد در متن طبق سبک {order.get('academic_style') or 'IEEE'} به صورت [1] باشد و همه شماره‌ها دقیقاً در «# منابع» با مشخصات کتابشناختی کامل و URL یا DOI در صورت وجود بیایند. منبعی که در متن نیامده، وارد فهرست نکن.
5) جدول فقط برای مقایسه، داده واقعی، محاسبه یا فرض‌های شفاف باشد. هر جدول را با یک خط مستقل «جدول N. عنوان — منبع: ...» بلافاصله پیش از جدول و هر شکل را با caption شماره‌دار، منبع و ارجاع در متن ارائه کن تا فهرست جداگانه جدول‌ها و شکل‌ها ساخته شود. اگر داده‌ی تأییدشده موجود نیست، شکل یا جدول ساختگی نساز.
6) متن فارسی روان، دانشگاهی، بدون تکرار، با پاراگراف‌های کامل و قابل دفاع بنویس؛ برای اعداد و واحدها، روش و فرض‌ها را روشن کن.
7) {volume_rule}

قواعد نتیجه‌محور اجباری:
- نوع تشخیص‌داده‌شده پروژه `{decision_contract['project_type']}` و سطح آن `{decision_contract['academic_level']}` است.
- هر بخش باید به‌ترتیب «پرسش/تصمیم، داده و منبع، اجرای روش، نتیجه و محدودیت» را نشان دهد. شرح روش، فهرست داده‌های لازم یا توصیه به انجام تحلیل در آینده، جای نتیجه را نمی‌گیرد.
- عبارت‌های راهنماگونه مانند «می‌توان بررسی کرد»، «برای برآورد باید» و «داده لازم عبارت است از» را ننویس؛ تحلیل را واقعاً انجام بده.
- اگر داده مستقیم موجود نیست، ابتدا منبع جایگزین معتبر، سپس داده جانشین و سناریوی حداقل/مبنا/حداکثر را به‌کار ببر. اگر هیچ نتیجه قابل دفاعی ممکن نیست، آن خروجی را صریحاً «نیازمند داده» اعلام کن؛ با کلی‌گویی یا جزئیات فرایندی نامرتبط حجم نساز.
- برای انتخاب فناوری، مکان، ظرفیت یا تجهیزات، گزینه‌ها را مقایسه و یک گزینه مشخص را با دلیل انتخاب کن.
- سطح نظری را با مقطع تنظیم کن؛ در پروژه کارشناسی، مقدمه و مبانی فشرده و تمرکز بر اجرای محاسبات و طراحی باشد.

خروجی‌های اجباری این سفارش:
{chr(10).join(f"- {item['id']}: {item['output']} (روش: {item['method']}; شاهد: {item['evidence']})" for item in decision_contract['deliverables'])}

Worker بر اساس شیوه‌نامه، فونت، صفحه‌آرایی و کنترل کیفیت را اعمال می‌کند و پاسخ تو را در `{target.relative_to(services.workspace)}` ذخیره می‌کند."""
    prompt += f"""\n\nمنابع آپلودشدهٔ مشتری در `{uploaded_sources}`، قرارداد یکپارچهٔ قواعد در `{source_contract}`، قرارداد اجرایی تمام فیلدهای سفارش در `{order_contract}` و یادداشت‌های اجباری مدیر در `{admin_rules}` قرار دارند. نقشهٔ بصریِ از پیش تعیین‌شده در `{visual_plan}` و فایل/manifest شکل‌های آماده در `{visual_manifest}` است. پیش از نوشتن همه را بررسی کن. برای هر شکل، متن همان بخش هدف را حول ادعای پشتیبانی‌شده بنویس: پیش از شکل مسئله یا ادعا را مطرح کن، با syntax دقیق `![caption](figures/name.png)` شکل را در همان بخش قرار بده، و بعد از آن تحلیل کن که شکل چگونه ادعا را پشتیبانی می‌کند. شکل را صرفاً تزئینی یا در بخش نامرتبط قرار نده و فایل شکل تازه نساز. تمام بایدها و نبایدها و تک‌تک یادداشت‌های مدیر را رعایت کن و هیچ فایل یا قاعده‌ای را نادیده نگیر. تعارض حل‌نشده یا دستور ناممکن را با ادعای ساختگی پنهان نکن."""
    services.run_codex(prompt, target)
    # Full theses are often longer than one model response. Extend the body in focused batches
    # while preserving the original verified reference list instead of accepting a short package.
    if target.exists():
        requested_pages = int(order.get("quantity_value") or 0) if order.get("quantity_type") == "pages" else 0
        # 360 words/page is deliberately conservative for 14pt, 1.5-line Persian A4 text.
        minimum_words = max(5200, requested_pages * 360)
        for attempt in range(1, 9):
            generated = target.read_text(encoding="utf-8")
            if len(re.findall(r"[آ-یA-Za-z]{2,}", generated)) >= minimum_words:
                break
            continuation = services.workspace / "drafts" / f"continuation_{attempt}.md"
            remaining = minimum_words - len(re.findall(r"[آ-یA-Za-z]{2,}", generated))
            batch_words = min(max(remaining + 300, 1800), 2500)
            continuation_prompt = f"""متن موجود `{target.relative_to(services.workspace)}`، طرح `{context['artifacts']['plan']}` و قرارداد `{order_contract}` را بخوان. کمبود محتوای واقعی حدود {batch_words} واژه است.

یک فصل تازه و عمومی به انتهای سند اضافه نکن. ضعیف‌ترین خروجی‌های قرارداد را پیدا کن و فقط همان بخش‌های موجود را با داده، محاسبه، مقایسه و نتیجه تکمیل کن. تکرار معنایی، شرح روش بدون اجرا و افزودن بخش پس از جمع‌بندی ممنوع است. استنادها را به اعداد ثابت محدود نکن؛ هر منبع تازه معتبر را هم‌زمان به فهرست منابع اضافه کن. اگر داده کافی نیست، سناریوی شفاف بساز یا وضعیت نیازمند داده را ثبت کن. فایل `{target.relative_to(services.workspace)}` را مستقیم ویرایش کن و گزارش کوتاه تغییرات را در پاسخ بنویس."""
            services.run_codex(continuation_prompt, continuation)
            if not continuation.exists() or not continuation.read_text(encoding="utf-8").strip():
                break
    if not target.exists() or not target.read_text(encoding="utf-8").strip():
        raise RuntimeError(f"Codex did not create {target.relative_to(services.workspace)}")
    context["artifacts"]["source"] = str(target.relative_to(services.workspace))
