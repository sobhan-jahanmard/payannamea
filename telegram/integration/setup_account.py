"""Interactive local login. No login codes, passwords or API hashes go to stdout."""
from __future__ import annotations

import asyncio
from concurrent.futures import Future
import logging
import queue
import threading
import tkinter as tk
from tkinter import ttk, messagebox, simpledialog
import webbrowser

from filelock import FileLock
from telethon.errors import (
    FloodWaitError, PasswordHashInvalidError, PhoneCodeInvalidError,
    SessionPasswordNeededError,
)

from common import (STATE, load_setup_defaults, make_client, protect_directory,
                    save_settings, validate_settings)

logging.disable(logging.CRITICAL)


class Setup:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("Daneshyar - Telegram account connection")
        self.root.geometry("640x470")
        self.root.resizable(False, False)
        self.messages = queue.Queue()
        self.busy = False
        self.loop = None
        self.task = None
        self.closing = False
        frame = ttk.Frame(self.root, padding=24)
        frame.pack(fill="both", expand=True)
        ttk.Label(frame, text="Connect your Telegram account", font=("Segoe UI", 16, "bold")).pack(anchor="w")
        ttk.Label(frame, text=(
            "Use API Development tools at my.telegram.org to create an app.\n"
            "Enter its API ID and API hash below, then your Telegram phone number.\n"
            "Codes and 2FA passwords stay in this local window."
        ), padding=(0, 12)).pack(anchor="w")
        ttk.Button(frame, text="Open my.telegram.org", command=lambda: webbrowser.open(
            "https://my.telegram.org/apps")).pack(anchor="w", pady=(0, 12))
        form = ttk.Frame(frame)
        form.pack(fill="x")
        self.fields = {}
        for i, (key, label, secret) in enumerate([
            ("api_id", "API ID", False), ("api_hash", "API hash", True),
            ("phone", "Phone (+98912...)", False),
            ("proxy", "Proxy URL (optional)", True),
        ]):
            ttk.Label(form, text=label).grid(row=i, column=0, sticky="w", padx=(0, 12), pady=7)
            field = ttk.Entry(form, width=48, show="*" if secret else "")
            field.grid(row=i, column=1, sticky="ew", pady=7)
            self.fields[key] = field
        try:
            previous = load_setup_defaults()
        except Exception:
            previous = {}
        for key, field in self.fields.items():
            field.insert(0, str(previous.get(key, "")))
        if previous.get("api_id") and previous.get("api_hash"):
            self.root.title("Daneshyar - Telegram connection (API loaded)")
        ttk.Label(frame, text="Example proxy: socks5://127.0.0.1:1080", foreground="#555555").pack(anchor="w", pady=4)
        self.status = tk.StringVar(value="No messages are sent and no profile changes are made during setup.")
        ttk.Label(frame, textvariable=self.status, wraplength=580).pack(anchor="w", pady=12)
        self.button = ttk.Button(frame, text="Connect account", command=self.start)
        self.button.pack(anchor="e")
        self.root.protocol("WM_DELETE_WINDOW", self.close)
        self.root.after(100, self.poll)

    def close(self):
        if self.busy:
            self.closing = True
            self.status.set("Closing the Telegram connection...")
            if self.loop and self.task:
                self.loop.call_soon_threadsafe(self.task.cancel)
        else:
            self.root.destroy()

    def start(self):
        try:
            data = validate_settings({key: field.get().strip() for key, field in self.fields.items()})
        except Exception as exc:
            messagebox.showerror("Check connection details", str(exc) if isinstance(exc, ValueError) else "Check all fields.", parent=self.root)
            return
        self.busy = True
        self.button.config(state="disabled")
        for field in self.fields.values():
            field.config(state="disabled")
        self.status.set("Connecting to Telegram...")
        threading.Thread(target=self.worker, args=(data,), daemon=True).start()

    def worker(self, data):
        async def run():
            self.loop = asyncio.get_running_loop()
            self.task = asyncio.current_task()
            if self.closing:
                raise asyncio.CancelledError()
            protect_directory()
            lock = FileLock(str(STATE / "account.lock"), timeout=3)
            lock.acquire()
            client = None
            try:
                client = make_client(data)
                await asyncio.wait_for(client.connect(), timeout=20)
                if not await client.is_user_authorized():
                    sent = await client.send_code_request(data["phone"])
                    for attempt in range(3):
                        code = await self.prompt("Telegram login code", "Enter the code sent by Telegram (check the Telegram app first):")
                        if code is None:
                            raise asyncio.CancelledError()
                        try:
                            await client.sign_in(data["phone"], code.replace(" ", "").replace("-", ""), phone_code_hash=sent.phone_code_hash)
                            break
                        except PhoneCodeInvalidError:
                            if attempt == 2:
                                raise
                            self.messages.put(("status", "Invalid code. Please try again.", None))
                        except SessionPasswordNeededError:
                            await self.password(client)
                            break
                me = await client.get_me()
                if me.bot or me.phone != data["phone"].lstrip("+"):
                    raise RuntimeError("AccountMismatch")
                save_settings(data)
                self.messages.put(("success", "Connected successfully. You can return to Codex.", None))
            finally:
                try:
                    if client is not None:
                        await client.disconnect()
                finally:
                    lock.release()
        try:
            asyncio.run(run())
        except asyncio.CancelledError:
            self.messages.put(("status", "Login cancelled. No messages were sent.", None))
        except FloodWaitError as exc:
            self.messages.put(("error", f"Telegram asked you to wait {exc.seconds} seconds before retrying.", None))
        except Exception as exc:
            descriptions = {
                "PhoneNumberInvalidError": "Telegram did not accept this phone number. Check the country code.",
                "ApiIdInvalidError": "Telegram did not accept the API ID/hash. Check my.telegram.org/apps.",
                "PhoneCodeExpiredError": "The login code expired. Click Connect account to request a new code.",
                "PhoneCodeInvalidError": "Telegram did not accept the login code.",
                "PasswordHashInvalidError": "Telegram did not accept the 2FA password.",
                "TimeoutError": "Connection timed out. Check internet access or enter a working proxy URL.",
                "Timeout": "The account is busy in another process. Wait for it to finish and retry.",
                "RuntimeError": "The existing local session belongs to another account. Use the same phone number.",
            }
            self.messages.put(("error", descriptions.get(type(exc).__name__,
                f"Connection failed ({type(exc).__name__}). Check the account details and proxy."), None))
        finally:
            self.messages.put(("done", None, None))

    async def password(self, client):
        for attempt in range(3):
            password = await self.prompt("Telegram two-step verification", "Enter your Telegram 2FA password:")
            if password is None:
                raise asyncio.CancelledError()
            try:
                await client.sign_in(password=password)
                return
            except PasswordHashInvalidError:
                if attempt == 2:
                    raise

    async def prompt(self, title, text):
        result = Future()
        self.messages.put(("prompt", (title, text), result))
        return await asyncio.wrap_future(result)

    def poll(self):
        try:
            while True:
                kind, payload, result = self.messages.get_nowait()
                if kind == "prompt":
                    if self.closing:
                        if not result.done():
                            result.set_result(None)
                    else:
                        value = simpledialog.askstring(payload[0], payload[1], show="*", parent=self.root)
                        if not result.done():
                            result.set_result(value)
                elif kind == "done":
                    self.busy = False
                    self.loop = self.task = None
                    self.button.config(state="normal")
                    for field in self.fields.values():
                        field.config(state="normal")
                    if self.closing:
                        self.root.destroy()
                        return
                else:
                    self.status.set(payload)
                    if kind == "error":
                        messagebox.showerror("Telegram connection", payload, parent=self.root)
                    elif kind == "success":
                        messagebox.showinfo("Telegram connected", payload, parent=self.root)
        except queue.Empty:
            pass
        self.root.after(100, self.poll)


if __name__ == "__main__":
    Setup().root.mainloop()
