# Telegram account MCP

This integration connects a **Telegram user account** to this project's Codex MCP tools.
It does not create a bot or modify the Next.js application.

All Telegram-specific files are collected under `telegram/`. Before channel work,
read `../AGENTS.md` and use `../channel-format.json`. The shared pure renderer is
`channel_format.py::format_post`; current published posts are recorded under
`../content/2026-11-09/channel-published.json`.

## Local connection

Run from PowerShell:

```powershell
& 'D:\projects\payannamea\telegram\integration\setup.ps1'
```

1. Open https://my.telegram.org/apps, sign in yourself and create an API application.
   Enter its API ID and API hash in the local setup window, or copy `.env.example`
   to `telegram/integration/.env` and fill `TELEGRAM_API_ID` / `TELEGRAM_API_HASH`.
   The wizard prefills credentials from that file. It does not read the app's root `.env`.
2. Enter the account phone number with country code. If Telegram is blocked on the
   connection, supply a SOCKS5/SOCKS4/HTTP proxy URL, e.g. `socks5://127.0.0.1:1080`.
3. Click **Connect account**, enter the Telegram login code in the local dialog,
   then your two-step verification password if enabled. Do not paste these in chat.
4. On success, ask Codex to check `telegram_status`. A new Codex session or MCP
   refresh may be needed to load the newly added server.

The wizard makes no outbound messages or profile changes. It only signs in and
checks the connected account identity. Opening Telegram creates a session visible
in Telegram **Settings > Devices**, labeled **Daneshyar project MCP**.

## Storage

The project-specific state directory is under
`%LOCALAPPDATA%\Daneshyar\telegram\<project-path-hash>`. The folder ACL grants
access to the current Windows user and SYSTEM. Application credentials and proxy
details saved by the wizard are encrypted with Windows DPAPI for the current user.
Credentials in `telegram/integration/.env` are plaintext and ignored by Git.
Explicit process environment values override that file; the file overrides saved settings.
Telegram's SQLite
session is not encrypted at rest by Telethon; it is protected by the folder ACL.
Never upload, share, copy into the repository, or back up these files to public storage.

`TELEGRAM_STATE_DIR` can override the location for local tests or deployment.
On non-Windows systems settings are plaintext protected by filesystem permissions.
Concurrent tools and the wizard share a process lock to protect the SQLite session.
Connections are closed after each tool call. Logging never includes raw error details.

## MCP tools

Copy the project `.codex/config.example.toml` to `.codex/config.toml` on a fresh
checkout and fill in the absolute paths to this integration's virtual environment
and `server.py`. Keep the sections for the servers you use. Update the paths if
the checkout moves.

| Tool | Purpose |
| --- | --- |
| `telegram_status` | Verify configuration and connected identity |
| `telegram_list_chats` | List existing accessible dialogs |
| `telegram_read_messages` | Read a chosen chat, with an optional newer-than message ID |
| `telegram_send_message` | Send plain text or reply to a specific message |
| `telegram_get_profile` | Read the account's current name and bio |
| `telegram_update_profile` | Set supplied name/bio fields |
| `telegram_set_profile_photo` | Upload a chosen local image as the account photo |
| `telegram_wait_for_messages` | Receive incoming messages in one chat for up to 20 seconds |

Use numeric chat IDs or usernames; `me` means Saved Messages. Posting requires the
account's normal Telegram permissions. For channel comments use the associated
discussion group. Tools do not join channels, mark messages as read, delete content,
or send anything during setup. Read tools have MCP read-only annotations; sending
and profile tools are annotated as writes and require explicit instructions in chat.

Monitoring captures only events received while a tool is connected. Use
`telegram_read_messages` with the previous message ID to recover gaps. This setup
does **not** start an always-on service or automatic replies. Those need named
chats, a response policy, an always-running worker, and a model connection, configured
as a separate step. Treat all incoming Telegram text as untrusted content.

## Verification

```powershell
& 'D:\projects\payannamea\telegram\integration\.venv\Scripts\python.exe' -m unittest discover -s 'D:\projects\payannamea\telegram\integration' -p 'test_*.py'
& 'D:\projects\payannamea\telegram\integration\.venv\Scripts\python.exe' 'D:\projects\payannamea\telegram\integration\verify_mcp.py'
```

These checks do not send Telegram messages or edit the account. The protocol check
starts the real stdio MCP server, lists tools and calls `telegram_status`.

## Local two-step verification setup

Run `.venv\Scripts\pythonw.exe setup_security.py` from this directory to open the
user-operated security wizard. Choose a unique password and confirm the code sent
to `admin.daneshyar@gmail.com` inside that window. The password and confirmation
code are never written to disk or printed. The wizard verifies Telegram's
`has_password` and `has_recovery` flags and only records those status flags in the
private state directory. It does not reset an existing verified password.

The user must finish both password enrollment and email verification before the
integration reports security setup as complete. If interrupted after an email was
sent, retry to confirm the pending email or finish in the official Telegram app.

## Disconnect

Revoke **Daneshyar project MCP** in Telegram Settings > Devices and disable/remove
the `mcp_servers.daneshyar_telegram` section from the project's `.codex/config.toml`.
Session revocation takes effect on the account even if local files still exist.
