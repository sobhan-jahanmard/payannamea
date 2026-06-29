#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
LOCAL_WORKER = ROOT / "scripts" / "local_worker.py"
USE_COLOR = sys.stdout.isatty() and not os.getenv("NO_COLOR")
COLOR_BLUE = "\033[34m"
COLOR_GREEN = "\033[32m"
COLOR_RED = "\033[31m"
COLOR_RESET = "\033[0m"
DEFAULT_PROMPT = (
    "Read AGENTS.md and execute codex/workflows/order_workflow.md through the "
    "human review package stage. Create or update all required durable files in "
    "this workspace. Do not call worker/admin backend endpoints from Codex; this "
    "wrapper will submit the final package after Codex exits successfully."
)

REVIEW_PROMPT = (
    "Read AGENTS.md, input/admin_review_notes.md, customer_input.json, and the current final/reports outputs. "
    "Revise the order package to address every internal admin review note. Create or update "
    "reports/admin_review_response.md with a note-by-note response describing the fix or the documented reason "
    "an item still needs human review. Re-run the selected order workflow checks as needed, then leave the "
    "corrected final package ready for submit-final. Do not call worker/admin backend endpoints from Codex; "
    "this wrapper will resubmit the package after Codex exits successfully."
)


FINAL_REPAIR_PROMPT = (
    "The worker's local final-package validator rejected the outputs below. Fix the root cause before submission. "
    "Do not remove academic-integrity limitations by pretending missing data exists. Instead, move operational TODOs, "
    "[NEEDS ...] markers, and human-action items out of final deliverables and into reports/human_review_checklist.md. "
    "Rewrite final/deliverable_source.md as polished review-ready academic text with no raw placeholders, no worker/order "
    "metadata labels, and no internal instructions. Then regenerate editable outputs with the local package-existing command "
    "when needed. Run validate-final yourself before finishing. Validator output:\n\n"
)


class StepFailure(RuntimeError):
    def __init__(
        self,
        step: int,
        total: int,
        label: str,
        reason: str,
        code: int = 1,
        mark_order_failed: bool = True,
    ) -> None:
        super().__init__(reason)
        self.step = step
        self.total = total
        self.label = label
        self.reason = reason
        self.code = code
        self.mark_order_failed = mark_order_failed


def colorize(text: str, color: str) -> str:
    if not USE_COLOR:
        return text
    return f"{color}{text}{COLOR_RESET}"


@dataclass
class StepRunner:
    total: int
    current: int = 0

    def run(self, label: str, action: Any) -> Any:
        self.current += 1
        step = self.current
        print(colorize(f"{step}/{self.total} ... {label}", COLOR_BLUE), flush=True)
        try:
            result = action()
        except StepFailure as exc:
            if exc.step == 0:
                exc.step = step
                exc.total = self.total
                exc.label = label
                print(colorize(f"{step}/{self.total} failed: {label}: {exc.reason}", COLOR_RED), flush=True)
            raise
        except SystemExit as exc:
            reason = str(exc) if str(exc) else f"exited with code {exc.code}"
            code = exc.code if isinstance(exc.code, int) else 1
            print(colorize(f"{step}/{self.total} failed: {label}: {reason}", COLOR_RED), flush=True)
            raise StepFailure(step, self.total, label, reason, code) from exc
        except Exception as exc:
            reason = str(exc) or exc.__class__.__name__
            print(colorize(f"{step}/{self.total} failed: {label}: {reason}", COLOR_RED), flush=True)
            raise StepFailure(step, self.total, label, reason) from exc
        print(colorize(f"{step}/{self.total} ✓ {label}", COLOR_GREEN), flush=True)
        return result


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


def run_stream_checked(command: list[str], cwd: Path, label: str) -> None:
    code = run_stream(command, cwd)
    if code != 0:
        raise SystemExit(f"{label} exited with code {code}")


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


def claim_order(args: argparse.Namespace) -> tuple[str, Path, Path | None]:
    command = [sys.executable, str(LOCAL_WORKER), "run"]
    if args.order_id:
        command.extend(["--order-id", args.order_id])
    if args.redo:
        command.append("--redo")
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
    archive_raw = str(payload.get("archiveWorkspace") or "").strip()
    archive = Path(archive_raw).expanduser() if archive_raw else None
    return order_id, workspace, archive


def verify_workspace(workspace: Path) -> None:
    required = [
        workspace / "customer_input.json",
        workspace / "AGENTS.md",
        workspace / "input" / "order_context.md",
        workspace / "extracted" / "order_profile.json",
    ]
    missing = [str(path) for path in required if not path.exists()]
    if missing:
        raise SystemExit("Workspace is missing required files:\n" + "\n".join(f"- {path}" for path in missing))


def verify_generated_package(workspace: Path) -> None:
    final_dir = workspace / "final"
    reports_dir = workspace / "reports"
    if not final_dir.exists() or not reports_dir.exists():
        raise SystemExit(f"Codex did not leave the expected final/reports directories in {workspace}")
    source_candidates = [
        final_dir / "deliverable_source.md",
        final_dir / "thesis_source.md",
        workspace / "drafts" / "assisted_draft.md",
    ]
    report_candidates = [
        reports_dir / "compliance_report.md",
        reports_dir / "reference_usage_report.md",
        reports_dir / "human_review_checklist.md",
    ]
    if not any(path.exists() and path.stat().st_size > 0 for path in source_candidates):
        raise SystemExit("Codex did not create a deliverable source or assisted draft.")
    missing_reports = [path for path in report_candidates if not path.exists() or path.stat().st_size == 0]
    if missing_reports:
        raise SystemExit("Codex did not create required reports:\n" + "\n".join(f"- {path}" for path in missing_reports))


def run_codex(args: argparse.Namespace, workspace: Path, prompt: str | None = None) -> None:
    prompt = prompt or args.prompt or DEFAULT_PROMPT
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

    run_stream_checked(command, workspace, "Codex")


def validate_final_package(workspace: Path) -> subprocess.CompletedProcess[str]:
    command = [
        sys.executable,
        str(LOCAL_WORKER),
        "validate-final",
        "--workspace",
        str(workspace),
    ]
    return run_capture(command, ROOT)


def package_existing(args: argparse.Namespace, workspace: Path) -> None:
    command = [
        sys.executable,
        str(LOCAL_WORKER),
        "package-existing",
        "--workspace",
        str(workspace),
        "--no-submit-final",
    ]
    run_stream_checked(command, ROOT, "package-existing")


def validate_or_repair_final_package(args: argparse.Namespace, workspace: Path) -> None:
    attempts = max(args.max_fix_attempts, 0)
    result = validate_final_package(workspace)
    if result.returncode == 0:
        print(result.stdout, end="" if result.stdout.endswith("\n") else "\n", flush=True)
        return

    validation_output = result.stdout.strip() or f"validate-final exited with code {result.returncode}"
    for attempt in range(1, attempts + 1):
        print(colorize(f"Final package validation failed; running Codex repair pass {attempt}/{attempts}.", COLOR_BLUE), flush=True)
        repair_prompt = FINAL_REPAIR_PROMPT + validation_output
        run_codex(args, workspace, prompt=repair_prompt)
        package_existing(args, workspace)
        result = validate_final_package(workspace)
        if result.returncode == 0:
            print(result.stdout, end="" if result.stdout.endswith("\n") else "\n", flush=True)
            return
        validation_output = result.stdout.strip() or f"validate-final exited with code {result.returncode}"

    raise StepFailure(
        0,
        0,
        "Validate final package",
        validation_output,
        code=result.returncode or 1,
        mark_order_failed=False,
    )


def submit_final(args: argparse.Namespace, workspace: Path) -> None:
    command = [
        sys.executable,
        str(LOCAL_WORKER),
        "submit-final",
        "--workspace",
        str(workspace),
        "--notes",
        args.submit_notes,
    ]
    run_stream_checked(command, ROOT, "submit-final")


def infer_order_id_from_workspace(workspace: Path) -> str | None:
    customer_input = workspace / "customer_input.json"
    if customer_input.exists():
        try:
            data = json.loads(customer_input.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            data = {}
        if data.get("id"):
            return str(data["id"])
    if workspace.name.startswith("order_"):
        return workspace.name.removeprefix("order_")
    return None


def archive_workspace(workspace: Path, order_id: str | None) -> Path:
    resolved_order_id = order_id or infer_order_id_from_workspace(workspace)
    if not resolved_order_id:
        raise SystemExit(f"Could not infer order ID for archive copy from {workspace}")
    archive = workspace.parent / f"order_{resolved_order_id}"
    if workspace.resolve() == archive.resolve():
        return archive
    if archive.exists():
        archived_order_id = infer_order_id_from_workspace(archive)
        if archived_order_id and archived_order_id != resolved_order_id:
            raise SystemExit(
                "Archive path belongs to a different order; refusing to overwrite it.\n"
                f"Archive: {archive}\n"
                f"Archive order: {archived_order_id}\n"
                f"Current order: {resolved_order_id}"
            )
        shutil.rmtree(archive)
    shutil.copytree(workspace, archive)
    return archive


def fetch_review_notes(args: argparse.Namespace, workspace: Path) -> str:
    command = [
        sys.executable,
        str(LOCAL_WORKER),
        "fetch-review-notes",
        "--workspace",
        str(workspace),
    ]
    if args.order_id:
        command.extend(["--order-id", args.order_id])
    result = run_capture(command, ROOT)
    print(result.stdout, end="" if result.stdout.endswith("\n") else "\n", flush=True)
    if result.returncode != 0:
        raise SystemExit(result.returncode)
    payload = parse_json_output(result.stdout)
    return str(payload.get("orderId") or args.order_id or "")


def mark_failed(order_id: str | None, workspace: Path | None, reason: str) -> None:
    if not order_id and not workspace:
        return
    command = [sys.executable, str(LOCAL_WORKER), "fail"]
    if workspace:
        command.extend(["--workspace", str(workspace)])
    elif order_id:
        command.extend(["--order-id", order_id])
    command.extend(["--notes", reason[:1000]])
    code = run_stream(command, ROOT)
    if code != 0:
        print("Could not mark the order failed; see command output above.", flush=True)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Claim the oldest approved order, run Codex inside its workspace, "
            "then submit the generated review package."
        )
    )
    parser.add_argument(
        "order_id_arg",
        nargs="?",
        help="Optional shorthand order ID. Equivalent to --order-id <id> --redo.",
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
        "--review-workspace",
        help="Review an existing completed/pending-approval workspace using internal admin notes instead of claiming a new order.",
    )
    parser.add_argument("--order-id", help="Claim this specific order, or identify the order in review mode.")
    parser.add_argument(
        "--redo",
        action="store_true",
        help="With --order-id, allow reclaiming a failed/in-progress/in-review order for a fresh run.",
    )
    parser.add_argument(
        "--no-submit-final",
        action="store_true",
        help="Stop after Codex finishes and do not upload the final package.",
    )
    parser.add_argument(
        "--submit-notes",
        default="Codex review package generated automatically; replacing existing final outputs.",
    )
    parser.add_argument(
        "--max-fix-attempts",
        type=int,
        default=int(os.getenv("WORKER_MAX_FIX_ATTEMPTS", "1")),
        help="How many Codex correction passes to run when final package validation fails before submit.",
    )
    return parser


def main() -> None:
    args = build_parser().parse_args()
    if args.order_id_arg:
        if args.order_id and args.order_id != args.order_id_arg:
            raise SystemExit("Pass the order ID either positionally or with --order-id, not both.")
        if args.review_workspace:
            raise SystemExit("Positional order ID cannot be combined with --review-workspace.")
        args.order_id = args.order_id_arg
        args.redo = True
    steps = StepRunner(total=8)
    order_id: str | None = None
    workspace: Path | None = None
    archive: Path | None = None
    try:
        if args.review_workspace:
            def resolve_review_workspace() -> Path:
                review_workspace = Path(args.review_workspace).expanduser()
                if not review_workspace.is_absolute():
                    review_workspace = (ROOT / review_workspace).resolve()
                if not review_workspace.exists():
                    raise SystemExit(f"Workspace does not exist: {review_workspace}")
                return review_workspace

            workspace = steps.run("Resolve review workspace", resolve_review_workspace)
            order_id = steps.run("Fetch admin review notes", lambda: fetch_review_notes(args, workspace))
        else:
            order_id, workspace, archive = steps.run("Claim order and prepare active workspace", lambda: claim_order(args))

        steps.run("Verify workspace context", lambda: verify_workspace(workspace))

        def select_prompt() -> str:
            if args.review_workspace and not args.prompt:
                args.prompt = REVIEW_PROMPT
            return args.prompt or DEFAULT_PROMPT

        steps.run("Select Codex prompt", select_prompt)
        print(f"Running Codex in {workspace}", flush=True)
        steps.run("Run Codex process", lambda: run_codex(args, workspace))
        steps.run("Validate final package and repair if needed", lambda: (verify_generated_package(workspace), validate_or_repair_final_package(args, workspace)))
        if args.no_submit_final:
            steps.run("Skip final submission by request", lambda: None)
        else:
            steps.run("Submit final package and update status", lambda: submit_final(args, workspace))
        archive = steps.run("Archive workspace snapshot", lambda: archive_workspace(workspace, order_id))
        steps.run(
            "Print completion summary",
            lambda: print(
                json.dumps(
                    {
                        "orderId": order_id,
                        "workspace": str(workspace),
                        "archiveWorkspace": str(archive),
                        "submittedFinal": not args.no_submit_final,
                    },
                    ensure_ascii=False,
                    indent=2,
                ),
                flush=True,
            ),
        )
    except StepFailure as exc:
        if workspace and order_id and exc.mark_order_failed:
            mark_failed(order_id, workspace, f"{exc.step}/{exc.total} failed: {exc.label}: {exc.reason}")
        raise SystemExit(exc.code).with_traceback(None)


if __name__ == "__main__":
    main()
