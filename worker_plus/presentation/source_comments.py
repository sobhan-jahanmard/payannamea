"""Keep source provenance in native PowerPoint comments, never on the canvas."""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import posixpath
import re
import zipfile
from lxml import etree

from presentation.source_pages import slide_source_notes, format_source_notes

POLICY_VERSION = 3
AUTHOR = "Daneshyar references"
P = "http://schemas.openxmlformats.org/presentationml/2006/main"
R = "http://schemas.openxmlformats.org/package/2006/relationships"
CT = "http://schemas.openxmlformats.org/package/2006/content-types"
REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/"
INTERNAL_REFERENCE = re.compile(r"(?:\bSource|منبع)\s+S\d+\b|\b[SG]\d+:(?:block|table|page|slide|figure|metadata)[\w:-]*", re.I)


def source_comment_text(slide, sources, rtl=True, require_pages=True):
    try:
        reading = format_source_notes(slide_source_notes(slide, sources), rtl)
    except ValueError:
        if require_pages:
            raise
        reading = "Source provenance (physical pagination unavailable)"
        reading += "\n" + "\n".join(s.get("original_name", s.get("name", s["id"])) for s in sources["sources"])
    evidence = "\n".join(f"{e['locator']}: {e['quote']}" for e in slide.get("evidence", []))
    metadata = "\n".join(f"{e['locator']}: {e['quote']}" for e in slide.get("metadata_evidence", []))
    return "\n\n".join(part for part in (reading, evidence, metadata) if part)


def expected_comments(spec, sources, rules):
    return [source_comment_text(s, sources, rules.get("rtl", True), rules.get("layout_version") == 2)
            for s in spec["slides"]]


def _xml(data):
    return etree.fromstring(data)


def _serialize(root):
    return etree.tostring(root, encoding="UTF-8", xml_declaration=True, standalone=True)


def _rels(data, path):
    return _xml(data[path]) if path in data else etree.Element(f"{{{R}}}Relationships", nsmap={None: R})


def _relation(root, kind, target):
    for rel in root:
        if rel.get("Type") == REL + kind:
            return rel
    ids = {r.get("Id") for r in root}
    index = 1
    while f"rId{index}" in ids:
        index += 1
    return etree.SubElement(root, f"{{{R}}}Relationship", Id=f"rId{index}", Type=REL + kind, Target=target)


def add_source_comments(target: Path, texts):
    """Write idempotent classic OOXML comments, preserving other authors."""
    with zipfile.ZipFile(target) as package:
        data = {item.filename: package.read(item) for item in package.infolist()}
    authors_path = "ppt/commentAuthors.xml"
    authors = _xml(data[authors_path]) if authors_path in data else etree.Element(f"{{{P}}}cmAuthorLst", nsmap={"p": P})
    author = next((a for a in authors if a.get("name") == AUTHOR), None)
    if author is None:
        author_id = str(max([int(a.get("id")) for a in authors] + [-1]) + 1)
        author = etree.SubElement(authors, f"{{{P}}}cmAuthor", id=author_id, name=AUTHOR, initials="DR", lastIdx="0", clrIdx="0")
    author_id = author.get("id")
    author.set("lastIdx", str(len(texts)))
    types = _xml(data["[Content_Types].xml"])

    def content_type(path, suffix):
        name = "/" + path
        if not any(n.get("PartName") == name for n in types):
            etree.SubElement(types, f"{{{CT}}}Override", PartName=name,
                             ContentType="application/vnd.openxmlformats-officedocument.presentationml." + suffix + "+xml")

    content_type(authors_path, "commentAuthors")
    presentation_rels = _rels(data, "ppt/_rels/presentation.xml.rels")
    _relation(presentation_rels, "commentAuthors", "commentAuthors.xml")
    data["ppt/_rels/presentation.xml.rels"] = _serialize(presentation_rels)
    data[authors_path] = _serialize(authors)
    for number, text in enumerate(texts, 1):
        rel_path = f"ppt/slides/_rels/slide{number}.xml.rels"
        rels = _rels(data, rel_path)
        relation = _relation(rels, "comments", f"../comments/comment{number}.xml")
        path = posixpath.normpath(posixpath.join("ppt/slides", relation.get("Target")))
        root = _xml(data[path]) if path in data else etree.Element(f"{{{P}}}cmLst", nsmap={"p": P})
        for node in list(root):
            if node.get("authorId") == author_id:
                root.remove(node)
        cm = etree.SubElement(root, f"{{{P}}}cm", authorId=author_id, idx=str(number),
                              dt=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"))
        etree.SubElement(cm, f"{{{P}}}pos", x="0", y="0")
        etree.SubElement(cm, f"{{{P}}}text").text = text
        data[path] = _serialize(root)
        data[rel_path] = _serialize(rels)
        content_type(path, "comments")
    data["[Content_Types].xml"] = _serialize(types)
    temporary = target.with_suffix(".source-comments.pptx")
    with zipfile.ZipFile(temporary, "w", zipfile.ZIP_DEFLATED) as package:
        for name, value in data.items():
            package.writestr(name, value)
    temporary.replace(target)


def validate_source_comments(target: Path, texts):
    with zipfile.ZipFile(target) as package:
        authors = _xml(package.read("ppt/commentAuthors.xml"))
        author_ids = {a.get("id") for a in authors if a.get("name") == AUTHOR}
        for number, expected in enumerate(texts, 1):
            rels = _xml(package.read(f"ppt/slides/_rels/slide{number}.xml.rels"))
            relation = next((r for r in rels if r.get("Type") == REL + "comments"), None)
            if relation is None:
                raise ValueError(f"Slide {number}: source comment missing")
            path = posixpath.normpath(posixpath.join("ppt/slides", relation.get("Target")))
            root = _xml(package.read(path))
            actual = [c.findtext(f"{{{P}}}text") for c in root if c.get("authorId") in author_ids]
            if actual != [expected]:
                raise ValueError(f"Slide {number}: source comment is missing or stale")
            slide = _xml(package.read(f"ppt/slides/slide{number}.xml"))
            visible = " ".join(slide.xpath('//*[local-name()="t"]/text()'))
            if INTERNAL_REFERENCE.search(visible):
                raise ValueError(f"Slide {number}: internal source identifier leaked onto slide")
    return {"passed": True, "slides": len(texts), "storage": "powerpoint_comments"}
