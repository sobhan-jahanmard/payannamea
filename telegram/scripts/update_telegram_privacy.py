"""Apply explicitly requested phone/invite privacy and the public contact bio."""
import asyncio
from datetime import datetime, timezone
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "telegram/integration"))
from common import STATE, account
from telethon import functions, types
from telethon.errors import RPCError

BIO = "پایان‌نامه و ارائه | daneshyar.vercel.app | admin.daneshyar@gmail.com"


def write(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def matches(actual, desired):
    expected = "PrivacyValue" + type(desired).__name__.removeprefix("InputPrivacyValue")
    if expected == "PrivacyValueAllowContacts":
        # Telegram may explicitly append its default-deny fallback.
        return actual in ([expected], [expected, "PrivacyValueDisallowAll"])
    return actual == [expected]


async def main():
    assert len(BIO) <= 70
    specifications = [
        ("phone_visibility", types.InputPrivacyKeyPhoneNumber(), types.InputPrivacyValueDisallowAll()),
        ("phone_discovery", types.InputPrivacyKeyAddedByPhone(), types.InputPrivacyValueAllowContacts()),
        ("direct_group_channel_invites", types.InputPrivacyKeyChatInvite(), types.InputPrivacyValueDisallowAll()),
    ]
    receipt = {"updated_at_utc": datetime.now(timezone.utc).isoformat(), "settings": {}}
    async with account() as client:
        before = {}
        for name, key, _ in specifications:
            result = await client(functions.account.GetPrivacyRequest(key))
            before[name] = [r.to_dict() for r in result.rules]
        backup = STATE / "privacy-before-2026-11-09.json"
        if not backup.exists():
            write(backup, before)
        for name, key, desired in specifications:
            try:
                current = [r["_"] for r in before[name]]
                if not matches(current, desired):
                    await client(functions.account.SetPrivacyRequest(key=key, rules=[desired]))
                result = await client(functions.account.GetPrivacyRequest(key))
                actual = [type(r).__name__ for r in result.rules]
                receipt["settings"][name] = {"verified": matches(actual, desired), "rules": actual}
            except RPCError as exc:
                receipt["settings"][name] = {"verified": False, "error_type": type(exc).__name__}
            write(STATE / "privacy-applied-2026-11-09.json", receipt)
        me = await client.get_me()
        full = await client(functions.users.GetFullUserRequest(me))
        if full.full_user.about != BIO:
            await client(functions.account.UpdateProfileRequest(about=BIO))
            full = await client(functions.users.GetFullUserRequest(me))
        assert full.full_user.about == BIO
        receipt["bio"] = full.full_user.about
        receipt["bio_length"] = len(BIO)
        # Inspect only whether two-step verification exists, without printing hints or emails.
        password = await client(functions.account.GetPasswordRequest())
        receipt["two_step_verification_enabled"] = bool(password.has_password)
        receipt["recovery_email_configured"] = bool(password.has_recovery)
        write(STATE / "privacy-applied-2026-11-09.json", receipt)
    folder = ROOT / "telegram/content/2026-11-09"
    plan = json.loads((folder / "profile-plan.json").read_text(encoding="utf-8"))
    plan["bio"] = BIO
    plan["contact_email"] = "admin.daneshyar@gmail.com"
    write(folder / "profile-plan.json", plan)
    profile_receipt = folder / "profile-applied.json"
    if profile_receipt.exists():
        saved = json.loads(profile_receipt.read_text(encoding="utf-8"))
        saved["profile"]["bio"] = BIO
        saved["updated_at_utc"] = receipt["updated_at_utc"]
        write(profile_receipt, saved)
    print(json.dumps(receipt, ensure_ascii=True))


if __name__ == "__main__":
    asyncio.run(main())
