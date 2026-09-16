from __future__ import annotations

import os
import shutil
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


WORKER_ROOT = Path(__file__).resolve().parents[1]


@dataclass(frozen=True)
class Config:
    backend_url: str
    worker_api_key: str
    worker_id: str
    workspace_root: Path
    codex_bin: str
    codex_sandbox: str
    codex_model: str


def load_config() -> Config:
    load_dotenv(WORKER_ROOT / ".env")
    codex_on_path = shutil.which("codex")
    installed_codex = sorted((Path(os.getenv("LOCALAPPDATA", "")) / "OpenAI" / "Codex" / "bin").glob("*/codex.exe"))
    codex_bin = codex_on_path or (str(installed_codex[-1]) if installed_codex else "codex")
    return Config(
        backend_url=os.getenv("BACKEND_URL", "https://daneshyar.vercel.app/").rstrip("/"),
        worker_api_key=os.getenv("WORKER_API_KEY", "local-worker-dev-key"),
        worker_id="worker-plus-1",
        workspace_root=WORKER_ROOT / "workspace",
        codex_bin=codex_bin,
        codex_sandbox="workspace-write",
        codex_model="gpt-5.6-sol",
    )
