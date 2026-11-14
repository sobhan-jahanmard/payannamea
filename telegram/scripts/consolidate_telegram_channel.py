"""Consolidate the user's sample channel into three posts, preserving the pinned URL."""
import asyncio
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys
from urllib.request import Request, urlopen
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "telegram/integration"))
from common import account
from telethon import functions, types

FOLDER = ROOT / "telegram/content/2026-11-09"
RECEIPT = FOLDER / "channel-published.json"
ARCHIVE = FOLDER / "Daneshyar-5-Samples.zip"
SAMPLES = [
    ("bachelor", "bachelor-thesis.pdf", "پایان‌نامه / پروژه کارشناسی"),
    ("master", "master-thesis.pdf", "پایان‌نامه کارشناسی ارشد"),
    ("proposal", "proposal.pdf", "پروپوزال"),
    ("research", "research-assignment.pdf", "تحقیق دانشگاهی"),
    ("presentation", "presentation.pdf", "ارائه و پاورپوینت"),
]
CONTACT = ("💬 پیام مستقیم و پیگیری سفارش: @daneshyar_academic\n"
           "https://t.me/daneshyar_academic\n"
           "🌐 ثبت سفارش: https://daneshyar.vercel.app/order\n"
           "✉️ ایمیل: admin.daneshyar@gmail.com")
WELCOME = ("🎓 دانشیار | خدمات دانشگاهی از ایده تا تحویل\n\n"
           "همراه شما در پایان‌نامه کارشناسی و ارشد، پروپوزال، تحقیق دانشگاهی و طراحی ارائه و پاورپوینت.\n\n"
           "موضوع، فایل‌ها، شیوه‌نامه دانشگاه و مهلت تحویل را ارسال کنید تا جزئیات درخواست بررسی شود.\n"
           "نمونه‌های هر پنج خدمت در پست پین‌شده قرار دارند.\n\n"
           "راه‌های تماس و ثبت درخواست:\n" + CONTACT + "\n\n#دانشیار #خدمات_دانشگاهی")
GUIDE = ("📝 چطور سفارش ثبت کنیم؟\n\n"
         "۱. نوع خدمت، رشته و مقطع را مشخص کنید.\n"
         "۲. موضوع، دانشگاه و مهلت تحویل را بنویسید.\n"
         "۳. منابع، داده‌ها، شیوه‌نامه و توضیحات استاد را ضمیمه کنید.\n"
         "۴. درخواست بررسی می‌شود و زمان، هزینه و جزئیات انجام با شما هماهنگ خواهد شد.\n"
         "۵. وضعیت کار و فایل‌های نهایی را از حساب کاربری سایت پیگیری کنید.\n\n"
         "برای شروع می‌توانید مستقیم به اکانت زیر پیام بدهید یا درخواست را در سایت ثبت کنید:\n\n"
         + CONTACT + "\n\n#ثبت_سفارش")


def sample_caption():
    lines = ["📎 هر پنج نمونه‌کار دانشیار در یک پیام", "",
             "فایل ZIP شامل پنج PDF نمونه است. برای دانلود جداگانه، لینک هر نمونه را باز کنید:", ""]
    for index, (_, filename, title) in enumerate(SAMPLES, 1):
        lines.extend([f"{index}. {title}", f"https://daneshyar.vercel.app/sample/{filename}"])
    lines.extend(["", "نسخه ارائه، پیش‌نمایش PDF اسلایدهاست. نمونه‌ها برای آشنایی با ساختار و شیوه ارائه‌اند.", "",
                  "راه‌های تماس و ثبت درخواست:", CONTACT, "", "#نمونه_کار"])
    return "\n".join(lines)


def save(state):
    state["updated_at_utc"] = datetime.now(timezone.utc).isoformat()
    RECEIPT.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def prepare_archive():
    with ZipFile(ARCHIVE, "w", compression=ZIP_DEFLATED) as bundle:
        for _, filename, _ in SAMPLES:
            source = ROOT / "frontend/public/sample" / filename
            bundle.write(source, arcname=filename)
    with ZipFile(ARCHIVE) as bundle:
        assert bundle.testzip() is None
        assert len(bundle.namelist()) == 5
        for _, filename, _ in SAMPLES:
            assert bundle.read(filename) == (ROOT / "frontend/public/sample" / filename).read_bytes()
    for _, filename, _ in SAMPLES:
        request = Request(f"https://daneshyar.vercel.app/sample/{filename}", method="HEAD")
        with urlopen(request, timeout=20) as response:
            assert response.status == 200 and "application/pdf" in response.headers.get("Content-Type", "")


async def main():
    caption = sample_caption()
    assert len(caption.encode("utf-16-le")) // 2 <= 1024
    assert len(WELCOME.encode("utf-16-le")) // 2 <= 1024
    await asyncio.to_thread(prepare_archive)
    state = json.loads(RECEIPT.read_text(encoding="utf-8"))
    snapshot = FOLDER / "channel-before-consolidation.json"
    if not snapshot.exists():
        snapshot.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    index_id = state["posts"].get("samples", state["posts"].get("index"))["id"]
    async with account() as client:
        channel = await client.get_entity(types.PeerChannel(state["channel_id"]))
        assert channel.creator and channel.username == "daneshyar_samples"
        before = await client.get_messages(channel, ids=index_id)
        if not (before.document and before.file.name == ARCHIVE.name and before.message == caption):
            await client.edit_message(channel, index_id, caption, file=ARCHIVE,
                                      force_document=True, parse_mode=None)
        combined = await client.get_messages(channel, ids=index_id)
        assert combined.document and combined.file.name == ARCHIVE.name and combined.message == caption
        download = await client.download_media(combined, bytes)
        assert hashlib.sha256(download).digest() == hashlib.sha256(ARCHIVE.read_bytes()).digest()
        # The replacement is verified before removing any of the separate posts.
        old_posts = state.setdefault("retired_posts", {})
        old_ids = []
        for key, _, _ in SAMPLES:
            if key in state["posts"]:
                old_posts[key] = state["posts"][key]
                old_ids.append(state["posts"][key]["id"])
        if old_ids:
            await client.delete_messages(channel, old_ids, revoke=True)
            assert all(m is None for m in await client.get_messages(channel, ids=old_ids))
        for key, _, _ in SAMPLES:
            state["posts"].pop(key, None)
        state["posts"].pop("index", None)
        state["posts"]["samples"] = {"id": index_id, "url": f"{state['url']}/{index_id}",
                                      "text": caption, "source_file": str(ARCHIVE.relative_to(ROOT)).replace("\\", "/"),
                                      "sha256": hashlib.sha256(ARCHIVE.read_bytes()).hexdigest(),
                                      "included_files": [filename for _, filename, _ in SAMPLES]}
        save(state)
        for key, text in (("welcome", WELCOME), ("order_guide", GUIDE)):
            message_id = state["posts"][key]["id"]
            message = await client.get_messages(channel, ids=message_id)
            if message.message != text:
                await client.edit_message(channel, message_id, text, parse_mode=None, link_preview=False)
            state["posts"][key]["text"] = text
            save(state)
        about = ("پنج نمونه‌کار پایان‌نامه، پروپوزال، تحقیق و پاورپوینت در پست پین‌شده\n"
                 "پیام مستقیم: @daneshyar_academic\nhttps://t.me/daneshyar_academic\n"
                 "سایت: daneshyar.vercel.app\nایمیل: admin.daneshyar@gmail.com")
        full = await client(functions.channels.GetFullChannelRequest(channel))
        if full.full_chat.about != about:
            await client(functions.messages.EditChatAboutRequest(peer=channel, about=about))
        if full.full_chat.pinned_msg_id != index_id:
            await client(functions.messages.UpdatePinnedMessageRequest(peer=channel, id=index_id, silent=True))
        # Remove only the old pin notification pointing to this replaced index.
        old_pin_notices = []
        async for message in client.iter_messages(channel, limit=40):
            if isinstance(message.action, types.MessageActionPinMessage) and message.reply_to_msg_id == index_id:
                old_pin_notices.append(message.id)
        if old_pin_notices:
            await client.delete_messages(channel, old_pin_notices, revoke=True)
        for key, expected in (("welcome", WELCOME), ("order_guide", GUIDE), ("samples", caption)):
            message = await client.get_messages(channel, ids=state["posts"][key]["id"])
            assert message and message.message == expected
            assert "@daneshyar_academic" in message.message
            assert "https://t.me/daneshyar_academic" in message.message
        full = await client(functions.channels.GetFullChannelRequest(channel))
        assert full.full_chat.pinned_msg_id == index_id
        visible = [m async for m in client.iter_messages(channel, limit=40) if not m.action]
        assert len(visible) == 3 and sum(bool(m.document) for m in visible) == 1
        state["verified"] = {"visible_post_count": 3, "sample_post_count": 1, "pdf_count_in_zip": 5,
                             "download_hashes_match": True, "index_pinned": True,
                             "direct_contact_in_all_posts": True}
        save(state)
        print(json.dumps({"channel": state["url"], "samples_post": state["posts"]["samples"]["url"],
                          "verified": state["verified"]}, ensure_ascii=True))


if __name__ == "__main__":
    asyncio.run(main())
