"""Deterministic order tools for a Codex conversation. Never starts an AI worker."""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import unquote, urlparse

from common import api
from common.config import WORKER_ROOT, load_config
from common.execution_lock import execution_lock
from common.helpers import write_json, write_text
from common.input_files import materialize_local_file, target_name
from common.local_reviews import collect_review_scores, verify_review_scores
from common.profiles import profile_for
from presentation import profile, workflow

STEPS = ["دریافت سفارش", "بررسی ورودی و قرارداد", "خواندن فایل‌های منبع",
         "انتخاب مطالب اصلی و مشخص‌کردن محل آن‌ها در منبع", "طرح روایت اسلایدها", "ساخت محتوای اسلایدها",
         "اعتبارسنجی محتوا و منابع", "ساخت و رندر پاورپوینت", "بازبینی بصری و اصلاح",
         "کنترل نهایی و تحویل"]
BASE = ["customer_input.json", "planning/presentation_contract.json",
        "extracted/presentation_sources.json", "extracted/presentation_guidelines.json"]
CONTENT = BASE + ["planning/presentation_claims.json", "planning/presentation_analysis.json",
                  "final/presentation.json"]
OUTPUTS = ["final/final.pptx", "final/final.pdf", "final/sample.pptx", "final/sample.pdf"]
VALIDATORS = {"claims": "planning/presentation_claims.json",
              "analysis": "planning/presentation_analysis.json", "slides": "final/presentation.json"}
REVIEW_NAMES = {"content": "presentation_content_audit.md", "sources": "presentation_source_audit.md",
                "visual": "presentation_visual_audit.md"}
ORDER_FIELDS = ("id", "order_type", "title", "course_name", "student_name", "student_number",
                "university", "instructor_name", "language", "quantity_type", "quantity_value",
                "requires_charts", "notes", "admin_notes", "admin_internal_rules",
                "presentation_style", "presentation_font", "presentation_options", "files")
DOCUMENT_FIELDS = ("degree", "field_of_study", "faculty", "department", "advisor_name",
                   "consultant_name", "title_english", "keywords", "abstract", "methodology",
                   "references", "review_notes")
SKILLS = {"پایان‌نامه کارشناسی": "daneshyar-bachelor-thesis",
          "پایان‌نامه کارشناسی ارشد": "daneshyar-master-thesis",
          "پروپوزال پایان‌نامه": "daneshyar-thesis-proposal",
          "تحقیق دانشگاهی": "daneshyar-university-research",
          "ارائه و پاورپوینت": "daneshyar-presentation"}


def now():
    return datetime.now(timezone.utc).isoformat()


def read(path: Path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def digest(path: Path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def order_id(value: str):
    parsed = urlparse(value)
    identifier = unquote(parsed.path.rstrip("/").split("/")[-1]) if parsed.scheme else value
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,127}", identifier):
        raise ValueError("Use an order ID or an order URL ending in its ID")
    return identifier


def signature(order):
    value = {key: order.get(key) for key in ORDER_FIELDS}
    # Preserve signatures for existing presentation workspaces.
    if order.get("order_type") != profile.ORDER_TYPE:
        value.update({key: order.get(key) for key in DOCUMENT_FIELDS})
    value["files"] = [{key: f.get(key) for key in ("id", "file_type", "original_name", "stored_name", "size_bytes", "url")}
                      for f in order.get("files", [])]
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def hashes(workspace: Path, paths):
    result = {}
    for relative in sorted(set(paths)):
        path = (workspace / relative).resolve()
        if not path.is_relative_to(workspace.resolve()) or not path.is_file():
            raise ValueError(f"Required workspace file is missing: {relative}")
        result[relative] = digest(path)
    return result


class OrderTools:
    outputs = OUTPUTS
    upload_keys = ("pptx_file", "pdf_file", "sample_file", "sample_pdf_file")
    steps = STEPS
    publication_note = "Source-only presentation, reviewed in Codex; all slides and native rendering checked."
    def __init__(self, workspace: Path, config=None):
        self.workspace = workspace.resolve()
        self.config = config

    @property
    def state_path(self):
        return self.workspace / "codex_order_state.json"

    def state(self):
        return read(self.state_path)

    def context(self):
        return read(self.workspace / "order_context.json")

    def save_state(self, state):
        state["updated_at"] = now()
        write_json(self.state_path, state)

    def services(self, audit_text=None):
        import shutil
        source = WORKER_ROOT / ".agents/skills/academic-presentation"
        shutil.copytree(source, self.workspace / ".agents/skills/academic-presentation", dirs_exist_ok=True)
        def supplied_review(_prompt, target):
            if audit_text is None:
                raise RuntimeError("This tool cannot call a model; perform the task in the current Codex chat")
            write_text(target, audit_text)
        return SimpleNamespace(workspace=self.workspace, profile=profile, config=self.config,
                               args=SimpleNamespace(offline=True), run_codex=supplied_review)

    def record(self, key, paths, **extra):
        state = self.state()
        if key in {"build", "render", "review_visual", "delivery"} and self.context()["order"]["order_type"] == profile.ORDER_TYPE:
            from presentation.source_comments import POLICY_VERSION
            extra["source_comment_policy"] = POLICY_VERSION
        state.setdefault("checks", {})[key] = {"inputs": hashes(self.workspace, paths), "at": now(), **extra}
        self.save_state(state)

    def current(self, key):
        stamp = self.state().get("checks", {}).get(key)
        if not stamp:
            return False
        if key in {"build", "render", "review_visual", "delivery"} and self.context()["order"]["order_type"] == profile.ORDER_TYPE:
            from presentation.source_comments import POLICY_VERSION
            if stamp.get("source_comment_policy") != POLICY_VERSION:
                return False
        try:
            return bool(stamp["inputs"]) and hashes(self.workspace, stamp["inputs"]) == stamp["inputs"]
        except (ValueError, OSError):
            return False

    def require(self, key):
        if not self.current(key):
            raise ValueError(f"Missing or stale '{key}' check; validate only its responsible inputs again")

    def verify_inputs(self):
        state = self.state()
        if hashes(self.workspace, state["input_hashes"]) != state["input_hashes"]:
            raise ValueError("Original order inputs changed; create a separate revision workspace")
        if read(self.workspace / "customer_input.json") != self.context()["order"]:
            raise ValueError("Order snapshot and context disagree")

    def fetch(self, identifier=None, order_file: Path | None = None):
        if order_file:
            order = read(order_file)
            if "customerInput" in order:
                order = order["customerInput"]
            identifier = order_id(str(order.get("id") or ""))
        else:
            identifier = order_id(identifier or "")
            order = api.fetch_order_read_only(self.config, identifier)
        if order.get("id") != identifier:
            raise ValueError("Order ID does not match the requested ID")
        active_profile = profile_for(order)
        active_profile.validate_order(order)
        if self.state_path.exists():
            self.verify_inputs()
            if self.state()["order_signature"] != signature(order):
                raise ValueError("Order changed; preserve this workspace and use --workspace for a new revision")
            return {"workspace": str(self.workspace), "order_id": identifier, "type": order["order_type"],
                    "skill": SKILLS[order["order_type"]], "reused": True}
        incomplete = self.workspace / "fetch_incomplete.json"
        if self.workspace.exists() and any(self.workspace.iterdir()):
            if not incomplete.is_file() or read(incomplete).get("order_signature") != signature(order):
                raise ValueError("Refusing to initialize a nonempty workspace without matching Codex order state")
        names = [target_name(item) for item in order.get("files", [])]
        if len(names) != len(set(name.casefold() for name in names)):
            raise ValueError("Uploaded files have colliding staged names; resolve before downloading")
        self.workspace.mkdir(parents=True, exist_ok=True)
        write_json(incomplete, {"order_signature": signature(order), "order_id": identifier})
        paths = []
        for item in order.get("files", []):
            target = self.workspace / "input/files" / target_name(item)
            local_item = dict(item)
            if order_file:
                for key in ("local_path", "file_path", "path"):
                    if local_item.get(key):
                        local_item[key] = str((order_file.parent / local_item[key]).resolve())
            else:
                for key in ("local_path", "file_path", "path"):
                    local_item.pop(key, None)
            local = materialize_local_file(self.workspace, WORKER_ROOT / "workspace", identifier, local_item, target)
            if local is None:
                if order_file:
                    raise ValueError(f"Local input missing: {item.get('original_name')}; set local_path in the order JSON")
                url = str(item.get("url") or "")
                if not url.startswith("/") or url.startswith("//"):
                    raise ValueError("Download URL must be a backend-relative file URL")
                api.download_file(self.config, url, target)
            expected = int(item.get("size_bytes") or 0)
            if not target.is_file() or not target.stat().st_size or (expected and target.stat().st_size != expected):
                raise ValueError(f"Incomplete order input: {target.name}")
            paths.append(target.relative_to(self.workspace).as_posix())
        for folder in ("planning", "extracted", "drafts", "final", "reports/stage_checks"):
            (self.workspace / folder).mkdir(parents=True, exist_ok=True)
        write_json(self.workspace / "customer_input.json", order)
        context = {"order_id": identifier, "order": order, "status": "in_progress", "mode": "full",
                   "offline": True, "completed_steps": [], "artifacts": {}, "errors": []}
        write_json(self.workspace / "order_context.json", context)
        self.save_state({"version": 1, "order_id": identifier, "order_signature": signature(order),
                         "source_policy": ("supplied_files_only" if order["order_type"] == profile.ORDER_TYPE
                                           else "supplied_and_verified_research"), "progress": [], "checks": {},
                         "input_hashes": hashes(self.workspace, ["customer_input.json", *paths])})
        incomplete.unlink()
        return {"workspace": str(self.workspace), "order_id": identifier, "type": order["order_type"],
                "skill": SKILLS[order["order_type"]]}

    def prepare(self):
        self.verify_inputs()
        if self.current("intake"):
            return {"reused": True}
        context, services = self.context(), self.services()
        workflow.check_intake(context, services)
        workflow.rules(context, services)
        workflow.build_contract(context, services)
        # The chat-native skill replaces the worker's stage-prompt routing.
        write_json(self.workspace / "order_context.json", context)
        self.record("intake", [*self.state()["input_hashes"], "planning/presentation_contract.json",
                                "planning/presentation_design.json"])
        return {"contract": "planning/presentation_contract.json", "source_policy": "supplied_files_only"}

    def extract(self):
        self.verify_inputs()
        self.require("intake")
        if self.current("sources"):
            return {"reused": True}
        context = self.context()
        workflow.extract(context, self.services())
        workflow.resolve(context, self.services())
        from presentation.assurance import source_topics
        index = read(self.workspace / BASE[2])
        write_json(self.workspace / "planning/presentation_topics.json", source_topics(index))
        write_json(self.workspace / "order_context.json", context)
        extra = [p.relative_to(self.workspace).as_posix() for p in (self.workspace / "extracted").rglob("*") if p.is_file()]
        self.record("sources", [*self.state()["input_hashes"], *BASE, "planning/presentation_topics.json", *extra])
        from presentation.analysis import required_categories
        return {"sources": len(index["sources"]), "segments": sum(len(s["segments"]) for s in index["sources"]),
                "index": BASE[2], "topics": "planning/presentation_topics.json",
                "required_analysis_categories": required_categories(source_topics(index))}

    def validate(self, kind, candidate: Path | None = None):
        if kind not in VALIDATORS:
            raise ValueError("Presentations support validate claims, analysis or slides")
        self.verify_inputs()
        self.require("sources")
        from presentation.assurance import source_topics, validate_claim_ledger
        from presentation.analysis import validate_packet
        index = read(self.workspace / BASE[2])
        topics = source_topics(index)
        if kind == "analysis":
            self.require("claims")
        if kind == "slides":
            self.require("claims")
            self.require("analysis")
        target = self.workspace / VALIDATORS[kind]
        value = read(candidate or target)
        if kind == "claims":
            normalized = validate_claim_ledger(value, index, topics)
        elif kind == "analysis":
            normalized = validate_packet(value, index, topics)
        else:
            normalized = value
            # Existing slide validators also read workspace ledgers and emit useful per-slide reports.
            # Stage the candidate temporarily, restoring the last valid model on any rejection.
            previous = target.read_bytes() if target.exists() else None
            try:
                write_json(target, value)
                workflow.validate(self.context(), self.services())
                from presentation.content_policy import policy_violations
                issues = policy_violations(value, index)
                if issues:
                    raise ValueError("; ".join(f"Slide {n}: {message}" for n, message in issues))
            except Exception:
                if previous is None:
                    target.unlink(missing_ok=True)
                else:
                    target.write_bytes(previous)
                raise
        write_json(target, normalized)
        paths = [*BASE, "planning/presentation_topics.json", VALIDATORS[kind]]
        if kind in {"analysis", "slides"}:
            paths.append(VALIDATORS["claims"])
        if kind == "slides":
            paths.append(VALIDATORS["analysis"])
        self.record(kind, paths)
        return {"validated": kind, "artifact": VALIDATORS[kind], "passed": True}

    def review_inputs(self, kind):
        self.verify_inputs()
        self.require("slides")
        paths = [*CONTENT, *self.state()["input_hashes"]]
        if kind == "visual":
            self.require("render")
            paths += [*OUTPUTS, "reports/presentation_layout.json", "reports/visual_evidence/checks.json"]
            paths += [p.relative_to(self.workspace).as_posix() for directory in ("reports/rendered_slides", "reports/visual_evidence")
                      for p in (self.workspace / directory).rglob("*") if p.is_file()]
        return {"kind": kind, "inputs": hashes(self.workspace, paths)}

    def review(self, kind, path: Path):
        expected = self.review_inputs(kind)["inputs"]
        text = path.read_text(encoding="utf-8-sig").strip()
        if text.splitlines()[:1] not in (["STATUS: PASS"], ["STATUS: FAIL"]):
            raise ValueError("Review must start with STATUS: PASS or STATUS: FAIL")
        line = next((line for line in text.splitlines() if line.startswith("INPUTS_SHA256:")), "")
        if not line or json.loads(line.split(":", 1)[1]) != expected:
            raise ValueError("Review snapshot missing or stale; get review-inputs, inspect those inputs and include INPUTS_SHA256")
        # Run existing review schema/coverage, input guards, and native glyph reconciliation.
        workflow.audit(self.services(text), REVIEW_NAMES[kind], "Review supplied by the current Codex conversation")
        paths = [*CONTENT, f"reports/{REVIEW_NAMES[kind]}", f"reports/{Path(REVIEW_NAMES[kind]).stem}.json"]
        if kind == "visual":
            paths += [*OUTPUTS, "reports/presentation_visual_decision.json", "reports/visual_evidence/checks.json"]
        self.record(f"review_{kind}", paths)
        return {"passed": True, "review": kind}

    def build(self):
        self.verify_inputs()
        for key in ("slides", "review_content", "review_sources"):
            self.require(key)
        if self.current("build"):
            return {"reused": True}
        context = self.context()
        workflow.package(context, self.services())
        workflow.cover(context, self.services())
        workflow.sample(context, self.services())
        write_json(self.workspace / "order_context.json", context)
        self.record("build", [*CONTENT, "final/final.pptx", "final/sample.pptx",
                               "reports/presentation_layout.json", "planning/presentation_design.json"])
        return {"pptx": str(self.workspace / OUTPUTS[0]), "sample": str(self.workspace / OUTPUTS[2])}

    def render(self):
        self.verify_inputs()
        self.require("build")
        if self.current("render"):
            return {"reused": True}
        context = self.context()
        workflow.render(context, self.services())
        from presentation.visual_checks import prepare_visual_evidence
        prepare_visual_evidence(self.workspace, read(self.workspace / VALIDATORS["slides"]),
                                read(self.workspace / BASE[1]))
        write_json(self.workspace / "order_context.json", context)
        rendered = [p.relative_to(self.workspace).as_posix() for directory in ("reports/rendered_slides", "reports/visual_evidence")
                    for p in (self.workspace / directory).rglob("*") if p.is_file()]
        self.record("render", [*CONTENT, *OUTPUTS, "reports/presentation_layout.json", *rendered])
        return {"pdf": str(self.workspace / OUTPUTS[1]), "images": str(self.workspace / "reports/rendered_slides"),
                "evidence": "reports/visual_evidence/checks.json"}

    def finalize(self):
        self.verify_inputs()
        for key in ("sources", "claims", "analysis", "slides", "review_content", "review_sources", "build", "render", "review_visual"):
            self.require(key)
        import fitz
        from presentation.deck import validate_package
        from presentation.visual_audit import load_visual_proof
        contract = read(self.workspace / BASE[1])
        load_visual_proof(self.workspace, read(self.workspace / VALIDATORS["slides"]), contract)
        count = contract["slide_count"]
        from presentation.source_comments import expected_comments, validate_source_comments
        sources = read(self.workspace / BASE[2])
        model = read(self.workspace / VALIDATORS["slides"])
        for editable, pdf, size in ((OUTPUTS[0], OUTPUTS[1], count), (OUTPUTS[2], OUTPUTS[3], math.ceil(count / 2))):
            validate_package(self.workspace / editable, size)
            validate_source_comments(self.workspace / editable, expected_comments({"slides": model["slides"][:size]}, sources, contract))
            with fitz.open(self.workspace / pdf) as document:
                if len(document) != size:
                    raise ValueError(f"PDF page count mismatch: {pdf}")
        report = {"passed": True, "order_id": self.state()["order_id"], "slides": count,
                  "source_policy": "supplied_files_only", "outputs": hashes(self.workspace, OUTPUTS)}
        write_json(self.workspace / "reports/codex_delivery.json", report)
        self.record("delivery", [*CONTENT, *OUTPUTS, "reports/codex_delivery.json"])
        return report

    def publish(self):
        self.finalize()
        state = self.state()
        files = hashes(self.workspace, self.delivery_outputs())
        reviews = collect_review_scores(self.workspace, state["order_id"], files)
        publication = state.get("publication", {})
        if publication.get("status") in {"uploading", "unknown"}:
            raise ValueError("Previous publication outcome is unknown; reconcile server outputs before another upload")
        if publication.get("outputs") == files and publication.get("status") == "confirmed":
            self.publish_reviews(state, reviews)
            return {"published": True, "reused_receipt": True, "order_id": state["order_id"], "reviews": len(reviews)}
        remote = api.fetch_order_read_only(self.config, state["order_id"])
        if signature(remote) != state["order_signature"]:
            raise ValueError("Remote order inputs changed; publication blocked until a new revision is reviewed")
        api.claim_oldest(self.config, state["order_id"], redo=True)
        api.heartbeat(self.config, state["order_id"], "Publishing the package reviewed in Codex.")
        state["publication"] = {"outputs": files, "at": now(), "status": "uploading"}
        self.save_state(state)
        try:
            api.submit_final(self.config, state["order_id"], dict(zip(
                self.upload_keys, [self.workspace / p for p in self.outputs])), self.publication_note)
        except Exception:
            state["publication"]["status"] = "unknown"
            self.save_state(state)
            raise
        state["publication"]["status"] = "confirmed"
        self.save_state(state)
        self.publish_reviews(state, reviews)
        return {"published": True, "order_id": state["order_id"], "reviews": len(reviews)}

    def publish_reviews(self, state, reviews):
        # File publication stays confirmed if grade sync fails. Retrying publish
        # then repairs only the idempotent review sync, never the file upload.
        state["publication"]["reviews_status"] = "pending"
        self.save_state(state)
        try:
            stored = api.sync_review_scores(self.config, state["order_id"], reviews)
            verify_review_scores(reviews, stored["reviews"])
        except Exception as error:
            raise ValueError(f"Files are published; review scores are not confirmed: {error}. "
                             "After resolving this error, retry publish to sync grades only.") from error
        state["publication"]["reviews_status"] = "confirmed"
        state["publication"]["review_runs"] = [review["run_id"] for review in reviews]
        self.save_state(state)

    def progress(self, step: int, detail: str):
        state = self.state()
        event = {"step": step, "total": 10, "label": self.steps[step - 1], "detail": detail, "at": now()}
        state["progress"].append(event)
        self.save_state(state)
        return event

    def status(self):
        state = self.state()
        return {"order_id": state["order_id"], "workspace": str(self.workspace), "source_policy": state["source_policy"],
                "progress": state["progress"][-1:] or [],
                "checks": {key: {"current": self.current(key), "at": item["at"]} for key, item in state["checks"].items()},
                "last_failure": state.get("last_failure"),
                "original_inputs_current": self.original_inputs_current()}

    def original_inputs_current(self):
        try:
            return hashes(self.workspace, self.state()["input_hashes"]) == self.state()["input_hashes"]
        except (ValueError, OSError):
            return False

    def delivery_outputs(self):
        return self.outputs


def parser():
    result = argparse.ArgumentParser(description=__doc__)
    result.add_argument("--workspace", type=Path, help="Isolated order workspace; required except for fetch")
    sub = result.add_subparsers(dest="command", required=True)
    fetch = sub.add_parser("fetch", help="Read order and download inputs without claiming or starting it")
    source = fetch.add_mutually_exclusive_group(required=True)
    source.add_argument("--order")
    source.add_argument("--order-file", type=Path)
    for name in ("prepare", "extract", "build", "render", "finalize", "publish", "status"):
        sub.add_parser(name)
    validate = sub.add_parser("validate")
    validate.add_argument("kind", choices=[*VALIDATORS, "rules", "evidence", "document"])
    validate.add_argument("--candidate", type=Path)
    review = sub.add_parser("review")
    review.add_argument("kind", choices=list(REVIEW_NAMES))
    review.add_argument("--report", type=Path, required=True)
    review_inputs = sub.add_parser("review-inputs")
    review_inputs.add_argument("kind", choices=list(REVIEW_NAMES))
    progress = sub.add_parser("progress")
    progress.add_argument("--step", type=int, choices=range(1, 11), required=True)
    progress.add_argument("--detail", default="")
    return result


def main(argv=None):
    args = parser().parse_args(argv)
    try:
        config = load_config() if args.command == "publish" or (args.command == "fetch" and args.order) else None
        workspace = args.workspace
        if workspace is None:
            if args.command != "fetch":
                raise ValueError("Pass --workspace from the fetch result")
            identifier = order_id(args.order) if args.order else order_id(str(read(args.order_file).get("id") or
                read(args.order_file).get("customerInput", {}).get("id") or ""))
            workspace = WORKER_ROOT / "workspace/codex_orders" / identifier
        # The lock is outside the order folder; initialization can require an empty folder.
        with execution_lock(workspace.resolve().parent / f".{workspace.name}.codex-lock"):
            tool = OrderTools(workspace, config)
            if args.command != "fetch" and tool.context()["order"]["order_type"] != profile.ORDER_TYPE:
                from codex_document_tools import DocumentTools
                tool = DocumentTools(workspace, config)
            if args.command == "fetch":
                value = tool.fetch(args.order, args.order_file.resolve() if args.order_file else None)
            elif args.command == "validate":
                value = tool.validate(args.kind, args.candidate)
            elif args.command == "review":
                value = tool.review(args.kind, args.report)
            elif args.command == "review-inputs":
                value = tool.review_inputs(args.kind)
            elif args.command == "progress":
                value = tool.progress(args.step, args.detail)
            else:
                value = getattr(tool, args.command)()
        if tool.state_path.is_file() and args.command not in {"status", "progress", "review-inputs"}:
            state = tool.state()
            if state.get("last_failure", {}).get("command") == args.command and state["last_failure"].get("kind") == getattr(args, "kind", None):
                state.pop("last_failure")
                tool.save_state(state)
        print(json.dumps({"ok": True, "command": args.command, "result": value}, ensure_ascii=False))
        return 0
    except Exception as error:
        if "tool" in locals() and tool.state_path.is_file():
            state = tool.state()
            state["last_failure"] = {"command": args.command, "kind": getattr(args, "kind", None),
                                     "error": str(error), "at": now()}
            tool.save_state(state)
        print(json.dumps({"ok": False, "command": args.command, "error": str(error),
                          "error_type": type(error).__name__}, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    sys.exit(main())
