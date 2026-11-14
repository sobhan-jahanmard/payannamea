"""Local Telegram account settings. Never log credentials or session contents."""
from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
from urllib.parse import urlparse, unquote

from filelock import FileLock
from dotenv import dotenv_values
from telethon import TelegramClient

ROOT = Path(__file__).resolve().parents[2]
PROJECT_ID = hashlib.sha256(str(ROOT).lower().encode()).hexdigest()[:12]
STATE = Path(os.environ.get("TELEGRAM_STATE_DIR", str(
    Path(os.environ.get("LOCALAPPDATA", str(Path.home() / ".local/share")))
    / "Daneshyar" / "telegram" / PROJECT_ID
)))
SETTINGS = STATE / "settings.bin"
SESSION = STATE / "account.session"
ENV_FILE = Path(__file__).with_name(".env")


def load_setup_defaults() -> dict:
    """Load saved identity plus project-local credentials without changing process env."""
    data = {}
    if SETTINGS.is_file():
        raw = SETTINGS.read_bytes()
        if os.name == "nt":
            import win32crypt
            raw = win32crypt.CryptUnprotectData(raw, None, None, None, 1)[1]
        data = json.loads(raw)
    values = dotenv_values(ENV_FILE, interpolate=False)
    for field, variable in {"api_id": "TELEGRAM_API_ID", "api_hash": "TELEGRAM_API_HASH",
                            "phone": "TELEGRAM_PHONE", "proxy": "TELEGRAM_PROXY"}.items():
        value = os.environ.get(variable, values.get(variable))
        if value is not None:
            data[field] = value
    return data


def protect_directory() -> None:
    STATE.mkdir(parents=True, exist_ok=True)
    if os.name == "nt":
        # Grant only this Windows user and SYSTEM access before writing secrets.
        import ctypes
        import ctypes.wintypes
        size = ctypes.wintypes.DWORD(256)
        name = ctypes.create_unicode_buffer(256)
        if not ctypes.windll.secur32.GetUserNameExW(2, name, ctypes.byref(size)):
            raise RuntimeError("Cannot identify the Windows user for private storage.")
        subprocess.run(
            ["icacls", str(STATE), "/inheritance:r", "/grant:r",
             f"{name.value}:(OI)(CI)F", "*S-1-5-18:(OI)(CI)F"],
            check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
    else:
        STATE.chmod(0o700)


def validate_settings(data: dict) -> dict:
    api_id = int(data["api_id"])
    if api_id <= 0 or not re.fullmatch(r"[a-fA-F0-9]{32}", data["api_hash"]):
        raise ValueError("Use the API ID and 32-character API hash from my.telegram.org.")
    phone = re.sub(r"[\s()-]", "", data["phone"])
    if not re.fullmatch(r"\+[1-9][0-9]{6,14}", phone):
        raise ValueError("Enter the phone number with country code, for example +98912...")
    proxy = data.get("proxy", "").strip()
    parse_proxy(proxy)
    return {"api_id": api_id, "api_hash": data["api_hash"], "phone": phone, "proxy": proxy}


def parse_proxy(value: str) -> dict | None:
    if not value:
        return None
    parsed = urlparse(value)
    if parsed.scheme not in {"socks5", "socks4", "http"} or not parsed.hostname or not parsed.port:
        raise ValueError("Proxy must be socks5://host:port, socks4://host:port or http://host:port.")
    return {"proxy_type": parsed.scheme, "addr": parsed.hostname, "port": parsed.port,
            "username": unquote(parsed.username) if parsed.username else None,
            "password": unquote(parsed.password) if parsed.password else None, "rdns": True}


def save_settings(data: dict) -> None:
    data = validate_settings(data)
    protect_directory()
    raw = json.dumps(data).encode("utf-8")
    if os.name == "nt":
        import win32crypt
        raw = win32crypt.CryptProtectData(raw, "Daneshyar Telegram", None, None, None, 1)
    temporary = SETTINGS.with_suffix(".tmp")
    temporary.write_bytes(raw)
    if os.name != "nt":
        temporary.chmod(0o600)
    temporary.replace(SETTINGS)


def load_settings() -> dict:
    if not SETTINGS.is_file():
        raise RuntimeError("Telegram is not configured. Run telegram/integration/setup.ps1 locally.")
    return validate_settings(load_setup_defaults())


def make_client(settings: dict, *, updates: bool = False) -> TelegramClient:
    return TelegramClient(
        str(SESSION), settings["api_id"], settings["api_hash"],
        proxy=parse_proxy(settings.get("proxy", "")),
        device_model="Daneshyar project MCP", app_version="1.0",
        connection_retries=1, request_retries=1, timeout=10,
        flood_sleep_threshold=0, receive_updates=updates,
    )


@asynccontextmanager
async def account(*, updates: bool = False):
    settings = load_settings()
    lock = FileLock(str(STATE / "account.lock"), timeout=0)
    lock.acquire()
    client = None
    try:
        client = make_client(settings, updates=updates)
        await asyncio.wait_for(client.connect(), timeout=15)
        if not await client.is_user_authorized():
            raise RuntimeError("Telegram login is required. Run telegram/integration/setup.ps1 locally.")
        yield client
    finally:
        try:
            if client is not None:
                await client.disconnect()
        finally:
            lock.release()


def peer(value: str) -> str | int:
    value = value.strip()
    if not value:
        raise ValueError("A chat ID, username, or 'me' is required.")
    return int(value) if re.fullmatch(r"-?[0-9]+", value) else value


def message_json(message) -> dict:
    return {"id": message.id, "chat_id": message.chat_id,
            "sender_id": message.sender_id,
            "date": message.date.isoformat() if message.date else None,
            "text": message.message or "", "outgoing": message.out,
            "reply_to_message_id": message.reply_to_msg_id,
            "has_media": bool(message.media)}
