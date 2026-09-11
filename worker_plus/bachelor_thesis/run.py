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
from utils.api import record_run

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


STEPS = [
    "01_fetch_order", "02_prepare_workspace", "03_check_intake",
    "04_extract_university_rules", "05_collect_sources", "06_build_thesis_plan",
    "07_generate_content", "08_review_content", "09_package_docx", "10_validate_and_publish",
]
FAILURE_STEP = "11_handle_failure"


@dataclass
class Services:
    config: Config
    args: argparse.Namespace
    workspace: Path
    token_usage: dict[str, int] = None  # type: ignore[assignment]

    def __post_init__(self) -> None:
        self.token_usage = {"inputTokens": 0, "outputTokens": 0, "reasoningTokens": 0, "totalTokens": 0}

    def run_codex(self, prompt: str, target: Path) -> None:
        if target.exists() and target.read_text(encoding="utf-8").strip():
            return
        if self.args.dry_run:
            write_text(target, "# خروجی آزمایشی\n\nاین خروجی فقط برای dry-run ساخته شده است.\n")
            return
        command = [
            self.config.codex_bin, "exec", "--model", self.config.codex_model,
            "--json",
            "--skip-git-repo-check", "--sandbox",
            self.config.codex_sandbox, "-C", str(self.workspace), "-",
        ]
        if os.name == "nt":
            command = ["cmd.exe", "/d", "/s", "/c", subprocess.list2cmdline(command)]
        result = subprocess.run(command, cwd=str(self.workspace), input=prompt, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace", check=False)
        print(result.stdout, end="", flush=True)
        for line in result.stdout.splitlines():
            try: event = json.loads(line)
            except json.JSONDecodeError: continue
            usage = event.get("usage") or event.get("data", {}).get("usage") or {}
            for key, target in (("input_tokens", "inputTokens"), ("output_tokens", "outputTokens"), ("total_tokens", "totalTokens")):
                if isinstance(usage.get(key), int): self.token_usage[target] = max(self.token_usage[target], usage[key])
            detail = usage.get("output_tokens_details") or {}
            if isinstance(detail.get("reasoning_tokens"), int): self.token_usage["reasoningTokens"] = max(self.token_usage["reasoningTokens"], detail["reasoning_tokens"])
        if result.returncode:
            raise RuntimeError(f"Codex exited with code {result.returncode}")
        deadline = time.monotonic() + 1800
        while time.monotonic() < deadline:
            if target.exists() and target.read_text(encoding="utf-8").strip():
                return
            time.sleep(5)
        raise RuntimeError(f"Codex did not create {target.relative_to(self.workspace)} within 30 minutes")

    def write_docx(self, source: Path, output: Path, title: str) -> None:
        try:
            from docx import Document
            from docx.enum.text import WD_ALIGN_PARAGRAPH
        except ImportError as exc:
            raise RuntimeError("python-docx is required. Install worker requirements first.") from exc
        document = Document()
        title_paragraph = document.add_heading(title, level=0)
        title_paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
        for raw_line in source.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line:
                continue
            if line.startswith("# "):
                paragraph = document.add_heading(line[2:], level=1)
            elif line.startswith("## "):
                paragraph = document.add_heading(line[3:], level=2)
            else:
                paragraph = document.add_paragraph(line.lstrip("- "))
            paragraph.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        output.parent.mkdir(parents=True, exist_ok=True)
        document.save(output)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Worker Plus: bachelor thesis workflow")
    parser.add_argument("--sample", action="store_true", help="Generate and publish a customer sample only")
    parser.add_argument("--order-id", "--order_id", dest="order_id", help="Force-claim this order and start from a fresh workspace")
    parser.add_argument("--redo", action="store_true", help="Allow reclaiming a specific order (implicit with --order-id)")
    parser.add_argument("--resume", action="store_true", help="Resume workspace/in_progress from its saved context")
    parser.add_argument("--dry-run", action="store_true", help="Avoid Codex and create a tiny test source")
    parser.add_argument("--offline", action="store_true", help="Run all steps with a local mock order; no backend changes")
    return parser


def header(index: int, title: str, context: dict[str, Any]) -> None:
    clean_title = re.sub(r"\s+", " ", title)
    print("-" * 64, flush=True)
    print("Worker Plus | Bachelor Thesis", flush=True)
    print(f"Order: {context.get('order_id') or 'pending'} | Mode: {context['mode']}", flush=True)
    print(f"Step {index:02}/11: {clean_title}", flush=True)
    print("-" * 64, flush=True)


def main() -> None:
    args = build_parser().parse_args()
    config = load_config()
    workspace = config.workspace_root / "in_progress"
    workspace.mkdir(parents=True, exist_ok=True)
    if args.resume and args.order_id:
        raise SystemExit("--resume cannot be combined with --order-id; a specific order always starts fresh.")
    args.redo = args.redo or bool(args.order_id)
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
        header(11, module.TITLE, context)
        try:
            module.run(context, services)
            save(workspace, context)
        finally:
            print(f"Result: FAIL — {exc}", flush=True)
        raise SystemExit(1) from exc
    finally:
        if context.get("order_id") and not args.offline:
            try:
                record_run(config, context["order_id"], {"workerId": config.worker_id, "model": config.codex_model, "mode": context["mode"], "status": "completed" if not context.get("errors") else "failed", "notes": context.get("errors", [None])[-1], **services.token_usage})
            except Exception as record_error:
                print(f"Could not record worker run usage: {record_error}", file=sys.stderr)


if __name__ == "__main__":
    main()
