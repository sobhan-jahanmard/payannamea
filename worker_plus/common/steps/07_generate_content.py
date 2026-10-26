from typing import Any
import json
import re
from common.helpers import write_json
from common.deliverable_policy import deliverable_contract
from common.page_budget import planned_page_budget

TITLE = "Generate content"


def source_word_count(text: str) -> int:
    """Use the same rough source count as the Word quality gate."""
    return len(re.findall(r"[آ-یA-Za-z]{2,}", text))

def run(context: dict[str, Any], services: Any) -> None:
    order = context["order"]
    scope = "بستهٔ کامل منطبق با طرح مصوب"
    visual_plan = context.get("artifacts", {}).get("visual_plan", "planning/visual_plan.json")
    visual_plan_path = services.workspace / visual_plan
    rules_path = services.workspace / context.get("artifacts", {}).get("university_rules", "extracted/university_rules.json")
    rules = json.loads(rules_path.read_text(encoding="utf-8")) if rules_path.exists() else None
    budget = planned_page_budget(order, visual_plan_path, rules)
    if budget:
        write_json(services.workspace / "reports" / "stage_checks" / "draft_content_budget.json", budget)
    volume_rule = (
        f"کل PDF نهایی، شامل جلد، فهرست‌ها، متن، شکل‌ها، جدول‌ها و منابع، باید {budget['minimum']} تا {budget['maximum']} صفحهٔ واقعی باشد. "
        f"بودجهٔ صفحه: {budget['reserved_nonbody_pages']} صفحه برای جلد، چکیده، فهرست‌ها و منابع، "
        f"حدود {budget['reserved_visual_pages']} صفحه برای {budget['estimated_visuals']} شکل، "
        f"حدود {budget['reserved_table_pages']} صفحه برای {budget['estimated_tables']} جدول و حدود {budget['estimated_text_pages']} صفحه برای متن اصلی. "
        f"کل متن Markdown را نزدیک {budget['suggested_content_words']} واژه و در بازهٔ {budget['minimum_content_words']} تا {budget['maximum_content_words']} واژه بنویس؛ از سقف عبور نکن. "
        "سهم بخش‌ها را از طرح فصل‌ها بگیر و بیشترین فضا را به تحلیل و نتیجهٔ خروجی‌های اجباری بده. "
        "این تخمین جای شمارش صفحهٔ Word/PDF را نمی‌گیرد. "
        "فصل‌های هم‌پوشان را ادغام کن، از زیربخش‌های فراوان و جدول‌های تکراری بپرهیز، و فقط جدول‌هایی را نگه دار که واقعاً برای تصمیم و محاسبه لازم‌اند. "
        "شاهد، محاسبه، نتیجه و محدودیت هر خروجی اجباری را حفظ کن. فهرست‌ها را worker از عنوان‌ها و captionهای واقعی می‌سازد."
        if budget else
        "حجم را متناسب با نوع سفارش و خروجی‌های اجباری نگه دار؛ از فصل، جدول و زیربخش تکراری برای افزایش حجم پرهیز کن."
    )
    target = services.workspace / "final" / "deliverable_source.md"
    feedback = services.recovery_feedback or {}
    if feedback.get("failed_step") == "10_validate_and_publish" and any(
        marker in str(feedback.get("error") or "") for marker in ("page window", "page count outside order budget", "page count exceeds order budget", "Page-budget")
    ):
        # A bounded local edit loop could not fit the document. Regenerate with
        # the measured page failure in the prompt instead of reusing stale prose.
        if target.exists():
            target.unlink()
        for stale in (services.workspace / "drafts").glob("continuation_*.md"):
            stale.unlink()
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
    visual_manifest = context.get("artifacts", {}).get("visual_manifest", "final/figures/manifest.json")
    research_evidence = context["artifacts"]["research_evidence"]
    research_analysis = context["artifacts"]["research_analysis"]
    decision_contract = deliverable_contract(order)
    research_report = order.get("order_type") == "تحقیق دانشگاهی"
    structure_rule = (
        "ساختار گزارش درسی را با # برای بخش‌های اصلی و ## برای زیربخش‌های لازم بساز: چکیده، فهرست مطالب، مقدمه و پرسش پژوهش، روش، یافته‌ها و تحلیل، بحث و نتیجه‌گیری، منابع. بخش‌های محتوایی را شماره‌گذاری کن؛ از فصل‌بندی پایان‌نامه و بخش‌های غیرلازم برای حجم این سفارش پرهیز کن."
        if research_report else
        "ساختار روشن و سلسله‌مراتبی با # برای فصل‌های اصلی و ## و ### برای بخش‌های فرعی؛ عنوان‌های محتوایی را با کد چندسطحی مانند «۱»، «۱-۱» و «۱-۱-۱» شماره‌گذاری کن. چکیده، فهرست‌ها و منابع از این شماره‌گذاری مستثنا هستند. عنوان‌ها نباید خالی باشند."
    )
    contents_rule = (
        "چکیده، کلیدواژه‌ها، «# فهرست مطالب»، مقدمه و پرسش، روش، یافته‌ها و تحلیل، بحث و نتیجه‌گیری و «# منابع» را متناسب با موضوع و حجم سفارش بساز. زیر «# فهرست مطالب» فقط عنوان بخش‌ها را به شکل bullet بنویس؛ worker آن‌ها را به لینک‌های قابل‌کلیک تبدیل می‌کند. جلد جداگانه نساز و متن را مستقیم با «# چکیده» شروع کن."
        if research_report else
        "برای نمونه: چکیده، کلیدواژه‌ها، «# فهرست مطالب»، مقدمه یا بیان مسئله، بخشی مستدل از مبانی یا امکان‌سنجی، روش و محدودیت‌ها، جمع‌بندی و «# منابع» را بساز. برای نسخه کامل، همه فصل‌های لازم را با همان منطق بساز. زیر «# فهرست مطالب» فقط bulletهای عنوان‌ها را بنویس؛ worker آن‌ها را به لینک‌های قابل‌کلیک به فصل‌ها تبدیل می‌کند. جلد و صفحهٔ عنوان جداگانه نساز؛ worker جلد را از اطلاعات سفارش ایجاد می‌کند. بنابراین خروجی را با «# عنوان پژوهش»، «# عنوان پایان‌نامه» یا تکرار عنوان سفارش آغاز نکن و مستقیم با «# چکیده» شروع کن."
    )
    proxy_instruction = (
        "اگر از شاهد یا دادهٔ جانشینِ زمینه‌ای دیگر استفاده شده، تفاوت زمینه و محدودیت تعمیم را کنار همان نتیجه بنویس. مثال فرضی را صریحاً از یافتهٔ تجربی جدا کن."
        if research_report else
        "اگر دادهٔ ایران یافت نشده، صریحاً بنویس «دادهٔ ایران یافت نشد»، نام کشور جانشین و محدودیت انتقال را کنار نتیجه بیاور. عدد کشور دیگر را آمار ایران معرفی نکن."
    )
    if research_report:
        volume_rule = volume_rule.replace("فصل", "بخش")
    prompt = f"""برای {services.profile.DISPLAY_NAME} با عنوان «{order.get('title')}»، {scope} آماده کن.

خروجی باید Markdown آماده‌ی تبدیل به Word باشد، نه توضیح درباره‌ی کار. فقط متن نهایی را بده؛ هیچ مقدمه، عذرخواهی، کدبلاک، TODO یا ادعای انجام‌نداده نیاور. برای خواندن فایل‌های مرجع نام‌برده حتماً از ابزار فایل یا shell به‌صورت read-only استفاده کن؛ هیچ فایل workspace را نساز، حذف یا ویرایش نکن. متن نهایی پاسخ تو توسط worker در فایل مقصد ذخیره می‌شود.

قواعد محتوایی اجباری:
1) {structure_rule}
2) {contents_rule}
3) هر ادعای علمی، فنی، آماری یا مقرراتی باید یا با منبع واقعی و قابل‌ردیابی پشتیبانی شود یا صریحاً به‌عنوان پیشنهاد یا فرض تحلیل معرفی شود. داده، نتیجه‌ی آزمایش، مجوز یا منبع جعلی نساز.
4) استنادهای درون‌متنی را به صورت شماره‌دار [1] بنویس و همه شماره‌ها را دقیقاً در «# منابع» با مشخصات کتابشناختی کامل و URL یا DOI در صورت وجود بیاور. منبعی که در متن نیامده، وارد فهرست نکن.
5) جدول فقط برای مقایسه، داده واقعی، محاسبه یا فرض‌های شفاف باشد. هر جدول را با یک خط مستقل «جدول N. عنوان — منبع: ...» بلافاصله پیش از جدول و هر شکل را با caption شماره‌دار، منبع و ارجاع در متن ارائه کن تا فهرست جداگانه جدول‌ها و شکل‌ها ساخته شود. عنوان شکل/جدول را کوتاه و گویا بنویس (ترجیحاً حداکثر ۸۰ نویسه)؛ توضیح داده، فرض و منبع را پس از عنوان یا در متن پیرامون بیاور. اگر داده‌ی تأییدشده موجود نیست، شکل یا جدول ساختگی نساز.
6) متن فارسی روان، دانشگاهی، بدون تکرار، با پاراگراف‌های کامل و قابل دفاع بنویس؛ برای اعداد و واحدها، روش و فرض‌ها را روشن کن.
7) {volume_rule}

قواعد نتیجه‌محور اجباری:
- نوع تشخیص‌داده‌شده پروژه `{decision_contract['project_type']}` و سطح آن `{decision_contract['academic_level']}` است.
- هر بخش باید به‌ترتیب «پرسش/تصمیم، داده و منبع، اجرای روش، نتیجه و محدودیت» را نشان دهد. شرح روش، فهرست داده‌های لازم یا توصیه به انجام تحلیل در آینده، جای نتیجه را نمی‌گیرد.
- عبارت‌های راهنماگونه مانند «می‌توان بررسی کرد»، «برای برآورد باید» و «داده لازم عبارت است از» را ننویس؛ تحلیل را واقعاً انجام بده.
- اگر داده مستقیم موجود نیست، ابتدا منبع جایگزین معتبر، سپس داده جانشین و سناریوی حداقل/مبنا/حداکثر را به‌کار ببر. اگر هیچ نتیجه قابل دفاعی ممکن نیست، آن خروجی را صریحاً «نیازمند داده» اعلام کن؛ با کلی‌گویی یا جزئیات فرایندی نامرتبط حجم نساز.
- داده‌های استخراج‌شده و محاسبات انجام‌شده در `{research_evidence}` و `{research_analysis}` را مبنای هر {"بخش" if research_report else "فصل"} قرار بده. نتیجهٔ هر خروجی را در متن و جدول/محاسبهٔ مربوط اجرا کن؛ فقط الگوریتم یا روش انجام کار را توضیح نده. {proxy_instruction}
- برای انتخاب فناوری، مکان، ظرفیت یا تجهیزات، گزینه‌ها را مقایسه و یک گزینه مشخص را با دلیل انتخاب کن.
- سطح نظری را با مقطع تنظیم کن؛ در پروژه کارشناسی، مقدمه و مبانی فشرده و تمرکز بر اجرای محاسبات و طراحی باشد.

خروجی‌های اجباری این سفارش:
{chr(10).join(f"- {item['id']}: {item['output']} (روش: {item['method']}; شاهد: {item['evidence']})" for item in decision_contract['deliverables'])}

Worker بر اساس شیوه‌نامه، فونت، صفحه‌آرایی و کنترل کیفیت را اعمال می‌کند و پاسخ تو را در `{target.relative_to(services.workspace)}` ذخیره می‌کند."""
    prompt += f"""\n\nمنابع آپلودشدهٔ مشتری در `{uploaded_sources}`، قرارداد یکپارچهٔ قواعد در `{source_contract}`، قرارداد اجرایی تمام فیلدهای سفارش در `{order_contract}` و یادداشت‌های اجباری مدیر در `{admin_rules}` قرار دارند. نقشهٔ بصریِ از پیش تعیین‌شده در `{visual_plan}` و فایل/manifest شکل‌های آماده در `{visual_manifest}` است. پیش از نوشتن همه را بررسی کن. برای هر شکل، متن همان بخش هدف را حول ادعای پشتیبانی‌شده بنویس: پیش از شکل مسئله یا ادعا را مطرح کن، با syntax دقیق `![caption](figures/name.png)` شکل را در همان بخش قرار بده، و بعد از آن تحلیل کن که شکل چگونه ادعا را پشتیبانی می‌کند. شکل را صرفاً تزئینی یا در بخش نامرتبط قرار نده و فایل شکل تازه نساز. تمام بایدها و نبایدها و تک‌تک یادداشت‌های مدیر را رعایت کن و هیچ فایل یا قاعده‌ای را نادیده نگیر. تعارض حل‌نشده یا دستور ناممکن را با ادعای ساختگی پنهان نکن."""
    services.run_codex(prompt, target)
    # Extend only to the order's proportional content floor. Rendered page count
    # is checked later; a fixed 6,000-word floor overproduces short orders.
    if target.exists():
        minimum_words = budget["minimum_content_words"] if budget else 5200
        budget_line = f"سقف PDF نهایی {budget['maximum']} صفحه است؛ از آن عبور نکن." if budget else ""
        maximum_batches = min(20, max(8, (minimum_words + 2499) // 2500))
        for attempt in range(1, maximum_batches + 1):
            generated = target.read_text(encoding="utf-8")
            if source_word_count(generated) >= minimum_words:
                break
            continuation = services.workspace / "drafts" / f"continuation_{attempt}.md"
            continuation.parent.mkdir(parents=True, exist_ok=True)
            if continuation.exists():
                continuation.unlink()
            remaining = minimum_words - source_word_count(generated)
            batch_cap = min(3000, max(900, (budget["suggested_content_words"] + 5) // 6)) if budget else 2500
            batch_words = min(max(remaining + 150, 250), batch_cap) if budget else min(max(remaining + 300, 1800), batch_cap)
            continuation_prompt = f"""متن موجود `{target.relative_to(services.workspace)}`، طرح `{context['artifacts']['plan']}`، شواهد وب `{research_evidence}`، محاسبات `{research_analysis}` و قرارداد `{order_contract}` را بخوان. کمبود محتوای واقعی حدود {remaining} واژه است؛ در این نوبت حداکثر {batch_words} واژهٔ مفید اضافه کن. {budget_line}

یک فصل تازه و عمومی به انتهای سند اضافه نکن. ضعیف‌ترین خروجی‌های قرارداد را پیدا کن و فقط همان بخش‌های موجود را با داده، محاسبه، مقایسه و نتیجه تکمیل کن. تکرار معنایی، شرح روش بدون اجرا و افزودن بخش پس از جمع‌بندی ممنوع است. استنادها را به اعداد ثابت محدود نکن؛ هر منبع تازه معتبر را هم‌زمان به فهرست منابع اضافه کن. اگر داده کافی نیست، سناریوی شفاف بساز یا وضعیت نیازمند داده را ثبت کن. فایل `{target.relative_to(services.workspace)}` را مستقیم ویرایش کن و گزارش کوتاه تغییرات را در پاسخ بنویس."""
            services.run_codex(continuation_prompt, continuation)
            if not continuation.exists() or not continuation.read_text(encoding="utf-8").strip():
                break
        if source_word_count(target.read_text(encoding="utf-8")) < minimum_words:
            raise RuntimeError(f"Initial source below content budget ({source_word_count(target.read_text(encoding='utf-8'))}/{minimum_words} words)")
    # Catch a grossly oversized first draft before Word packaging and PDF export.
    # The rendered-page gate remains authoritative for tables, figures and layout.
    if budget and target.exists():
        for attempt in range(1, 4):
            generated = target.read_text(encoding="utf-8")
            actual_words = source_word_count(generated)
            if actual_words <= budget["maximum_content_words"]:
                break
            report = services.workspace / "drafts" / f"content_budget_{attempt}.md"
            report.parent.mkdir(parents=True, exist_ok=True)
            if report.exists():
                report.unlink()
            prompt = f"""متن `{target.relative_to(services.workspace)}` اکنون حدود {actual_words} واژه دارد و بودجهٔ این سفارش {budget['minimum_content_words']} تا {budget['maximum_content_words']} واژه برای کل Markdown است. پیش از صفحه‌آرایی Word، خود فایل را به حدود {budget['suggested_content_words']} واژه برسان. طرح `{context['artifacts']['plan']}`، قرارداد `{order_contract}` و شواهد `{research_evidence}` را بخوان. مطالب تکراری و بخش‌های کم‌اثر را ادغام و خلاصه کن؛ شواهد، محاسبات، نتیجه‌ها، شکل‌های لازم و استنادهای معتبر هر خروجی اجباری را حفظ کن. هیچ داده یا منبعی جعل نکن و با تغییر فونت یا قالب‌بندی حجم را پنهان نکن. پاسخ فقط گزارش کوتاه تغییرات باشد."""
            services.run_codex(prompt, report)
            if target.read_text(encoding="utf-8") == generated:
                raise RuntimeError("Content-budget compression did not change the source")
        if source_word_count(target.read_text(encoding="utf-8")) > budget["maximum_content_words"]:
            raise RuntimeError(f"Initial source exceeds content budget ({source_word_count(target.read_text(encoding='utf-8'))}/{budget['maximum_content_words']} words)")
    if not target.exists() or not target.read_text(encoding="utf-8").strip():
        raise RuntimeError(f"Codex did not create {target.relative_to(services.workspace)}")
    context["artifacts"]["source"] = str(target.relative_to(services.workspace))
