"""Reserve a final blank line for Telegram's timestamp without changing post content."""
import asyncio
from datetime import datetime, timezone
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "telegram/integration"))
from common import account
from telethon import types

RECEIPT = ROOT / "telegram/content/2026-11-09/channel-published.json"
SPACER = "\n\u2060"


async def main():
    state = json.loads(RECEIPT.read_text(encoding="utf-8"))
    verified = []
    async with account() as client:
        channel = await client.get_entity(types.PeerChannel(state["channel_id"]))
        for key, post in state["posts"].items():
            current = await client.get_messages(channel, ids=post["id"])
            assert current and current.message
            base = current.message.removesuffix(SPACER)
            assert base.endswith("admin.daneshyar@gmail.com")
            desired = base + SPACER
            if current.message != desired:
                await client.edit_message(channel, current.id, desired, parse_mode=None,
                    formatting_entities=current.entities, link_preview=False)
            saved = await client.get_messages(channel, ids=current.id)
            assert saved.message == desired
            assert saved.message.removesuffix(SPACER) == base
            assert saved.entities == current.entities
            post["text"] = saved.message
            if post.get("html") and not post["html"].endswith(SPACER):
                post["html"] += SPACER
            verified.append(saved.id)
    state["updated_at_utc"] = datetime.now(timezone.utc).isoformat()
    state["verified"]["timestamp_spacer_in_all_posts"] = True
    RECEIPT.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"updated_posts": verified, "final_line_preserved": True,
                      "formatting_and_links_preserved": True}))


if __name__ == "__main__":
    asyncio.run(main())
