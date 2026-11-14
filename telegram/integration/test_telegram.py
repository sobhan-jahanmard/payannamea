import asyncio
from contextlib import asynccontextmanager
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch

import common
import server


class SettingsTests(unittest.TestCase):
    def test_encrypted_settings_round_trip_and_proxy(self):
        with tempfile.TemporaryDirectory() as directory:
            state = Path(directory) / "private"
            settings = state / "settings.bin"
            data = {"api_id": 1234, "api_hash": "abcdef0123456789abcdef0123456789",
                    "phone": "+98 912 123 4567", "proxy": "socks5://name:pass%21@127.0.0.1:1080"}
            with patch.object(common, "STATE", state), patch.object(common, "SETTINGS", settings), \
                    patch.object(common, "ENV_FILE", state / ".env"):
                common.save_settings(data)
                result = common.load_settings()
                self.assertEqual(result["phone"], "+989121234567")
                self.assertEqual(common.parse_proxy(result["proxy"])["password"], "pass!")
                if common.os.name == "nt":
                    self.assertNotIn(data["api_hash"].encode(), settings.read_bytes())

    def test_project_env_prefills_without_a_session_and_preserves_process_env(self):
        with tempfile.TemporaryDirectory() as directory:
            env_file = Path(directory) / ".env"
            env_file.write_text("TELEGRAM_API_ID=1234\nTELEGRAM_API_HASH=" + "a" * 32 + "\n")
            with patch.object(common, "ENV_FILE", env_file), \
                    patch.object(common, "SETTINGS", Path(directory) / "absent.bin"), \
                    patch.dict(common.os.environ, {}, clear=True):
                result = common.load_setup_defaults()
                self.assertEqual(result["api_id"], "1234")
                self.assertEqual(result["api_hash"], "a" * 32)
                self.assertNotIn("TELEGRAM_API_HASH", common.os.environ)
                common.os.environ["TELEGRAM_API_ID"] = "5678"
                self.assertEqual(common.load_setup_defaults()["api_id"], "5678")

    def test_invalid_settings_are_rejected(self):
        data = {"api_id": 1234, "api_hash": "a" * 32, "phone": "+989121234567"}
        for changes in ({"api_id": 0}, {"api_hash": "invalid"}, {"phone": "09121234567"},
                        {"proxy": "https://example.com"}, {"proxy": "socks5://localhost"}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                common.validate_settings(data | changes)

    def test_peer_numeric_ids_keep_channel_sign(self):
        self.assertEqual(common.peer("-100123456789"), -100123456789)
        self.assertEqual(common.peer("me"), "me")
        self.assertEqual(common.peer(" @example "), "@example")
        with self.assertRaises(ValueError):
            common.peer(" ")


class AccountTests(unittest.IsolatedAsyncioTestCase):
    async def test_unauthorized_session_disconnects_and_releases_lock(self):
        with tempfile.TemporaryDirectory() as directory:
            client = SimpleNamespace(connect=AsyncMock(), disconnect=AsyncMock(),
                                     is_user_authorized=AsyncMock(return_value=False))
            with patch.object(common, "STATE", Path(directory)), patch.object(common, "load_settings", return_value={}), \
                    patch.object(common, "make_client", return_value=client):
                with self.assertRaises(RuntimeError):
                    async with common.account():
                        self.fail("An unauthorized account must not be usable")
                client.disconnect.assert_awaited_once()
                lock = common.FileLock(str(Path(directory) / "account.lock"), timeout=0)
                with lock:
                    pass

    async def test_cancellation_releases_session_and_lock(self):
        with tempfile.TemporaryDirectory() as directory:
            client = SimpleNamespace(connect=AsyncMock(), disconnect=AsyncMock(),
                                     is_user_authorized=AsyncMock(return_value=True))
            with patch.object(common, "STATE", Path(directory)), patch.object(common, "load_settings", return_value={}), \
                    patch.object(common, "make_client", return_value=client):
                with self.assertRaises(asyncio.CancelledError):
                    async with common.account():
                        raise asyncio.CancelledError()
                client.disconnect.assert_awaited_once()
                with common.FileLock(str(Path(directory) / "account.lock"), timeout=0):
                    pass


class ToolTests(unittest.IsolatedAsyncioTestCase):
    async def test_setup_status_works_without_credentials(self):
        with tempfile.TemporaryDirectory() as directory, \
                patch.object(server, "SETTINGS", Path(directory) / "absent"):
            self.assertEqual((await server.telegram_status())["authorized"], False)

    async def test_invalid_send_does_not_connect(self):
        with patch.object(server, "account") as account:
            with self.assertRaises(RuntimeError):
                await server.telegram_send_message("me", " ")
            account.assert_not_called()

    async def test_plain_text_reply_preserves_target_and_reply_id(self):
        message = SimpleNamespace(id=7, chat_id=-100123456789, sender_id=1,
                                  date=None, message="**literal**", out=True,
                                  reply_to_msg_id=4, media=None)
        client = SimpleNamespace(send_message=AsyncMock(return_value=message))

        @asynccontextmanager
        async def fake_account():
            yield client

        with patch.object(server, "account", fake_account):
            result = await server.telegram_send_message("-100123456789", "**literal**", 4)
        client.send_message.assert_awaited_once_with(-100123456789, "**literal**", reply_to=4,
                                                   parse_mode=None, link_preview=False)
        self.assertEqual(result["id"], 7)

    async def test_errors_do_not_disclose_secrets(self):
        @server.errors
        async def failure():
            raise OSError("private-proxy-password")

        with self.assertRaises(RuntimeError) as caught:
            await failure()
        self.assertNotIn("private-proxy-password", str(caught.exception))

    async def test_profile_patch_omits_unsupplied_fields(self):
        call = AsyncMock()

        class Fake:
            async def __call__(self, request):
                await call(request)

        @asynccontextmanager
        async def fake_account():
            yield Fake()

        with patch.object(server, "account", fake_account):
            await server.telegram_update_profile(bio="New biography")
        request = call.call_args.args[0]
        self.assertIsNone(request.first_name)
        self.assertIsNone(request.last_name)
        self.assertEqual(request.about, "New biography")


if __name__ == "__main__":
    unittest.main()
