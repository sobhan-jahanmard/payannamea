from __future__ import annotations

from pathlib import Path
from typing import Any

from pypdf import PdfReader

from common.helpers import write_text

TITLE = "Analyze customer source rules"

def extract_text(path: Path) -> str:
    if path.suffix.lower() == ".pdf":
        return "\n".join(page.extract_text() or "" for page in PdfReader(path).pages).strip()
    if path.suffix.lower() in {".md", ".txt"}:
        return path.read_text(encoding="utf-8", errors="replace").strip()
    raise RuntimeError(f"Unsupported source format for local rule extraction: {path.name}")


def run(context: dict[str, Any], services: Any) -> None:
    source_dir = services.workspace / context.get("artifacts", {}).get("customer_sources", "extracted/customer_sources")
    target = services.workspace / "extracted" / "source_contract.md"
    sources = sorted(path for path in source_dir.iterdir() if path.is_file())
    if not sources:
        raise RuntimeError("No customer source files are available for rule extraction")

    sections = [
        "# قرارداد قواعد منابع مشتری",
        "",
        "این قرارداد به‌صورت محلی از متن قابل‌استخراج فایل‌های مشتری ساخته شده است. "
        "هیچ قاعده‌ای به آن افزوده یا از آن استنباط نشده؛ هر دستور مبهم باید در بررسی انسانی مشخص شود.",
    ]
    for source in sources:
        text = extract_text(source)
        if not text:
            raise RuntimeError(f"Customer source is unreadable or contains no extractable text: {source.name}")
        sections.extend(["", f"## فایل: {source.name}", "", "### متن مرجع استخراج‌شده", "", text])

    write_text(target, "\n".join(sections).rstrip() + "\n")
    context["artifacts"]["source_contract"] = str(target.relative_to(services.workspace))
