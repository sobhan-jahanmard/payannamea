"""User-operated local two-step verification and recovery-email enrollment."""
import asyncio
from datetime import datetime, timezone
import json
import logging
import queue
import threading
import tkinter as tk
from tkinter import ttk, messagebox

from telethon import functions
from telethon.errors import CodeInvalidError, FloodWaitError

from common import STATE, account
from setup_account import Setup

EMAIL = "admin.daneshyar@gmail.com"
logging.disable(logging.CRITICAL)


class SecuritySetup(Setup):
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("Daneshyar - Enable Telegram two-step verification")
        self.root.geometry("700x390")
        self.root.resizable(False, False)
        self.messages = queue.Queue()
        self.busy = False
        self.loop = self.task = None
        self.closing = False
        frame = ttk.Frame(self.root, padding=24)
        frame.pack(fill="both", expand=True)
        ttk.Label(frame, text="Secure the Daneshyar Telegram account", font=("Segoe UI", 15, "bold")).pack(anchor="w")
        ttk.Label(frame, text=(
            "Choose a unique password and keep it in your password manager.\n"
            "The password stays in memory; it is never written to a file or sent to Codex.\n"
            f"Recovery email: {EMAIL}\n"
            "Telegram will email a code. Enter that code only in the local dialog."
        ), padding=(0, 14)).pack(anchor="w")
        self.fields = {}
        form = ttk.Frame(frame)
        form.pack(fill="x")
        for row, (key, label) in enumerate([("password", "New password (12+ characters)"),
                                          ("confirm", "Repeat password")]):
            ttk.Label(form, text=label).grid(row=row, column=0, sticky="w", padx=(0, 16), pady=8)
            entry = ttk.Entry(form, width=38, show="*")
            entry.grid(row=row, column=1, pady=8)
            self.fields[key] = entry
        self.status = tk.StringVar(value="Ready. No security settings have been changed by this window yet.")
        ttk.Label(frame, textvariable=self.status, wraplength=640).pack(anchor="w", pady=14)
        self.button = ttk.Button(frame, text="Enable two-step verification", command=self.start)
        self.button.pack(anchor="e")
        self.root.protocol("WM_DELETE_WINDOW", self.close)
        self.root.after(100, self.poll)

    def start(self):
        password = self.fields["password"].get()
        if len(password) < 12 or password != self.fields["confirm"].get():
            messagebox.showerror("Check password", "Use at least 12 characters and enter the same password twice.", parent=self.root)
            return
        self.busy = True
        self.button.config(state="disabled")
        for field in self.fields.values():
            field.delete(0, "end")
            field.config(state="disabled")
        self.status.set("Connecting to Telegram...")
        threading.Thread(target=self.worker, args=(password,), daemon=True).start()

    def worker(self, password):
        async def run():
            self.loop = asyncio.get_running_loop()
            self.task = asyncio.current_task()
            if self.closing:
                raise asyncio.CancelledError()
            async with account() as client:
                current = await client(functions.account.GetPasswordRequest())
                if current.has_password and current.has_recovery:
                    self.messages.put(("success", "Two-step verification and a recovery email are already enabled.", None))
                    return
                if current.has_password and not current.email_unconfirmed_pattern:
                    self.messages.put(("error", "A password was already enabled elsewhere. Add/verify the recovery email in the official Telegram app.", None))
                    return

                async def code_callback(length):
                    while True:
                        code = await self.prompt("Confirm recovery email", f"Enter the {length}-digit code Telegram sent to {EMAIL}:")
                        if code is None:
                            raise asyncio.CancelledError()
                        code = code.replace(" ", "").replace("-", "")
                        if code.isdigit() and len(code) == length:
                            return code
                        self.messages.put(("status", "Check the email code length and enter it again.", None))

                if not current.has_password and not current.email_unconfirmed_pattern:
                    self.messages.put(("status", "Setting up two-step verification; checking the password may take a moment...", None))
                    try:
                        await client.edit_2fa(new_password=password, hint="Saved in my password manager",
                                              email=EMAIL, email_code_callback=code_callback)
                    except CodeInvalidError:
                        self.messages.put(("status", "The email code was not accepted. Please try again.", None))
                # A retry can confirm a pending email without changing the password again.
                for _ in range(3):
                    current = await client(functions.account.GetPasswordRequest())
                    if current.has_password and current.has_recovery:
                        break
                    if not current.email_unconfirmed_pattern:
                        raise RuntimeError("EmailConfirmationRequired")
                    code = await self.prompt("Confirm recovery email", f"Enter the email code Telegram sent to {EMAIL}:")
                    if code is None:
                        raise asyncio.CancelledError()
                    try:
                        await client(functions.account.ConfirmPasswordEmailRequest(code.replace(" ", "").replace("-", "")))
                    except CodeInvalidError:
                        self.messages.put(("status", "Incorrect email code. Check the latest email and try again.", None))
                final = await client(functions.account.GetPasswordRequest())
                confirmed = bool(final.has_password and final.has_recovery and not final.email_unconfirmed_pattern)
                (STATE / "security-setup-status.json").write_text(json.dumps({
                    "checked_at_utc": datetime.now(timezone.utc).isoformat(),
                    "two_step_verification_enabled": bool(final.has_password),
                    "recovery_email_configured": bool(final.has_recovery),
                    "email_confirmation_pending": bool(final.email_unconfirmed_pattern),
                    "verified": confirmed,
                }), encoding="utf-8")
                if not confirmed:
                    raise RuntimeError("EmailConfirmationRequired")
                self.messages.put(("success", "Verified: two-step verification is enabled and the recovery email is confirmed. You can close this window.", None))
        try:
            asyncio.run(run())
        except asyncio.CancelledError:
            self.messages.put(("status", "Setup interrupted. If an email was already sent, complete verification in Telegram or retry this window.", None))
        except FloodWaitError as exc:
            self.messages.put(("error", f"Telegram requires waiting {exc.seconds} seconds before retrying.", None))
        except Exception as exc:
            self.messages.put(("error", f"Setup is not yet verified ({type(exc).__name__}). Check the recovery email and complete verification in Telegram, or retry.", None))
        finally:
            password = None
            self.messages.put(("done", None, None))


if __name__ == "__main__":
    SecuritySetup().root.mainloop()
