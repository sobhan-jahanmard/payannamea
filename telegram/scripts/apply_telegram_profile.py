"""Apply the user-requested Daneshyar sales profile via the project's MCP tools."""
import asyncio
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "telegram/integration"))

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from telethon import functions
from telethon.errors import UsernameOccupiedError, UsernamePurchaseAvailableError
from common import account

FOLDER = ROOT / "telegram/content/2026-11-09"


def save(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


async def call(session, name, values):
    result = await session.call_tool(name, values)
    if result.isError:
        # MCP tool errors are already sanitized by the local server.
        raise RuntimeError(next(item.text for item in result.content if item.type == "text"))
    return result.structuredContent or json.loads(next(item.text for item in result.content if item.type == "text"))


async def main():
    plan = json.loads((FOLDER / "profile-plan.json").read_text(encoding="utf-8"))
    assert len(plan["bio"]) <= 70, "Bio must fit a non-Premium account"
    image = FOLDER / plan["photo"]
    assert image.is_file()
    image_hash = hashlib.sha256(image.read_bytes()).hexdigest()
    parameters = StdioServerParameters(command=sys.executable,
        args=[str(ROOT / "telegram/integration/server.py")])
    async with stdio_client(parameters) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            before = await call(session, "telegram_get_profile", {})
            backup = FOLDER / "profile-before.json"
            if not backup.exists():
                save(backup, before)
            changes = {key: plan[key] for key in ("first_name", "last_name", "bio")
                       if (before.get(key) or "") != plan[key]}
            if changes:
                await call(session, "telegram_update_profile", changes)
            receipt = FOLDER / "profile-applied.json"
            previous = json.loads(receipt.read_text(encoding="utf-8")) if receipt.exists() else {}
            if not (previous.get("photo_sha256") == image_hash and
                    previous.get("profile", {}).get("photo_id") == before.get("photo_id")):
                await call(session, "telegram_set_profile_photo", {"image_path": str(image)})
            profile = await call(session, "telegram_get_profile", {})
            save(receipt, {"applied_at_utc": datetime.now(timezone.utc).isoformat(),
                           "photo_sha256": image_hash, "profile": profile})
            assert profile["first_name"] == plan["first_name"]
            assert (profile.get("last_name") or "") == plan["last_name"]
            assert profile["bio"] == plan["bio"]
            assert profile["photo_id"] is not None
            # Persist confirmed fields immediately so a later username failure does not
            # cause duplicate photo uploads on a retry.
            save(receipt, {"applied_at_utc": datetime.now(timezone.utc).isoformat(),
                           "photo_sha256": image_hash, "profile": profile})
    username_note = "Existing username preserved"
    if not profile.get("username"):
        async with account() as client:
            for candidate in plan["username_candidates"]:
                try:
                    if await client(functions.account.CheckUsernameRequest(username=candidate)):
                        await client(functions.account.UpdateUsernameRequest(username=candidate))
                        me = await client.get_me()
                        profile["username"] = me.username
                        assert me.username == candidate
                        username_note = "Public username set and verified"
                        break
                except (UsernameOccupiedError, UsernamePurchaseAvailableError):
                    continue
            else:
                username_note = "Candidate usernames unavailable; display name, bio and photo applied"
    save(receipt, {"applied_at_utc": datetime.now(timezone.utc).isoformat(),
                   "photo_sha256": image_hash, "profile": profile, "username_note": username_note})
    print(json.dumps({"verified": True, "profile": profile,
                      "bio_length": len(plan["bio"]), "username_note": username_note}, ensure_ascii=True))


if __name__ == "__main__":
    asyncio.run(main())
