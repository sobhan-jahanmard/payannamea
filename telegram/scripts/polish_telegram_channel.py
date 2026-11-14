"""Apply the user's final channel copy, links, footer and no-ZIP layout."""
import asyncio
from datetime import datetime, timezone
from html import escape
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "telegram/integration"))
from common import account
from channel_format import DIVIDER, FOOTER, format_post
from telethon import functions, types

FOLDER = ROOT / "telegram/content/2026-11-09"
RECEIPT = FOLDER / "channel-published.json"
def finish(body, tags):
    return format_post(body, tags)


WELCOME = finish(
    "<b>🎓 دانشیار | خدمات دانشگاهی</b>\n"
    "از ایده تا تحویل\n\n"
    "• پایان‌نامه و پروژه کارشناسی\n"
    "• پایان‌نامه کارشناسی ارشد\n"
    "• پروپوزال و تحقیق دانشگاهی\n"
    "• طراحی ارائه و پاورپوینت\n\n"
    "درخواست شما با توجه به موضوع، شیوه‌نامه دانشگاه و مهلت تحویل بررسی می‌شود. "
    "برای آشنایی با خروجی‌ها، نمونه‌کارها را در پست پین‌شده ببینید.",
    "#دانشیار #خدمات_دانشگاهی #پایان_نامه #پروپوزال #پاورپوینت",
)
GUIDE = finish(
    "<b>📝 راهنمای ثبت سفارش</b>\n\n"
    "۱. نوع خدمت، رشته و مقطع را مشخص کنید.\n"
    "۲. موضوع، دانشگاه و مهلت تحویل را بنویسید.\n"
    "۳. منابع، داده‌ها، شیوه‌نامه و توضیحات استاد را ضمیمه کنید.\n"
    "۴. پس از بررسی درخواست، زمان، هزینه و جزئیات انجام با شما هماهنگ می‌شود.\n"
    "۵. وضعیت کار و فایل‌های نهایی را از حساب کاربری سایت پیگیری کنید.\n\n"
    "برای شروع، از طریق سایت درخواست ثبت کنید یا در تلگرام پیام بدهید.",
    "#دانشیار #خدمات_دانشگاهی #ثبت_سفارش",
)
SAMPLE_FILES = [
    ("پایان‌نامه / پروژه کارشناسی", "bachelor-thesis.pdf"),
    ("پایان‌نامه کارشناسی ارشد", "master-thesis.pdf"),
    ("پروپوزال پایان‌نامه", "proposal.pdf"),
    ("تحقیق دانشگاهی", "research-assignment.pdf"),
    ("ارائه و پاورپوینت", "presentation.pdf"),
]
SAMPLES = finish(
    "<b>📎 نمونه‌کارها</b>\n\n"
    "برای مشاهده و دانلود، روی عنوان هر نمونه بزنید:\n\n"
    + "\n\n".join(f'• <a href="https://daneshyar.vercel.app/sample/{filename}">{escape(title)}</a>'
                    for title, filename in SAMPLE_FILES)
    + "\n\nنمونهٔ ارائه، پیش‌نمایش PDF اسلایدهاست.",
    "#دانشیار #خدمات_دانشگاهی #نمونه_کار",
)
ABOUT = ("نمونه‌کار و معرفی خدمات دانشگاهی دانشیار\n\n" + FOOTER)


def save(state):
    state["updated_at_utc"] = datetime.now(timezone.utc).isoformat()
    RECEIPT.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def plain(html):
    from telethon.extensions import html as parser
    return parser.parse(html)[0]


async def main():
    for html in (WELCOME, GUIDE, SAMPLES):
        text = plain(html)
        assert text.count("@daneshyar_academic") == 1
        assert "/order" not in text and "t.me/daneshyar_academic" not in text
        assert text.count(DIVIDER) == 1
        assert "#دانشیار" in text and "#خدمات_دانشگاهی" in text
        assert text.removesuffix("\n\u2060").endswith(FOOTER)
    assert len(plain(WELCOME).encode("utf-16-le")) // 2 <= 1024
    assert len(ABOUT) <= 255
    state = json.loads(RECEIPT.read_text(encoding="utf-8"))
    async with account() as client:
        channel = await client.get_entity(types.PeerChannel(state["channel_id"]))
        assert channel.creator and channel.username == "daneshyar_samples"
        live = [m async for m in client.iter_messages(channel, limit=50) if not m.action]
        backup = FOLDER / "channel-before-polish.json"
        if not backup.exists():
            backup.write_text(json.dumps({"posts": [{"id": m.id, "text": m.message,
                "document_name": m.file.name if m.document else None} for m in live]},
                ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        for key, html in (("welcome", WELCOME), ("order_guide", GUIDE)):
            current = await client.get_messages(channel, ids=state["posts"][key]["id"])
            if current.message != plain(html) or not any(isinstance(e, types.MessageEntityBold) for e in (current.entities or [])):
                await client.edit_message(channel, current.id, html, parse_mode="html", link_preview=False)
            state["posts"][key]["text"] = plain(html)
            state["posts"][key]["html"] = html
            save(state)
        old = await client.get_messages(channel, ids=state["posts"]["samples"]["id"])
        replacement = next((m for m in live if not m.document and m.message == plain(SAMPLES)), None)
        if old.document:
            if replacement is None:
                replacement = await client.send_message(channel, SAMPLES, parse_mode="html", link_preview=False, silent=True)
            verified = await client.get_messages(channel, ids=replacement.id)
            assert verified and not verified.document and verified.message == plain(SAMPLES)
            links = [e.url for e in verified.entities or [] if isinstance(e, types.MessageEntityTextUrl)]
            assert links == [f"https://daneshyar.vercel.app/sample/{filename}" for _, filename in SAMPLE_FILES]
            await client(functions.messages.UpdatePinnedMessageRequest(peer=channel, id=replacement.id, silent=True))
            state.setdefault("retired_posts", {})["samples_zip"] = state["posts"]["samples"]
            state["posts"]["samples"] = {"id": replacement.id, "url": f"{state['url']}/{replacement.id}",
                "text": plain(SAMPLES), "html": SAMPLES, "download_links": links}
            save(state)
            await client.delete_messages(channel, [old.id], revoke=True)
        else:
            if old.message != plain(SAMPLES):
                await client.edit_message(channel, old.id, SAMPLES, parse_mode="html", link_preview=False)
            state["posts"]["samples"].update({"text": plain(SAMPLES), "html": SAMPLES,
                "download_links": [f"https://daneshyar.vercel.app/sample/{f}" for _, f in SAMPLE_FILES]})
            save(state)
        full = await client(functions.channels.GetFullChannelRequest(channel))
        if full.full_chat.about != ABOUT:
            await client(functions.messages.EditChatAboutRequest(channel, ABOUT))
        pin_id = state["posts"]["samples"]["id"]
        if full.full_chat.pinned_msg_id != pin_id:
            await client(functions.messages.UpdatePinnedMessageRequest(peer=channel, id=pin_id, silent=True))
        notifications = [m.id async for m in client.iter_messages(channel, limit=50)
                         if isinstance(m.action, types.MessageActionPinMessage)]
        if notifications:
            await client.delete_messages(channel, notifications, revoke=True)
        final = [m async for m in client.iter_messages(channel, limit=50) if not m.action]
        assert len(final) == 3 and not any(m.document for m in final)
        for message in final:
            assert message.message.count("@daneshyar_academic") == 1
            assert "t.me/daneshyar_academic" not in message.message and "/order" not in message.message
            assert message.message.removesuffix("\n\u2060").endswith(FOOTER)
            assert all(tag in message.message for tag in ("#دانشیار", "#خدمات_دانشگاهی"))
        full = await client(functions.channels.GetFullChannelRequest(channel))
        assert full.full_chat.pinned_msg_id == pin_id
        state["layout_version"] = 3
        state["verified"] = {"visible_post_count": 3, "zip_removed": True, "sample_download_links": 5,
            "single_telegram_contact_per_post": True, "homepage_links": True,
            "contact_footer_divider": True, "common_hashtags_in_all_posts": True, "samples_pinned": True}
        save(state)
        print(json.dumps({"channel": state["url"], "samples": state["posts"]["samples"]["url"],
                          "verified": state["verified"]}, ensure_ascii=True))


if __name__ == "__main__":
    asyncio.run(main())
