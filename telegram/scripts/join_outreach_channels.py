"""Join only the ten outreach channels on the user's explicit instruction."""
import asyncio
import csv
from datetime import datetime, timezone
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "telegram/integration"))
from common import account
from telethon import functions, types
from telethon.errors import (
    FloodWaitError, InviteRequestSentError, RPCError, UserNotParticipantError,
)

OUTPUT = ROOT / "telegram/outputs/01a1c4dd-0f74-7500-a258-6ae9b4374957"
RECEIPT = OUTPUT / "channel-membership.json"
EXPECTED = {
    "daneshjoo", "amozesh_daneshjo", "daneshjo_report", "iauamozeshyar",
    "azadtnb1", "uttweet", "ketabkhaneh_daneshjoyan", "azaadnews",
    "twitterjoo", "pnudaneshjuy",
}


async def main():
    with (OUTPUT / "daneshyar-advertising-outreach.csv").open(
        encoding="utf-8-sig", newline=""
    ) as stream:
        rows = list(csv.DictReader(stream))
    channels = [r["آدرس کانال"].removeprefix("https://t.me/") for r in rows]
    assert len(channels) == 10 and {c.lower() for c in channels} == EXPECTED
    receipt = {"account": "daneshyar_academic", "channels": []}

    def record(channel, status):
        receipt["channels"].append({
            "channel": channel, "status": status,
            "checked_at_utc": datetime.now(timezone.utc).isoformat(),
        })
        RECEIPT.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"@{channel}: {status}", flush=True)

    async with account() as client:
        me = await client.get_me()
        assert me.id == 9066450337 and me.username.lower() == "daneshyar_academic"
        for channel in channels:
            try:
                entity = await client.get_entity("@" + channel)
                assert isinstance(entity, types.Channel) and entity.broadcast
                assert entity.username.lower() == channel.lower()
                try:
                    await client(functions.channels.GetParticipantRequest(entity, me))
                    record(channel, "already_joined")
                except UserNotParticipantError:
                    await client(functions.channels.JoinChannelRequest(entity))
                    await client(functions.channels.GetParticipantRequest(entity, me))
                    record(channel, "joined")
            except InviteRequestSentError:
                record(channel, "join_request_pending")
            except FloodWaitError as exc:
                record(channel, f"rate_limited_wait_{exc.seconds}_seconds")
                break
            except RPCError as exc:
                record(channel, "error_" + type(exc).__name__)
            await asyncio.sleep(1)
    print(f"Verified membership: {sum(r['status'] in ('joined', 'already_joined') for r in receipt['channels'])}/10", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
