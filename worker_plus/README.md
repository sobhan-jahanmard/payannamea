# Worker Plus

The shared workflow lives in `common/`: order claim, workspace preparation, source handling, content review, DOCX packaging, publishing, and failure handling are implemented once.

## AI review loop in admin orders

The admin order page has an AI review box. Its first action queues a comparison of the stored original inputs with the current generated deliverable. An open Worker Plus desktop polls the backend, downloads those exact file versions, extracts readable text, and returns a 0–20 score, evidence-based report, and editable repair prompt. Each review and fix remains in the order's history. The web box shows queued/running/failed status while the desktop is offline or busy.

The fix action applies only a general Worker algorithm patch in an isolated copy. It must pass the relevant tests before it is applied, then the saved order resumes at `07_generate_content` and runs through the normal validation and publishing stages. If the required workspace or a testable general patch is unavailable, the fix is marked failed rather than claiming that the output was repaired. After a completed fix, request a new review to grade the revised deliverable.

The web database needs the `ai_reviews` table. Apply the focused migration with `cd frontend && npx tsx src/server/scripts/migrate-ai-reviews.ts` before exposing the UI. The packaged desktop must include `ai_review.py` (listed in `ui/package.json`).

Each supported order type has its own folder containing only its profile and any genuinely type-specific utilities:

- `bachelor_thesis/`
- `master_thesis/`
- `thesis_proposal/`
- `university_research/`
- `presentation/`

Run the single worker with `python run.py`. After it claims or resumes an order, it selects the matching profile from that order’s `order_type`. Only the profiles listed above are supported.

File access errors pause on the failing stage without invalidating validated
upstream work. Close the locked output or resolve permissions, then resume that
stage. Content or visual quality failures still replay their responsible stages.

Before planning or writing, stage `05c_research_evidence` searches the web for each required deliverable. It records the Iranian search, opened source URLs, extracted facts, geography, an executed calculation or comparison, a result, and limitations in `research/evidence.json` and `research/analysis.md`. If comparable Iranian data is unavailable, it uses a clearly labelled foreign or adjacent-context proxy; only after both searches fail may it use an explicit design assumption. An incomplete ledger blocks drafting. The Electron app shows the evidence counts and opens both files.

To generate a local package from a real order without changing its backend status, lock, run history, or outputs, use `python run.py --offline --order-id <order-id>`. Backend access is read-only; the worker still searches external websites for research evidence.
Once the local package is complete, use **انتشار نسخهٔ محلی** in the desktop app
or `python run.py --publish-local <order-id>` to upload the existing files
without AI or regeneration. The order must still be eligible for a worker claim.

## Codex account

By default, the worker uses the normal Codex credential store for the current
Windows user. To use a separate authenticated Codex account for Worker Plus,
set this in `worker_plus/.env`:

```env
WORKER_PLUS_CODEX_HOME=C:/Users/XMART/AppData/Local/OpenAI-Profiles/account2/codex-home
```

When the portable EXE remains in its generated release directory under
`worker_plus/ui`, it reads the same `worker_plus/.env` file automatically:

```text
worker_plus/
├── .env
└── ui/
    └── release-portable-final/
        └── Daneshyar 0.1.0.exe
```

After one rebuild containing this feature, edit `worker_plus/.env` whenever the
account needs to change and double-click the EXE normally. Changing `.env` does
not require another rebuild. The packaged app forwards the values from this file
to the Python worker. If the EXE is moved elsewhere, place a copy of `.env` beside
the EXE instead.

When `WORKER_PLUS_CODEX_HOME` is set, the worker passes that directory to its
`codex exec` processes as `CODEX_HOME`. When it is absent or empty, no override
is applied and Codex uses its normal default. The directory must already contain
a valid Codex login; verify it from Git Bash with:

```bash
CODEX_HOME='C:/Users/XMART/AppData/Local/OpenAI-Profiles/account2/codex-home' codex login status
```

## Windows desktop executable

To build the Electron UI as a portable Windows executable, run the following
from `worker_plus/ui` in PowerShell:

```powershell
npm install
npm run build
```

The standard build produces portable and installer packages under `release/`.
If Windows locks the build directory or electron-builder cannot create the
symlinks required by its signing helper, build the unsigned portable executable
in a fresh directory instead:

```bash
npm run build:portable
```

The portable executable is created at
`worker_plus/ui/release-portable-final/Daneshyar 0.1.0.exe`. The portable
build command first force-closes running Worker Plus processes, builds in a new
uniquely named staging directory, and publishes the resulting EXE to the final
directory. This keeps externally locked stale `app.asar` files from blocking
later builds. Scanner-locked staging directories may be left behind and can be
removed after the lock is released. Concurrent portable builds are rejected, and
stale 7-Zip/app-builder processes from interrupted builds are stopped before a
new build starts. Do not rebuild while an order is running,
because the pre-build cleanup terminates the app and its process tree. Because this
fallback build is unsigned, Windows SmartScreen may show a warning when it is
opened.

Python and the packages in `requirements.txt` must still be installed on the
target computer; the executable bundles the worker source but not a private
Python runtime. Set `WORKER_PLUS_PYTHON` if the desired Python executable is not
available as `python`.
# ارائه و پاورپوینت

مسیر ارائه از دریافت سفارش، فایل‌ها، runner، بازیابی و گراف مشترک استفاده می‌کند. مراحل محتوایی
در `presentation/workflow.py` به ساخت مدل اسلاید، PPTX قابل ویرایش، PDF و نمونه تغییر می‌کنند.
فایل `information_source` اجباری است؛ نمونه، نیمه اول همان اسلایدهاست. برای این نوع خروجی Word
یا گزارش میانی پایان‌نامه تولید نمی‌شود. شماره مراحل برای حفظ تاریخچه مشترک ثابت است و عنوان
هر مرحله در UI متناسب با ارائه نمایش داده می‌شود.
در مرحلهٔ دفتر ادعاهای ارائه، اگر یک ادعا اعتبارسنجی نشود، Worker همان ادعا را با خطای دقیق و
locatorهای موضوع دوباره تولید می‌کند و ادعاهای سالم را نگه می‌دارد. بازیابی مشترک برای همهٔ
نوع سفارش‌ها خطای مرحله را به اجرای بعدی می‌رساند و تعداد تلاش‌ها محدود است؛ خطای تکراری یا
مانع خارجی برای بررسی انسانی متوقف می‌شود.

در قراردادهای جدید ارائه، `analytical_assurance_version=1` دفتر
`planning/presentation_analysis.json` را نیز فعال می‌کند. فناوری، مکان، موازنه جرم، مدل مالی،
آستانه‌های سرمایه‌گذاری و شش محور مهندسی صنایع بر اساس موضوعات واقعی منبع، یا با داده و محاسبه
قابل‌بازتولید ثبت می‌شوند یا با شکاف دادهٔ صریح. وزن و امتیاز ماتریس، بسته‌شدن موازنه و اجزای
جریان نقد سالانه به‌طور قطعی کنترل می‌شوند. هر مورد باید با `analysis_ids` در اسلاید پوشش یابد؛
گزارش‌های `reports/presentation_analytical_assurance.json` و
`reports/presentation_slide_validation.{csv,md}` برای بازبینی ساخته می‌شوند. سفارش‌های قدیمی
فاقد این فیلد با قرارداد قبلی خود کار می‌کنند.

دکمهٔ «اصلاح و ادامه از مرحلهٔ پیشنهادی» علاوه بر راهنمای اصلاح فایل‌های همان سفارش، تشخیص ایراد کد
مرحله را نیز فعال می‌کند. عامل ابتدا در کپی موقت کد و گزارش‌های متنی سفارش کار می‌کند.
فقط فایل Python همان مرحله یا پروفایل نوع سفارش می‌تواند تغییر کند؛ آزمون مرتبط و compile
باید بگذرند و نسخهٔ اصلی در این فاصله تغییر نکرده باشد. نتیجه در
`reports/stage_checks/auto_code_repair.json` ثبت می‌شود. اگر کد نیاز به تغییر نداشته باشد
یا اصلاح آزمون را نگذراند، کد اصلی دست‌نخورده می‌ماند و بازیابی فایل سفارش ادامه می‌یابد.

نصب Python، کتابخانه‌ها، Office، مهارت محلی، ساختار پیش‌فرض و روش ثبت سفارش از فایل نهایی:
[`PROJECT_REQUIREMENTS.md`](../PROJECT_REQUIREMENTS.md).
