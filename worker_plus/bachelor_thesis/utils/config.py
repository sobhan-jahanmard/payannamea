from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


BACHELOR_THESIS_ROOT = Path(__file__).resolve().parents[1]
WORKER_ROOT = BACHELOR_THESIS_ROOT.parent


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
    return Config(
        backend_url=os.getenv("BACKEND_URL", "https://daneshyar.vercel.app/").rstrip("/"),
        worker_api_key=os.getenv("WORKER_API_KEY", "local-worker-dev-key"),
        worker_id="worker-plus-1",
        workspace_root=WORKER_ROOT / "workspace",
        codex_bin="codex",
        codex_sandbox="workspace-write",
        codex_model="gpt-5.6-terra",
    )
