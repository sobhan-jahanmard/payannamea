"""Build a presentation payload without mutating the reviewed content model."""
from __future__ import annotations

import json
from pathlib import Path
import os
import shutil
import subprocess
import sys
import tempfile
import zipfile

from common.helpers import write_json
from presentation.design import ROOT, ensure_font, resolve_design, semantic_digest
from presentation.source_pages import slide_source_notes, format_source_notes


class PresentationDesignError(RuntimeError):
    restart_step = "09_package_docx"
    repair_kind = "rendering"
    retryable = False


def apply_script_fonts(target: Path, family: str, rtl=True):
    """Office charts otherwise inherit the theme's Arabic fallback font."""
    from lxml import etree
    namespace = "http://schemas.openxmlformats.org/drawingml/2006/main"
    q = lambda name: f"{{{namespace}}}{name}"
    temporary = target.with_suffix(".font-normalized.pptx")
    with zipfile.ZipFile(target) as source, zipfile.ZipFile(temporary, "w", zipfile.ZIP_DEFLATED) as output:
        for entry in source.infolist():
            data = source.read(entry.filename)
            if entry.filename.startswith("ppt/") and entry.filename.endswith(".xml"):
                root = etree.fromstring(data)
                for properties in root.iter():
                    if properties.tag in {q("rPr"), q("defRPr"), q("endParaRPr")}:
                        if rtl and any(parent.tag == q("tc") for parent in properties.iterancestors()):
                            properties.set("lang", "fa-IR")
                        for script in ("latin", "ea", "cs"):
                            node = properties.find(q(script))
                            if node is None:
                                node = etree.SubElement(properties, q(script))
                            node.set("typeface", family)
                    elif properties.tag in {q("latin"), q("ea"), q("cs")} or (properties.tag == q("font") and properties.get("script") == "Arab"):
                        properties.set("typeface", family)
                    elif properties.tag == q("pPr") and any(parent.tag == q("tc") for parent in properties.iterancestors()):
                        properties.set("rtl", "1" if rtl else "0")
                data = etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True)
            output.writestr(entry, data)
    temporary.replace(target)


def build_designed_pptx(spec, contract, sources, target: Path, workspace: Path):
    design = contract.get("design") or resolve_design(contract)
    font = contract.get("font") or design["font"]
    try:
        font_file = ensure_font(font)
    except RuntimeError as error:
        raise PresentationDesignError(str(error)) from error
    images = {image["id"]: image for source in sources["sources"] for image in source["images"]}
    slides = []
    for number, source in enumerate(spec["slides"], 1):
        data = dict(source)
        source_notes = slide_source_notes(data, sources)
        data["source_notes"] = source_notes
        data["speaker_notes"] = format_source_notes(source_notes, contract.get("rtl", True)) + "\n\n" + data["notes"] + "\n\nEvidence:\n" + "\n".join(f"{e['locator']}: {e['quote']}" for e in data.get("evidence", []))
        if data.get("points"):
            data["speaker_notes"] += "\n\n" + ("جزئیات تکمیلی اسلاید:" if contract.get("rtl", True) else "Slide talking points:") + "\n" + "\n".join(data["points"])
        if data.get("metadata_evidence"):
            data["speaker_notes"] += "\n\nSource file identity:\n" + "\n".join(f"{e['locator']}: {e['quote']}" for e in data["metadata_evidence"])
        citations = []
        for item in source_notes:
            # Human-readable references; full non-contiguous ranges and internal
            # evidence locators are retained in the speaker notes and manifest.
            ranges = ", ".join(str(a) if a == b else f"{a}-{b}" for a, b in item["ranges"][:2])
            extra = " +" if len(item["ranges"]) > 2 else ""
            citations.append({"locator": item["source_id"], "text": f"[{item['source_number']}] pp. {ranges}{extra}",
                              "source_locators": item["locators"]})
        data["citations"] = citations
        if data.get("image_id"):
            image = images[data["image_id"]]
            data["image_path"] = str((workspace / image["path"]).resolve())
            from PIL import Image
            with Image.open(data["image_path"]) as bitmap:
                data["image_size"] = list(bitmap.size)
        slides.append(data)
    target.parent.mkdir(parents=True, exist_ok=True)
    node = os.environ.get("WORKER_PLUS_NODE") or shutil.which("node")
    if not node:
        raise PresentationDesignError("Presentation renderer requires Node.js 20+; configure WORKER_PLUS_NODE")
    if not (ROOT / "runtime/node_modules/pptxgenjs").is_dir():
        raise PresentationDesignError("Presentation runtime is missing: run npm ci in presentation/runtime")
    payload = {"slides": slides, "contract": contract, "design": {**design, "font": font}, "target": str(target.resolve()),
               "content_sha256": semantic_digest(spec), "design_sha256": semantic_digest(design), "font_file": font_file}
    with tempfile.TemporaryDirectory(prefix="daneshyar-deck-") as directory:
        request = Path(directory) / "request.json"
        write_json(request, payload)
        result = subprocess.run([node, str(ROOT / "runtime/render.mjs"), str(request)], capture_output=True, text=True, encoding="utf-8", timeout=180,
                                env={**os.environ, "ELECTRON_RUN_AS_NODE": "1"})
        if result.returncode:
            raise PresentationDesignError("Presentation layout failed; reviewed content was preserved. " + result.stderr[-3500:])
    # Font embedding makes the editable PPTX portable to customer machines.
    manifest = json.loads(target.with_suffix(".layout.json").read_text(encoding="utf-8"))
    from presentation.visual_checks import validate_layout_manifest
    try:
        validate_layout_manifest(manifest, spec, {**contract, "font": font, "design": design})
    except ValueError as error:
        raise PresentationDesignError(str(error)) from error
    apply_script_fonts(target, font, contract.get("rtl", True))
    if os.name == "nt":
        subprocess.run([sys.executable, "-m", "presentation.embed_fonts", str(target.resolve()), font],
                       cwd=str(ROOT.parent), check=True, timeout=180)
    return manifest
