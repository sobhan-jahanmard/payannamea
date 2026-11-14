# Telegram work in this project

Read `telegram/channel-format.json` before creating, editing or publishing posts
to `@daneshyar_samples`. This records the user's approved channel format. Follow
it by default unless the user explicitly changes the format.

- Use a short bold Persian heading, concise RTL prose, and restrained emoji.
- Put hashtags after the body, before the contact block. Every post must include
  `#دانشیار` and `#خدمات_دانشگاهی`, plus relevant topic tags without duplicates.
- End with the saved divider and five contact lines: Telegram orders, Telegram
  channel, Instagram, website and email. Label orders `سفارش در تلگرام` and
  link the channel as `https://t.me/daneshyar_samples`. Use
  `https://instagram.com/daneshyar.web` for Instagram. Show the order account
  only once as `@daneshyar_academic`; do not also repeat its `t.me` URL.
- Use `https://daneshyar.vercel.app` as the contact website, without `/order`.
  Direct `/sample/*.pdf` links remain valid for individual sample downloads.
- Preserve the final newline plus U+2060 WORD JOINER from the saved format. This
  keeps a visually empty final line for Telegram's time/edit indicator.
- Keep samples in one pinned text post titled `📎 نمونه‌کارها`, with five labeled
  PDF links. Do not attach a ZIP or recreate separate sample posts.
- Use `telegram/integration/channel_format.py::format_post` for shared rendering.
  Use Telegram HTML parsing when the body contains bold headings or labeled links;
  verify returned text and entities after publishing.

All Telegram-specific source, scripts and generated assets belong under this
`telegram/` directory. MCP registration remains at `.codex/config.toml` as required
by Codex. Shared website PDF samples and the source brand logo remain in
`frontend/public/`. Keep application credentials in the ignored
`telegram/integration/.env`; account sessions and security status stay in their
existing protected Windows state directory, outside Git.

`telegram/content/2026-11-09/channel-published.json` records the current channel
message IDs, links and published copy. Backups in that folder are historical, not
approved current templates. Older publish/consolidation scripts under `scripts/`
must not be rerun to restore superseded layouts. Read-only checks and formatting
do not authorize publishing: send or edit external content only within an actual
user request. Automatic replies remain disabled.
