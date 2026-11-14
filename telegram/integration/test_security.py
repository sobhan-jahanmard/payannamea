from contextlib import asynccontextmanager
from pathlib import Path
import queue
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch

import setup_security
from telethon import functions


def state(enabled, recovery, pending=None):
    return SimpleNamespace(has_password=enabled, has_recovery=recovery, email_unconfirmed_pattern=pending)


class SecurityTests(unittest.TestCase):
    def wizard(self):
        wizard = setup_security.SecuritySetup.__new__(setup_security.SecuritySetup)
        wizard.messages = queue.Queue()
        wizard.closing = False
        wizard.prompt = AsyncMock(return_value="123456")
        return wizard

    def test_enrolls_password_and_confirms_email_without_storing_password(self):
        wizard = self.wizard()

        class Client:
            def __init__(self):
                self.confirmed = False
                self.edit = None

            async def __call__(self, request):
                self.assert_request(request)
                return state(self.confirmed, self.confirmed)

            def assert_request(self, request):
                assert isinstance(request, functions.account.GetPasswordRequest)

            async def edit_2fa(self, **kwargs):
                self.edit = kwargs
                assert await kwargs["email_code_callback"](6) == "123456"
                self.confirmed = True

        client = Client()

        @asynccontextmanager
        async def account():
            yield client

        with tempfile.TemporaryDirectory() as directory, \
                patch.object(setup_security, "STATE", Path(directory)), \
                patch.object(setup_security, "account", account):
            wizard.worker("unique-test-password")
            receipt = (Path(directory) / "security-setup-status.json").read_text()
            self.assertNotIn("unique-test-password", receipt)
            self.assertIn('"verified": true', receipt)
        self.assertEqual(client.edit["new_password"], "unique-test-password")
        self.assertEqual(client.edit["email"], "admin.daneshyar@gmail.com")
        self.assertNotIn("current_password", client.edit)

    def test_existing_verified_security_is_not_changed(self):
        wizard = self.wizard()

        class Client:
            edit_2fa = AsyncMock()

            async def __call__(self, request):
                return state(True, True)

        client = Client()

        @asynccontextmanager
        async def account():
            yield client

        with patch.object(setup_security, "account", account):
            wizard.worker("unique-test-password")
        client.edit_2fa.assert_not_awaited()
        wizard.prompt.assert_not_awaited()

    def test_pending_email_is_confirmed_without_resetting_password(self):
        wizard = self.wizard()

        class Client:
            edit_2fa = AsyncMock()

            def __init__(self):
                self.confirmed = False

            async def __call__(self, request):
                if isinstance(request, functions.account.ConfirmPasswordEmailRequest):
                    assert request.code == "123456"
                    self.confirmed = True
                    return True
                return state(True, self.confirmed, None if self.confirmed else "a***@g***.com")

        client = Client()

        @asynccontextmanager
        async def account():
            yield client

        with tempfile.TemporaryDirectory() as directory, \
                patch.object(setup_security, "STATE", Path(directory)), \
                patch.object(setup_security, "account", account):
            wizard.worker("unused-test-password")
            self.assertIn('"verified": true', (Path(directory) / "security-setup-status.json").read_text())
        client.edit_2fa.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
