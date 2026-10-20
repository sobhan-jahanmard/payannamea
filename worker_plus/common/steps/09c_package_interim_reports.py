"""Create the three standalone interim reports required by some style guides."""
from __future__ import annotations

import json
import re
from typing import Any

from common.helpers import write_json, write_text

TITLE = "Package required interim reports"

_HEADING = re.compile(r"(?m)^#\s+([0-9۰-۹٠-٩]+)\.\s+.+$")
_DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")
REPORTS = (
    ("report_1", "گزارش ۱: بررسی اولیه"),
    ("report_2", "گزارش ۲: تحلیل بازار و فنی"),
    ("report_3", "گزارش ۳: تحلیل مالی و اقتصادی"),
)


def split_chapters(markdown: str) -> tuple[str, dict[int, str], str]:
    matches = list(_HEADING.finditer(markdown))
    if not matches:
        raise RuntimeError("Cannot package interim reports: numbered research chapters are missing")
    abstract = markdown[:matches[0].start()].split("# فهرست مطالب", 1)[0]
    references_at = markdown.find("# منابع", matches[-1].end())
    references = markdown[references_at:] if references_at >= 0 else ""
    chapters: dict[int, str] = {}
    for index, match in enumerate(matches):
        number = int(match.group(1).translate(_DIGITS))
        end = matches[index + 1].start() if index + 1 < len(matches) else (references_at if references_at >= 0 else len(markdown))
        chapters[number] = markdown[match.start():end].strip()
    return abstract, chapters, references


def report_chapter_groups(chapters: dict[int, str]) -> tuple[tuple[int, ...], ...]:
    """Split at actual market and finance chapters, not fixed chapter numbers."""
    numbers = sorted(chapters)
    if len(numbers) < 3:
        raise RuntimeError("Cannot package three interim reports from fewer than three chapters")
    headings = {number: chapters[number].splitlines()[0] for number in numbers}
    market = next((number for number in numbers[1:] if any(word in headings[number] for word in ("بازار", "تقاضا"))), None)
    finance = next((number for number in numbers[1:] if any(word in headings[number] for word in ("مالی", "اقتصادی"))), None)
    if market is None or finance is None or market >= finance:
        raise RuntimeError("Cannot locate distinct market and financial chapters for interim reports")
    groups = (
        tuple(number for number in numbers if number < market),
        tuple(number for number in numbers if market <= number < finance),
        tuple(number for number in numbers if number >= finance),
    )
    if any(not group for group in groups):
        raise RuntimeError("Interim report chapter groups cannot be empty")
    return groups


def run(context: dict[str, Any], services: Any) -> None:
    workspace = services.workspace
    rules_text = (workspace / context["artifacts"]["resolved_source_rules"]).read_text(encoding="utf-8")
    if not any(marker in rules_text for marker in ("سه گزارش میانی", "گزارش ۱", "گزارش 1")):
        context["artifacts"]["interim_reports"] = []
        write_json(workspace / "reports" / "stage_checks" / "interim_reports.json", {"required": False, "files": []})
        return
    source = workspace / context["artifacts"]["source"]
    abstract, chapters, references = split_chapters(source.read_text(encoding="utf-8"))
    groups = report_chapter_groups(chapters)
    if not references.strip():
        raise RuntimeError("Cannot package interim reports without a reference list")
    rules = json.loads((workspace / context["artifacts"]["university_rules"]).read_text(encoding="utf-8"))
    files: list[dict[str, str]] = []
    for (stem, title), numbers in zip(REPORTS, groups):
        markdown = workspace / "final" / f"{stem}.md"
        docx = workspace / "final" / f"{stem}.docx"
        pdf = workspace / "final" / f"{stem}.pdf"
        body = "\n\n".join([f"# {title}", abstract.strip(), *(chapters[number] for number in numbers), references.strip()]) + "\n"
        if len(re.findall(r"[آ-ی]{2,}", body)) < 350:
            raise RuntimeError(f"{stem} has insufficient substantive content")
        write_text(markdown, body)
        services.write_docx(markdown, docx, title, rules, context["order"])
        services.export_pdf(docx, pdf, rules["font"]["persian"])
        if not all(path.is_file() and path.stat().st_size for path in (markdown, docx, pdf)):
            raise RuntimeError(f"{stem} is missing a nonempty deliverable file")
        files.append({"markdown": str(markdown.relative_to(workspace)), "docx": str(docx.relative_to(workspace)), "pdf": str(pdf.relative_to(workspace))})
    context["artifacts"]["interim_reports"] = files
    write_json(workspace / "reports" / "stage_checks" / "interim_reports.json", {"required": True, "files": files})
