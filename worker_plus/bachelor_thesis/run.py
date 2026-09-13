#!/usr/bin/env python3
from __future__ import annotations

import argparse
import importlib
import json
import os
import re
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from order_context import load, new_context, save
from utils.config import Config, load_config
from utils.helpers import write_text
from utils.api import claim_oldest, heartbeat, record_run
from utils.helpers import write_json

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


STEPS = [
    "01_fetch_order", "02_prepare_workspace", "03_check_intake",
    "04_extract_university_rules", "05_collect_sources", "05a_analyze_customer_sources", "05b_resolve_source_rules", "06_build_thesis_plan",
    "07_generate_content", "08_review_content", "08b_audit_source_compliance", "09_package_docx", "09b_polish_cover", "10b_finalize_persian_pagination", "10c_verify_persian_pagination", "10_validate_and_publish",
]
FAILURE_STEP = "11_handle_failure"
TOTAL_STEPS = len(STEPS) + 1


@dataclass
class Services:
    config: Config
    args: argparse.Namespace
    workspace: Path
    token_usage: dict[str, int] = None  # type: ignore[assignment]

    def __post_init__(self) -> None:
        self.token_usage = {"inputTokens": 0, "cachedInputTokens": 0, "outputTokens": 0, "reasoningTokens": 0, "totalTokens": 0}
        self._automation_word_pids_at_start = self.automation_word_pids()

    @staticmethod
    def automation_word_pids() -> set[int]:
        """Return only headless Word COM servers, never interactive Word."""
        if os.name != "nt":
            return set()
        command = (
            "Get-CimInstance Win32_Process -Filter \"Name='WINWORD.EXE'\" | "
            "Where-Object { $_.CommandLine -match '/Automation\\s+-Embedding' } | "
            "ForEach-Object { $_.ProcessId }"
        )
        result = subprocess.run(
            ["powershell.exe", "-NoProfile", "-Command", command],
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, encoding="utf-8", errors="replace", timeout=15, check=False,
        )
        return {int(value) for value in re.findall(r"^\s*(\d+)\s*$", result.stdout, re.M)}

    def cleanup_run(self) -> dict[str, Any]:
        """Release worker DOCX locks and remove only COM servers started by this run."""
        report: dict[str, Any] = {"released_docx_targets": [], "terminated_automation_word_pids": [], "errors": []}
        if os.name != "nt":
            return report
        for path in sorted(self.workspace.rglob("*.docx")):
            try:
                self.release_docx_lock(path)
                report["released_docx_targets"].append(str(path.relative_to(self.workspace)))
            except Exception as exc:
                report["errors"].append(f"{path.name}: {exc}")
        # Word COM processes frequently become children of Explorer, not Python.
        # Capture the baseline at startup and terminate only new, hidden
        # `/Automation -Embedding` servers created by this worker run.
        for pid in sorted(self.automation_word_pids() - self._automation_word_pids_at_start):
            result = subprocess.run(
                ["taskkill", "/PID", str(pid), "/T", "/F"],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False,
            )
            if result.returncode == 0:
                report["terminated_automation_word_pids"].append(pid)
        write_json(self.workspace / "reports" / "stage_checks" / "run_cleanup.json", report)
        return report

    def run_codex(self, prompt: str, target: Path) -> None:
        if target.exists() and target.read_text(encoding="utf-8").strip():
            return
        if self.args.dry_run:
            write_text(target, "# خروجی آزمایشی\n\nاین خروجی فقط برای dry-run ساخته شده است.\n")
            return
        command = [
            self.config.codex_bin, "exec", "--model", self.config.codex_model,
            "--json",
            "--output-last-message", str(target),
            "--skip-git-repo-check", "--ignore-user-config",
            "--dangerously-bypass-approvals-and-sandbox",
            "-C", str(self.workspace), "-",
        ]
        if os.name == "nt":
            command = ["cmd.exe", "/d", "/s", "/c", subprocess.list2cmdline(command)]
        result = subprocess.run(command, cwd=str(self.workspace), input=prompt, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace", check=False)
        print(result.stdout, end="", flush=True)
        for line in result.stdout.splitlines():
            try: event = json.loads(line)
            except json.JSONDecodeError: continue
            usage = event.get("usage") or event.get("data", {}).get("usage") or {}
            for key, usage_field in (("input_tokens", "inputTokens"), ("cached_input_tokens", "cachedInputTokens"), ("output_tokens", "outputTokens"), ("total_tokens", "totalTokens")):
                if isinstance(usage.get(key), int): self.token_usage[usage_field] = max(self.token_usage[usage_field], usage[key])
            detail = usage.get("output_tokens_details") or {}
            input_detail = usage.get("input_tokens_details") or {}
            if isinstance(input_detail.get("cached_tokens"), int): self.token_usage["cachedInputTokens"] = max(self.token_usage["cachedInputTokens"], input_detail["cached_tokens"])
            if isinstance(detail.get("reasoning_tokens"), int): self.token_usage["reasoningTokens"] = max(self.token_usage["reasoningTokens"], detail["reasoning_tokens"])
            if isinstance(usage.get("reasoning_output_tokens"), int): self.token_usage["reasoningTokens"] = max(self.token_usage["reasoningTokens"], usage["reasoning_output_tokens"])
        if not self.token_usage["totalTokens"]:
            self.token_usage["totalTokens"] = self.token_usage["inputTokens"] + self.token_usage["outputTokens"]
        if result.returncode:
            raise RuntimeError(f"Codex exited with code {result.returncode}")
        deadline = time.monotonic() + 1800
        while time.monotonic() < deadline:
            if target.exists() and target.read_text(encoding="utf-8").strip():
                return
            time.sleep(5)
        raise RuntimeError(f"Codex did not create {target.relative_to(self.workspace)} within 30 minutes")

    def release_docx_lock(self, path: Path) -> None:
        """Close only a stale Word instance for this worker artifact."""
        if os.name != "nt" or not path.exists():
            return
        script = Path(__file__).resolve().parent / "utils" / "release_docx_lock.ps1"
        result = subprocess.run(
            ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-STA", "-File", str(script), "-Path", str(path)],
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace", timeout=60, check=False,
        )
        if result.returncode:
            raise RuntimeError("Could not release the previous Word document lock: " + result.stdout.strip()[-500:])

    def write_docx(self, source: Path, output: Path, title: str, rules: dict[str, Any], order: dict[str, Any]) -> None:
        try:
            from docx import Document
            from docx.enum.section import WD_SECTION
            from docx.enum.text import WD_ALIGN_PARAGRAPH
            from docx.enum.style import WD_STYLE_TYPE
            from docx.shared import Cm, Pt, RGBColor
            from docx.oxml import OxmlElement
            from docx.oxml.ns import qn
        except ImportError as exc:
            raise RuntimeError("python-docx is required. Install worker requirements first.") from exc

        font = rules["font"]
        page = rules["page"]
        paragraph_rules = rules["paragraph"]

        def bidi(paragraph: Any) -> None:
            props = paragraph._p.get_or_add_pPr()
            if props.find(qn("w:bidi")) is None:
                props.append(OxmlElement("w:bidi"))

        def rtl_table(table: Any) -> None:
            """Make column order and cell flow RTL, not only the text in each cell."""
            props = table._tbl.tblPr
            if props.find(qn("w:bidiVisual")) is None:
                props.append(OxmlElement("w:bidiVisual"))

        def set_complex_script_size(run: Any, size_pt: float) -> None:
            """Word uses szCs, rather than sz, for Persian/Arabic glyphs."""
            run.font.size = Pt(size_pt)
            props = run._element.get_or_add_rPr()
            size_cs = props.find(qn("w:szCs"))
            if size_cs is None:
                size_cs = OxmlElement("w:szCs")
                props.append(size_cs)
            size_cs.set(qn("w:val"), str(round(size_pt * 2)))

        def apply_persian_run(run: Any, size_pt: float | None = None) -> None:
            run.font.name = font["persian"]
            run.font.color.rgb = RGBColor(0, 0, 0)
            props = run._element.get_or_add_rPr()
            fonts = props.get_or_add_rFonts()
            for attribute in ("ascii", "hAnsi", "eastAsia", "cs"):
                fonts.set(qn(f"w:{attribute}"), font["persian"])
            if props.find(qn("w:rtl")) is None:
                props.append(OxmlElement("w:rtl"))
            language = props.find(qn("w:lang"))
            if language is None:
                language = OxmlElement("w:lang")
                props.append(language)
            language.set(qn("w:bidi"), "fa-IR")
            if size_pt is not None:
                set_complex_script_size(run, size_pt)

        def normalize_persian(value: str) -> str:
            value = value.replace("ي", "ی").replace("ك", "ک").replace("ـ", "")
            # Content generators usually emit ASCII digits even in Persian prose.
            # Convert them while building the DOCX, so section labels, numbered
            # citations, captions, tables, and bibliography markers consistently
            # use Persian glyphs.  Arabic-Indic digits are normalised too because
            # they are a distinct Unicode digit set from Persian digits. URLs and
            # DOI identifiers remain machine-readable, because digit conversion
            # would make a copied source link invalid.
            digit_map = str.maketrans("0123456789٠١٢٣٤٥٦٧٨٩", "۰۱۲۳۴۵۶۷۸۹۰۱۲۳۴۵۶۷۸۹")
            protected = re.split(r"((?:https?://|www\.)\S+|\b10\.\d{4,9}/\S+)", value)
            value = "".join(part if index % 2 else part.translate(digit_map) for index, part in enumerate(protected))
            value = re.sub(r"\s+([،؛؟٪])", r"\1", value)
            value = re.sub(r"([،؛؟])(?=\S)", r"\1 ", value)
            value = re.sub(r"\s+", " ", value).strip()
            return value

        def add_page_border(section: Any) -> None:
            border = rules["page"].get("border", {})
            if not border.get("enabled", False): return
            sect_pr = section._sectPr
            borders = OxmlElement("w:pgBorders")
            borders.set(qn("w:offsetFrom"), "page")
            for edge in ("top", "left", "bottom", "right"):
                tag = OxmlElement(f"w:{edge}")
                tag.set(qn("w:val"), "single")
                tag.set(qn("w:sz"), str(border.get("size", 6)))
                tag.set(qn("w:space"), str(border.get("space", 16)))
                tag.set(qn("w:color"), str(border.get("color", "808080")))
                borders.append(tag)
            sect_pr.append(borders)

        def style(name: str, size: float, bold: bool = False, align: Any = WD_ALIGN_PARAGRAPH.JUSTIFY) -> Any:
            current = document.styles[name] if name in document.styles else document.styles.add_style(name, WD_STYLE_TYPE.PARAGRAPH)
            current.font.name = font["persian"]
            current._element.rPr.rFonts.set(qn("w:eastAsia"), font["persian"])
            current._element.rPr.rFonts.set(qn("w:cs"), font["persian"])
            current.font.size = Pt(size)
            current.font.bold = bold
            current.font.color.rgb = RGBColor(0, 0, 0)
            current.paragraph_format.alignment = align
            current.paragraph_format.line_spacing = paragraph_rules["line_spacing"]
            current.paragraph_format.space_before = Pt(0)
            current.paragraph_format.space_after = Pt(paragraph_rules["space_after_pt"])
            props = current._element.get_or_add_pPr()
            # Word's built-in Title style can carry a theme-coloured bottom rule.
            # It has no place in a formal Persian thesis cover.
            for border in props.findall(qn("w:pBdr")):
                props.remove(border)
            # Word's stock Title style enables contextual spacing, which silently
            # discards paragraph spacing between consecutive cover lines.
            for contextual_spacing in props.findall(qn("w:contextualSpacing")):
                props.remove(contextual_spacing)
            if props.find(qn("w:bidi")) is None:
                props.append(OxmlElement("w:bidi"))
            style_props = current._element.get_or_add_rPr()
            size_cs = style_props.find(qn("w:szCs"))
            if size_cs is None:
                size_cs = OxmlElement("w:szCs")
                style_props.append(size_cs)
            size_cs.set(qn("w:val"), str(round(size * 2)))
            return current

        document = Document()
        # Word otherwise chooses the UI/document locale for inherited paragraph
        # direction.  Declare Persian as the bidi language at document level too.
        settings = document.settings._element
        language = settings.find(qn("w:themeFontLang"))
        if language is None:
            language = OxmlElement("w:themeFontLang")
            settings.append(language)
        language.set(qn("w:bidi"), "fa-IR")
        section = document.sections[0]
        section.top_margin, section.bottom_margin = Cm(page["top_cm"]), Cm(page["bottom_cm"])
        section.right_margin, section.left_margin = Cm(page["right_cm"]), Cm(page["left_cm"])
        section.header_distance, section.footer_distance = Cm(1.2), Cm(1.2)
        # Keep the cover visually clean: page numbering begins with the body.
        section.different_first_page_header_footer = True
        add_page_border(section)
        # Persian prose should be fully justified; headings, covers, and table
        # cells intentionally use their own alignment.
        normal = style("Normal", font["body_pt"], align=WD_ALIGN_PARAGRAPH.JUSTIFY)
        normal.paragraph_format.first_line_indent = Cm(paragraph_rules["first_line_cm"])
        style("TOC Entry", font["body_pt"], align=WD_ALIGN_PARAGRAPH.RIGHT)
        style("Title", font["heading_1_pt"] + 2, True, WD_ALIGN_PARAGRAPH.CENTER)
        style("Heading 1", font["heading_1_pt"], True, WD_ALIGN_PARAGRAPH.CENTER)
        style("Heading 2", font["heading_2_pt"], True, WD_ALIGN_PARAGRAPH.RIGHT)
        style("Heading 3", font["heading_3_pt"], True, WD_ALIGN_PARAGRAPH.RIGHT)
        for heading in ("Heading 1", "Heading 2", "Heading 3"):
            document.styles[heading].paragraph_format.space_before = Pt(18)
            document.styles[heading].paragraph_format.space_after = Pt(10)
            document.styles[heading].paragraph_format.keep_with_next = True

        # Modelled on the Ferdowsi University thesis template: institution and
        # faculty, degree/field, title, author, then supervisors.  Typography and
        # white space make those levels visibly distinct on the cover.
        cover = rules.get("cover", {})
        faculty = order.get("faculty") or ""
        department = order.get("department") or ""
        faculty_line = " — ".join(part for part in (f"دانشکده {faculty}" if faculty else "", f"گروه {department}" if department else "") if part)
        degree_line = f"پروژه طراحی برای دریافت درجه {order.get('degree') or 'کارشناسی'}"
        if order.get("field_of_study"):
            degree_line += f" در رشته {order['field_of_study']}"
        cover_lines = [
            (order.get("university") or "", cover.get("institution_pt", 21), True, cover.get("institution_after_pt", 32)),
            (faculty_line, cover.get("metadata_pt", 14), False, cover.get("faculty_after_pt", 52)),
            (degree_line, cover.get("degree_pt", 15), True, cover.get("degree_after_pt", 48)),
            (title, cover.get("title_pt", 28), True, cover.get("title_after_pt", 54)),
            (order.get("student_name") or "", cover.get("student_pt", 19), True, cover.get("student_after_pt", 48)),
            (f"استاد راهنما: {order['advisor_name']}" if order.get("advisor_name") else "", cover.get("supervisor_pt", 13), False, cover.get("supervisor_after_pt", 22)),
            (f"استاد مشاور: {order['consultant_name']}" if order.get("consultant_name") else "", cover.get("supervisor_pt", 13), False, cover.get("supervisor_after_pt", 22)),
        ]
        for cover_index, (text, size, bold, space_after) in enumerate(cover_lines):
            if text:
                p = document.add_paragraph(style="Title")
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                p.paragraph_format.line_spacing = cover.get("line_spacing", 1.5)
                p.paragraph_format.space_before = Pt(
                    cover.get("top_space_pt", 72) if cover_index == 0
                    else cover.get("student_block_before_pt", 100) if text == (order.get("student_name") or "")
                    else 0
                )
                p.paragraph_format.space_after = Pt(space_after)
                run = p.add_run(normalize_persian(text))
                run.font.bold = bold
                apply_persian_run(run, size)
                bidi(p)
        document.add_page_break()

        footer = section.footer.paragraphs[0]
        footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
        footer_run = footer.add_run()
        field_begin, field_instr, field_separator, field_result, field_end = (OxmlElement("w:fldChar"), OxmlElement("w:instrText"), OxmlElement("w:fldChar"), OxmlElement("w:t"), OxmlElement("w:fldChar"))
        field_begin.set(qn("w:fldCharType"), "begin")
        field_instr.set(qn("xml:space"), "preserve")
        field_instr.text = "PAGE \\* MERGEFORMAT"
        field_separator.set(qn("w:fldCharType"), "separate")
        field_result.text = "۱"
        field_end.set(qn("w:fldCharType"), "end")
        footer_run._r.extend([field_begin, field_instr, field_separator, field_result, field_end])
        apply_persian_run(footer_run)
        bidi(footer)

        lines = source.read_text(encoding="utf-8").splitlines()
        index = 0
        chapter_count = 0
        redundant_cover_headings = {"عنوان پژوهش", "عنوان پایان نامه", "عنوان پایان‌نامه", "عنوان پروژه"}
        heading_anchors: dict[int, str] = {}
        anchor_for_heading: dict[str, str] = {}
        anchor_number = 1
        for source_index, source_line in enumerate(lines):
            candidate = normalize_persian(source_line.strip())
            prefix = next((value for value in ("### ", "## ", "# ") if candidate.startswith(value)), None)
            if prefix is None:
                continue
            heading_text = normalize_persian(candidate[len(prefix):])
            if heading_text in redundant_cover_headings or heading_text == "فهرست مطالب":
                continue
            anchor = f"toc_{anchor_number}"
            heading_anchors[source_index] = anchor
            anchor_for_heading.setdefault(heading_text, anchor)
            anchor_number += 1

        def add_bookmark(paragraph: Any, anchor: str) -> None:
            start = OxmlElement("w:bookmarkStart")
            start.set(qn("w:id"), str(len(heading_anchors) + len(document.paragraphs)))
            start.set(qn("w:name"), anchor)
            end = OxmlElement("w:bookmarkEnd")
            end.set(qn("w:id"), start.get(qn("w:id")))
            paragraph._p.insert(0, start)
            paragraph._p.append(end)

        def add_toc_link(paragraph: Any, text: str, anchor: str) -> None:
            run = paragraph.add_run(text)
            apply_persian_run(run)
            hyperlink = OxmlElement("w:hyperlink")
            hyperlink.set(qn("w:anchor"), anchor)
            hyperlink.set(qn("w:history"), "1")
            paragraph._p.remove(run._r)
            hyperlink.append(run._r)
            paragraph._p.append(hyperlink)

        while index < len(lines):
            raw_line = lines[index]
            line = normalize_persian(raw_line.strip())
            if not line:
                index += 1
                continue
            # The worker builds the cover itself.  A generated Markdown title
            # block would otherwise become an empty duplicate title page.
            if line.startswith("# ") and normalize_persian(line[2:]) in redundant_cover_headings:
                title_line_index = index + 1
                while title_line_index < len(lines) and not lines[title_line_index].strip():
                    title_line_index += 1
                # This is always a redundant Markdown cover block: the official
                # cover above already carries the order title. Do not compare
                # strings here, because model output can vary only in diacritics.
                index = title_line_index + 1 if title_line_index < len(lines) else index + 1
                continue
            if line == "# فهرست مطالب":
                toc_heading = document.add_paragraph("فهرست مطالب", style="Heading 1")
                toc_heading.alignment = WD_ALIGN_PARAGRAPH.CENTER
                # Paragraph direction alone is insufficient for the strict RTL
                # audit: the heading's own Persian run must carry w:rtl too.
                for toc_run in toc_heading.runs:
                    apply_persian_run(toc_run)
                if chapter_count:
                    toc_heading.paragraph_format.page_break_before = True
                chapter_count += 1
                index += 1
                while index < len(lines):
                    toc_line = normalize_persian(lines[index].strip())
                    if toc_line.startswith("# "):
                        break
                    item_match = re.match(r"^(?:-|\*)\s+(.+)$", toc_line)
                    if item_match:
                        item_text = normalize_persian(item_match.group(1))
                        anchor = anchor_for_heading.get(item_text)
                        if anchor:
                            toc_item = document.add_paragraph(style="TOC Entry")
                            toc_item.alignment = WD_ALIGN_PARAGRAPH.RIGHT
                            toc_item.paragraph_format.first_line_indent = Cm(0)
                            toc_item.paragraph_format.right_indent = Cm(0.6 if lines[index].startswith((" ", "\t")) else 0)
                            bidi(toc_item)
                            add_toc_link(toc_item, item_text, anchor)
                    index += 1
                continue
            if line.startswith("|") and index + 1 < len(lines) and set(lines[index + 1].strip()) <= {"|", "-", ":", " "}:
                rows: list[list[str]] = []
                index += 2
                while index < len(lines) and lines[index].strip().startswith("|"):
                    rows.append([cell.strip() for cell in lines[index].strip().strip("|").split("|")])
                    index += 1
                headers = [normalize_persian(cell.strip()) for cell in line.strip("|").split("|")]
                table = document.add_table(rows=1, cols=len(headers))
                table.style = "Table Grid"
                rtl_table(table)
                for cell, value in zip(table.rows[0].cells, headers):
                    cell.text = value
                    for p in cell.paragraphs:
                        p.alignment = WD_ALIGN_PARAGRAPH.CENTER; bidi(p)
                        for r in p.runs: apply_persian_run(r, font["table_pt"]); r.font.bold = True
                for row in rows:
                    cells = table.add_row().cells
                    for cell, value in zip(cells, row):
                        cell.text = normalize_persian(value)
                        for p in cell.paragraphs:
                            p.alignment = WD_ALIGN_PARAGRAPH.RIGHT; bidi(p)
                            for r in p.runs: apply_persian_run(r, font["table_pt"])
                continue
            if line.startswith("# "):
                paragraph = document.add_paragraph(line[2:], style="Heading 1")
                # Every top-level section starts on a fresh page.  The first one
                # already follows the cover's explicit page break.
                if chapter_count:
                    paragraph.paragraph_format.page_break_before = True
                chapter_count += 1
                if index in heading_anchors:
                    add_bookmark(paragraph, heading_anchors[index])
            elif line.startswith("## "):
                paragraph = document.add_paragraph(line[3:], style="Heading 2")
                anchor = anchor_for_heading.get(normalize_persian(line[3:]))
                if anchor:
                    add_bookmark(paragraph, anchor)
            elif line.startswith("### "):
                paragraph = document.add_paragraph(line[4:], style="Heading 3")
                anchor = anchor_for_heading.get(normalize_persian(line[4:]))
                if anchor:
                    add_bookmark(paragraph, anchor)
            elif line.startswith(("- ", "* ")):
                paragraph = document.add_paragraph(line[2:], style="Normal")
                paragraph.paragraph_format.first_line_indent = Cm(0)
                paragraph.paragraph_format.right_indent = Cm(0.6)
            else:
                paragraph = document.add_paragraph(line, style="Normal")
            if paragraph.style.name == "Normal":
                paragraph.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
            elif paragraph.style.name == "Heading 1":
                paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
            else:
                paragraph.alignment = WD_ALIGN_PARAGRAPH.RIGHT
            paragraph.paragraph_format.widow_control = True
            bidi(paragraph)
            for run in paragraph.runs:
                apply_persian_run(run)
            index += 1
        self.release_docx_lock(output)
        output.parent.mkdir(parents=True, exist_ok=True)
        document.save(output)

    def word_rtl_audit(self, docx: Path, audit_only: bool = True) -> dict[str, int]:
        if os.name != "nt":
            raise RuntimeError("actual Word RTL audit requires the Windows Worker runtime")
        self.release_docx_lock(docx)
        script = Path(__file__).resolve().parent / "utils" / "enforce_word_rtl.ps1"
        command = [
            "powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-STA", "-File", str(script), "-Path", str(docx)
        ]
        if audit_only:
            command.append("-AuditOnly")
        result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace", timeout=180, check=False)
        if result.returncode:
            raise RuntimeError("Word RTL audit failed: " + result.stdout.strip()[-500:])
        counts = re.findall(r"^\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*$", result.stdout, re.M)
        if not counts:
            raise RuntimeError("Word RTL audit returned no numeric result")
        right, center, invalid = (int(value) for value in counts[-1])
        return {"right_rtl": right, "center_rtl": center, "invalid_or_left": invalid}

    def enforce_word_rtl(self, docx: Path) -> None:
        audit = self.word_rtl_audit(docx, audit_only=False)
        if audit["invalid_or_left"]:
            raise RuntimeError(f"Word RTL enforcement left {audit['invalid_or_left']} invalid Persian paragraphs")

    def polish_cover(self, docx: Path, rules: dict[str, Any], order: dict[str, Any]) -> None:
        """Dedicated cover-layout pass, separate from content packaging."""
        from docx import Document
        from docx.shared import Pt, RGBColor
        from docx.oxml import OxmlElement
        from docx.oxml.ns import qn

        cover = rules.get("cover", {})
        values = {
            "institution": (cover.get("institution_pt", 21), True, cover.get("institution_after_pt", 32)),
            "faculty": (cover.get("metadata_pt", 14), False, cover.get("faculty_after_pt", 52)),
            "degree": (cover.get("degree_pt", 15), True, cover.get("degree_after_pt", 48)),
            "title": (cover.get("title_pt", 28), True, cover.get("title_after_pt", 54)),
            "student": (cover.get("student_pt", 19), True, cover.get("student_after_pt", 48)),
            "supervisor": (cover.get("supervisor_pt", 13), False, cover.get("supervisor_after_pt", 22)),
        }
        document = Document(docx)
        title_props = document.styles["Title"]._element.get_or_add_pPr()
        for contextual_spacing in title_props.findall(qn("w:contextualSpacing")):
            title_props.remove(contextual_spacing)
        for index, paragraph in enumerate(p for p in document.paragraphs if p.style.name == "Title" and p.text.strip()):
            text = paragraph.text.strip()
            role = "supervisor"
            if text == (order.get("university") or ""):
                role = "institution"
            elif text == (order.get("title") or ""):
                role = "title"
            elif text == (order.get("student_name") or ""):
                role = "student"
            elif text.startswith("دانشکده "):
                role = "faculty"
            elif text.startswith("پروژه طراحی برای دریافت درجه"):
                role = "degree"
            size, bold, gap = values[role]
            paragraph.paragraph_format.line_spacing = cover.get("line_spacing", 1.5)
            paragraph.paragraph_format.space_before = Pt(
                cover.get("top_space_pt", 72) if index == 0
                else cover.get("student_block_before_pt", 100) if role == "student"
                else 0
            )
            paragraph.paragraph_format.space_after = Pt(gap)
            for run in paragraph.runs:
                run.font.size = Pt(size)
                run.font.bold = bold
                run.font.color.rgb = RGBColor(0, 0, 0)
                props = run._element.get_or_add_rPr()
                props.get_or_add_rFonts().set(qn("w:cs"), rules["font"]["persian"])
                size_cs = props.find(qn("w:szCs"))
                if size_cs is None:
                    size_cs = OxmlElement("w:szCs")
                    props.append(size_cs)
                size_cs.set(qn("w:val"), str(round(size * 2)))
        document.save(docx)

    def count_docx_pages(self, docx: Path) -> int:
        if os.name != "nt":
            raise RuntimeError("actual DOCX page counting requires the Windows Worker runtime")
        self.release_docx_lock(docx)
        script = Path(__file__).resolve().parent / "utils" / "measure_pages.ps1"
        result = subprocess.run([
            "powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-STA", "-File", str(script), "-Path", str(docx)
        ], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace", timeout=120, check=False)
        if result.returncode:
            raise RuntimeError("Word page count failed: " + result.stdout.strip()[-500:])
        counts = re.findall(r"^\s*(\d+)\s*$", result.stdout, re.M)
        if not counts:
            raise RuntimeError("Word page count returned no numeric result")
        return int(counts[-1])

    def export_pdf(self, docx: Path, pdf: Path) -> None:
        if os.name != "nt":
            raise RuntimeError("PDF export requires the Windows Word runtime")
        script = Path(__file__).resolve().parent / "utils" / "export_pdf.ps1"
        last_output = ""
        for attempt in range(1, 3):
            self.release_docx_lock(docx)
            self.release_docx_lock(pdf)
            if pdf.exists():
                pdf.unlink()
            process = subprocess.Popen(
                ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-STA", "-File", str(script), "-Path", str(docx), "-OutputPath", str(pdf)],
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace",
            )
            try:
                output, _ = process.communicate(timeout=180)
            except subprocess.TimeoutExpired:
                subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
                output, _ = process.communicate()
                last_output = output or "Word PDF export timed out"
                self.release_docx_lock(docx)
                if attempt == 1:
                    continue
                raise RuntimeError("Word PDF export timed out after retry")
            last_output = output
            if process.returncode == 0 and pdf.exists() and pdf.stat().st_size:
                return
            self.release_docx_lock(docx)
        raise RuntimeError("Word PDF export failed: " + last_output[-500:])

    def create_first_half_sample(self, docx: Path, sample_docx: Path) -> tuple[int, int]:
        """Save the actual first half of rendered Word pages as a separate DOCX."""
        self.release_docx_lock(docx)
        self.release_docx_lock(sample_docx)
        script = Path(__file__).resolve().parent / "utils" / "create_first_half_sample.ps1"
        result = subprocess.run(
            ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-STA", "-File", str(script), "-Path", str(docx), "-OutputPath", str(sample_docx)],
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace", timeout=300, check=False,
        )
        counts = re.findall(r"^\s*(\d+)\s*,\s*(\d+)\s*$", result.stdout, re.M)
        if result.returncode or not sample_docx.exists() or not sample_docx.stat().st_size or not counts:
            raise RuntimeError("Word first-half sample creation failed: " + result.stdout[-500:])
        return tuple(map(int, counts[-1]))

    def validate_docx(self, source: Path, docx: Path, rules: dict[str, Any], report: Path, mode: str, order: dict[str, Any]) -> None:
        from docx import Document
        from docx.enum.text import WD_ALIGN_PARAGRAPH
        from docx.oxml.ns import qn
        text = source.read_text(encoding="utf-8")
        # Word's effective paragraph formatting is authoritative. Repair it before
        # inspecting OOXML so a retry can converge instead of repeatedly rejecting
        # style-inherited RTL/alignment that Word renders correctly.
        word_rtl_audit = self.word_rtl_audit(docx)
        if word_rtl_audit["invalid_or_left"]:
            self.enforce_word_rtl(docx)
            word_rtl_audit = self.word_rtl_audit(docx)
        document = Document(docx)
        errors: list[str] = []
        warnings: list[str] = []
        # `--sample` controls submission status only; every run generates the
        # same complete package and its first-half excerpt.
        min_words = rules["quality"]["min_full_words"]
        if len(re.findall(r"[آ-یA-Za-z]{2,}", text)) < min_words: errors.append(f"content below minimum word target ({min_words})")
        if not re.search(r"^# .*?(منابع|References)", text, re.M | re.I): errors.append("missing references section")
        citations = set(re.findall(r"\[([0-9۰-۹]+)\]", text))
        reference_numbers = set(re.findall(r"(?m)^\s*\[([0-9۰-۹]+)\]", text))
        if rules["quality"]["require_citations"] and not citations: errors.append("missing numbered in-text citations")
        missing_references = citations - reference_numbers
        if missing_references: errors.append("in-text citations missing from reference list: " + ", ".join(sorted(missing_references)))
        if any(marker in text.upper() for marker in ("TODO", "TBD", "[NEEDS", "لورم")): errors.append("placeholder marker found")
        source_table_count = sum(
            1 for index, line in enumerate(text.splitlines()[:-1])
            if line.strip().startswith("|") and bool(text.splitlines()[index + 1].strip()) and set(text.splitlines()[index + 1].strip()) <= {"|", "-", ":", " "}
        )
        if len(document.tables) < source_table_count: errors.append("not all Markdown tables were converted to DOCX tables")
        if document.styles["Normal"].font.name != rules["font"]["persian"]: errors.append("default Persian font was not applied")
        if len(document.paragraphs) < 12: errors.append("DOCX contains too few paragraphs")
        toc_present = any(paragraph.text.strip() == "فهرست مطالب" for paragraph in document.paragraphs)
        bookmarks = {item.get(qn("w:name")) for item in document._element.iter(qn("w:bookmarkStart"))}
        toc_links = [
            item.get(qn("w:anchor"))
            for item in document._element.iter(qn("w:hyperlink"))
            if item.get(qn("w:anchor"))
        ]
        if not toc_present:
            errors.append("missing table of contents")
        elif not toc_links:
            errors.append("table of contents has no clickable entries")
        elif any(anchor not in bookmarks for anchor in toc_links):
            errors.append("table of contents contains a broken internal link")
        required_pages = int(order.get("quantity_value") or 0) if order.get("quantity_type") == "pages" else 0
        actual_pages = self.count_docx_pages(docx)
        if required_pages and actual_pages < required_pages:
            errors.append(f"page count below order requirement ({actual_pages}/{required_pages})")
        persian_runs = 0
        wrong_font_runs = 0
        missing_rtl_runs = 0
        bad_direction_paragraphs = 0
        non_justified_body_paragraphs = 0

        def style_property(paragraph: Any, tag: str) -> Any:
            style = paragraph.style
            while style is not None:
                props = style._element.pPr
                if props is not None:
                    value = props.find(qn(tag))
                    if value is not None:
                        return value
                style = style.base_style
            return None

        def style_complex_font(paragraph: Any) -> str | None:
            style = paragraph.style
            while style is not None:
                props = style._element.rPr
                fonts = props.rFonts if props is not None else None
                value = fonts.get(qn("w:cs")) if fonts is not None else None
                if value:
                    return value
                style = style.base_style
            return None
        # Centred text is only legitimate for the cover/chapter title and table
        # headers.  A centred or left-aligned body paragraph is a Word-layout bug.
        paragraphs_to_audit = [
            (paragraph, paragraph.style.name in ("Title", "Heading 1"), paragraph.style.name == "Normal")
            for paragraph in document.paragraphs
        ]
        paragraphs_to_audit.extend(
            (paragraph, row_index == 0, False)
            for table in document.tables
            for row_index, row in enumerate(table.rows)
            for cell in row.cells
            for paragraph in cell.paragraphs
        )
        for paragraph, center_allowed, justify_required in paragraphs_to_audit:
            contains_persian = any(re.search(r"[آ-ی]", run.text) for run in paragraph.runs)
            if not contains_persian:
                continue
            props = paragraph._p.pPr
            if (props is None or props.find(qn("w:bidi")) is None) and style_property(paragraph, "w:bidi") is None:
                bad_direction_paragraphs += 1
            effective_alignment = paragraph.alignment if paragraph.alignment is not None else paragraph.style.paragraph_format.alignment
            allowed_alignments = (WD_ALIGN_PARAGRAPH.RIGHT, WD_ALIGN_PARAGRAPH.JUSTIFY)
            if center_allowed:
                allowed_alignments += (WD_ALIGN_PARAGRAPH.CENTER,)
            if effective_alignment not in allowed_alignments:
                bad_direction_paragraphs += 1
            if justify_required and effective_alignment != WD_ALIGN_PARAGRAPH.JUSTIFY:
                non_justified_body_paragraphs += 1
            for run in paragraph.runs:
                if not re.search(r"[آ-ی]", run.text):
                    continue
                persian_runs += 1
                run_props = run._element.rPr
                run_fonts = run_props.rFonts if run_props is not None else None
                effective_font = run_fonts.get(qn("w:cs")) if run_fonts is not None else style_complex_font(paragraph)
                if effective_font != rules["font"]["persian"]:
                    wrong_font_runs += 1
                if run_props is None or run_props.find(qn("w:rtl")) is None:
                    missing_rtl_runs += 1
        if wrong_font_runs: errors.append(f"{wrong_font_runs} Persian runs do not use the required font")
        if missing_rtl_runs: errors.append(f"{missing_rtl_runs} Persian runs are missing RTL direction")
        if non_justified_body_paragraphs:
            errors.append(f"{non_justified_body_paragraphs} Persian body paragraphs are not justified")
        if word_rtl_audit["invalid_or_left"]:
            errors.append(f"Word reports {word_rtl_audit['invalid_or_left']} Persian paragraphs as LTR or left-aligned")
        elif bad_direction_paragraphs:
            warnings.append(
                f"{bad_direction_paragraphs} Persian paragraphs rely on Word/style formatting; "
                "Word's effective RTL audit passed"
            )
        cover_paragraphs = [paragraph for paragraph in document.paragraphs if paragraph.style.name == "Title" and paragraph.text.strip()]
        cover_spacing_issues = 0
        if len(cover_paragraphs) < 2:
            cover_spacing_issues += 1
        else:
            for cover_index, paragraph in enumerate(cover_paragraphs):
                fmt = paragraph.paragraph_format
                style_fmt = paragraph.style.paragraph_format
                effective_line_spacing = fmt.line_spacing if fmt.line_spacing is not None else style_fmt.line_spacing
                # Word removes redundant line-spacing XML from single-line cover
                # paragraphs when saving. Missing XML is therefore not a visual
                # spacing failure; an explicit value must still be in range.
                line_spacing_ok = effective_line_spacing is None or 1.4 <= float(effective_line_spacing) <= 1.7
                after = fmt.space_after if fmt.space_after is not None else style_fmt.space_after
                before = fmt.space_before if fmt.space_before is not None else style_fmt.space_before
                after_pt = after.pt if after is not None else 0
                before_pt = before.pt if before is not None else 0
                if not line_spacing_ok or after_pt < 8 or (cover_index == 0 and before_pt < 60):
                    cover_spacing_issues += 1
        section_headings = [paragraph for paragraph in document.paragraphs if paragraph.style.name == "Heading 1"]
        missing_section_breaks = sum(
            1 for paragraph in section_headings[1:]
            if not paragraph.paragraph_format.page_break_before
        )
        if cover_spacing_issues:
            errors.append(f"cover page spacing audit failed ({cover_spacing_issues} issue(s))")
        cover_sizes = [run.font.size.pt for paragraph in cover_paragraphs for run in paragraph.runs if run.font.size is not None]
        title_cover = next((paragraph for paragraph in cover_paragraphs if paragraph.text.strip() == (order.get("title") or "")), None)
        student_cover = next((paragraph for paragraph in cover_paragraphs if paragraph.text.strip() == (order.get("student_name") or "")), None)
        title_size = max((run.font.size.pt for run in title_cover.runs if run.font.size is not None), default=0) if title_cover else 0
        if not cover_sizes or max(cover_sizes) - min(cover_sizes) < 8 or title_size != max(cover_sizes):
            errors.append("cover typography audit failed: title hierarchy or font-size contrast is insufficient")
        if student_cover is None or (student_cover.paragraph_format.space_before.pt if student_cover.paragraph_format.space_before else 0) < 60:
            errors.append("cover layout audit failed: student and supervisor block is not positioned in the lower cover area")
        if missing_section_breaks:
            errors.append(f"top-level sections missing required page break ({missing_section_breaks})")
        if rules.get("requires_manual_guideline_review"): warnings.append("uploaded guideline text was unreadable; fallback rules used pending manual/OCR review")
        result = {"passed": not errors, "errors": errors, "warnings": warnings, "word_target": min_words, "required_pages": required_pages or None, "actual_pages": actual_pages, "paragraphs": len(document.paragraphs), "citations": len(citations), "source_tables": source_table_count, "docx_tables": len(document.tables), "font": rules["font"]["persian"], "toc_audit": {"present": toc_present, "clickable_entries": len(toc_links), "broken_entries": sum(anchor not in bookmarks for anchor in toc_links)}, "rtl_audit": {"persian_runs": persian_runs, "wrong_font_runs": wrong_font_runs, "missing_rtl_runs": missing_rtl_runs, "bad_direction_paragraphs": bad_direction_paragraphs, "non_justified_body_paragraphs": non_justified_body_paragraphs, "word": word_rtl_audit}, "layout_audit": {"cover_paragraphs": len(cover_paragraphs), "cover_spacing_issues": cover_spacing_issues, "cover_font_sizes_pt": cover_sizes, "cover_title_size_pt": title_size, "top_level_sections": len(section_headings), "missing_section_breaks": missing_section_breaks}}
        write_json(report, result)
        if errors: raise RuntimeError("DOCX quality gate failed: " + "; ".join(errors))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Worker Plus: bachelor thesis workflow")
    parser.add_argument("--sample", action="store_true", help="Set the final order status to customer-sample approval; output generation remains complete")
    parser.add_argument("--order-id", "--order_id", dest="order_id", help="Force-claim this order and start from a fresh workspace")
    parser.add_argument("--redo", action="store_true", help="Allow reclaiming a specific order (implicit with --order-id)")
    parser.add_argument("--resume", action="store_true", help="Resume workspace/in_progress from its saved context")
    parser.add_argument("--dry-run", action="store_true", help="Avoid Codex and create a tiny test source")
    parser.add_argument("--offline", action="store_true", help="Run all steps with a local mock order; no backend changes")
    parser.add_argument("--repackage", action="store_true", help="Restart at Step 12 (Package DOCX) using the saved source, without invoking Codex")
    parser.add_argument("--step", type=int, choices=range(1, len(STEPS) + 1), help="Resume from the terminal step number (1-16); Step 16 regenerates and publishes sample.docx/sample.pdf from final.docx")
    return parser


def header(index: int, title: str, context: dict[str, Any]) -> None:
    clean_title = re.sub(r"\s+", " ", title)
    print("-" * 64, flush=True)
    print("Worker Plus | Bachelor Thesis", flush=True)
    print(f"Order: {context.get('order_id') or 'pending'} | Mode: {context['mode']}", flush=True)
    print(f"Step {index:02}/{TOTAL_STEPS:02}: {clean_title}", flush=True)
    print("-" * 64, flush=True)


def main() -> None:
    args = build_parser().parse_args()
    config = load_config()
    workspace = config.workspace_root / "in_progress"
    workspace.mkdir(parents=True, exist_ok=True)
    if args.repackage and (args.resume or args.order_id or args.step):
        raise SystemExit("--repackage uses the saved workspace; do not combine it with --resume or --order-id.")
    if args.step and args.order_id:
        raise SystemExit("--step resumes the saved workspace; do not combine it with --order-id.")
    if args.resume and args.order_id:
        raise SystemExit("--resume cannot be combined with --order-id; a specific order always starts fresh.")
    args.redo = args.redo or bool(args.order_id) or args.repackage
    if args.repackage:
        context = load(workspace)
        if not context.get("order_id"):
            raise SystemExit("No saved order is available to repackage.")
        if not args.offline:
            claimed = claim_oldest(config, context["order_id"], redo=True)
            context["order"] = claimed["customerInput"]
        context["status"] = "in_progress"
        context["errors"] = []
        # The package step is the first step that can safely rebuild Word/PDF
        # outputs while retaining the reviewed source and all intake artifacts.
        context["completed_steps"] = STEPS[:STEPS.index("09_package_docx")]
    elif args.step:
        if args.step == 1:
            context = new_context(workspace, "sample" if args.sample else "full")
        else:
            context = load(workspace)
            if not context.get("order_id"):
                raise SystemExit("No saved order is available; start with a normal run before using --step.")
            # A resumed sample publish must honour an explicit --sample flag.
            # Previously the saved full-mode context silently won, so
            # `--step 16 --sample` published as a full run despite the CLI flag.
            if args.sample:
                context["mode"] = "sample"
            # Re-claiming and heartbeating keep the backend state correct even when
            # the expensive intake/source stages are intentionally skipped.
            if not args.offline:
                claimed = claim_oldest(config, context["order_id"], redo=True)
                context["order"] = claimed["customerInput"]
                heartbeat(config, context["order_id"], f"Worker Plus resumed from step {args.step}.")
            context["status"] = "in_progress"
            context["errors"] = []
            context["completed_steps"] = STEPS[:args.step - 1]

            # A deliberate re-run from generation must not silently reuse a stale
            # model output.  Starting at packaging/validation leaves source data
            # untouched for visual-only corrections.
            if args.step <= 7:
                for stale in (workspace / "final" / "deliverable_source.md", workspace / "final" / "sample_source.md"):
                    if stale.exists():
                        stale.unlink()
                for stale in (workspace / "drafts").glob("continuation_*.md"):
                    stale.unlink()
            if args.step <= 9:
                for stale in (workspace / "final" / "deliverable.docx", workspace / "final" / "sample.docx"):
                    if stale.exists():
                        stale.unlink()
    else:
        context = load(workspace) if args.resume else new_context(workspace, "sample" if args.sample else "full")
    save(workspace, context)
    services = Services(config, args, workspace)

    try:
        for index, name in enumerate(STEPS, start=1):
            if name in context["completed_steps"]:
                continue
            module = importlib.import_module(f"steps.{name}")
            header(index, module.TITLE, context)
            context["current_step"] = name
            save(workspace, context)
            module.run(context, services)
            context["completed_steps"].append(name)
            context["current_step"] = None
            save(workspace, context)
            print("Result: PASS", flush=True)
    except Exception as exc:
        context.setdefault("errors", []).append(str(exc))
        save(workspace, context)
        module = importlib.import_module(f"steps.{FAILURE_STEP}")
        header(len(STEPS) + 1, module.TITLE, context)
        try:
            module.run(context, services)
            save(workspace, context)
        finally:
            print(f"Result: FAIL — {exc}", flush=True)
        raise SystemExit(1) from exc
    finally:
        try:
            cleanup = services.cleanup_run()
            context["cleanup"] = cleanup
            save(workspace, context)
            print(
                "Cleanup: released "
                f"{len(cleanup['released_docx_targets'])} DOCX target(s); terminated "
                f"{len(cleanup['terminated_automation_word_pids'])} worker Word automation process(es).",
                flush=True,
            )
        except Exception as cleanup_error:
            print(f"Could not complete worker cleanup: {cleanup_error}", file=sys.stderr)
        if context.get("order_id") and not args.offline:
            try:
                errors = context.get("errors") or []
                record_run(config, context["order_id"], {"workerId": config.worker_id, "model": config.codex_model, "mode": context["mode"], "status": "completed" if not errors else "failed", "notes": errors[-1] if errors else None, **services.token_usage})
            except Exception as record_error:
                print(f"Could not record worker run usage: {record_error}", file=sys.stderr)


if __name__ == "__main__":
    main()
