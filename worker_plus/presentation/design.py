"""Versioned presentation styles shared with the order form."""
from __future__ import annotations

import ctypes
import hashlib
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def catalog():
    bundled = ROOT / "catalog.json"
    source = ROOT.parents[1] / "frontend/src/lib/presentation-catalog.json"
    return json.loads((bundled if bundled.exists() else source).read_text(encoding="utf-8"))


def resolve_design(order: dict) -> dict:
    data = catalog()
    style_id = order.get("presentation_style") or data["default_style"]
    style = next((s for s in data["styles"] if s["id"] == style_id), None)
    if not style:
        raise ValueError(f"Unknown presentation style: {style_id}")
    font = order.get("presentation_font") or data["default_font"]
    if font not in {f["id"] for f in data["fonts"]}:
        raise ValueError(f"Unknown presentation font: {font}")
    return {**style, "font": font, "catalog_version": data["version"], "renderer": "pptxgenjs", "renderer_version": 2}


def ensure_font(family: str):
    """Register packaged OFL fonts before Office starts; never silently substitute."""
    from matplotlib import font_manager
    if family == "Vazirmatn":
        files = list((ROOT / "assets/fonts").glob("Vazirmatn-*.ttf"))
        if not files:
            raise RuntimeError("Bundled Vazirmatn font is missing; reinstall the presentation runtime")
        for file in files:
            font_manager.fontManager.addfont(str(file))
            if os.name == "nt":
                if not ctypes.windll.gdi32.AddFontResourceExW(str(file), 0, 0):
                    raise RuntimeError(f"Could not register presentation font: {file.name}")
        if os.name == "nt":
            ctypes.windll.user32.SendNotifyMessageW(0xFFFF, 0x001D, 0, 0)
    try:
        path = font_manager.findfont(font_manager.FontProperties(family=family), fallback_to_default=False)
    except ValueError as error:
        raise RuntimeError(f"Selected presentation font is not installed: {family}") from error
    return str(path)


def semantic_contract(contract: dict) -> dict:
    return {key: value for key, value in contract.items() if key not in {
        "design", "font", "title_pt", "body_pt", "citation_pt", "presentation_style", "presentation_font", "layout_version", "schema_version"}}


def semantic_spec(spec: dict) -> dict:
    return {**spec, "slides": [{key: value for key, value in slide.items() if key not in {"layout", "design_variant", "source_notes"}}
                              for slide in spec.get("slides", [])]}


def semantic_digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()


def content_inputs(workspace: Path):
    read = lambda name: json.loads((workspace / name).read_text(encoding="utf-8"))
    sources = read("extracted/presentation_sources.json")
    stable_sources = []
    for source in sources["sources"]:
        stable_sources.append({"id": source["id"], "name": source.get("name"), "sha256": source.get("sha256"),
                               "segments": [{"id": segment["id"], "text": segment["text"]} for segment in source["segments"]],
                               "images": [{"id": image["id"], "sha256": hashlib.sha256((workspace / image["path"]).read_bytes()).hexdigest()} for image in source["images"]]})
    result = {"content": semantic_digest(semantic_spec(read("final/presentation.json"))),
              "sources": semantic_digest(stable_sources), "requirements": semantic_digest(semantic_contract(read("planning/presentation_contract.json")))}
    if read("planning/presentation_contract.json").get("evidence_policy_version") == 2:
        result["claims"] = semantic_digest(read("planning/presentation_claims.json"))
    if read("planning/presentation_contract.json").get("analytical_assurance_version") == 1:
        result["analysis"] = semantic_digest(read("planning/presentation_analysis.json"))
    return result
