# Worker Plus: پایان‌نامه کارشناسی

این پوشه جایگزین Worker قدیمی برای جریان `bachelor_thesis` است. یک Worker دارد و با argument `--sample` فقط نمونهٔ چندصفحه‌ای تولید می‌کند.

## اجرا

ابتدا از پوشهٔ `worker_plus` فایل `.env` را از روی `.env.example` بسازید و وابستگی‌ها را نصب کنید. تنها تنظیمات محیطی لازم URL سایت و کلید Worker هستند؛ مدل در `utils/config.py` ثابت است.

```text
python -m pip install -r ../requirements.txt
```

```text
python run.py
python run.py --sample
python run.py --order_id 872225ec-d68b-4f6e-aeaf-04b6c1c2ed85
```

- اجرای عادی: تهیهٔ کامل پایان‌نامه و ارسال package برای بررسی مدیر.
- اجرای `--sample`: تهیهٔ نمونه، ارسال آن برای مشتری و توقف در وضعیت `sample_pending_customer_approval`.
- اجرای `--order_id`: سفارش مشخص‌شده را force-claim می‌کند، حتی اگر `in_progress` باشد، و workspace فعال را از نو می‌سازد.

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
        ├── 06_build_thesis_plan.py
        ├── 07_generate_content.py
        ├── 08_review_content.py
        ├── 09_package_docx.py
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
6. **Build thesis plan** — فهرست و طرح فصل‌های پایان‌نامه را می‌سازد.
7. **Generate content** — متن کامل، یا در حالت Sample متن چندصفحه‌ای نماینده، را تولید می‌کند.
8. **Review content** — متن، citation و موارد نیازمند بررسی انسانی را کنترل می‌کند.
9. **Package DOCX** — فایل DOCX کامل یا `sample.docx` را با قالب دانشگاه ایجاد می‌کند.
10. **Validate and publish** — خروجی را اعتبارسنجی و منتشر می‌کند.
11. **Handle failure** — فقط در خطا اجرا می‌شود؛ علت را ثبت و سفارش را `failed` می‌کند.

## نمایش پیشرفت در Terminal

قبل از شروع هر step، `run.py` باید header یکسان زیر را چاپ کند:

```text
────────────────────────────────────────────────────────
Worker Plus | پایان‌نامه کارشناسی
Order: 872225ec-d68b-4f6e-aeaf-04b6c1c2ed85 | Mode: full
Step 03/11: Check intake — بررسی اولیه اطلاعات سفارش
────────────────────────────────────────────────────────
```

پس از پایان مرحله نیز یکی از این نتیجه‌ها چاپ می‌شود:

```text
Result: PASS
Result: SKIPPED (already completed)
Result: FAIL — <reason>
```

در حالت Sample، header همچنان شمارش `01/11` تا `10/11` را دارد و فقط عنوان/رفتار stepهای ۷، ۹ و ۱۰ به حالت نمونه تغییر می‌کند.

## قرارداد هر Step

هر فایل در `steps/` باید یک تابع واحد با این رفتار داشته باشد:

1. context فعلی را از `order_context.json` دریافت کند.
2. فقط مسئول همان step باشد.
3. artifactها و نتیجهٔ خود را در context ثبت کند.
4. در موفقیت، شمارهٔ خود را به `completed_steps` اضافه کند.
5. در خطا، خطای قابل‌فهم برگرداند تا `run.py` مرحلهٔ ۱۱ را اجرا کند.

`run.py` تنها مسئول انتخاب ترتیب stepها، نمایش header در terminal، ذخیرهٔ context و مدیریت خطا است.
