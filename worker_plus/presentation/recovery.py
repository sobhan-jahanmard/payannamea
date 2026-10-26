"""Preserve presentation inputs and describe repairs at slide granularity."""
from __future__ import annotations

from contextlib import contextmanager
from copy import deepcopy
import json
import hashlib
from pathlib import Path
import re


class PresentationIntegrityError(RuntimeError):
    retryable = False


class PresentationNoProgressError(RuntimeError):
    retryable = False


def slide_numbers(text: str) -> list[int]:
    text = text.translate(str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789"))
    return sorted({int(n) for n in re.findall(r"(?:اسلاید\s*|\bslide\s+)(\d+)", text, re.I)})


def audit_issues(text: str, slide_count: int) -> list[dict]:
    marker = "ISSUES_JSON:"
    if marker in text:
        try:
            value, _ = json.JSONDecoder().raw_decode(text.split(marker, 1)[1].lstrip())
            issues = value.get("issues")
            if isinstance(issues, list) and all(isinstance(item, dict) and isinstance(item.get("message"), str)
                                               and type(item.get("slide")) is int and 1 <= item["slide"] <= slide_count for item in issues):
                return [{"code": "PRESENTATION_AUDIT", "slide": item["slide"], "location": f"slide {item['slide']}", "message": item["message"]} for item in issues]
        except (ValueError, AttributeError):
            pass
    # Read legacy reports, ignoring lines which explicitly say an earlier defect
    # was fixed. New audits return structured issues instead of this fallback.
    lines = [line.strip(" -") for line in text.splitlines() if slide_numbers(line)]
    failed = [line for line in lines if re.search(r"ناقص|پشتیبانی نمی|اشتباه|مفقود|فاقد|نامعتبر|بی‌شاهد|ندارد|وجود ندارد|نادرست|مردود|\bfail\b|mismatch|unsupported|missing", line, re.I)
              and not re.search(r"رفع شده|رفع‌شده|رفع شد|منطبق است|تطابق کامل", line)]
    return [{"code": "PRESENTATION_AUDIT", "slide": n, "location": f"slide {n}", "message": line}
            for line in (failed or lines) for n in slide_numbers(line) if 1 <= n <= slide_count]


class PresentationAuditError(RuntimeError):
    def __init__(self, report_path: str, text: str, slide_count: int):
        self.report_path = report_path
        self.issues = audit_issues(text, slide_count)
        self.repair_slides = sorted({item["slide"] for item in self.issues})
        detail = "\n".join(item["message"] for item in self.issues) or text[:2200]
        super().__init__(f"Presentation audit failed: {report_path}\n{detail[:2200]}")


class PresentationVisualAuditError(PresentationAuditError):
    # Rendering faults must keep the reviewed slide model intact and replay
    # packaging/rendering. Text repair cannot fix native chart fill or bidi.
    restart_step = "09_package_docx"
    repair_kind = "rendering"
    # Rebuilding deterministic slides cannot repair renderer code or clarify an
    # ambiguous screenshot. Stop with evidence for a fix, then resume manually.
    retryable = False


class PresentationRenderingRecoveryRequired(RuntimeError):
    restart_step = "09_package_docx"
    repair_kind = "rendering"
    validated_checkpoint = True


def verified_content_checkpoint(services) -> bool:
    """Accept earlier actual PASS audits only while all their inputs match."""
    root = services.workspace.resolve()
    required = {"final/presentation.json", "extracted/presentation_sources.json", "planning/presentation_contract.json"}
    try:
        for name in ("presentation_content_audit", "presentation_source_audit"):
            if (root / f"reports/{name}.md").read_text(encoding="utf-8").strip().splitlines()[:1] != ["STATUS: PASS"]:
                return False
            stamp = json.loads((root / f"reports/{name}.json").read_text(encoding="utf-8"))
            if stamp.get("passed") is not True or not required.issubset(stamp.get("inputs", {})):
                return False
            if stamp.get("semantic_inputs"):
                from presentation.design import content_inputs
                if stamp["semantic_inputs"] != content_inputs(root):
                    return False
                continue
            for relative, digest in stamp["inputs"].items():
                path = (root / relative).resolve()
                if not path.is_relative_to(root) or hashlib.sha256(path.read_bytes()).hexdigest() != digest:
                    return False
        return True
    except (OSError, ValueError, TypeError, AttributeError):
        return False


@contextmanager
def guard_inputs(services, extra=()):
    """Detect and roll back model edits to sources, plans and the current draft."""
    root = services.workspace
    relatives = ["customer_input.json", "order_context.json", "extracted/presentation_sources.json",
                 "extracted/presentation_guidelines.json", "planning/presentation_contract.json",
                 "planning/presentation_topics.json", "planning/presentation_claims.json",
                 "planning/presentation_outline.json", "planning/presentation_visuals.json", "final/presentation.json", *extra]
    relatives += ["planning/presentation_design.json", "reports/presentation_layout.json"]
    paths = {root / relative for relative in relatives}
    for directory in ("input", "extracted/source_media", "extracted/paginated_sources"):
        paths.update(path for path in (root / directory).rglob("*") if path.is_file())
    before = {path: path.read_bytes() if path.is_file() else None for path in paths}
    try:
        yield
    finally:
        changed = []
        for path, original in before.items():
            current = path.read_bytes() if path.is_file() else None
            if current != original:
                changed.append(str(path.relative_to(root)))
                if original is None:
                    path.unlink(missing_ok=True)
                else:
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_bytes(original)
        if changed:
            raise PresentationIntegrityError("Presentation model changed protected inputs; originals restored: " + ", ".join(sorted(changed)))


def apply_slide_repairs(original: dict, reply: dict, allowed: list[int]) -> dict:
    patches = reply.get("patches") if isinstance(reply, dict) else None
    if not isinstance(patches, list) or not patches:
        raise ValueError("Presentation repair must return a nonempty patches array; current draft preserved")
    result = deepcopy(original)
    seen = set()
    for patch in patches:
        if not isinstance(patch, dict):
            raise ValueError("Invalid slide patch; current draft preserved")
        number, slide = patch.get("slide_number"), patch.get("slide")
        if type(number) is not int or number not in allowed or number in seen or not isinstance(slide, dict):
            raise ValueError("Presentation repair tried to change an unaffected or invalid slide; current draft preserved")
        seen.add(number)
        result["slides"][number - 1] = slide
    if result == original:
        raise PresentationNoProgressError("Presentation repair made no progress; current draft preserved")
    return result
