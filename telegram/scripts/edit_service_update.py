"""Update the two existing Daneshyar channel posts through the saved Telegram session."""
import asyncio
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "telegram/integration"))
from channel_format import CONFIG, FOOTER, TIMESTAMP_SPACER
from common import account
from telethon import types
from telethon.extensions.html import parse

FOLDER = ROOT / "telegram/content/2026-11-17"


def post_spec(id_, filename, media=None):
    caption = (FOLDER / filename).read_text(encoding="utf-8")
    text, entities = parse(caption)
    assert text.endswith(FOOTER + TIMESTAMP_SPACER)
    assert text.count(CONFIG["contact"]["telegram"]) == 1
    return {"id": id_, "caption": caption, "text": text, "entities": entities, "media": media}


def formatted_entities(entities):
    return [entity for entity in entities or [] if isinstance(entity, (types.MessageEntityBold, types.MessageEntityTextUrl))]


async def main():
    history = json.loads((FOLDER.parent / "2026-11-09/pricing-published.json").read_text(encoding="utf-8"))
    poster = FOLDER / "pricing-poster.jpg"
    if not poster.is_file():
        raise RuntimeError("Run marketing/render-tariffs.ps1 to create the current tariff image")
    pricing = post_spec(history["id"], "pricing-caption.html", poster)
    samples = post_spec(CONFIG["sample_post"]["message_id"], "samples.html")
    async with account() as client:
        me = await client.get_me()
        if (me.username or "").casefold() != CONFIG["contact"]["telegram"].lstrip("@").casefold():
            raise RuntimeError("The connected Telegram account is not @daneshyar_academic")
        channel = await client.get_entity(CONFIG["channel"]["username"])
        if channel.id != CONFIG["channel"]["id"] or not (channel.creator or getattr(channel.admin_rights, "edit_messages", False)):
            raise RuntimeError("The Telegram account cannot edit the target channel")
        for spec in [pricing, samples]:
            before = await client.get_messages(channel, ids=spec["id"])
            if (not before or not before.message.startswith(spec["text"].splitlines()[0])
                    or bool(before.photo) != bool(spec["media"]) or (not spec["media"] and not before.pinned)):
                raise RuntimeError("A target message differs from the expected channel post")
        verified = []
        for spec in [pricing, samples]:
            before = await client.get_messages(channel, ids=spec["id"])
            expected = formatted_entities(spec["entities"])
            if before.message != spec["text"] or formatted_entities(before.entities) != expected:
                await client.edit_message(channel, spec["id"], spec["caption"], file=spec["media"],
                                          link_preview=False, parse_mode="html")
            after = await client.get_messages(channel, ids=spec["id"])
            if after.message != spec["text"]:
                raise RuntimeError("Telegram did not return the saved post text")
            if formatted_entities(after.entities) != expected or bool(after.photo) != bool(spec["media"]) or (not spec["media"] and not after.pinned):
                raise RuntimeError("Telegram did not return the expected formatting, media or pin")
            verified.append({"url": f'{CONFIG["channel"]["url"]}/{after.id}', "text": after.message,
                             "photo_id": after.photo.id if after.photo else None, "pinned": after.pinned,
                             "edit_date": after.edit_date.isoformat() if after.edit_date else None})
        (FOLDER / "service-update.json").write_text(json.dumps(verified, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({"verified": [item["url"] for item in verified]}))


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as exc:
        print(json.dumps({"error_type": type(exc).__name__,
                          "detail": str(exc) if isinstance(exc, RuntimeError) else "Telegram did not complete the channel update."}))
        sys.exit(1)
