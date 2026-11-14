"""Publish the explicitly authorized five website samples to a branded channel."""
import asyncio
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "telegram/integration"))
from common import account
from telethon import functions, types, utils
from telethon.errors import UsernameOccupiedError, UsernamePurchaseAvailableError

FOLDER = ROOT / "telegram/content/2026-11-09"
RECEIPT = FOLDER / "channel-published.json"
TITLE = "دانشیار | نمونه‌کار و خدمات دانشگاهی"
ABOUT = "نمونه‌کار پایان‌نامه، پروپوزال، تحقیق و پاورپوینت\nثبت سفارش: https://daneshyar.vercel.app/order\nپشتیبانی: @daneshyar_academic\nایمیل: admin.daneshyar@gmail.com"
ORDER = "https://daneshyar.vercel.app/order"
SUPPORT = "@daneshyar_academic"
EMAIL = "admin.daneshyar@gmail.com"
SAMPLES = [
    {"key": "bachelor", "file": "bachelor-thesis.pdf", "title": "نمونه پایان‌نامه / پروژه کارشناسی",
     "subject": "طراحی کارخانه تولید پلی‌استر پلی‌ال با استفاده از PET بازیافتی",
     "pages": 78, "detail": "نمونه‌ای از ساختار گزارش مهندسی، بررسی منابع، طراحی مفهومی و جمع‌بندی پژوهش.",
     "tag": "#پایان_نامه_کارشناسی"},
    {"key": "master", "file": "master-thesis.pdf", "title": "نمونه پایان‌نامه کارشناسی ارشد",
     "subject": "مسئولیت مدنی سکوهای بازارگاه اینترنتی در قبال عرضه کالای معیوب توسط فروشندگان ثالث در حقوق ایران",
     "pages": 108, "detail": "برای آشنایی با فصل‌بندی پایان‌نامه، طرح مسئله، تحلیل حقوقی و شیوه ارائه منابع.",
     "tag": "#پایان_نامه_ارشد"},
    {"key": "proposal", "file": "proposal.pdf", "title": "نمونه پروپوزال پایان‌نامه",
     "subject": "مسئولیت مدنی بازارگاه‌های اینترنتی در حقوق ایران",
     "pages": 18, "detail": "نمونه تنظیم مسئله پژوهش، اهداف، پرسش‌ها، روش تحقیق و منابع اولیه.",
     "tag": "#پروپوزال"},
    {"key": "research", "file": "research-assignment.pdf", "title": "نمونه تحقیق دانشگاهی",
     "subject": "مقایسه قواعد اولویت‌بندی کارها در کاهش زمان انتظار و تأخیر سفارش‌ها در کارگاه‌های تولیدی کوچک",
     "pages": 18, "detail": "گزارش درس تحقیق در عملیات با مثال محاسباتی، تحلیل، نمودار و منابع.",
     "tag": "#تحقیق_دانشگاهی"},
    {"key": "presentation", "file": "presentation.pdf", "title": "نمونه ارائه و پاورپوینت",
     "subject": "ارائه پروژه طراحی کارخانه تولید پلی‌استر پلی‌ال با PET بازیافتی",
     "pages": 10, "detail": "پیش‌نمایش PDF از ۱۰ اسلاید ارائه؛ برای مشاهده چیدمان، نمودارها و مسیر روایت.",
     "tag": "#پاورپوینت"},
]


def save(data):
    data["updated_at_utc"] = datetime.now(timezone.utc).isoformat()
    RECEIPT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def caption(sample):
    unit = "اسلاید" if sample["key"] == "presentation" else "صفحه"
    return (f"📎 {sample['title']}\n\nموضوع: {sample['subject']}\n"
            f"PDF | {sample['pages']} {unit}\n\n{sample['detail']}\n\n"
            "این فایل همان نمونه منتشرشده در سایت دانشیار است و برای آشنایی با ساختار خروجی ارائه می‌شود.\n\n"
            f"ثبت درخواست و ارسال مشخصات:\n{ORDER}\n"
            f"پشتیبانی: {SUPPORT}\n{EMAIL}\n\n#نمونه_کار {sample['tag']}")


async def main():
    for sample in SAMPLES:
        assert (ROOT / "frontend/public/sample" / sample["file"]).is_file()
        assert len(caption(sample)) <= 1024
    state = json.loads(RECEIPT.read_text(encoding="utf-8")) if RECEIPT.exists() else {"posts": {}}
    async with account() as client:
        channel = None
        if state.get("channel_id"):
            channel = await client.get_entity(types.PeerChannel(state["channel_id"]))
        else:
            # Recover a prior create request if it succeeded before a local interruption.
            async for dialog in client.iter_dialogs():
                entity = dialog.entity
                if getattr(entity, "creator", False) and getattr(entity, "broadcast", False) and dialog.name == TITLE:
                    channel = entity
                    break
            if channel is None:
                created = await client(functions.channels.CreateChannelRequest(title=TITLE, about=ABOUT, broadcast=True))
                channel = next(c for c in created.chats if isinstance(c, types.Channel))
            state["channel_id"] = channel.id
            save(state)
        assert channel.creator and channel.broadcast
        if not channel.username:
            for name in ("daneshyar_samples", "daneshyar_portfolio", "daneshyar_academic_samples"):
                try:
                    if await client(functions.channels.CheckUsernameRequest(channel=channel, username=name)):
                        await client(functions.channels.UpdateUsernameRequest(channel=channel, username=name))
                        channel = await client.get_entity(types.PeerChannel(channel.id))
                        break
                except (UsernameOccupiedError, UsernamePurchaseAvailableError):
                    continue
        assert channel.username, "A public channel username is required before publishing."
        state["username"] = channel.username
        state["url"] = f"https://t.me/{channel.username}"
        save(state)
        current_full = await client(functions.channels.GetFullChannelRequest(channel))
        if current_full.full_chat.about != ABOUT:
            await client(functions.messages.EditChatAboutRequest(peer=channel, about=ABOUT))
        if not state.get("photo_set"):
            uploaded = await client.upload_file(FOLDER / "daneshyar-telegram-avatar.png")
            await client(functions.channels.EditPhotoRequest(channel, types.InputChatUploadedPhoto(uploaded)))
            state["photo_set"] = True
            save(state)

        async def post(key, text, file=None, thumb=None):
            if key in state["posts"]:
                message = await client.get_messages(channel, ids=state["posts"][key]["id"])
                assert message and message.message == text, f"Published post changed: {key}"
                return message
            if file:
                message = await client.send_file(channel, file, caption=text, parse_mode=None,
                                                 force_document=file.suffix.lower() == ".pdf", thumb=thumb)
            else:
                message = await client.send_message(channel, text, parse_mode=None, link_preview=False)
            state["posts"][key] = {"id": message.id, "url": f"{state['url']}/{message.id}", "text": text}
            if file and file.suffix.lower() == ".pdf":
                state["posts"][key]["source_file"] = str(file.relative_to(ROOT)).replace("\\", "/")
                state["posts"][key]["sha256"] = hashlib.sha256(file.read_bytes()).hexdigest()
            save(state)
            return message

        welcome = ("🎓 دانشیار | خدمات دانشگاهی از ایده تا تحویل\n\n"
                   "اینجا نمونه‌های پنج خدمت دانشیار را ببینید:\n"
                   "• پایان‌نامه و پروژه کارشناسی\n• پایان‌نامه کارشناسی ارشد\n"
                   "• پروپوزال\n• تحقیق دانشگاهی\n• ارائه و پاورپوینت\n\n"
                   "برای شروع، مشخصات درخواست و فایل‌هایتان را در سایت ثبت کنید. "
                   "موضوع، شیوه‌نامه دانشگاه و مهلت تحویل پیش از شروع بررسی می‌شوند.\n\n"
                   f"🌐 {ORDER}\n💬 {SUPPORT}\n✉️ {EMAIL}\n\n#دانشیار #خدمات_دانشگاهی")
        await post("welcome", welcome, ROOT / "telegram/assets/daneshyar-telegram-v1.png")
        for sample in SAMPLES:
            thumb = ROOT / "telegram/previews" / f"telegram-{Path(sample['file']).stem}-thumb.jpg"
            await post(sample["key"], caption(sample), ROOT / "frontend/public/sample" / sample["file"],
                       thumb if thumb.exists() else None)
        guide = ("📝 راهنمای ثبت سفارش دانشیار\n\n"
                 "۱. نوع خدمت و مقطع را انتخاب کنید.\n"
                 "۲. موضوع، رشته، دانشگاه و مهلت تحویل را بنویسید.\n"
                 "۳. شیوه‌نامه، منابع، داده‌ها و توضیحات استاد را ضمیمه کنید.\n"
                 "۴. درخواست بررسی می‌شود و جزئیات انجام با شما هماهنگ خواهد شد.\n"
                 "۵. وضعیت سفارش و فایل‌های نهایی را از حساب کاربری پیگیری کنید.\n\n"
                 "زمان و هزینه به موضوع، حجم کار و فایل‌های ورودی وابسته است؛ "
                 "هنگام ثبت درخواست، اطلاعات را کامل وارد کنید.\n\n"
                 f"ثبت درخواست:\n{ORDER}\n\nپشتیبانی: {SUPPORT}\nایمیل: {EMAIL}\n\n#ثبت_سفارش")
        await post("order_guide", guide)
        lines = ["📌 از اینجا شروع کنید | فهرست نمونه‌کارهای دانشیار", "",
                 "پنج نمونه PDF موجود در سایت، همراه با معرفی هر خدمت:", ""]
        for i, sample in enumerate(SAMPLES, 1):
            lines.extend([f"{i}. {sample['title']}", state["posts"][sample["key"]]["url"], ""])
        lines.extend(["راهنمای ثبت سفارش:", state["posts"]["order_guide"]["url"], "",
                      "نمونه‌ها برای مشاهده ساختار و شیوه ارائه‌اند؛ مشخصات هر سفارش جداگانه بررسی می‌شود.", "",
                      f"🌐 ثبت سفارش: {ORDER}", f"💬 پشتیبانی: {SUPPORT}", f"✉️ {EMAIL}"])
        index = await post("index", "\n".join(lines))
        await client(functions.messages.UpdatePinnedMessageRequest(peer=channel, id=index.id, silent=True))
        await client(functions.account.UpdatePersonalChannelRequest(channel=utils.get_input_channel(channel)))
        me = await client.get_me()
        profile = await client(functions.users.GetFullUserRequest(me))
        full = await client(functions.channels.GetFullChannelRequest(channel))
        assert profile.full_user.personal_channel_id == channel.id
        assert full.full_chat.pinned_msg_id == index.id
        assert full.full_chat.chat_photo is not None
        for sample in SAMPLES:
            message = await client.get_messages(channel, ids=state["posts"][sample["key"]]["id"])
            assert message and message.document and message.document.mime_type == "application/pdf"
            original = ROOT / "frontend/public/sample" / sample["file"]
            assert message.document.size == original.stat().st_size
            downloaded = await client.download_media(message, bytes)
            assert hashlib.sha256(downloaded).hexdigest() == state["posts"][sample["key"]]["sha256"]
        state["verified"] = {"profile_linked": True, "index_pinned": True,
                             "pdf_count": len(SAMPLES), "download_hashes_match": True}
        save(state)
        print(json.dumps({"channel": state["url"], "pinned_index": state["posts"]["index"]["url"],
                          "post_count": len(state["posts"]), "verified": state["verified"]}, ensure_ascii=True))


if __name__ == "__main__":
    asyncio.run(main())
