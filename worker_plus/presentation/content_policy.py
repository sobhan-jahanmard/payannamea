"""Customer-facing copy rules and bibliography grounded in the uploaded document."""
from __future__ import annotations

import re
import unicodedata
from copy import deepcopy


def clean(value):
    value = unicodedata.normalize("NFKC", str(value)).translate(str.maketrans("يك", "یک"))
    return " ".join(value.replace("\u200c", " ").split()).casefold()


HEADING = re.compile(r"^(?:(?:[\d۰-۹]+[.\-–:]?\s*)+)?(?:منابع(?: و (?:م[اآ]خذ|مراجع))?|م[اآ]خذ|مراجع|فهرست (?:منابع|مراجع)|references|bibliography|works cited|منابع فارسی|منابع انگلیسی)\s*[:：]?$", re.I)
STOP = re.compile(r"^(?:پیوست|ضمیمه|appendix|appendices|acknowledg|سپاسگزاری|چکیده|abstract|نتیجه گیری|conclusion)\b", re.I)
ENTRY = re.compile(r"^(?:\[[\d۰-۹٠-٩]+\]|[\d۰-۹٠-٩]+[.)ـ])\s*")
# Detect production chatter, not legitimate subjects such as order management.
CHATTER = re.compile(
    r"(?:فایل (?:اطلاعاتی|اصلی) سفارش|(?:طبق|مطابق|براساس|بر اساس) (?:سفارش|درخواست مشتری)|"
    r"(?:این|همین) سفارش|(?:ثبت|شناسه|جزئیات|توضیحات) سفارش|مشتری خواسته|"
    r"فایل (?:آپلود|بارگذاری|ارسالی)|منابع? (?:آپلود|بارگذاری) شده|"
    r"(?:هیچ|بدون) پژوهش (?:تازه|جدید)|نام فایل اصلی|مبنای همه اسلایدها|"
    r"customer (?:order|request)|order (?:id|requirements)|uploaded (?:file|document)|"
    r"(?:as|per) (?:requested|ordered)|no (?:new|external) research|original file ?name)", re.I)


def bibliography_entries(sources):
    """Extract only an explicit bibliography, including PDF pages containing its heading.

    Each entry keeps its real segment locator; no web lookup or inferred reference.
    A short heading mentioned in a table of contents does not activate the section.
    """
    entries = []
    for source in sources.get("sources", []):
        active, current, numbered = False, None, False
        for segment in source.get("segments", []):
            lines = [line.strip() for line in segment.get("text", "").splitlines() if line.strip()]
            for line in lines:
                if HEADING.fullmatch(clean(line)):
                    active, current, numbered = True, None, False
                    continue
                if active and STOP.match(clean(line)):
                    active, current = False, None
                if not active:
                    continue
                is_numbered = bool(ENTRY.match(line))
                # Wrapped lines on a PDF page belong to the preceding entry.
                continuation = current is not None and current["locator"] == segment["id"] and (numbered and not is_numbered)
                if continuation:
                    current["text"] += " " + line
                else:
                    current = {"source_id": source["id"], "locator": segment["id"], "text": line}
                    entries.append(current)
                numbered = numbered or is_numbered
    return entries


def compact_bibliography_points(spec, sources, max_chars=240):
    """Use exact short bibliography excerpts on slides; retain full evidence."""
    result = deepcopy(spec)
    entries = bibliography_entries(sources)
    for slide in result.get("slides", []):
        if slide.get("section") != "references":
            continue
        evidence = slide.get("evidence", [])
        for index, point in enumerate(slide.get("points", [])):
            if not isinstance(point, str) or len(point) <= max_chars:
                continue
            matches = (entry for entry in entries if clean(point) in clean(entry["text"])
                       and any(e.get("locator") == entry["locator"]
                               and clean(point) in clean(e.get("quote", "")) for e in evidence))
            if not next(matches, None):
                continue
            prefix = point[:max_chars]
            sentence_ends = [match.start() for match in re.finditer(r"[.!?؟](?=\s)", prefix)
                             if match.start() >= max_chars // 2]
            if sentence_ends:
                excerpt = prefix[:sentence_ends[-1] + 1]
            else:
                boundary = prefix.rfind(" ")
                excerpt = prefix[:boundary] if boundary >= max_chars // 2 else prefix
            if len(clean(excerpt)) >= 24:
                slide["points"][index] = excerpt
    return result


def visible_text(slide):
    """Enumerate rendered text, excluding notes and internal evidence metadata."""
    def strings(value):
        if isinstance(value, str):
            yield value
        elif isinstance(value, list):
            for item in value:
                yield from strings(item)
        elif isinstance(value, dict):
            for key, item in value.items():
                if key not in {"locator", "relationship", "type", "image_id"}:
                    yield from strings(item)
    for key in ("title", "description", "points", "caption", "table", "chart", "visual"):
        yield from strings(slide.get(key))


def policy_violations(spec, sources):
    entries = bibliography_entries(sources)
    filenames = {clean(s.get(key, "")) for s in sources.get("sources", []) for key in ("name", "original_name")} - {""}
    issues = []
    for number, slide in enumerate(spec.get("slides", []), 1):
        texts = list(visible_text(slide))
        if any(CHATTER.search(clean(text)) for text in [*texts, slide.get("notes", "")]):
            issues.append((number, "Production/order/upload commentary is forbidden in presentation copy and speaker notes"))
        if any(filename in clean(text) for text in texts for filename in filenames):
            issues.append((number, "Source filenames belong only in preparation notes, never in slide content or bibliography"))
        if slide.get("section") != "references":
            continue
        if not entries:
            issues.append((number, "No bibliography exists in the original source; replace this references slide with substantive content, preserving slide count"))
            continue
        if (slide.get("layout") != "statement" or
                clean(slide.get("title", "")) not in {"منابع", "مراجع", "references", "bibliography"} or
                any(slide.get(key) for key in ("description", "caption", "table", "chart", "visual", "image_id"))):
            issues.append((number, "References must be a plain bibliography, without source/use tables or production explanations"))
        points = slide.get("points", [])
        evidence = slide.get("evidence", [])
        if not points:
            issues.append((number, "References must contain real bibliographic entries"))
        for point in points:
            matches = [entry for entry in entries if len(clean(point)) >= 24 and clean(point) in clean(entry["text"])]
            if not any(e.get("locator") == entry["locator"] and clean(point) in clean(e.get("quote", "")) for entry in matches for e in evidence):
                issues.append((number, "Each reference must be an exact excerpt of an original bibliography entry with matching evidence; invented/abbreviated organizations are insufficient"))
                break
    if entries and not any(slide.get("section") == "references" for slide in spec.get("slides", [])):
        issues.append((None, "Original source has a bibliography; include a references slide with real entries"))
    return issues


def validate_content_policy(spec, sources):
    issues = policy_violations(spec, sources)
    if issues:
        number, message = issues[0]
        raise ValueError(f"Slide {number}: {message}" if number else message)
