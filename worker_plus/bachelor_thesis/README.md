# Worker Plus: پایان‌نامه کارشناسی

این پوشه فقط تنظیمات و utilityهای اختصاصی جریان `bachelor_thesis` را نگه می‌دارد. منطق مشترک Worker Plus در `../common/` است و `../run.py` بر اساس نوع سفارش، profile این پوشه را انتخاب می‌کند.

## اجرا

ابتدا از پوشهٔ `worker_plus` فایل `.env` را از روی `.env.example` بسازید و وابستگی‌ها را نصب کنید. تنها تنظیمات محیطی لازم URL سایت و کلید Worker هستند؛ مدل در `utils/config.py` ثابت است.

```text
python -m pip install -r ../requirements.txt
```

```text
python ../run.py
python ../run.py --sample
python ../run.py --order_id 872225ec-d68b-4f6e-aeaf-04b6c1c2ed85
```

- اجرای عادی: تهیهٔ کامل پایان‌نامه و ارسال package برای بررسی مدیر.
- اجرای `--sample`: تهیهٔ نمونه، ارسال آن برای مشتری و توقف در وضعیت `sample_pending_customer_approval`.
- اجرای `--order_id`: سفارش مشخص‌شده را بدون توجه به وضعیت فعلی آن force-claim می‌کند و workspace فعال را از نو می‌سازد.

## ساختار هدف

```text
worker_plus/
├── workspace/
│   ├── in_progress/
│   └── order_<order_id>/
└── bachelor_thesis/
    ├── run.py
    ├── README.md
    ├── flowchart.html
    ├── utils/
    │   ├── config.py
    │   ├── api.py
    │   └── helpers.py
    └── steps/
        ├── 01_fetch_order.py
        ├── 02_prepare_workspace.py
        ├── 03_check_intake.py
        ├── 04_extract_university_rules.py
        ├── 05_collect_sources.py
        ├── 05a_analyze_customer_sources.py
        ├── 05b_resolve_source_rules.py
        ├── 06_build_thesis_plan.py
        ├── 07_generate_content.py
        ├── 08_review_content.py
        ├── 08b_audit_source_compliance.py
        ├── 09_package_docx.py
        ├── 09b_polish_cover.py
        ├── 10b_finalize_persian_pagination.py
        ├── 10c_verify_persian_pagination.py
        ├── 10_validate_and_publish.py
        └── 11_handle_failure.py
```

## اطلاعات ماندگار سفارش

هر سفارش در مسیر زیر اجرا می‌شود:

```text
worker_plus/workspace/in_progress/
```

اطلاعات واقعی و قابل ادامه‌دادن سفارش در این فایل ذخیره می‌شود:

```text
worker_plus/workspace/in_progress/order_context.json
```

هر step این فایل را می‌خواند، نتیجهٔ خود را ثبت می‌کند و دوباره ذخیره می‌کند. پس در صورت قطع شدن برنامه، runner می‌تواند stepهای تکمیل‌شده را تشخیص دهد.

حداقل ساختار فایل:

```json
{
  "order_id": "uuid",
  "mode": "full",
  "status": "in_progress",
  "workspace": "worker_plus/workspace/in_progress",
  "completed_steps": [],
  "current_step": null,
  "order": {},
  "artifacts": {},
  "errors": []
}
```

## مرحله‌های اجرا

1. **Fetch order** — قدیمی‌ترین سفارش آماده را claim و قفل می‌کند.
2. **Prepare workspace** — workspace، فایل‌ها و اطلاعات سفارش را آماده می‌کند.
3. **Check intake** — کامل‌بودن اطلاعات ضروری سفارش را بررسی می‌کند.
4. **Extract university rules** — قوانین و قالب دانشگاه را استخراج می‌کند.
5. **Collect sources** — منابع مشتری و تصویرهای مجاز را ثبت می‌کند.
6. **Analyze customer sources** — فایل‌ها و منابع ارسالی مشتری را تحلیل می‌کند.
7. **Resolve source rules** — محدودیت‌ها و قواعد قابل‌استفادهٔ منابع را تعیین می‌کند.
8. **Build thesis plan** — فهرست و طرح فصل‌های پایان‌نامه را می‌سازد.
9. **Plan section-level visuals** — پیش از نگارش، بر اساس حجم سفارش تراکم منطقی شکل‌ها و نمودارها را محاسبه و برای هرکدام ادعا، داده/منبع و بخش هدف را تعیین می‌کند.
10. **Generate planned visual assets** — PNGهای حرفه‌ای را پیش از متن و بر پایهٔ نقشهٔ بصری می‌سازد.
11. **Generate content** — متن کامل را در بخش هدف هر شکل، با تحلیل قبل و بعد آن، تولید می‌کند.
12. **Validate visual placement and argument** — پیوند شکل با ادعا و بخش درست را ممیزی می‌کند.
13. **Review content** — متن، citation و موارد نیازمند بررسی انسانی را کنترل می‌کند.
14. **Audit source compliance** — انطباق محتوا با منابع و محدودیت‌ها را کنترل می‌کند.
15. **Package DOCX** — `final.docx` را از متن تأییدشده می‌سازد.
16. **Polish cover** — صفحهٔ عنوان را اصلاح و کنترل می‌کند.
17. **Finalize Persian pagination** — شماره‌گذاری و صفحه‌بندی فارسی را نهایی می‌کند.
18. **Verify Persian pagination** — صفحه‌بندی فارسی را صفحه‌به‌صفحه کنترل می‌کند.
19. **Validate and publish** — خروجی را اعتبارسنجی می‌کند، شکل‌ها و صفحات PDF را با AI ممیزی می‌کند، سپس `sample.docx` و `sample.pdf` را می‌سازد و منتشر می‌کند.
20. **Handle failure** — فقط در خطا اجرا می‌شود؛ علت را ثبت و سفارش را `failed` می‌کند.

## نمایش پیشرفت در Terminal

قبل از شروع هر step، `run.py` باید header یکسان زیر را چاپ کند:

```text
────────────────────────────────────────────────────────
Worker Plus | پایان‌نامه کارشناسی
Order: 872225ec-d68b-4f6e-aeaf-04b6c1c2ed85 | Mode: full
Step 03/17: Check intake — بررسی اولیه اطلاعات سفارش
────────────────────────────────────────────────────────
```

پس از پایان مرحله نیز یکی از این نتیجه‌ها چاپ می‌شود:

```text
Result: PASS
Result: SKIPPED (already completed)
Result: FAIL — <reason>
```

در حالت Sample، شمارش terminal مطابق تعداد مرحله‌های فعال است (اکنون `01/20` تا `20/20`). مرحلهٔ انتشار فایل‌های `sample.docx` و `sample.pdf` را از `final.docx` می‌سازد و برای تأیید مشتری ارسال می‌کند.

برای اجرای دوبارهٔ sample از DOCX فعلی، بدون بازتولید محتوا یا بسته‌بندی Word، از workspace ذخیره‌شده اجرا کنید:

```text
python ../run.py --step 16
```

`--step` از شماره‌های terminal در فهرست بالا استفاده می‌کند. `--repackage` از Step 12 شروع می‌شود؛ یعنی DOCX را از source ذخیره‌شده دوباره می‌سازد و سپس Stepهای 13 تا 16 را اجرا می‌کند.

## قرارداد هر Step

هر فایل در `steps/` باید یک تابع واحد با این رفتار داشته باشد:

1. context فعلی را از `order_context.json` دریافت کند.
2. فقط مسئول همان step باشد.
3. artifactها و نتیجهٔ خود را در context ثبت کند.
4. در موفقیت، شمارهٔ خود را به `completed_steps` اضافه کند.
5. در خطا، خطای قابل‌فهم برگرداند تا `run.py` مرحلهٔ ۱۷ را اجرا کند.

`run.py` تنها مسئول انتخاب ترتیب stepها، نمایش header در terminal، ذخیرهٔ context و مدیریت خطا است.
