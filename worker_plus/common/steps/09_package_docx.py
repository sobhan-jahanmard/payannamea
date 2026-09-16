import hashlib
import json
import re
from typing import Any

TITLE = "Package DOCX"

_DIGIT_TO_ASCII = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")
_IMAGE = re.compile(r"!\[[^\]]*\]\(([^)]+)\)")


def _canonical_path(value: str) -> str:
    return value.replace("\\", "/").translate(_DIGIT_TO_ASCII).casefold()


def repair_missing_figures(context: dict[str, Any], services: Any, source: Any, missing: list[str], attempt: int) -> None:
    """Repair only unresolved figure references and keep the rest of the source intact."""
    original = source.read_text(encoding="utf-8")
    figures = services.workspace / "final" / "figures"
    available = {
        _canonical_path(str(path.relative_to(source.parent))): path.relative_to(source.parent).as_posix()
        for path in figures.glob("*.png") if path.is_file()
    }
    repaired = original
    unresolved: list[str] = []
    for relative in missing:
        replacement = available.get(_canonical_path(relative))
        if replacement:
            repaired = repaired.replace(f"]({relative})", f"]({replacement})")
        else:
            unresolved.append(relative)
    if repaired != original:
        source.write_text(repaired, encoding="utf-8")

    if unresolved:
        response = services.workspace / "reports" / "stage_checks" / f"missing_figure_repair_{attempt}.md"
        if response.exists():
            response.unlink()
        before = hashlib.sha256(source.read_bytes()).hexdigest()
        references = "\n".join(f"- `{path}`" for path in unresolved)
        prompt = f"""فایل `{source.relative_to(services.workspace)}` به تصویرهای زیر اشاره می‌کند، اما آن فایل‌ها وجود ندارند:
{references}

فقط با ابزار فایل، Markdown را مستقیماً اصلاح کن. در `final/figures/manifest.json` و پوشهٔ `final/figures/` بررسی کن که آیا تصویر هم‌معنا با نام متفاوت وجود دارد؛ در آن صورت فقط مسیر Markdown را به فایل موجود تغییر بده. اگر تصویر معادل وجود ندارد، همان تصویر Markdown و پاراگرافی که فقط به آن متکی است را حذف یا به تحلیل متنیِ صریح و بدون ادعای تصویری تبدیل کن. تصویر، داده یا منبع جعلی نساز و سایر محتوا را تغییر نده. در پایان فقط تأیید کوتاه بده."""
        services.run_codex(prompt, response)
        after = hashlib.sha256(source.read_bytes()).hexdigest()
        if after == before:
            raise RuntimeError("Missing-figure repair made no change to deliverable_source.md")

def run(context: dict[str, Any], services: Any) -> None:
    source = services.workspace / context["artifacts"]["source"]
    output = services.workspace / "final" / "deliverable.docx"
    rules = json.loads((services.workspace / context["artifacts"]["university_rules"]).read_text(encoding="utf-8"))
    for attempt in range(1, 3):
        source_text = source.read_text(encoding="utf-8")
        missing = [relative for relative in _IMAGE.findall(source_text) if not (source.parent / relative).is_file()]
        if missing:
            repair_missing_figures(context, services, source, sorted(set(missing)), attempt)
            continue
        try:
            services.write_docx(source, output, context["order"].get("title") or services.profile.DISPLAY_NAME, rules, context["order"])
            break
        except RuntimeError as exc:
            match = re.search(r"Markdown figure is missing: (.+)$", str(exc))
            if not match or attempt == 2:
                raise
            repair_missing_figures(context, services, source, [match.group(1)], attempt)
    else:
        raise RuntimeError("Markdown figures remain unresolved after repair attempt")
    context["artifacts"]["docx"] = str(output.relative_to(services.workspace))
