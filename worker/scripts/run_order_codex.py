#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
LOCAL_WORKER = ROOT / "scripts" / "local_worker.py"
DEFAULT_PROMPT = (
    "Read AGENTS.md and execute codex/workflows/order_workflow.md through the "
    "human review package stage. Create or update all required durable files in "
    "this workspace. Do not call worker/admin backend endpoints from Codex; this "
    "wrapper will submit the final package after Codex exits successfully."
)


def run_capture(command: list[str], cwd: Path) -> subprocess.CompletedProcess[str]:
    print(f"$ {' '.join(command)}", flush=True)
    return subprocess.run(
        command,
        cwd=str(cwd),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        check=False,
    )


def run_stream(command: list[str], cwd: Path) -> int:
    print(f"$ {' '.join(command)}", flush=True)
    return subprocess.run(command, cwd=str(cwd), check=False).returncode


def parse_json_output(output: str) -> dict[str, Any]:
    try:
        return json.loads(output)
    except json.JSONDecodeError:
        pass

    start = output.find("{")
    end = output.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise SystemExit(f"Could not find JSON in local_worker output:\n{output}")

    try:
        return json.loads(output[start : end + 1])
    except json.JSONDecodeError as exc:
        raise SystemExit(f"Could not parse local_worker JSON output: {exc}\n{output}") from exc


def claim_order(args: argparse.Namespace) -> tuple[str, Path]:
    command = [sys.executable, str(LOCAL_WORKER), "run"]
    result = run_capture(command, ROOT)
    print(result.stdout, end="" if result.stdout.endswith("\n") else "\n", flush=True)
    if result.returncode != 0:
        raise SystemExit(result.returncode)

    payload = parse_json_output(result.stdout)
    order_id = str(payload.get("orderId") or "").strip()
    workspace = Path(str(payload.get("workspace") or "")).expanduser()
    if not order_id or not workspace:
        raise SystemExit(f"local_worker did not return orderId/workspace:\n{result.stdout}")
    if not workspace.exists():
        raise SystemExit(f"Workspace does not exist: {workspace}")
    return order_id, workspace


def run_codex(args: argparse.Namespace, workspace: Path) -> None:
    prompt = args.prompt or DEFAULT_PROMPT
    command = [
        args.codex_bin,
        "exec",
        "--skip-git-repo-check",
        "--sandbox",
        args.codex_sandbox,
        "-C",
        str(workspace),
    ]
    for value in args.codex_arg:
        command.extend(value.split(" ", 1) if value.startswith("-c ") else [value])
    command.append(prompt)

    code = run_stream(command, workspace)
    if code != 0:
        raise SystemExit(code)


def submit_final(args: argparse.Namespace, workspace: Path) -> None:
    if args.no_submit_final:
        return

    command = [
        sys.executable,
        str(LOCAL_WORKER),
        "submit-final",
        "--workspace",
        str(workspace),
        "--notes",
        args.submit_notes,
    ]
    code = run_stream(command, ROOT)
    if code != 0:
        raise SystemExit(code)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Claim the oldest approved order, run Codex inside its workspace, "
            "then submit the generated review package."
        )
    )
    parser.add_argument("--codex-bin", default=os.getenv("CODEX_BIN", "codex"))
    parser.add_argument(
        "--codex-sandbox",
        default=os.getenv("CODEX_SANDBOX", "danger-full-access"),
        choices=["read-only", "workspace-write", "danger-full-access"],
    )
    parser.add_argument(
        "--codex-arg",
        action="append",
        default=[],
        help="Extra argument passed to `codex exec`. Repeat for multiple args.",
    )
    parser.add_argument("--prompt", help="Override the default Codex prompt.")
    parser.add_argument(
        "--no-submit-final",
        action="store_true",
        help="Stop after Codex finishes and do not upload the final package.",
    )
    parser.add_argument(
        "--submit-notes",
        default="Codex review package generated automatically; replacing existing final outputs.",
    )
    return parser


def main() -> None:
    args = build_parser().parse_args()
    order_id, workspace = claim_order(args)
    print(f"Claimed order {order_id}", flush=True)
    print(f"Running Codex in {workspace}", flush=True)
    run_codex(args, workspace)
    submit_final(args, workspace)
    print(
        json.dumps(
            {
                "orderId": order_id,
                "workspace": str(workspace),
                "submittedFinal": not args.no_submit_final,
            },
            ensure_ascii=False,
            indent=2,
        ),
        flush=True,
    )


if __name__ == "__main__":
    main()
