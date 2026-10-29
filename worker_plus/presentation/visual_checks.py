"""Native PDF evidence and magnified crops for the presentation visual audit."""
from __future__ import annotations

import json
import hashlib
from pathlib import Path
import re
import unicodedata

from common.helpers import write_json
from presentation.recovery import PresentationVisualAuditError

from presentation.source_comments import POLICY_VERSION, INTERNAL_REFERENCE, expected_comments, validate_source_comments


def visual_inputs(workspace: Path, spec: dict, rules: dict) -> dict:
    def digest(value):
        return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()
    result = {"pdf_sha256": hashlib.sha256((workspace / "final/final.pdf").read_bytes()).hexdigest(),
              "pptx_sha256": hashlib.sha256((workspace / "final/final.pptx").read_bytes()).hexdigest(),
              "spec_sha256": digest(spec), "rules_sha256": digest(rules)}
    sources = workspace / "extracted/presentation_sources.json"
    if sources.is_file():
        result["sources_sha256"] = hashlib.sha256(sources.read_bytes()).hexdigest()
    manifest = workspace / "reports/presentation_layout.json"
    if rules.get("layout_version") == 2:
        result["layout_sha256"] = hashlib.sha256(manifest.read_bytes()).hexdigest()
    return result


def _font_key(name):
    return re.sub(r"^[A-Z]{6}\+", "", name).lower().replace(" ", "").replace("-regular", "").removesuffix("regular")


def compact(text):
    return "".join(char for char in text if not char.isspace() and unicodedata.category(char) != "Cf")


def validate_layout_manifest(manifest, spec, rules):
    """Check native layout structure; visual judgement remains a separate audit."""
    from presentation.design import semantic_digest
    if (manifest.get("version") != 2 or len(manifest.get("slides", [])) != len(spec["slides"])
            or manifest.get("content_sha256") != semantic_digest(spec)
            or manifest.get("font") != rules["font"] or manifest.get("style") != rules["design"]["id"]):
        raise ValueError("Presentation layout manifest is stale; rebuild the PPTX from the reviewed model")
    for index, (row, data) in enumerate(zip(manifest["slides"], spec["slides"]), 1):
        objects = row.get("objects", [])
        roles = {obj["role"] for obj in objects}
        if not row.get("source_notes") or ("cover-title" if data["layout"] == "title" else "title") not in roles:
            raise ValueError(f"Slide {index}: separate title and source reading notes are required")
        if data.get("description") and data["layout"] != "title" and "description" not in roles:
            raise ValueError(f"Slide {index}: subtitle was not rendered separately")
        for obj in objects:
            x0, y0, x1, y1 = obj["bbox"]
            if not 0 <= x0 < x1 <= 960.01 or not 0 <= y0 < y1 <= 540.01:
                raise ValueError(f"Slide {index}: {obj['role']} lies outside the slide")
            if obj.get("font_size", 22) < (12 if obj["role"] in {"citation", "page-number"} else 16):
                raise ValueError(f"Slide {index}: {obj['role']} is too small for presentation")
            if data["layout"] != "title" and obj["role"] not in {"title", "description", "citation", "page-number"} and (y0 < 142 or y1 > 492):
                raise ValueError(f"Slide {index}: {obj['role']} crosses the heading or source footer region")
        if row.get("citations") or any(o["role"] in {"citation", "primary-id", "primary-author", "primary-title"} for o in objects):
            raise ValueError(f"Slide {index}: source provenance must be in comments, not on the canvas")


def verify_citation_pixels(page, expected: list[str], destination: Path, number: int, region=None) -> dict:
    """Compare every citation glyph against an independent embedded-font render.

    Extractable PDF text alone can be invisible or covered by another object.
    Re-render the expected characters at their actual baselines, then require
    visible matching ink for every character, with no later overlapping objects.
    """
    import fitz
    from PIL import Image, ImageChops

    if not expected:
        return {"passed": True, "locators": []}
    footer_region = fitz.Rect(region) if region is not None else fitz.Rect(0, page.rect.height * .90, page.rect.width * .88, page.rect.height)
    traces = [t for t in page.get_texttrace() if fitz.Rect(t["bbox"]).intersects(footer_region)]
    chars = [(chr(c[0]), c, t) for t in traces for c in t["chars"] if compact(chr(c[0]))]
    text = "".join(c[0] for c in chars)
    fonts, loaded_fonts = {}, {}
    operations = page.get_bboxlog()
    results = []
    with fitz.open() as reference:
        ref = reference.new_page(width=page.rect.width, height=page.rect.height)

        def resolve_font(trace, char, glyph):
            key = (trace["font"], char, glyph)
            if key in fonts:
                return fonts[key]
            for entry in page.get_fonts():
                if _font_key(entry[3]) != _font_key(trace["font"]):
                    continue
                xref = entry[0]
                if xref not in loaded_fonts:
                    _, _, _, buffer = page.parent.extract_font(xref)
                    try:
                        font = fitz.Font(fontbuffer=buffer) if buffer else fitz.Font(fontname=entry[3])
                        name = f"Proof{xref}"
                        if buffer:
                            ref.insert_font(fontname=name, fontbuffer=buffer)
                        else:
                            name = entry[3]
                            ref.insert_font(fontname=name)
                        loaded_fonts[xref] = (font, name)
                    except (ValueError, RuntimeError):
                        continue
                font, name = loaded_fonts[xref]
                # Office applies Unicode bidi mirroring before drawing brackets,
                # while ToUnicode retains their logical characters. Resolve the
                # actual drawn glyph, rather than treating a mirrored bracket as
                # a missing character or relaxing the raster coverage threshold.
                variants = [char]
                mirrors = {"[": "]", "]": "[", "(": ")", ")": "(", "{": "}", "}": "{"}
                if char in mirrors:
                    variants.append(mirrors[char])
                for rendered in variants:
                    if glyph > 0 and font.has_glyph(ord(rendered)) == glyph:
                        fonts[key] = (name, rendered)
                        return fonts[key]
            raise ValueError(f"Cannot independently render citation glyph {char!r} in {trace['font']}")

        groups = []
        for locator in expected:
            match = re.search(r"(?<![\w:-])" + re.escape(compact(locator)) + r"(?![\w:-])", text)
            if not match:
                results.append({"locator": locator, "passed": False, "reason": "locator missing from drawn text"})
                continue
            selected = chars[match.start():match.end()]
            rect = fitz.Rect(selected[0][1][3])
            for _, record, _ in selected[1:]:
                rect |= fitz.Rect(record[3])
            groups.append((locator, selected, rect))
            for char, record, trace in selected:
                try:
                    font, rendered = resolve_font(trace, char, record[1])
                    ref.insert_text(record[2], rendered, fontname=font, fontsize=trace["size"], color=(0, 0, 0))
                except (ValueError, RuntimeError) as error:
                    results.append({"locator": locator, "passed": False, "reason": str(error)})
                    break
        region = footer_region
        scale = 4
        actual = page.get_pixmap(matrix=fitz.Matrix(scale, scale), clip=region, colorspace=fitz.csRGB)
        ideal = ref.get_pixmap(matrix=fitz.Matrix(scale, scale), clip=region, colorspace=fitz.csRGB)
        visible = Image.frombytes("RGB", (actual.width, actual.height), actual.samples).convert("L").point(lambda p: 255 if p < 220 else 0)
        required = Image.frombytes("RGB", (ideal.width, ideal.height), ideal.samples).convert("L").point(lambda p: 255 if p < 180 else 0)
        for index, (locator, selected, rect) in enumerate(groups, 1):
            glyphs = []
            for char, record, trace in selected:
                bounds = fitz.Rect(record[3])
                pixels = (int(bounds.x0 * scale) - actual.x, int(bounds.y0 * scale) - actual.y,
                          int(bounds.x1 * scale + 1) - actual.x, int(bounds.y1 * scale + 1) - actual.y)
                mask = required.crop(pixels)
                ink = mask.histogram()[255]
                matched = ImageChops.multiply(mask, visible.crop(pixels)).histogram()[255]
                coverage = matched / ink if ink else 0
                # A later rectangle/image can cover the text while leaving
                # searchable characters and even some dark pixels behind.
                covered = any(kind != "ignore-text" and (not kind.endswith("text") or fitz.Rect(box).intersect(bounds).get_area() > bounds.get_area() * .30)
                              and fitz.Rect(box).intersect(bounds).get_area() > .1
                              for kind, box in operations[trace["seqno"] + 1:])
                passed = (page.rect.contains(bounds) and trace["type"] == 0 and trace["opacity"] >= .95
                          and trace["size"] >= 12 and record[1] > 0 and coverage >= .98 and not covered)
                glyphs.append({"char": char, "coverage": round(coverage, 5), "expected_pixels": ink,
                               "covered": covered, "passed": bool(passed)})
            crop = (rect + (-8, -8, 8, 8)) & page.rect
            name = f"slide-{number:03}-citation-{index:02}.png"
            page.get_pixmap(matrix=fitz.Matrix(scale, scale), clip=crop).save(destination / name)
            results.append({"locator": locator, "passed": all(g["passed"] for g in glyphs),
                            "image": f"reports/visual_evidence/{name}", "glyphs": glyphs})
        # A tight actual-PDF crop avoids the extreme aspect ratio of a full
        # slide-width strip. No expected text is painted into these evidence images.
        if groups:
            footer_rect = fitz.Rect(groups[0][2])
            for _, _, rect in groups[1:]:
                footer_rect |= rect
            footer_rect = (footer_rect + (-8, -8, 8, 8)) & page.rect
            zoom = min(4, 1200 / footer_rect.width)
            page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), clip=footer_rect).save(destination / f"slide-{number:03}-footer.png")
    return {"passed": len(results) == len(expected) and all(r["passed"] for r in results), "locators": results}


def prepare_visual_evidence(workspace: Path, spec: dict, rules: dict) -> dict:
    import fitz

    destination = workspace / "reports/visual_evidence"
    destination.mkdir(parents=True, exist_ok=True)
    slides, issues = [], []
    sources = json.loads((workspace / "extracted/presentation_sources.json").read_text(encoding="utf-8"))
    provenance = validate_source_comments(workspace / "final/final.pptx", expected_comments(spec, sources, rules))
    manifest = None
    if rules.get("layout_version") == 2:
        manifest = json.loads((workspace / "reports/presentation_layout.json").read_text(encoding="utf-8"))
        validate_layout_manifest(manifest, spec, rules)
    with fitz.open(workspace / "final/final.pdf") as document:
        if len(document) != rules["slide_count"] or len(document) != len(spec["slides"]):
            raise ValueError("Presentation PDF slide count mismatch")
        for number, (page, slide) in enumerate(zip(document, spec["slides"]), 1):
            if not page.get_text().strip():
                raise ValueError(f"Presentation PDF slide {number} has no searchable text")
            fonts = [font[3].lower().replace(" ", "") for font in page.get_fonts()]
            if not any(rules["font"].lower().replace(" ", "") in font for font in fonts):
                raise RuntimeError(f"PDF font verification failed on slide {number}: {rules['font']}")
            # Footer and body views come directly from the PDF, not a resized
            # screenshot. Keep overlap at the centre of the body views.
            bounds = page.rect
            footer = fitz.Rect(0, bounds.height * .90, bounds.width, bounds.height)
            citations = manifest["slides"][number - 1]["citations"] if manifest else None
            if citations:
                footer = fitz.Rect(citations[0]["bbox"])
                for citation in citations[1:]:
                    footer |= fitz.Rect(citation["bbox"])
                footer = (footer + (-2, -2, 2, 2)) & bounds
            areas = {"footer": (footer, 3),
                     "left": (fitz.Rect(0, 0, bounds.width * .53, bounds.height * .90), 2),
                     "right": (fitz.Rect(bounds.width * .47, 0, bounds.width, bounds.height * .90), 2)}
            for label, (region, scale) in areas.items():
                page.get_pixmap(matrix=fitz.Matrix(scale, scale), clip=region).save(destination / f"slide-{number:03}-{label}.png")
            # Technical identifiers are deliberately absent; their completeness
            # is checked in native PPTX comments against current source bytes.
            expected = []
            leaked = INTERNAL_REFERENCE.findall(page.get_text())
            spans = [span for block in page.get_text("dict")["blocks"] if "lines" in block
                     for line in block["lines"] for span in line["spans"]
                     if fitz.Rect(span["bbox"]).intersects(footer)]
            text = " ".join(span["text"] for span in spans)
            missing = [locator for locator in expected if not re.search(r"(?<![\w:-])" + re.escape(compact(locator)) + r"(?![\w:-])", compact(text))]
            clipped = [span for span in spans if span["text"].strip() and not bounds.contains(fitz.Rect(span["bbox"]))]
            small = [span for span in spans if any(compact(locator) in compact(span["text"]) for locator in expected) and span["size"] < 12]
            raster = verify_citation_pixels(page, expected, destination, number, list(footer) if citations else None)
            if citations:
                for result in raster["locators"]:
                    definition = next(c for c in citations if c["text"] == result["locator"])
                    result["source_id"] = definition["locator"]
                    result["source_locators"] = definition["source_locators"]
            row = {"slide": number, "expected_locators": expected, "pdf_footer_text": text, "raster": raster,
                   "spans": [{key: span[key] for key in ("text", "bbox", "size")} for span in spans],
                   "missing_locators": missing, "clipped": bool(clipped), "small_citations": bool(small),
                   "source_comment_verified": True, "visible_internal_references": leaked}
            slides.append(row)
            if leaked:
                issues.append({"slide": number, "message": "Internal source identifier leaked into PDF"})
            if missing or clipped or small or not raster["passed"]:
                issues.append({"slide": number, "message": f"PDF footer check: missing={missing}, outside_canvas={bool(clipped)}, citation_below_12pt={bool(small)}, glyph_pixels_match={raster['passed']}; inspect reports/visual_evidence/slide-{number:03}-footer.png"})
    report = {"policy_version": POLICY_VERSION, "provenance": provenance, "inputs": visual_inputs(workspace, spec, rules), "passed": not issues, "slides": slides, "issues": issues}
    write_json(destination / "checks.json", report)
    if issues:
        raise PresentationVisualAuditError("reports/visual_evidence/checks.json", "STATUS: FAIL\nISSUES_JSON: " + json.dumps({"issues": issues}), len(slides))
    return report
