---
name: daneshyar-order
description: Fetch a registered Daneshyar order by link or ID and route its execution in Codex to the dedicated skill for that order type.
---

# Daneshyar Order

Run the order in the current conversation. Read [the tool contract](references/tools.md)
and use `scripts/order_tools.py` for deterministic operations. Resolve paths from
this skill's actual directory, not the chat cwd. Tools reuse the checkout's
`worker_plus` modules and `.env`; never print credentials. Do not start `run.py`,
`codex exec` or an AI review job to generate the order: the current agent reasons
and edits files directly.

For presentations, source IDs, original filenames and source-page footers belong
in native PowerPoint comments, never on visible slides/PDF. Keep the references
slide for real bibliography entries from the supplied file's own reference list.

## Routing

Fetch using `fetch --order <link-or-ID>` or an explicitly provided local snapshot
using `fetch --order-file`. Retain the absolute workspace path returned by fetch.
For continuation, run `status` on the existing workspace and inspect current files.

## Name the current Codex chat after the order

As soon as `fetch` or the existing workspace's `status` confirms the order ID,
set the current Codex chat title to that exact ID, before routing or continuing
the order. Use the top-level order ID, not a source/reference order mentioned
in notes. On resumption apply the same rule; if the user assigns a different
order to this chat, use the newly confirmed ID.

Discover `set_thread_title` and call `mcp__codex_app__set_thread_title` with
`{"title":"<confirmed order ID>"}`. Omit `threadId` to target the calling chat;
the source defaults to Codex. Use only the ID, without prefixes or extra text.
Do not create a new chat or rename another chat. Renaming is part of this
workflow and needs no additional confirmation. Inspect the tool result before
claiming success. If the tool is unavailable or fails, briefly report that the
title could not be updated and continue the order; do not edit Codex's internal
history/database files. A request to edit this skill alone does not rename the
current chat.

| Stored order type | Dedicated skill |
| --- | --- |
| پایان‌نامه کارشناسی | Read [daneshyar-bachelor-thesis](../daneshyar-bachelor-thesis/SKILL.md) |
| پایان‌نامه کارشناسی ارشد | Read [daneshyar-master-thesis](../daneshyar-master-thesis/SKILL.md) |
| پروپوزال پایان‌نامه | Read [daneshyar-thesis-proposal](../daneshyar-thesis-proposal/SKILL.md) |
| تحقیق دانشگاهی | Read [daneshyar-university-research](../daneshyar-university-research/SKILL.md) |
| ارائه و پاورپوینت | Read [daneshyar-presentation](../daneshyar-presentation/SKILL.md) |

The five stored types above match the frontend and worker profiles. Reject an
unknown type explicitly. Documents share [the document workflow](references/documents.md)
and their own type guide; presentations retain supplied-files-only sourcing.
The CLI dispatches subsequent commands from the stored workspace order type.

## Visible progress and continuation

At the start of every milestone send commentary such as
`مرحلهٔ ۲/۱۰ — بررسی ورودی‌ها و قرارداد سفارش`. After fetch also persist it with
`progress`. The dedicated skill defines the ten milestones. Give updates during
long operations; disk logs do not replace user-visible messages. On resumption
show the actual milestone being resumed, even if its number moves backward.

Preserve valid artifacts and repair the responsible file. Read current errors
and checks rather than replaying stale prompts or regenerating successful work.
Keep the workspace and order ID as continuation handles across chats.

Default delivery is a reviewed local package linked in chat. `publish` is for
requests that authorize upload to the order system; existing authorization
persists. Fetch/generation alone must not claim the order, change remote status
or replace remote outputs. Submission ends at pending admin approval; do not
claim final approval.

## Show the complete current delivery after every edit

Whenever an order is completed, and after every subsequent edit that changes a
deliverable, show the complete set of current delivery files again in the final
response. This applies to every revision, including repeated edits in the same
chat. Include all final files required by the order contract, including full and
sample versions; do not list only the changed file or refer back to earlier links.

Before presenting them, regenerate affected companion outputs (such as PDFs and
samples), complete the required checks, and verify that every linked file exists
and belongs to the latest reviewed package. Reattach each current deliverable with
a fresh `:codex-file-citation{path="<verified absolute path>" purpose="output"}`
directive in its own paragraph, with a short label identifying its purpose. Emit
the directives directly, outside code fences. Repeat them even when an edited
file keeps the same path as an earlier version. Present delivery files, not input
sources, temporary drafts or internal audit files. Showing files in chat does not
authorize publishing or uploading them to the order system.
