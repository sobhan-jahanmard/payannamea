"""Send the exact approved inquiry and saved advertisement to the ten approved admins."""
import asyncio
import csv
from datetime import datetime, timezone, timedelta
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "telegram/integration"))
from common import account
from telethon import types
from telethon.errors import RPCError, FloodWaitError, PeerFloodError

OUTPUT = ROOT / "telegram/outputs/01a1c4dd-0f74-7500-a258-6ae9b4374957"
RECEIPT = OUTPUT / "advertising-inquiries-2026-11-12.json"
EXPECTED = {
    "Daneshjoo": "@AdsDaneshjoo",
    "amozesh_daneshjo": "@Ad_daneshjoyan",
    "daneshjo_report": "@ad_daneshjo",
    "IauAmozeshyar": "@Mehrdad1070",
    "azadtnb1": "@a_y_jamali",
    "uttweet": "@utadd",
    "ketabkhaneh_daneshjoyan": "@nahad1278",
    "Azaadnews": "@azaad_ads",
    "twitterjoo": "@hadiashraf1",
    "pnudaneshjuy": "@amin67_h",
}
CONTACT_ROUTES = {
    "@AdsDaneshjoo": ("@Daneshjoo_Ads", "https://t.me/AdsDaneshjoo/62"),
    "@utadd": ("@UT_AD", "https://t.me/utadd/27"),
}


def inquiry(name, username):
    return (
        f"سلام، وقتتون بخیر. از دانشیار پیام می‌دم. برای معرفی خدمات دانشگاهی‌مون یه بنر داریم؛ "
        f"می‌خواستیم توی کانال «{name}» (@{username}) تبلیغ بذاریم.\n\n"
        "هزینهٔ پست ۲۴ساعته چقدره و اولین زمانی که جا دارید کیه؟ "
        "اگه پین هم می‌کنید، قیمت اون رو هم بگید لطفاً.\n\n"
        "این رو می‌خوایم بذارید 👇"
    )


async def main():
    resume = "--resume" in sys.argv
    if RECEIPT.exists() and not resume:
        raise RuntimeError("Receipt already exists. Inspect it before any further sends.")
    with (OUTPUT / "daneshyar-advertising-outreach.csv").open(encoding="utf-8-sig", newline="") as stream:
        rows = list(csv.DictReader(stream))
    assert len(rows) == 10
    actual = {r["آدرس کانال"].removeprefix("https://t.me/"): r["آیدی ادمین تبلیغات"] for r in rows}
    assert actual.keys() == EXPECTED.keys()
    assert all(actual[channel] in {original, CONTACT_ROUTES.get(original, (original, None))[0]}
               for channel, original in EXPECTED.items())
    receipt = json.loads(RECEIPT.read_text(encoding="utf-8")) if resume else {"account": "daneshyar_academic", "saved_ad_message_id": 11,
               "started_at_utc": datetime.now(timezone.utc).isoformat(), "results": []}
    if resume:
        finished = datetime.fromisoformat(receipt["finished_at_utc"])
        limited = next((r for r in receipt["results"] if r["status"] == "telegram_rate_limited"), None)
        if limited and limited.get("wait_seconds"):
            delay = (finished + timedelta(seconds=limited["wait_seconds"] + 2) - datetime.now(timezone.utc)).total_seconds()
            if delay > 0:
                print(f"Respecting Telegram cooldown: {delay:.0f} seconds.", flush=True)
                while delay > 0:
                    part = min(delay, 45)
                    await asyncio.sleep(part)
                    delay -= part
        receipt.pop("finished_at_utc", None)

    def persist():
        temporary = RECEIPT.with_suffix(".tmp")
        temporary.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        temporary.replace(RECEIPT)

    async with account() as client:
        me = await client.get_me()
        assert me.id == 9066450337 and me.username == "daneshyar_academic"
        source = await client.get_messages("me", ids=11)
        assert source and source.media and source.message.startswith("🎓 دانشیار | خدمات دانشگاهی")
        assert source.sender_id == me.id and "https://t.me/daneshyar_samples/14" in source.message
        targets = []
        for row in rows:
            username = row["آدرس کانال"].removeprefix("https://t.me/")
            listed_admin = row["آیدی ادمین تبلیغات"]
            admin = CONTACT_ROUTES.get(listed_admin, (listed_admin, None))[0]
            entity = await client.get_entity(admin)
            assert isinstance(entity, types.User) and entity.username.lower() == admin[1:].lower()
            assert not entity.deleted and entity.id != me.id
            targets.append((row, username, admin, entity))
        print("Verified account, saved advertisement with media, and all ten admin identities.", flush=True)
        persist()
        for row, channel, admin, entity in targets:
            item = next((r for r in receipt["results"] if r["channel"] == channel), None)
            if item and item["status"] == "sent_and_verified":
                continue
            if item and item["status"] in ("sending_inquiry", "sending_advertisement"):
                raise RuntimeError("Ambiguous previous send; inspect destination before retrying.")
            if item is None:
                item = {"channel": channel, "channel_name": row["نام کانال"], "admin": admin,
                        "admin_user_id": entity.id, "status": "ready"}
                receipt["results"].append(item)
            listed_admin = row["آیدی ادمین تبلیغات"]
            if listed_admin in CONTACT_ROUTES:
                item["listed_contact"] = listed_admin
                item["contact_source"] = CONTACT_ROUTES[listed_admin][1]
            persist()
            async def limited_request(operation):
                while True:
                    try:
                        return await operation()
                    except FloodWaitError as exc:
                        item["last_flood_wait_seconds"] = exc.seconds
                        persist()
                        if exc.seconds > 900:
                            raise
                        print(f"{admin}: Telegram cooldown {exc.seconds}s; waiting before retry.", flush=True)
                        delay = exc.seconds + 2
                        while delay > 0:
                            part = min(delay, 45)
                            await asyncio.sleep(part)
                            delay -= part
            try:
                text = inquiry(row["نام کانال"], channel)
                if item.get("inquiry_message_id"):
                    message = await client.get_messages(entity, ids=item["inquiry_message_id"])
                    assert message.out and message.message == text
                else:
                    item["status"] = "sending_inquiry"
                    persist()
                    message = await limited_request(lambda: client.send_message(entity, text, link_preview=False, parse_mode=None))
                item.update({"inquiry_message_id": message.id, "inquiry_text": text,
                             "sent_at_utc": message.date.isoformat(),
                             "sent_at_tehran": message.date.astimezone(timezone(timedelta(hours=3, minutes=30))).isoformat(),
                             "status": "inquiry_sent"})
                persist()
                await asyncio.sleep(1.5)
                item["status"] = "sending_advertisement"
                persist()
                if item.get("advertisement_message_id"):
                    saved = await client.get_messages(entity, ids=item["advertisement_message_id"])
                else:
                    forwarded = await limited_request(lambda: client.forward_messages(entity, source.id, from_peer="me"))
                    saved = forwarded[0] if isinstance(forwarded, list) else forwarded
                item["advertisement_message_id"] = saved.id
                persist()
                assert saved.media and saved.message == source.message
                verified = await client.get_messages(entity, ids=[message.id, saved.id])
                assert verified[0].out and verified[0].message == text
                assert verified[1].out and verified[1].media and verified[1].message == source.message
                item.update({"advertisement_message_id": saved.id, "advertisement_sent_at_utc": saved.date.isoformat(),
                             "status": "sent_and_verified"})
                persist()
                print(f"{admin} ({channel}): inquiry + saved advertisement sent and verified.", flush=True)
            except (FloodWaitError, PeerFloodError) as exc:
                item.update({"status": "telegram_rate_limited", "error_type": type(exc).__name__})
                if isinstance(exc, FloodWaitError):
                    item["wait_seconds"] = exc.seconds
                persist()
                print(f"{admin}: {item['error_type']}; stopping further sends.", flush=True)
                break
            except RPCError as exc:
                item.update({"status": "send_failed", "error_type": type(exc).__name__})
                persist()
                print(f"{admin}: {item['error_type']}", flush=True)
            await asyncio.sleep(30)
    receipt["finished_at_utc"] = datetime.now(timezone.utc).isoformat()
    persist()
    print(f"Complete: {sum(r['status'] == 'sent_and_verified' for r in receipt['results'])}/10 verified.", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
