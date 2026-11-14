"""Add the user-provided Instagram link to every current channel post and template."""
import asyncio
import copy
from datetime import datetime, timezone
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "telegram/integration"))
from common import account
from telethon import functions, types

FORMAT = ROOT / "telegram/channel-format.json"
RECEIPT = ROOT / "telegram/content/2026-11-09/channel-published.json"
INSTAGRAM = "https://instagram.com/daneshyar.web"
NEW_LINE = "📷 اینستاگرام: " + INSTAGRAM


def units(value):
    return len(value.encode("utf-16-le")) // 2


def save(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


async def main():
    config = json.loads(FORMAT.read_text(encoding="utf-8"))
    old_footer = config["divider"] + "\n" + "\n".join(config["footer_lines"])
    if NEW_LINE not in config["footer_lines"]:
        config["footer_lines"].insert(1, NEW_LINE)
    config["contact"]["instagram"] = INSTAGRAM
    config["version"] = 2
    new_footer = config["divider"] + "\n" + "\n".join(config["footer_lines"])
    state = json.loads(RECEIPT.read_text(encoding="utf-8"))
    updated = []
    async with account() as client:
        channel = await client.get_entity(types.PeerChannel(config["channel"]["id"]))
        posts = [m async for m in client.iter_messages(channel, limit=50) if not m.action]
        assert {m.id for m in posts} == {p["id"] for p in state["posts"].values()}
        for message in posts:
            if NEW_LINE not in message.message:
                assert message.message.endswith(old_footer + config["timestamp_spacer"])
                marker = config["footer_lines"][0] + "\n"
                position = message.message.index(marker) + len(marker)
                added = NEW_LINE + "\n"
                offset, delta = units(message.message[:position]), units(added)
                desired = message.message[:position] + added + message.message[position:]
                entities = copy.deepcopy(message.entities or [])
                for entity in entities:
                    if entity.offset >= offset:
                        entity.offset += delta
                    elif entity.offset + entity.length > offset:
                        entity.length += delta
                url_offset = offset + units(NEW_LINE[:NEW_LINE.index(INSTAGRAM)])
                entities.append(types.MessageEntityUrl(offset=url_offset, length=units(INSTAGRAM)))
                entities.sort(key=lambda entity: (entity.offset, -entity.length))
                await client.edit_message(channel, message.id, desired, parse_mode=None,
                                          formatting_entities=entities, link_preview=False)
            saved = await client.get_messages(channel, ids=message.id)
            assert saved.message.count(INSTAGRAM) == 1
            assert saved.message.endswith(new_footer + config["timestamp_spacer"])
            assert saved.message.count("@daneshyar_academic") == 1
            assert "#دانشیار" in saved.message and "#خدمات_دانشگاهی" in saved.message
            post = next(p for p in state["posts"].values() if p["id"] == message.id)
            post["text"] = saved.message
            if post.get("html") and NEW_LINE not in post["html"]:
                assert old_footer in post["html"]
                post["html"] = post["html"].replace(old_footer, new_footer)
            updated.append(message.id)
            state["updated_at_utc"] = datetime.now(timezone.utc).isoformat()
            save(RECEIPT, state)
    save(FORMAT, config)
    state["verified"]["instagram_contact_in_all_posts"] = True
    save(RECEIPT, state)
    print(json.dumps({"updated_posts": sorted(updated), "instagram": INSTAGRAM,
                      "saved_in_template": True, "footer_spacing_preserved": True}))


if __name__ == "__main__":
    asyncio.run(main())
