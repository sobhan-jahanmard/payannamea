"""Build the source-checked analytical revision for one presentation order.

This is an order-specific reproducible authoring script, not a production
generator change. All source locators resolve against the staged thesis.
"""
from __future__ import annotations

import csv
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from presentation.deck import build_pptx, render_powerpoint, source_numbers, validate_package
from presentation.content_policy import validate_content_policy, visible_text


ORDER = ROOT / "workspace/order_2fb16202-09b1-4b61-8dfa-88250ac64471"
OUT = ORDER / "revision_2026-10-25"
SOURCES = json.loads((ORDER / "extracted/presentation_sources.json").read_text(encoding="utf-8"))
SEG = {s["id"]: s for source in SOURCES["sources"] for s in source["segments"]}
CONTRACT = json.loads((ORDER / "planning/presentation_contract.json").read_text(encoding="utf-8"))
CONTRACT["slide_count"] = 22
CONTRACT["max_body_words"] = 90
CONTRACT["max_points"] = 4


def ev(*locators: str) -> list[dict]:
    return [{"locator": locator, "quote": SEG[locator]["text"]} for locator in locators]


slides: list[dict] = []
validation: list[dict] = []


def add(section: str, layout: str, title: str, *, points=(), notes: str,
        sources=(), formula="—", confidence="مشروط", claim="", table=None,
        description=None, visual=None, chart=None, caption=None):
    slide = {"section": section, "layout": layout, "title": title,
             "points": list(points), "notes": notes, "evidence": ev(*sources),
             "claim_ids": []}
    if description:
        slide["description"] = description
    if table is not None:
        slide["table"] = table
    if visual is not None:
        slide["visual"] = visual
    if chart is not None:
        slide["chart"] = chart
    if caption is not None:
        slide["caption"] = caption
    slides.append(slide)
    pages = sorted({p for locator in sources for p in SEG[locator]["pages"]})
    validation.append({"slide": len(slides), "claim": claim or title,
                       "source": "پایان‌نامه سفارش؛ " + ", ".join(sources),
                       "pages": ", ".join(map(str, pages)) if pages else "—",
                       "formula": formula, "confidence": confidence})


pet = 5000 / (0.98 * (1 + 0.79 + 0.005))
pg = 0.79 * pet
catalyst = 0.005 * pet
loss = 0.02 * (pet + pg + catalyst)
gross_bottles = pet / 0.77
min_flake_2pct = pet / 0.98
base_flows = [-6.9] + [1.84] * 9 + [2.74]
stress_flows = [-6.765] + [0.175] * 9 + [0.94]


def npv(flows: list[float], rate: float = .15) -> float:
    return sum(amount / (1 + rate) ** year for year, amount in enumerate(flows))


def irr(flows: list[float]) -> float:
    low, high = -.99, 2.0
    for _ in range(150):
        middle = (low + high) / 2
        if npv(flows, middle) > 0:
            low = middle
        else:
            high = middle
    return (low + high) / 2


assert abs(pet + pg + catalyst - loss - 5000) < 1e-8
assert round(npv(base_flows), 2) == 2.56
assert round(npv(stress_flows), 2) == -5.70
assert 0.23 < irr(base_flows) < 0.25

add("title", "title", "طراحی مفهومی کارخانه پلی‌استر پلی‌ال از PET بازیافتی",
    points=["پروژه کارشناسی مهندسی صنایع", "محمدرضا ضیاء خدادادیان", "دانشگاه فردوسی مشهد"],
    notes="بازبینی تحلیلی بر اساس پایان‌نامه سفارش. اعداد طراحی، سناریویی و مشروط‌اند.",
    sources=["S1:block-2", "S1:block-3", "S1:block-4", "S1:block-5"], confidence="بالا")

add("problem", "statement", "پرسش طرح، امکان دفاع از ظرفیت هدف ۵۰۰۰ تن در سال است",
    points=["بازار، خوراک، فناوری، مکان، اقتصاد و اجرا باید هم‌زمان بررسی شوند.",
            "داده مستقیم تقاضای پلی‌استر پلی‌ال ایران در پایان‌نامه موجود نیست.",
            "بازار متناظر ۵۷۸۳ تن در سال، حاصل ضرایب سناریویی است."],
    notes="۵۷۸۳ = ۷۰٬۰۹۷٫۷ × ۰٫۵۵ × ۰٫۱۵ تن در سال. پایه، واردات پلی‌یورتان اولیه است و مصرف مستقیم پلی‌ال نیست.",
    sources=["S1:block-21", "S1:block-26", "S1:block-27", "S1:block-28"],
    formula="۷۰٬۰۹۷٫۷ × ۰٫۵۵ × ۰٫۱۵ = ۵۷۸۳", confidence="پایین برای تقاضای واقعی")

add("results", "table", "موازنه جرم، ۲۸۴۲ تن PET خالص را به ۵۰۰۰ تن محصول وصل می‌کند",
    points=["اتلاف فرایند ۲٪ و نسبت PG/PET برابر ۰٫۷۹، فرض طراحی‌اند."],
    table=[["جریان سالانه", "تن", "مبنای محاسبه"],
           ["PET خالص", "۲۸۴۲٫۴", "۵۰۰۰÷(۰٫۹۸×۱٫۷۹۵)"],
           ["PG", "۲۲۴۵٫۵", "۰٫۷۹×PET"],
           ["کاتالیست", "۱۴٫۲", "۰٫۰۰۵×PET"],
           ["اتلاف", "۱۰۲٫۰", "۲٪ مجموع ورودی"],
           ["محصول", "۵۰۰۰", "ورودی − اتلاف"]],
    notes="اعداد از نسبت‌های آزمایشگاهی و اتلاف فرضی پایان‌نامه بازسازی شده‌اند. گرد کردن ورودی‌ها ممکن است اختلاف کوچک نمایشی بسازد.",
    sources=["S1:block-21", "S1:block-33", "S1:block-34", "S1:block-35"],
    formula="PET=5000/[0.98(1+0.79+0.005)]؛ PG=0.79PET؛ کاتالیست=0.005PET؛ اتلاف=0.02 ورودی",
    confidence="محاسبه بازتولیدپذیر بر فرض‌های طراحی")

add("results", "table", "۳۷۰۰ تن بطری با فرض رد ۲۳٪ سازگار است؛ ۲۸۵۰ تن پرک به خلوص وابسته است",
    points=["اگر آلودگی پرک ۲٪ باشد، ۲۸۵۰ تن فقط ۲۷۹۳ تن PET می‌دهد.",
            "حداقل پرک با همین آلودگی، حدود ۲۹۰۰ تن است.",
            "باید روشن شود رد ۲۳٪ و آلودگی ۲٪ هم‌پوشانی دارند یا جداگانه‌اند."],
    table=[["مسیر خوراک", "ورودی", "PET قابل‌استفاده"],
           ["بطری؛ رد ۲۳٪", "۳۷۰۰ تن", "۲۸۴۹ تن"],
           ["پرک؛ آلودگی ۲٪", "۲۸۵۰ تن", "۲۷۹۳ تن"],
           ["نیاز موازنه", "—", "۲۸۴۲٫۴ تن"]],
    notes="۳۷۰۰×۰٫۷۷=۲۸۴۹ و ۲۸۵۰×۰٫۹۸=۲۷۹۳. کمبود پرک در سقف آلودگی برابر ۴۹٫۴ تن است. اگر ۲۳٪ رد شامل آلودگی باشد، نباید ۲٪ را دوباره کم کرد. خلوص عملی، بازده شست‌وشو و تعریف تجاری تن پرک در منبع روشن نیست.",
    sources=["S1:block-35", "S1:block-36"],
    formula="۳۷۰۰×۰٫۷۷=۲۸۴۹؛ ۲۸۵۰×۰٫۹۸=۲۷۹۳؛ ۲۸۴۲٫۴÷۰٫۹۸=۲۹۰۰٫۴",
    confidence="محاسبه قطعی؛ تفسیر آلودگی شکاف داده")

add("method", "table", "ماتریس وزن‌دار، بچ حرارتی را در غربال مقدماتی اول می‌گذارد",
    points=["وزن و امتیازها قضاوت طراحی‌اند؛ آزمون صنعتی نیستند.",
            "جمع وزن‌ها ۱۰۰٪ است؛ امتیاز کل بچ ۴٫۲۵، پیوسته ۳٫۴۵ و مایکروویو ۳٫۳۰."],
    table=[["معیار", "وزن", "بچ", "پیوسته / مایکروویو"],
           ["کیفیت", "۳۰٪", "۵", "۴ / ۴"],
           ["بلوغ", "۲۵٪", "۴", "۴ / ۲"],
           ["CAPEX", "۲۰٪", "۴", "۳ / ۳"],
           ["انعطاف", "۱۵٪", "۵", "۲ / ۴"],
           ["ایمنی", "۱۰٪", "۲", "۳٫۵ / ۴"]],
    notes="امتیازهای وزن‌دار از ضرب هر امتیاز در وزن معیار و جمع حاصل می‌شوند. شواهد فرآیندی امکان‌پذیری مسیر را نشان می‌دهند اما امتیازهای کیفیت، هزینه و ایمنی در مقیاس این کارخانه اندازه‌گیری نشده‌اند.",
    sources=["S1:block-39", "S1:block-40", "S1:block-43"],
    formula="Σ وزن×امتیاز؛ بچ ۴٫۲۵، پیوسته ۳٫۴۵، مایکروویو ۳٫۳۰",
    confidence="قضاوت مقدماتی")

add("discussion", "statement", "مزیت ۰٫۸۰ امتیازی فناوری بچ به امتیازهای قضاوتی حساس است",
    points=["فاصله بچ و پیوسته در وزن‌های فعلی ۰٫۸۰ است.",
            "اگر امتیاز هر معیار برای هر دو گزینه تا ۰٫۵ خطا داشته باشد، کران تغییر اختلاف ۱٫۰۰ است.",
            "در این آزمون حساسیت، رتبه نخست تضمین نمی‌شود؛ امتیازها باید پس از پایلوت و RFQ بازبینی شوند."],
    notes="آزمون ±۰٫۵ یک فرض تحلیل حساسیت است، نه داده منبع. اختلاف هر معیار حداکثر ۱ امتیاز تغییر می‌کند؛ جمع وزن‌ها ۱ است، پس کران اختلاف کل ۱ امتیاز است. چون ۱ بزرگ‌تر از ۰٫۸ است، رتبه در این دامنه مقاوم نیست. این کران، احتمال وقوع را نشان نمی‌دهد.",
    sources=["S1:block-40", "S1:block-43"],
    formula="Δ=۴٫۲۵−۳٫۴۵=۰٫۸۰؛ کران خطا=Σw×(۰٫۵+۰٫۵)=۱٫۰۰",
    confidence="تحلیل حساسیت شرطی")

add("results", "table", "راکتور ۱۲ مترمکعبی ظرفیت نظری ۶۲۱۰ تن دارد؛ گلوگاه واقعی هنوز معلوم نیست",
    points=["هدف ۵۰۰۰ تن معادل ۸۰٫۵٪ ظرفیت نظری راکتور است.",
            "چرخه ۱۲ساعته، دو بچ در روز و چگالی مذاب فرض‌اند.",
            "ظرفیت کندانسور، خلأ و فیلتر و توقف‌های واقعی اندازه‌گیری نشده‌اند."],
    table=[["متغیر", "مقدار", "جایگاه"],
           ["روز کار", "۳۰۰", "فرض طراحی"],
           ["چرخه", "۱۲ ساعت", "نیازمند پایلوت"],
           ["حجم راکتور", "۱۲ m³", "انتخاب مفهومی"],
           ["ظرفیت نظری", "۶۲۱۰ تن/سال", "محاسبه"],
           ["بار هدف", "۸۰٫۵٪", "۵۰۰۰÷۶۲۱۰"]],
    notes="۶۲۱۰=۱۲×۰٫۷۵×۱٫۱۵×۲×۳۰۰. محاسبه فقط محدودیت راکتور را می‌سنجد. تک‌خط بودن راکتور و کندانس/خلأ ریسک توقف مشترک ایجاد می‌کند؛ برای تعیین گلوگاه کل خط باید زمان چرخه و ظرفیت مرحله‌ها اندازه‌گیری شود.",
    sources=["S1:block-45", "S1:block-46", "S1:block-47", "S1:table-49", "S1:block-50"],
    formula="۱۲×۰٫۷۵×۱٫۱۵×۲×۳۰۰=۶۲۱۰؛ ۵۰۰۰÷۶۲۱۰=۸۰٫۵٪",
    confidence="ظرفیت نظری، نه تضمین عملیاتی")

add("results", "table", "چیدمان مفهومی مسیر خوراک تا بارگیری را کوتاه و قابل‌کنترل می‌کند",
    points=["دریافت و آماده‌سازی کنار بافر؛ راکتور کنار خوراک و یوتیلیتی؛ محصول کنار بارگیری.",
            "فاصله ایمنی، باد، خاک، اطفا و مسیر اضطراری هنوز طراحی نشده‌اند."],
    table=[["ناحیه", "مساحت m²", "جوار موردنظر"],
           ["فرایند", "۶۵۰", "خوراک و یوتیلیتی"],
           ["خوراک", "۵۰۰", "دریافت و بافر"],
           ["محصول", "۲۵۰", "بارگیری"],
           ["یوتیلیتی", "۲۵۰", "پایین‌باد اداره"],
           ["آزمایشگاه/اداره", "۲۵۰", "ورودی مستقل"]],
    notes="جمع نواحی ۱۹۰۰ مترمربع است؛ ۷۶۰ مترمربع گردش، تعمیر و ایمنی، زیربنا را به ۲۶۶۰ می‌رساند. با پوشش فرضی ۴۰٪، زمین ۶۶۵۰ مترمربع و گرد شده ۷۰۰۰ است. این، جانمایی اجرایی نیست.",
    sources=["S1:block-52", "S1:block-53", "S1:block-57"],
    formula="۶۵۰+۵۰۰+۲۵۰+۲۵۰+۲۵۰+۷۶۰=۲۶۶۰؛ ۲۶۶۰÷۰٫۴=۶۶۵۰",
    confidence="چیدمان مفهومی")

add("method", "table", "شمس‌آباد با اختلاف ۰٫۱۰، فقط گزینه نخست غربال مکان است",
    points=["امتیازهای ۱ تا ۵ و وزن‌ها قضاوت طراحی‌اند.",
            "هزینه زمین، تن‌کیلومتر واقعی، انشعاب و رده استقرار هنوز وارد مدل نشده‌اند."],
    table=[["معیار", "وزن", "شمس‌آباد", "کاسپین۲ / اراک"],
           ["خوراک", "۳۵٪", "۳", "۴ / ۵"],
           ["بازار", "۳۰٪", "۵", "۴ / ۳"],
           ["زیرساخت", "۲۰٪", "۴", "۴ / ۳"],
           ["مجوز", "۱۵٪", "۲", "۱ / ۲"],
           ["جمع وزن‌دار", "۱۰۰٪", "۳٫۶۵", "۳٫۵۵ / ۳٫۵۵"]],
    notes="جمع وزن‌دار هر گزینه از ضرب چهار امتیاز در وزن معیارها حاصل می‌شود. متن پایان‌نامه شمس‌آباد را فقط گزینه اول غربال می‌خواند.",
    sources=["S1:block-59", "S1:block-60"],
    formula="Σ وزن×امتیاز: شمس‌آباد ۳٫۶۵؛ کاسپین۲ ۳٫۵۵؛ اراک ۳٫۵۵",
    confidence="قضاوت مقدماتی")

add("discussion", "statement", "جابه‌جایی کوچک وزن‌ها رتبه مکان را تغییر می‌دهد",
    points=["انتقال ۲٫۵ واحد درصد وزن از «بازار» به «خوراک»، شمس‌آباد و اراک را هم‌امتیاز می‌کند.",
            "انتقال ۵ واحد درصد، شمس‌آباد و کاسپین۲ را هم‌امتیاز می‌کند.",
            "آزمون حساسیت نشان می‌دهد انتخاب نهایی به داده واقعی مکان وابسته است."],
    notes="اختلاف شمس‌آباد با اراک ۰٫۱۰ است. در انتقال δ از بازار به خوراک، اختلاف با اراک ۰٫۱۰−۴δ و با کاسپین۲ برابر ۰٫۱۰−۲δ می‌شود؛ نقاط تساوی δ=۰٫۰۲۵ و ۰٫۰۵ هستند. این تغییر وزن، سناریوی آزمون است، نه وزن مصوب جدید.",
    sources=["S1:block-59", "S1:block-60"],
    formula="Δشمس−اراک=۰٫۱۰−۴δ؛ δ*=۰٫۰۲۵. Δشمس−کاسپین=۰٫۱۰−۲δ؛ δ*=۰٫۰۵",
    confidence="حساسیت محاسباتی بر امتیازهای فرضی")

add("results", "statement", "برآورد ۳۳ نفر از کارسنجی فرضی ۶۰۰ بچ به دست می‌آید",
    points=["۶۰۰ بچ سالانه × ۵۶ نفرساعت هر بچ = ۳۳٬۶۰۰ نفرساعت.",
            "با ۱۷۶۸ ساعت مؤثر، نیاز مستقیم ۱۹ نفر برآورد می‌شود.",
            "۱۴ نفر پشتیبان، کل سازمان را به ۳۳ نفر می‌رساند؛ شیفت‌بندی و شرح شغل هنوز باید آزموده شوند."],
    notes="۵۶ نفرساعت شامل ۳۶ تولید، ۱۲ آماده‌سازی و ۸ کنترل کیفیت است. این داده کارسنجی واقعی نیست و بعد از پایلوت باید به‌روزرسانی شود.",
    sources=["S1:block-72"],
    formula="۶۰۰×(۳۶+۱۲+۸)=۳۳۶۰۰؛ ۳۳۶۰۰÷۱۷۶۸=۱۹٫۰؛ ۱۹+۱۴=۳۳",
    confidence="سناریوی کارسنجی")

add("results", "timeline", "برنامه ۱۷ماهه به رفع تعارض زمان خرید و دروازه FID نیاز دارد",
    points=["پایه برنامه ۱۵ ماه است و دو ماه ذخیره دارد.",
            "بازه خرید و سایت از ماه ۵ شروع می‌شود، اما توقف خرید تا Gate ۳ و FID تا ماه ۷ ذکر شده است.",
            "تعهد خرید، مجوز، HAZOP و آزمون ۷۲ساعته باید در برنامه تفصیلی هم‌راستا شوند."],
    visual={"items": [
        {"label":"پایلوت", "when":"ماه ۰–۲", "detail":"تثبیت فرض‌های فرایند", "locator":"S1:block-73"},
        {"label":"FEED و مکان", "when":"ماه ۲–۴", "detail":"غربال و طرح پایه", "locator":"S1:block-73"},
        {"label":"مجوز و FID", "when":"تا ماه ۷", "detail":"دروازه تعهد سرمایه", "locator":"S1:block-73"},
        {"label":"خرید و سایت", "when":"ماه ۵–۱۲", "detail":"تعارض زمان شروع خرید", "locator":"S1:block-73"},
        {"label":"نصب و آزمون", "when":"ماه ۱۱–۱۵", "detail":"راه‌اندازی و آزمون ۷۲ساعته", "locator":"S1:block-73"}]},
    notes="منبع شبکه فعالیت‌ها، مدت معتبر و شناوری ندارد؛ مسیر بحرانی قابل تأیید نیست. ریسک‌ها با دو تأمین‌کننده، QC هر بچ، HAZOP، توقف خرید و تعدیل ارز کنترل پیشنهادی دارند. زمان تعهد خرید باید با Gate ۳ سازگار شود.",
    sources=["S1:block-73", "S1:block-74", "S1:block-75"],
    formula="۱۵ ماه پایه + ۲ ماه ذخیره = ۱۷ ماه؛ تعارض ماه ۵ خرید با FID تا ماه ۷",
    confidence="برنامه مفهومی؛ تعارض باز")

add("results", "table", "ورودی‌های مالی، سناریوی اولیه‌اند و قیمت قراردادی ندارند",
    points=["CAPEX شش میلیون دلار، OPEX سالانه ۶٫۸۵ میلیون دلار و سرمایه در گردش ۰٫۹۰ میلیون دلار فرض شده‌اند.",
            "نرخ تنزیل ۱۵٪، مالیات ۲۰٪ و عمر بهره‌برداری ده سال در مدل اولیه آمده‌اند."],
    table=[["پارامتر", "مبنا", "وضعیت"],
           ["CAPEX", "۶٫۰۰ میلیون دلار", "برآورد، بدون پیشنهاد"],
           ["OPEX متغیر", "۶٫۲۵ میلیون دلار", "۱٫۲۵ دلار/کیلوگرم"],
           ["OPEX ثابت", "۰٫۶۰ میلیون دلار", "فرض مدل"],
           ["سرمایه در گردش", "۰٫۹۰ میلیون دلار", "۱۰٪ فروش"],
           ["ساخت", "۱۷ ماه", "در DCF لحاظ نشده"]],
    notes="درآمد ۹٫۰۰ میلیون دلار =۵۰۰۰ تن×۱٫۸۰ دلار/کیلوگرم. CAPEX اجزای تجهیزات، یوتیلیتی، ساختمان، مهندسی و راه‌اندازی دارد. OPEX متغیر ۶٫۲۵ و ثابت ۰٫۶۰ است. برنامه ساخت ۱۷ ماهه با زمان‌بندی پرداخت CAPEX و بهره‌برداری در DCF آشتی نشده است.",
    sources=["S1:block-65", "S1:block-69", "S1:block-73"],
    formula="درآمد=۵۰۰۰×۱۰۰۰×۱٫۸۰÷۱۰^۶=۹؛ OPEX=۶٫۲۵+۰٫۶۰=۶٫۸۵؛ WC=۱۰٪×۹=۰٫۹",
    confidence="فرض مالی اولیه")

add("discussion", "chart", "جریان نقد اولیه بازتولید می‌شود؛ زمان ساخت در آن غایب است",
    points=["سال صفر: ۶٫۹۰− میلیون دلار؛ سال‌های عملیاتی ۱ تا ۹: هر سال ۱٫۸۴+؛ سال ۱۰: ۲٫۷۴+.",
            "NPV بازسازی‌شده ۲٫۵۶ میلیون دلار و IRR حدود ۲۳٫۹٪ است، فقط برای همین زمان‌بندی فرضی.",
            "آغاز بهره‌برداری پس از ساخت ۱۷ماهه و توزیع واقعی CAPEX مشخص نیست."],
    chart={"type":"column", "categories":["مبنا", "بدبینانه"], "unit":"میلیون دلار",
           "series":[{"name":"NPV مدل اولیه", "values":[2.56, -5.70]}]},
    caption="NPV ده‌ساله مدل اولیه؛ دوره ساخت در زمان‌بندی جریان‌ها منظور نشده است",
    notes="جریان عملیاتی مبنا ۱٫۸۴ از سود خالص ۱٫۲۴ به اضافه استهلاک ۰٫۶۰ است. سال ۱۰، بازیافت ۰٫۹۰ سرمایه در گردش به آن اضافه می‌شود. NPV در نرخ ۱۵٪ برابر ۲٫۵۵۷ و IRR برابر ۲۳٫۹۰۶٪ است. بدبینانه NPV برابر ۵٫۶۹۸− است. این اعداد خروجی مدل اولیه و تأییدنشده‌اند؛ برای DCF تقویمی باید زمان و پرداخت ساخت، ramp-up، هزینه مالی، مالیات و بازیافت دارایی مشخص شوند.",
    sources=["S1:table-68", "S1:block-69", "S1:block-70", "S1:block-73"],
    formula="NPV=Σ CF_t/(۱٫۱۵)^t؛ CF_0=−۶٫۹؛ CF_1..9=۱٫۸۴؛ CF_10=۲٫۷۴؛ IRR ریشه NPV=۰",
    confidence="بازتولید حسابی؛ مدل سرمایه‌گذاری تأییدنشده")

add("discussion", "table", "آستانه‌های سرمایه‌گذاری معیار پیشنهادی‌اند و باید با قرارداد آزموده شوند",
    points=["۳۰۰۰ تن پرک با ۲٪ آلودگی، ۲۹۴۰ تن PET می‌دهد؛ بیش از نیاز ۲۸۴۲ تن است.",
            "پیش‌فروش ۳۵۰۰ تن، ۷۰٪ ظرفیت هدف است، اما مبنای احتمال فروش ندارد.",
            "حاشیه ۰٫۴۰ و سقف CAPEX شش میلیون دلار به‌تنهایی NPV مثبت را تضمین نمی‌کنند."],
    table=[["معیار پیشنهادی", "مبنای عدد", "نیاز به تأیید"],
           ["۳۰۰۰ تن پرک", "۲۹۴۰ تن PET در ۲٪ آلودگی", "خلوص و قرارداد"],
           ["۳۵۰۰ تن پیش‌فروش", "۷۰٪ هدف ۵۰۰۰تنی", "سفارش الزام‌آور"],
           ["حاشیه ۰٫۴۰", "کمتر از مبنای ۰٫۵۵", "قیمت و OPEX"],
           ["سقف CAPEX: ۶ میلیون", "فرض مدل اولیه", "RFQ و ذخیره"]],
    notes="۳۰۰۰×۰٫۹۸=۲۹۴۰ و ۳۵۰۰÷۵۰۰۰=۷۰٪. حاشیه مبنا ۱٫۸۰−۱٫۲۵=۰٫۵۵ دلار/کیلوگرم و بدبینانه ۱٫۵۳−۱٫۳۷۵=۰٫۱۵۵ است. آستانه ۰٫۴۰ از بهینه‌سازی یا DCF دارای ساخت به دست نیامده است. بنابراین این اعداد فقط معیارهای پیشنهادی مذاکره‌اند و تصمیم FID نیازمند مدل مالی کامل و مدارک قرارداد است.",
    sources=["S1:block-36", "S1:block-65", "S1:block-69", "S1:block-70", "S1:block-74", "S1:block-80"],
    formula="۳۰۰۰×۰٫۹۸=۲۹۴۰؛ ۳۵۰۰÷۵۰۰۰=۷۰٪؛ CM مبنا=۱٫۸۰−۱٫۲۵=۰٫۵۵",
    confidence="معیار پیشنهادی، نه شرط اثبات‌شده")

add("conclusion", "statement", "تصمیم سرمایه‌گذاری به رفع شکاف‌های خوراک، عملکرد، بازار و مالی وابسته است",
    points=["انتخاب فناوری و مکان، غربال مقدماتی با امتیازهای قضاوتی است.",
            "موازنه خوراک باید تعریف خلوص و نرخ رد را یکسان کند؛ گلوگاه با پایلوت سنجیده شود.",
            "مدل مالی باید دوره ساخت و جریان نقد تقویمی را وارد کند.",
            "تا آن زمان، NPV و IRR فقط خروجی مدل اولیه و تأییدنشده‌اند."],
    notes="اولویت داده‌های بعدی: آزمون محموله و خلوص پرک، پایلوت چرخه و کیفیت، RFQ تجهیزات و سایت، قرارداد فروش، شبکه زمان‌بندی و DCF تقویمی. آستانه‌های تصمیم پیشنهادی‌اند.",
    sources=["S1:block-35", "S1:block-50", "S1:block-60", "S1:block-69", "S1:block-73", "S1:block-80"],
    confidence="جمع‌بندی مشروط")

# Calculation appendices: the 16 preceding slides form the main deck.
add("results", "table", "پیوست ۱ | کنترل موازنه خوراک و محصول",
    points=["اگر ۲٪ آلودگی علاوه بر رد ۲۳٪ باشد، مسیر ۳۷۰۰ تنی نیز کفایت نمی‌کند.",
            "تعریف مشترک بازده خرید تا PET خالص باید در آزمون محموله ثبت شود."],
    table=[["فرمول", "نتیجه", "وضعیت"],
           ["PET خالص", "۲۸۴۲٫۴ تن", "نیاز موازنه"],
           ["PET÷۰٫۷۷", "۳۶۹۱٫۴ تن", "بطری با رد ۲۳٪"],
           ["PET÷۰٫۹۸", "۲۹۰۰٫۴ تن", "پرک با آلودگی ۲٪"],
           ["۳۷۰۰×۰٫۷۷×۰٫۹۸", "۲۷۹۲٫۰ تن", "فقط اگر دو کسر مستقل"],
           ["۲۸۵۰×۰٫۹۸", "۲۷۹۳٫۰ تن", "کمبود ۴۹٫۴ تن"]],
    notes="رد ۲۳٪ و آلودگی ۲٪ ممکن است دو بیان یک پدیده باشند؛ سناریوی مستقل فقط برای نشان دادن ریسک دوباره‌کسرکردن یا کمبود است. فرمول‌های این پیوست از داده‌های صفحات ۸ و ۶ منبع مشتق شده‌اند.",
    sources=["S1:block-21", "S1:block-33", "S1:block-34", "S1:block-35", "S1:block-36"],
    formula="PET=۵۰۰۰÷[۰٫۹۸×۱٫۷۹۵]؛ خرید=PET÷بازده", confidence="محاسبه شرطی")

add("results", "table", "پیوست ۲ | جمع امتیازهای ماتریس فناوری",
    points=["ستون‌های معیار و وزن در اسلاید ۵ آمده‌اند؛ این جدول حاصل ضرب‌های همان داده‌هاست."],
    table=[["گزینه", "کیفیت+بلوغ", "CAPEX+انعطاف", "ایمنی / کل"],
           ["بچ", "۱٫۵۰+۱٫۰۰", "۰٫۸۰+۰٫۷۵", "۰٫۲۰ / ۴٫۲۵"],
           ["پیوسته", "۱٫۲۰+۱٫۰۰", "۰٫۶۰+۰٫۳۰", "۰٫۳۵ / ۳٫۴۵"],
           ["مایکروویو", "۱٫۲۰+۰٫۵۰", "۰٫۶۰+۰٫۶۰", "۰٫۴۰ / ۳٫۳۰"]],
    notes="تمام امتیازها و وزن‌ها در صفحه ۹ منبع ثبت شده‌اند. محاسبه، رتبه قضاوتی را بازتولید می‌کند و اعتبار تجربی معیارها را ثابت نمی‌کند.",
    sources=["S1:block-40"], formula="امتیاز کل=Σw_i s_i", confidence="بازتولید حسابی ماتریس فرضی")

add("results", "table", "پیوست ۳ | جمع امتیازهای ماتریس مکان",
    points=["حساسیت وزن بازار و خوراک در اسلاید ۱۰ بررسی شده است."],
    table=[["گزینه", "خوراک+بازار", "زیرساخت+مجوز", "کل"],
           ["شمس‌آباد", "۱٫۰۵+۱٫۵۰", "۰٫۸۰+۰٫۳۰", "۳٫۶۵"],
           ["کاسپین۲", "۱٫۴۰+۱٫۲۰", "۰٫۸۰+۰٫۱۵", "۳٫۵۵"],
           ["اراک", "۱٫۷۵+۰٫۹۰", "۰٫۶۰+۰٫۳۰", "۳٫۵۵"]],
    notes="این جدول صرفاً حاصل ضرب وزن و امتیازهای صفحه ۱۳ پایان‌نامه است. خرید زمین یا صدور مجوز از آن نتیجه نمی‌شود.",
    sources=["S1:block-59", "S1:block-60"], formula="امتیاز کل=Σw_i s_i",
    confidence="بازتولید حسابی ماتریس فرضی")

add("results", "table", "پیوست ۴ | جریان نقد سال صفر تا چهار در مدل اولیه",
    points=["میلیون دلار؛ سال‌های ۱ تا ۵ سال عملیاتی‌اند، نه سال تقویمی پس از شروع ساخت."],
    table=[["سال", "CAPEX/WC", "عملیاتی", "خالص مبنا"],
           ["۰", "۶٫۹۰−", "۰", "۶٫۹۰−"],
           ["۱", "۰", "۱٫۸۴", "۱٫۸۴"],
           ["۲", "۰", "۱٫۸۴", "۱٫۸۴"],
           ["۳", "۰", "۱٫۸۴", "۱٫۸۴"],
           ["۴", "۰", "۱٫۸۴", "۱٫۸۴"]],
    notes="سال ۵ نیز ۱٫۸۴ است و در پیوست بعدی می‌آید. تقسیم CAPEX در ۱۷ ماه ساخت منبع ندارد؛ جدول همین مدل اولیه را بازسازی می‌کند.",
    sources=["S1:table-68", "S1:block-69", "S1:block-73"],
    formula="CF_0=−۶−۰٫۹؛ CF_1..9=۱٫۲۴+۰٫۶۰", confidence="جدول حسابی اولیه")

add("results", "table", "پیوست ۵ | جریان نقد سال پنج تا ده در مدل اولیه",
    points=["در سال ۱۰، سرمایه در گردش ۰٫۹۰ میلیون دلار فرضاً بازیافت می‌شود."],
    table=[["سال", "عملیاتی", "بازیافت WC", "خالص مبنا"],
           ["۵", "۱٫۸۴", "۰", "۱٫۸۴"],
           ["۶–۸", "هر سال ۱٫۸۴", "۰", "هر سال ۱٫۸۴"],
           ["۹", "۱٫۸۴", "۰", "۱٫۸۴"],
           ["۱۰", "۱٫۸۴", "۰٫۹۰", "۲٫۷۴"]],
    notes="سال‌های ۶، ۷ و ۸ هرکدام جریان یکسان دارند؛ فرمول و فایل cash_flows.csv همه سال‌ها را جداگانه ثبت می‌کنند. برای سناریوی بدبینانه CF_0=۶٫۷۶۵−، CF_1..9=۰٫۱۷۵ و CF_10=۰٫۹۴ است. زمان ساخت در این جدول نیست.",
    sources=["S1:table-68", "S1:block-69"],
    formula="NPV=Σ CF_t/۱٫۱۵^t؛ NPV مبنا=۲٫۵۵۷ و بدبینانه=−۵٫۶۹۸",
    confidence="جدول حسابی اولیه؛ تصمیم مالی تأییدنشده")

add("references", "statement", "منابع",
    points=["[۶] هیئت وزیران جمهوری اسلامی ایران، «ضوابط و معیارهای استقرار واحدها و فعالیت‌های صنعتی و تولیدی»، مصوب ۱۳۹۰ با اصلاحات بعدی.",
            "[۱۳] صندوق نوآوری و شکوفایی، «تکمیل زیرساخت‌های تولید دانش‌بنیان؛ بسته توانا»، فراخوان ۱۴۰۴."],
    notes="فهرست کامل منابع در صفحات ۲۰ تا ۲۳ پایان‌نامه موجود است. این اسلاید فقط منابع مرتبط با زنجیره محاسبات اصلی را نشان می‌دهد؛ ارجاع مستقیم هر ادعا در جدول اعتبارسنجی آمده است.",
    sources=["S1:block-87", "S1:block-94"],
    confidence="نقل کتابشناختی از منبع")

assert len(slides) == 22
OUT.mkdir(parents=True, exist_ok=True)
spec = {"slides": slides}
validate_content_policy(spec, SOURCES)
(OUT / "presentation.json").write_text(json.dumps(spec, ensure_ascii=False, indent=2), encoding="utf-8")
(OUT / "contract.json").write_text(json.dumps(CONTRACT, ensure_ascii=False, indent=2), encoding="utf-8")

with (OUT / "cash_flows.csv").open("w", encoding="utf-8-sig", newline="") as stream:
    writer = csv.writer(stream)
    writer.writerow(["year_relative_to_operations", "base_million_usd", "downside_million_usd", "construction_included"])
    for year, (base, downside) in enumerate(zip(base_flows, stress_flows)):
        writer.writerow([year, base, downside, "no"])

with (OUT / "calendar_model_template.csv").open("w", encoding="utf-8-sig", newline="") as stream:
    writer = csv.writer(stream)
    writer.writerow(["calendar_year_from_project_start", "months", "capex_million_usd",
                     "revenue_million_usd", "opex_million_usd", "working_capital_delta_million_usd",
                     "tax_million_usd", "net_cash_flow_million_usd", "discount_rate",
                     "status"])
    for year in range(12):
        period = f"{year*12}-{(year+1)*12}"
        status = ("construction; CAPEX payment schedule missing" if year == 0 else
                  "construction/possible commissioning; start month and cash allocation missing" if year == 1 else
                  "operation horizon depends on actual start month; annual cash flow missing")
        writer.writerow([year, period, "", "", "", "", "", "", .15, status])

with (OUT / "slide_validation.csv").open("w", encoding="utf-8-sig", newline="") as stream:
    writer = csv.DictWriter(stream, fieldnames=list(validation[0]))
    writer.writeheader()
    writer.writerows(validation)

with (OUT / "slide_validation.md").open("w", encoding="utf-8") as stream:
    stream.write("# جدول اعتبارسنجی اسلایدها\n\n")
    stream.write("منبع همه ردیف‌ها: پایان‌نامه اصلی سفارش. صفحه‌ها شماره صفحه واقعی نسخه صفحه‌بندی‌شده‌اند. «محاسبه» به معنای تأیید فرض‌ها نیست.\n\n")
    stream.write("| اسلاید | ادعا | منبع و محل | صفحه | فرمول | سطح اطمینان |\n|---:|---|---|---|---|---|\n")
    for row in validation:
        values = [row["slide"], row["claim"], row["source"], row["pages"], row["formula"], row["confidence"]]
        stream.write("| " + " | ".join(str(value).replace("|", "/") for value in values) + " |\n")

calcs = {
    "source": "S1:block-21, S1:block-33..36, S1:block-40, S1:block-59..60, S1:block-65, S1:block-69, S1:block-73",
    "mass_tonnes_per_year": {"pet_pure": pet, "propylene_glycol": pg, "catalyst": catalyst,
                              "process_loss": loss, "product": 5000,
                              "gross_bottles_at_23pct_reject": gross_bottles,
                              "minimum_flake_at_2pct_impurity": min_flake_2pct,
                              "usable_pet_from_2850_flake_at_2pct_impurity": 2850*.98,
                              "usable_pet_from_3700_bottles_at_23pct_reject": 3700*.77},
    "technology_scores": {"batch": 4.25, "continuous": 3.45, "microwave": 3.30,
                          "half_point_each_option_sensitivity_bound": 1.0},
    "site_scores": {"shamsabad": 3.65, "caspian2": 3.55, "arak": 3.55,
                    "market_to_feed_weight_shift_tie_arak": .025,
                    "market_to_feed_weight_shift_tie_caspian2": .05},
    "financial_model_initial_unverified": {"discount_rate": .15, "construction_months_in_thesis": 17,
                                           "construction_in_dcf": False,
                                           "base_npv_million_usd": npv(base_flows),
                                           "base_irr": irr(base_flows),
                                           "downside_npv_million_usd": npv(stress_flows)}
}
(OUT / "calculations.json").write_text(json.dumps(calcs, ensure_ascii=False, indent=2), encoding="utf-8")

# One-off numeric gate: every numeral in visible copy and notes must either
# occur in cited thesis text, occur in the formula ledger, or be explicitly
# inventoried below as a derived value, a declared stress assumption, or a
# page/year label. This does not alter the worker's reusable validator.
derived_numbers = {
    3: {1.795, 102.0, 2245.5, 2842.4},
    4: {49.4, 2900.0},
    5: {10.0, 15.0, 20.0, 100.0},
    8: {1900.0},
    9: {100.0},
    10: {2.5},
    11: {56.0},
    14: {-5.698, 2.557, 23.9, 23.906},
    15: {-1.375, 0.155, 1.53, 2842.0},
    17: {6.0, 8.0, 49.4, 2792.0, 2793.0, 2842.4, 2900.4, 3691.4},
    18: {0.35, 0.4, 0.5, 0.6, 0.75, 0.8, 1.0, 1.2, 1.5, 9.0},
    19: {0.6, 0.8, 0.9, 1.05, 1.2, 1.4, 1.5, 1.75, 13.0},
    20: {-1.0, 3.0},
    21: {0.0, 0.94, 2.74, 5.0, 6.0, 8.0},
    22: {20.0, 23.0},
}
number_audit = []
for number, slide in enumerate(slides, 1):
    quoted = " ".join(item["quote"] for item in slide["evidence"])
    displayed = " ".join([*visible_text(slide), slide["notes"]])
    source_backed = source_numbers(quoted)
    formula_backed = source_numbers(validation[number - 1]["formula"])
    extra = source_numbers(displayed) - source_backed - formula_backed
    unexplained = extra - derived_numbers.get(number, set())
    if unexplained:
        raise ValueError(f"Slide {number}: numeric audit has unclassified values: {sorted(unexplained)}")
    number_audit.append({"slide": number, "source_numbers": sorted(source_backed),
                         "formula_numbers": sorted(formula_backed),
                         "additional_classified_numbers": sorted(extra),
                         "unclassified": []})
(OUT / "numeric_audit.json").write_text(json.dumps(number_audit, ensure_ascii=False, indent=2), encoding="utf-8")

build_pptx(spec, CONTRACT, SOURCES, OUT / "revised.pptx", ORDER)
package = validate_package(OUT / "revised.pptx", 22)
(OUT / "package_validation.json").write_text(json.dumps(package, ensure_ascii=False, indent=2), encoding="utf-8")
render_powerpoint(OUT / "revised.pptx", OUT / "revised.pdf", OUT / "rendered_slides")
sample_contract = {**CONTRACT, "slide_count": 11}
build_pptx({"slides": slides[:11]}, sample_contract, SOURCES, OUT / "sample.pptx", ORDER)
validate_package(OUT / "sample.pptx", 11)
render_powerpoint(OUT / "sample.pptx", OUT / "sample.pdf", OUT / "rendered_sample")
print(json.dumps({"slides": len(slides), "npv": npv(base_flows), "irr": irr(base_flows),
                  "pptx": str(OUT / "revised.pptx"), "pdf": str(OUT / "revised.pdf")}, ensure_ascii=False))
