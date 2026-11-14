"""Publish the explicitly requested price post, preserving channel formatting."""
import asyncio
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import struct
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "telegram/integration"))
from channel_format import CONFIG, FOOTER, TIMESTAMP_SPACER
from common import account
from telethon import types
from telethon.extensions import html

FOLDER = ROOT / "telegram/content/2026-11-09"
RECEIPT = FOLDER / "pricing-published.json"
CHANNEL_STATE = FOLDER / "channel-published.json"


def save(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


async def main():
    artwork = FOLDER / "pricing-poster.png"
    data = artwork.read_bytes()
    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    assert struct.unpack(">II", data[16:24]) == (1080, 1440)
    caption = (FOLDER / "pricing-caption.html").read_text(encoding="utf-8")
    expected, entities = html.parse(caption)
    assert len(expected.encode("utf-16-le")) // 2 <= 1024
    assert expected.endswith(FOOTER + TIMESTAMP_SPACER)
    assert expected.count("@daneshyar_academic") == 1
    assert all(expected.count(tag) == 1 for tag in CONFIG["common_hashtags"])
    assert sum(isinstance(e, types.MessageEntityBold) for e in entities) == 6
    assert all(value in expected for value in ["۲۰۰٬۰۰۰", "۲۵۰٬۰۰۰", "۱۵۰٬۰۰۰", "۳۰۰٬۰۰۰"])

    async with account() as client:
        channel = await client.get_entity(types.PeerChannel(CONFIG["channel"]["id"]))
        assert channel.username == "daneshyar_samples"
        # Reuse an exact recent match after an interrupted publish; never duplicate it.
        existing = [m async for m in client.iter_messages(channel, limit=20)
                    if m.message == expected and m.photo]
        if existing:
            sent = existing[0]
        else:
            sent = await client.send_file(channel, artwork, caption=caption,
                                          parse_mode="html", force_document=False)
        receipt = {
            "id": sent.id, "url": f"https://t.me/daneshyar_samples/{sent.id}",
            "html": caption, "text": expected,
            "source_file": str(artwork.relative_to(ROOT)).replace("\\", "/"),
            "sha256": hashlib.sha256(data).hexdigest(),
            "published_at_utc": sent.date.isoformat(),
        }
        save(RECEIPT, receipt)
        stored = await client.get_messages(channel, ids=sent.id)
        assert stored.message == expected and stored.photo
        bold = [e for e in stored.entities or [] if isinstance(e, types.MessageEntityBold)]
        assert len(bold) == 6
        links = [e.url for e in stored.entities or [] if isinstance(e, types.MessageEntityTextUrl)]
        assert "https://t.me/daneshyar_samples/12" in links
        assert stored.message.endswith(TIMESTAMP_SPACER)
        sizes = [s for s in stored.photo.sizes if hasattr(s, "w") and hasattr(s, "h")]
        largest = max(sizes, key=lambda s: s.w * s.h)
        assert largest.w >= 700 and abs(largest.w / largest.h - 0.75) < 0.01
        await client.download_media(stored, file=str(FOLDER / "pricing-published.jpg"))
        receipt["verified"] = {
            "caption_matches": True, "bold_headings": len(bold),
            "sample_link": True, "timestamp_spacer": True,
            "photo_size": [largest.w, largest.h],
        }
        save(RECEIPT, receipt)
        state = json.loads(CHANNEL_STATE.read_text(encoding="utf-8"))
        state["posts"]["pricing"] = receipt
        state["updated_at_utc"] = datetime.now(timezone.utc).isoformat()
        visible = [m async for m in client.iter_messages(channel, limit=30) if not m.action]
        state["verified"]["visible_post_count"] = len(visible)
        save(CHANNEL_STATE, state)
        print(json.dumps({"url": receipt["url"], "verified": receipt["verified"]}))


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as exc:
        print(json.dumps({"ok": False, "error_type": type(exc).__name__,
                          "detail": "Check local receipt and channel before retrying; do not duplicate the post."}))
        sys.exit(1)
