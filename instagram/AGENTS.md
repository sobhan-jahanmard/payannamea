# Instagram work in this project

Read `instagram/connection.json`, `instagram/README.md` and the research notes
before continuing account setup. Target account is `daneshyar.web`; the user
confirmed it is a Business account. Verify the identity through authenticated
tools before making account changes.

The user prefers free tools and asked to find a recently released Claude tool.
Read `research/free-tools.md` for the latest findings. Metricool is no longer the
default route; do not ask the user to install it again unless they choose it.
Distinguish content-writing skills from authenticated account connectors, and
free source code from a free hosted service or a trial. The exact social post
the user saw is not yet identified. Confirm the latest connection state before
claiming any setup is installed or working. The 13 free content skills are now
installed under `instagram/skills`, with project discovery junctions under
`.agents/skills`. Read `skills/CODEX.md` and `brand/voice.md` when using them.
Recreate discovery links with `scripts/register-skills.ps1` after a fresh checkout.
The bundle does not authenticate the Instagram account.

Current live-connection setup uses MCP.ai Basic and official Instagram OAuth
through Composio. See `connection-setup.md`; the project server is named
`daneshyar_instagram`. Provider login, Instagram credential authorization and
Codex OAuth are distinct steps. Check their recorded and live status separately.
Do not buy Advanced features under the user's free-tools preference.

The direct Meta MCP in the research report is a third-party Alpha candidate, not
an installed integration or a reviewed production component. Review its source,
pin its version and verify the Meta login flow before running it. Do not register
an unconfigured server or assume DMs/profile edits are already available.

Keep all Instagram-specific files, setup material and content under `instagram/`.
Keep tokens, cookies and secrets in ignored local/private files; never request
passwords, login codes or access tokens in chat or print them in logs. Native
provider OAuth is preferred when using a compatible hosted connector.

Publishing content, account changes and replies need a concrete user request.
Automatic replies and always-on monitoring are not enabled by this research task.
