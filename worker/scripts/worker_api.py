#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import signal
import subprocess
import sys
import threading
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

from dotenv import load_dotenv


ROOT = Path(__file__).resolve().parents[1]
LOCAL_WORKER = ROOT / "scripts" / "local_worker.py"
RUN_ORDER_CODEX = ROOT / "scripts" / "run_order_codex.py"


@dataclass(frozen=True)
class OptionSpec:
    flag: str
    kind: str = "value"
    false_flag: str | None = None


@dataclass(frozen=True)
class CommandSpec:
    executable: Path
    subcommand: str | None
    options: dict[str, OptionSpec]


COMMON_ORDER_OPTIONS = {
    "order_id": OptionSpec("--order-id"),
    "workspace": OptionSpec("--workspace"),
}

CLAIM_OPTIONS = {
    "order_id": OptionSpec("--order-id"),
    "redo": OptionSpec("--redo", "bool"),
}

LOCAL_COMMANDS: dict[str, CommandSpec] = {
    "claim": CommandSpec(LOCAL_WORKER, "run", CLAIM_OPTIONS),
    "run": CommandSpec(LOCAL_WORKER, "run", CLAIM_OPTIONS),
    "current": CommandSpec(LOCAL_WORKER, "current", COMMON_ORDER_OPTIONS),
    "heartbeat": CommandSpec(LOCAL_WORKER, "heartbeat", COMMON_ORDER_OPTIONS),
    "submit-draft": CommandSpec(
        LOCAL_WORKER,
        "submit-draft",
        {
            **COMMON_ORDER_OPTIONS,
            "draft_file": OptionSpec("--draft-file"),
            "notes": OptionSpec("--notes"),
        },
    ),
    "submit-final": CommandSpec(
        LOCAL_WORKER,
        "submit-final",
        {
            **COMMON_ORDER_OPTIONS,
            "pptx": OptionSpec("--pptx"),
            "docx": OptionSpec("--docx"),
            "pdf": OptionSpec("--pdf"),
            "deliverable_source": OptionSpec("--deliverable-source"),
            "compliance_report": OptionSpec("--compliance-report"),
            "reference_usage_report": OptionSpec("--reference-usage-report"),
            "human_review_checklist": OptionSpec("--human-review-checklist"),
            "final_readme": OptionSpec("--final-readme"),
            "image_sources": OptionSpec("--image-sources"),
            "skip_package_check": OptionSpec("--skip-package-check", "bool"),
            "notes": OptionSpec("--notes"),
            "replace_existing": OptionSpec("--replace-existing", "bool", "--no-replace-existing"),
        },
    ),
    "validate-final": CommandSpec(
        LOCAL_WORKER,
        "validate-final",
        {
            **COMMON_ORDER_OPTIONS,
            "pptx": OptionSpec("--pptx"),
            "docx": OptionSpec("--docx"),
            "pdf": OptionSpec("--pdf"),
            "deliverable_source": OptionSpec("--deliverable-source"),
            "compliance_report": OptionSpec("--compliance-report"),
            "reference_usage_report": OptionSpec("--reference-usage-report"),
            "human_review_checklist": OptionSpec("--human-review-checklist"),
            "final_readme": OptionSpec("--final-readme"),
            "image_sources": OptionSpec("--image-sources"),
        },
    ),
    "reset": CommandSpec(
        LOCAL_WORKER,
        "reset",
        {**COMMON_ORDER_OPTIONS, "notes": OptionSpec("--notes")},
    ),
    "fetch-review-notes": CommandSpec(LOCAL_WORKER, "fetch-review-notes", COMMON_ORDER_OPTIONS),
    "mock-generate": CommandSpec(LOCAL_WORKER, "mock-generate", COMMON_ORDER_OPTIONS),
    "package-existing": CommandSpec(
        LOCAL_WORKER,
        "package-existing",
        {
            **COMMON_ORDER_OPTIONS,
            "source": OptionSpec("--source"),
            "notes": OptionSpec("--notes"),
            "submit_final": OptionSpec("--submit-final", "bool", "--no-submit-final"),
            "skip_package_check": OptionSpec("--skip-package-check", "bool"),
            "replace_existing": OptionSpec("--replace-existing", "bool", "--no-replace-existing"),
        },
    ),
    "fail": CommandSpec(
        LOCAL_WORKER,
        "fail",
        {**COMMON_ORDER_OPTIONS, "notes": OptionSpec("--notes")},
    ),
    "run-order": CommandSpec(
        RUN_ORDER_CODEX,
        None,
        {
            "codex_bin": OptionSpec("--codex-bin"),
            "codex_sandbox": OptionSpec("--codex-sandbox"),
            "codex_arg": OptionSpec("--codex-arg", "list"),
            "prompt": OptionSpec("--prompt"),
            "no_submit_final": OptionSpec("--no-submit-final", "bool"),
            "submit_notes": OptionSpec("--submit-notes"),
            "max_fix_attempts": OptionSpec("--max-fix-attempts"),
            "order_id": OptionSpec("--order-id"),
            "redo": OptionSpec("--redo", "bool"),
        },
    ),
    "review-order": CommandSpec(
        RUN_ORDER_CODEX,
        None,
        {
            "review_workspace": OptionSpec("--review-workspace"),
            "order_id": OptionSpec("--order-id"),
            "codex_bin": OptionSpec("--codex-bin"),
            "codex_sandbox": OptionSpec("--codex-sandbox"),
            "codex_arg": OptionSpec("--codex-arg", "list"),
            "prompt": OptionSpec("--prompt"),
            "no_submit_final": OptionSpec("--no-submit-final", "bool"),
            "submit_notes": OptionSpec("--submit-notes"),
            "max_fix_attempts": OptionSpec("--max-fix-attempts"),
        },
    ),
}


@dataclass
class Job:
    id: str
    command: str
    argv: list[str]
    status: str = "queued"
    created_at: str = field(default_factory=lambda: datetime.now(UTC).isoformat())
    started_at: str | None = None
    finished_at: str | None = None
    exit_code: int | None = None
    output: str = ""
    error: str | None = None
    process: subprocess.Popen[str] | None = field(default=None, repr=False)

    def public(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "command": self.command,
            "argv": self.argv,
            "status": self.status,
            "created_at": self.created_at,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "exit_code": self.exit_code,
            "error": self.error,
            "output": self.output[-20000:],
        }


JOBS: dict[str, Job] = {}
JOBS_LOCK = threading.Lock()


def compact(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def command_argv(command: str, payload: dict[str, Any]) -> list[str]:
    spec = LOCAL_COMMANDS.get(command)
    if not spec:
        raise ValueError(f"Unknown command '{command}'")
    if command == "review-order" and not compact(payload.get("review_workspace")) and compact(payload.get("workspace")):
        payload = {**payload, "review_workspace": payload["workspace"]}

    argv = [sys.executable, str(spec.executable)]
    if spec.subcommand:
        argv.append(spec.subcommand)

    if command == "review-order" and not compact(payload.get("review_workspace")):
        raise ValueError("review_workspace is required for review-order")

    for name, option in spec.options.items():
        if name not in payload or payload[name] is None:
            continue
        value = payload[name]
        if option.kind == "bool":
            if value is True:
                argv.append(option.flag)
            elif value is False and option.false_flag:
                argv.append(option.false_flag)
            continue
        if option.kind == "list":
            if not isinstance(value, list):
                raise ValueError(f"{name} must be a list")
            for item in value:
                text = compact(item)
                if text:
                    argv.extend([option.flag, text])
            continue
        text = compact(value)
        if text:
            argv.extend([option.flag, text])
    return argv


def run_job(job: Job) -> None:
    with JOBS_LOCK:
        job.status = "running"
        job.started_at = datetime.now(UTC).isoformat()
    try:
        process = subprocess.Popen(
            job.argv,
            cwd=str(ROOT),
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            bufsize=1,
        )
        with JOBS_LOCK:
            job.process = process
        assert process.stdout is not None
        for line in process.stdout:
            with JOBS_LOCK:
                job.output += line
        code = process.wait()
        with JOBS_LOCK:
            job.exit_code = code
            job.status = "succeeded" if code == 0 else "failed"
            job.finished_at = datetime.now(UTC).isoformat()
            job.process = None
    except Exception as exc:
        with JOBS_LOCK:
            job.status = "failed"
            job.error = str(exc)
            job.finished_at = datetime.now(UTC).isoformat()
            job.process = None


def start_job(command: str, argv: list[str]) -> Job:
    job = Job(id=str(uuid.uuid4()), command=command, argv=argv)
    with JOBS_LOCK:
        JOBS[job.id] = job
    thread = threading.Thread(target=run_job, args=(job,), daemon=True)
    thread.start()
    return job


def run_sync(command: str, argv: list[str]) -> Job:
    job = Job(id=str(uuid.uuid4()), command=command, argv=argv)
    with JOBS_LOCK:
        JOBS[job.id] = job
    run_job(job)
    return job


def parse_json_body(handler: BaseHTTPRequestHandler) -> dict[str, Any]:
    length = int(handler.headers.get("content-length") or "0")
    if length <= 0:
        return {}
    raw = handler.rfile.read(length)
    if not raw:
        return {}
    data = json.loads(raw.decode("utf-8"))
    if not isinstance(data, dict):
        raise ValueError("JSON body must be an object")
    return data


class WorkerApiHandler(BaseHTTPRequestHandler):
    server_version = "PayannameWorkerAPI/1.0"

    def log_message(self, fmt: str, *args: Any) -> None:
        print(f"{self.address_string()} - {fmt % args}", flush=True)

    def require_auth(self) -> None:
        expected = self.server.api_key  # type: ignore[attr-defined]
        if not expected:
            return
        authorization = self.headers.get("authorization")
        api_key = self.headers.get("x-worker-api-key")
        if authorization == f"Bearer {expected}" or api_key == expected:
            return
        self.respond({"detail": "Invalid or missing worker API key"}, HTTPStatus.UNAUTHORIZED)
        raise PermissionError

    def respond(self, payload: Any, status: HTTPStatus = HTTPStatus.OK) -> None:
        raw = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(status.value)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self) -> None:
        try:
            parsed = urlparse(self.path)
            if parsed.path == "/health":
                self.respond({"ok": True, "commands": sorted(LOCAL_COMMANDS)})
                return
            self.require_auth()
            if parsed.path == "/v1/jobs":
                with JOBS_LOCK:
                    jobs = [job.public() for job in JOBS.values()]
                self.respond({"jobs": jobs})
                return
            if parsed.path.startswith("/v1/jobs/"):
                job_id = parsed.path.removeprefix("/v1/jobs/").strip("/")
                with JOBS_LOCK:
                    job = JOBS.get(job_id)
                    payload = job.public() if job else None
                if not payload:
                    self.respond({"detail": "Job not found"}, HTTPStatus.NOT_FOUND)
                    return
                self.respond(payload)
                return
            self.respond({"detail": "Not found"}, HTTPStatus.NOT_FOUND)
        except PermissionError:
            return
        except Exception as exc:
            self.respond({"detail": str(exc)}, HTTPStatus.INTERNAL_SERVER_ERROR)

    def do_POST(self) -> None:
        try:
            parsed = urlparse(self.path)
            self.require_auth()
            if parsed.path.startswith("/v1/commands/"):
                command = parsed.path.removeprefix("/v1/commands/").strip("/")
                payload = parse_json_body(self)
                query = parse_qs(parsed.query)
                run_async = payload.pop("async", True)
                if "async" in query:
                    run_async = query["async"][-1].lower() not in {"0", "false", "no"}
                argv = command_argv(command, payload)
                job = start_job(command, argv) if run_async else run_sync(command, argv)
                status = HTTPStatus.ACCEPTED if run_async else HTTPStatus.OK
                self.respond(job.public(), status)
                return
            if parsed.path.startswith("/v1/jobs/") and parsed.path.endswith("/cancel"):
                job_id = parsed.path.removeprefix("/v1/jobs/").removesuffix("/cancel").strip("/")
                with JOBS_LOCK:
                    job = JOBS.get(job_id)
                    process = job.process if job else None
                if not job:
                    self.respond({"detail": "Job not found"}, HTTPStatus.NOT_FOUND)
                    return
                if process and job.status == "running":
                    process.send_signal(signal.SIGTERM)
                    self.respond({"id": job.id, "status": "terminating"})
                    return
                self.respond({"id": job.id, "status": job.status})
                return
            self.respond({"detail": "Not found"}, HTTPStatus.NOT_FOUND)
        except PermissionError:
            return
        except (ValueError, json.JSONDecodeError) as exc:
            self.respond({"detail": str(exc)}, HTTPStatus.BAD_REQUEST)
        except Exception as exc:
            self.respond({"detail": str(exc)}, HTTPStatus.INTERNAL_SERVER_ERROR)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="HTTP control API for the local Payanname worker")
    parser.add_argument("--host", default=os.getenv("WORKER_API_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.getenv("WORKER_API_PORT", "8765")))
    parser.add_argument(
        "--api-key",
        default=os.getenv("WORKER_CONTROL_API_KEY") or os.getenv("WORKER_API_KEY", "local-worker-dev-key"),
    )
    return parser


def main() -> None:
    load_dotenv(ROOT / ".env")
    args = build_parser().parse_args()
    server = ThreadingHTTPServer((args.host, args.port), WorkerApiHandler)
    server.api_key = args.api_key  # type: ignore[attr-defined]
    print(f"Worker API listening on http://{args.host}:{args.port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
