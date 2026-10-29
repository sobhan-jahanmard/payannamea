"""Chat-authored academic documents. Deterministic helpers; no model or remote writes except publish."""
from __future__ import annotations

import importlib
import json
import math
import re
from pathlib import Path
from types import SimpleNamespace

from codex_order_tools import OrderTools, hashes, read
from common.helpers import write_json, write_text
from common.input_files import target_name
from common.profiles import profile_for

OUTPUTS = ["final/final.docx", "final/final.pdf", "final/sample.docx", "final/sample.pdf"]
STEPS = ["دریافت سفارش", "بررسی ورودی و قرارداد", "خواندن منابع و شیوه‌نامه",
         "پژوهش و ثبت شواهد", "طراحی ساختار و روش", "نگارش و اجرای تحلیل",
         "بازبینی محتوا و استنادها", "ساخت Word و PDF", "بازبینی صفحات و نمونه",
         "کنترل نهایی و تحویل"]
BASE = ["customer_input.json", "planning/document_contract.json", "extracted/university_rules.json",
        "extracted/document_sources.json", "planning/resolved_source_rules.md"]
MODEL = ["research/evidence.json", "research/analysis.md", "planning/document_plan.json",
         "planning/visual_plan.json", "final/figures/manifest.json", "final/deliverable_source.md"]


def word_count(text):
    text = re.sub(r"!\[[^\]]*\]\([^)]+\)", "", text)
    text = re.sub(r"\[[0-9۰-۹٠-٩]+\]", "", text)
    return len(re.findall(r"[^\W\d_]+(?:[\u200c'-][^\W\d_]+)*", text, re.UNICODE))


class DocumentTools(OrderTools):
    outputs = OUTPUTS
    upload_keys = ("docx_file", "pdf_file", "sample_file", "sample_pdf_file")
    steps = STEPS
    publication_note = "Academic document reviewed in Codex; full Word/PDF and first-half samples."

    def services(self, audit_text=None):
        from common.runner import Services

        class ChatServices(Services):
            def run_codex(self, prompt, target):
                raise RuntimeError("Write or repair this artifact in the current chat; model subprocesses are disabled")

        return ChatServices(config=self.config, args=SimpleNamespace(offline=True, resume=True, dry_run=False),
                            workspace=self.workspace, profile=profile_for(self.context()["order"]))

    def stage(self, name, context, services):
        importlib.import_module(f"common.steps.{name}").run(context, services)

    def paths(self, directories):
        return sorted(p.relative_to(self.workspace).as_posix() for directory in directories
                      for p in (self.workspace / directory).rglob("*") if p.is_file())

    def content_paths(self):
        plan_path = self.workspace / "planning/document_plan.json"
        companions = read(plan_path).get("companions", []) if plan_path.exists() else []
        return [*BASE, *MODEL, *self.state()["input_hashes"], *self.paths(["research", "final/figures"]),
                *[item["source"] for item in companions]]

    def delivery_outputs(self):
        companions = self.context()["artifacts"].get("document_companions", [])
        return [*self.outputs, *companions]

    def prepare(self):
        self.verify_inputs()
        context = self.context()
        order = context["order"]
        profile_for(order).validate_order(order)
        if not str(order.get("title") or "").strip():
            raise ValueError("A document title is required")
        quantity = order.get("quantity_value")
        if order.get("quantity_type") not in {"pages", "words"} or type(quantity) is not int or quantity < 1:
            raise ValueError("Document quantity must be a positive integer in pages or words")
        if self.current("intake"):
            return {"reused": True, "contract": "planning/document_contract.json"}
        services = self.services()
        # Only guideline files can change typography, never an academic source PDF.
        context["artifacts"]["input_files"] = [str(self.workspace / "input/files" / target_name(f))
            for f in order.get("files", []) if f.get("file_type") == "university_guideline"]
        self.stage("03_check_intake", context, services)
        rules_path = self.workspace / "extracted/university_rules.json"
        if not rules_path.exists():
            self.stage("04_extract_university_rules", context, services)
        if order["quantity_type"] == "words":
            rules = read(rules_path)
            rules["quality"]["min_full_words"] = order["quantity_value"]
            write_json(rules_path, rules)
        context["artifacts"]["university_rules"] = "extracted/university_rules.json"
        self.stage("04a_build_order_contract", context, services)
        contract = read(self.workspace / "planning/order_execution_contract.json")
        contract.update({"order_type": order["order_type"], "source_policy": "supplied_and_verified_research",
                         "outputs": OUTPUTS, "proposal": order["order_type"] == "پروپوزال پایان‌نامه"})
        # The source policy belongs to the question, not an assumed nationality.
        contract["research_policy"]["search_order"] = ["question and specified geography", "disclosed proxy", "labelled assumption"]
        contract["research_policy"]["web_research_required"] = not any(
            f.get("file_type") != "university_guideline" for f in order.get("files", []))
        contract["research_policy"]["completion"] = (
            "Complete the literature synthesis, research design and feasibility checks; proposed data collection is future work."
            if contract["proposal"] else "Execute the stated analysis on traceable evidence; disclose unavailable data.")
        write_json(self.workspace / "planning/document_contract.json", contract)
        write_json(self.workspace / "order_context.json", context)
        self.record("intake", [*self.state()["input_hashes"], "extracted/university_rules.json",
                               "planning/document_contract.json"])
        return {"contract": "planning/document_contract.json", "missing_cover_fields": context["artifacts"]["missing_intake_fields"]}

    def extract(self):
        self.verify_inputs()
        self.require("intake")
        if self.current("sources"):
            return {"reused": True}
        from common.source_extract import extract_source
        sources = []
        for n, item in enumerate(self.context()["order"].get("files", []), 1):
            path = self.workspace / "input/files" / target_name(item)
            entry = extract_source(path, f"S{n}", self.workspace / "extracted/document_media")
            entry.update({"role": item.get("file_type"), "original_name": item.get("original_name")})
            sources.append(entry)
        write_json(self.workspace / "extracted/document_sources.json", {"sources": sources})
        self.record("sources", [*self.state()["input_hashes"], "planning/document_contract.json",
                                "extracted/university_rules.json", *self.paths(["extracted"])])
        return {"index": "extracted/document_sources.json", "sources": len(sources),
                "note": "Read every supplied file. Empty sources permit research from verified external evidence."}

    def validate(self, kind, candidate=None):
        self.verify_inputs()
        if kind == "rules":
            self.require("intake")
            value = read(candidate or self.workspace / "extracted/university_rules.json")
            from common.profile_support import DEFAULT_DOCUMENT_RULES
            for group, defaults in DEFAULT_DOCUMENT_RULES.items():
                if isinstance(defaults, dict) and (not isinstance(value.get(group), dict) or not set(defaults) <= set(value[group])):
                    raise ValueError(f"Incomplete document rule group: {group}")
            for key in ("right_cm", "left_cm", "top_cm", "bottom_cm"):
                if not 0 < float(value["page"][key]) < 10:
                    raise ValueError("Invalid page margins")
            if not 6 <= float(value["font"]["body_pt"]) <= 30 or not .5 <= float(value["paragraph"]["line_spacing"]) <= 3:
                raise ValueError("Invalid font size or line spacing")
            write_json(self.workspace / "extracted/university_rules.json", value)
            return self.prepare()
        self.require("sources")
        if kind == "evidence":
            hashes(self.workspace, [*BASE, "research/analysis.md"])
            stage = importlib.import_module("common.steps.05c_research_evidence")
            contract = read(self.workspace / "planning/document_contract.json")
            rules = (self.workspace / "planning/resolved_source_rules.md").read_text(encoding="utf-8-sig")
            required = stage.research_deliverables(contract["deliverable_contract"]["deliverables"], rules)
            value = read(candidate or self.workspace / "research/evidence.json")
            issues = stage.evidence_issues(value, required, iran_required=False)
            # Supplied-only assignments must not invent public URLs for private
            # references. Verify their quotes against immutable uploaded bytes.
            index = read(self.workspace / "extracted/document_sources.json")
            segments = {segment["id"]: segment["text"] for source in index["sources"]
                        if source.get("role") != "university_guideline" for segment in source["segments"]}
            for entry in value.get("deliverables", []) if isinstance(value, dict) else []:
                if not isinstance(entry, dict) or not entry.get("uploaded_evidence"):
                    continue
                references = entry["uploaded_evidence"]
                if not isinstance(references, list):
                    issues.append(f"{entry.get('id')}: uploaded_evidence must be an array")
                    continue
                for reference in references:
                    locator = reference.get("locator") if isinstance(reference, dict) else None
                    quote = reference.get("quote") if isinstance(reference, dict) else None
                    if locator not in segments or not isinstance(quote, str) or not quote.strip() or " ".join(quote.split()) not in " ".join(segments[locator].split()):
                        issues.append(f"{entry.get('id')}: uploaded evidence has an invalid locator or unsupported quote")
                if references:
                    missing_web = f"{entry.get('id')}: direct/proxy result needs an actual web source"
                    issues = [issue for issue in issues if issue != missing_web]
            if issues:
                raise ValueError("; ".join(issues))
            write_json(self.workspace / "research/evidence.json", value)
            self.record("evidence", [*BASE, "research/evidence.json", "research/analysis.md", *self.paths(["research"])])
            return {"passed": True, "entries": len(value["deliverables"])}
        if kind != "document":
            raise ValueError("Documents support validate rules, evidence or document")
        self.require("evidence")
        source = candidate or self.workspace / "final/deliverable_source.md"
        text = source.read_text(encoding="utf-8-sig")
        hashes(self.workspace, [p for p in self.content_paths() if p != "final/deliverable_source.md"])
        plan = read(self.workspace / "planning/document_plan.json")
        sections = plan.get("sections", [])
        if not sections or any(not isinstance(s, dict) or not s.get("id") or not s.get("title") or not isinstance(s.get("evidence_ids"), list) or not s["evidence_ids"] for s in sections):
            raise ValueError("Plan needs sections with unique IDs, titles and evidence_ids arrays")
        if len({s["id"] for s in sections}) != len(sections):
            raise ValueError("Duplicate plan section IDs")
        evidence_ids = {e["id"] for e in read(self.workspace / "research/evidence.json")["deliverables"]}
        if any(not set(s["evidence_ids"]) <= evidence_ids for s in sections):
            raise ValueError("Plan refers to unknown evidence IDs")
        missing = [s["title"] for s in sections if s["title"] not in text]
        if missing:
            raise ValueError("Missing planned sections: " + ", ".join(missing))
        parts = re.split(r"(?mi)^#\s+(?:منابع|References)\s*$", text, maxsplit=1)
        if len(parts) != 2 or not parts[1].strip() or not re.search(r"\[[0-9۰-۹٠-٩]+\]", parts[0]):
            raise ValueError("Document needs numbered in-text citations and a # منابع or # References section")
        digits = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")
        cited = set(re.findall(r"\[(\d+)\]", parts[0].translate(digits)))
        refs = re.findall(r"(?m)^\s*\[(\d+)\]", parts[1].translate(digits))
        if not cited <= set(refs) or len(refs) != len(set(refs)):
            raise ValueError("Unmatched or duplicate numbered references")
        if any(marker in text.upper() for marker in ("TODO", "TBD", "[NEEDS", "لورم")):
            raise ValueError("Unfinished document markers")
        order = self.context()["order"]
        count = word_count(parts[0])
        if order["quantity_type"] == "words" and count < order["quantity_value"]:
            raise ValueError(f"Body word count below order target ({count}/{order['quantity_value']})")
        for relative in re.findall(r"!\[[^\]]*\]\(([^)]+)\)", text):
            asset = (self.workspace / "final" / relative).resolve()
            if not asset.is_relative_to(self.workspace) or not asset.is_file():
                raise ValueError(f"Missing or external figure: {relative}")
        write_text(self.workspace / "final/deliverable_source.md", text)
        self.record("document", self.content_paths())
        return {"passed": True, "body_words": count}

    def review_inputs(self, kind):
        self.verify_inputs()
        self.require("document")
        paths = self.content_paths()
        if kind == "visual":
            self.require("render")
            paths += [*self.delivery_outputs(), *self.paths(["reports/rendered_pages"]), "reports/document_render.json"]
        return {"kind": kind, "inputs": hashes(self.workspace, paths)}

    def review(self, kind, path):
        state = self.state()
        state["checks"].pop(f"review_{kind}", None)
        self.save_state(state)
        expected = self.review_inputs(kind)["inputs"]
        text = path.read_text(encoding="utf-8-sig").strip()
        lines = text.splitlines()
        def payload(prefix):
            line = next((line for line in lines if line.startswith(prefix + ":")), "")
            return json.loads(line.split(":", 1)[1]) if line else None
        if payload("INPUTS_SHA256") != expected:
            raise ValueError("Review snapshot missing or stale")
        details = payload("ISSUES_JSON")
        if not isinstance(details, dict) or not isinstance(details.get("issues"), list):
            raise ValueError("Review needs ISSUES_JSON with issues array")
        if kind == "visual":
            required = set(read(self.workspace / "reports/document_render.json")["images"])
            reviewed = details.get("reviewed_images", [])
        else:
            required = {s["id"] for s in read(self.workspace / "planning/document_plan.json")["sections"]}
            reviewed = details.get("reviewed_sections", [])
        if not isinstance(reviewed, list) or len(reviewed) != len(set(reviewed)) or set(reviewed) != required:
            raise ValueError("Review must cover all current sections/images exactly once")
        target = f"reports/document_{kind}_audit.md"
        write_text(self.workspace / target, text + "\n")
        if lines[:1] != ["STATUS: PASS"] or details["issues"]:
            raise ValueError("Review failed; repair the documented issues before recording PASS")
        self.record(f"review_{kind}", [*expected, target])
        return {"passed": True, "review": kind}

    def build(self):
        self.verify_inputs()
        for key in ("evidence", "document", "review_content", "review_sources"):
            self.require(key)
        if self.current("build"):
            return {"reused": True}
        context, services = self.context(), self.services()
        context["artifacts"].update({"source": "final/deliverable_source.md",
                                     "resolved_source_rules": "planning/resolved_source_rules.md"})
        self.stage("09_package_docx", context, services)
        self.stage("09b_polish_cover", context, services)
        self.stage("10b_finalize_persian_pagination", context, services)
        self.stage("10c_verify_persian_pagination", context, services)
        source = self.workspace / context["artifacts"]["source"]
        docx = self.workspace / context["artifacts"]["docx"]
        gate = importlib.import_module("common.steps.10_validate_and_publish")
        gate.enforce_visual_policy(context, services, source, docx)
        rules = read(self.workspace / "extracted/university_rules.json")
        services.validate_docx(source, docx, rules, self.workspace / "reports/stage_checks/docx_quality.json", "full", context["order"])
        (self.workspace / OUTPUTS[0]).write_bytes(docx.read_bytes())
        write_json(self.workspace / "order_context.json", context)
        self.record("build", [*self.content_paths(), OUTPUTS[0]])
        return {"docx": str(self.workspace / OUTPUTS[0])}

    def render(self):
        self.verify_inputs()
        self.require("build")
        if self.current("render"):
            return {"reused": True}
        import fitz
        context, services = self.context(), self.services()
        rules = read(self.workspace / "extracted/university_rules.json")
        font = rules["font"]["persian"]
        services.export_pdf(self.workspace / OUTPUTS[0], self.workspace / OUTPUTS[1], font)
        full, sample = services.create_first_half_sample(self.workspace / OUTPUTS[0], self.workspace / OUTPUTS[2])
        services.export_pdf(self.workspace / OUTPUTS[2], self.workspace / OUTPUTS[3], font)
        # Explicit companions use this order's chosen titles; no factory-specific interim template.
        companions = []
        for item in read(self.workspace / "planning/document_plan.json").get("companions", []):
            raw = str(item.get("source") or "")
            source = (self.workspace / raw).resolve()
            if not raw.startswith("final/") or source.suffix != ".md" or not source.is_relative_to(self.workspace) or not source.is_file():
                raise ValueError("Companion source must be an existing final/*.md within this workspace")
            docx, pdf = source.with_suffix(".docx"), source.with_suffix(".pdf")
            if docx.relative_to(self.workspace).as_posix() in OUTPUTS:
                raise ValueError("Companion may not overwrite a primary delivery")
            services.write_docx(source, docx, item["title"], rules, context["order"])
            services.export_pdf(docx, pdf, font)
            companions += [docx.relative_to(self.workspace).as_posix(), pdf.relative_to(self.workspace).as_posix()]
        context["artifacts"]["document_companions"] = companions
        write_json(self.workspace / "order_context.json", context)
        images, counts = {}, {}
        for relative in [OUTPUTS[1], OUTPUTS[3], *[p for p in companions if p.endswith(".pdf")]]:
            with fitz.open(self.workspace / relative) as document:
                counts[relative] = len(document)
                for n, page in enumerate(document, 1):
                    target = f"reports/rendered_pages/{Path(relative).stem}/page-{n:04d}.png"
                    (self.workspace / target).parent.mkdir(parents=True, exist_ok=True)
                    page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5)).save(self.workspace / target)
                    images[target] = {"pdf": relative, "page": n}
        report = {"counts": counts, "images": images, "word_full_pages": full, "word_sample_pages": sample}
        write_json(self.workspace / "reports/document_render.json", report)
        self.record("render", [*self.content_paths(), *self.delivery_outputs(), "reports/document_render.json", *images])
        return report

    def finalize(self):
        self.verify_inputs()
        for key in ("intake", "sources", "evidence", "document", "review_content", "review_sources", "build", "render", "review_visual"):
            self.require(key)
        import fitz
        from docx import Document
        from common.page_budget import page_budget
        for path in [OUTPUTS[0], OUTPUTS[2], *[p for p in self.delivery_outputs()[4:] if p.endswith(".docx")]]:
            Document(self.workspace / path)
        render = read(self.workspace / "reports/document_render.json")
        counts = {}
        for relative in [p for p in self.delivery_outputs() if p.endswith(".pdf")]:
            with fitz.open(self.workspace / relative) as document:
                if not len(document):
                    raise ValueError("Empty PDF: " + relative)
                counts[relative] = len(document)
        full, sample = counts[OUTPUTS[1]], counts[OUTPUTS[3]]
        if sample != math.ceil(full / 2) or render["word_full_pages"] != full or render["word_sample_pages"] != sample:
            raise ValueError("Word/PDF or first-half sample page counts disagree")
        budget = page_budget(self.context()["order"])
        if budget and not budget["minimum"] <= full <= budget["maximum"]:
            raise ValueError(f"Final PDF outside page budget: {full}; {budget['minimum']}–{budget['maximum']}")
        report = {"passed": True, "order_id": self.state()["order_id"], "pages": counts,
                  "source_policy": self.state()["source_policy"], "outputs": hashes(self.workspace, self.delivery_outputs())}
        write_json(self.workspace / "reports/codex_delivery.json", report)
        self.record("delivery", [*self.content_paths(), *self.delivery_outputs(), "reports/codex_delivery.json"])
        return report

    def publish(self):
        # The existing API accepts four primary document files, without arbitrary attachments.
        if self.context()["artifacts"].get("document_companions"):
            raise ValueError("This API cannot upload companion reports; deliver them locally and arrange an explicit supported upload")
        return super().publish()
