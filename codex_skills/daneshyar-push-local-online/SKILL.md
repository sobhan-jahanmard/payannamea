---
name: daneshyar-push-local-online
description: Publish an already completed local Daneshyar order package to its online order using the worker APIs, then verify the stored files and server status. Use for push, upload or online submission of offline deliveries; not for generating, revising or grading orders.
---

# Daneshyar Push Local Online

Upload the latest reviewed local delivery for the requested order. Work in the
current chat; do not launch a worker, another model, or a generation workflow.
Invoking this skill with an order link/ID is a request to publish that order.
Use existing authorization without asking again. Creating/installing this skill
or asking how it works does not authorize uploading any order.

## Locate the existing delivery

Resolve installed junctions to find this skill's real checkout. The existing
entrypoint is [order_tools.py](../daneshyar-order/scripts/order_tools.py), which
reuses `worker_plus/.env` and its configured Python interpreter. Read
[the tool contract](../daneshyar-order/references/tools.md) when needed.
Never print credentials or copy `.env` into reports.

Resolve the order ID from the supplied link/ID. Prefer an explicitly supplied
workspace; otherwise inspect `worker_plus/workspace/codex_orders/<ID>` and search
other local workspaces for matching `codex_order_state.json` order IDs. Match the
actual order ID and current manifest, not just the folder name or timestamps.
Exclude `baseline`, `reviews`, and revision snapshots from candidate deliveries.
If distinct final packages remain plausible, explain the difference and ask
which to publish. If the ID is missing, use unambiguous conversation context;
otherwise request the order link/ID.

## Check and publish

Announce the order and selected workspace. Commands below use absolute paths;
`--workspace` goes before the command. `TOOLS` is the resolved sibling
`daneshyar-order/scripts/order_tools.py`; `WORKSPACE` is the selected directory.

```text
python -X utf8 TOOLS --workspace WORKSPACE status
python -X utf8 TOOLS --workspace WORKSPACE finalize
python -X utf8 TOOLS --workspace WORKSPACE publish
```

Run sequentially and inspect each result. `status` must show unchanged original
inputs and current prerequisites. `finalize` validates the current reviewed
package without rebuilding its deliverables. `publish` rechecks remote input
identity, claims this specific order, starts it, submits the four primary files,
and saves a receipt. It selects PPTX/PDF or Word/PDF from the stored order type.
Verify the configured backend matches the supplied order URL before publishing.

`publish` also sends every collected independent review under `reviews/*`,
including earlier grades and incomplete assessments, to the private admin
review-scores section. Each run includes its score out of 20, rubric, summary,
snapshot identity and whether its output hashes match the submitted package.
Do not choose only the highest or latest score. Pending bundles without a
reviewer report have no grade to send; an uncollected/invalid report is an
explicit blocker requiring review collection, not a reason to omit that run.
No local review means an empty review history; do not invent grades.

Review synchronization is idempotent by order and review run. It also runs
when a confirmed file publication receipt is reused. If file upload succeeds
but grade synchronization fails, report the partial outcome; the files remain
confirmed and rerunning `publish` retries only the review sync. Do not reset
the publication state or upload the same package again to fix missing grades.

Do not regenerate files, fetch over the existing workspace, mark stale checks
as passed, bypass validation, or omit required files to make an upload succeed.
For missing artifacts, stale reviews, changed remote inputs, or a legacy package
without the required state, report the precise blocker and the necessary repair.
The document API cannot upload companion reports; preserve its explicit blocker
instead of silently submitting a partial delivery.

A confirmed receipt for the same hashes should reuse the existing publication.
For `uploading`/`unknown`, do not retry submission blindly: inspect the live order
and use the verifier below to reconcile stored bytes first. A matching server
package establishes successful upload even if the initial response was lost;
retain the verification receipt. If it does not match, report the discrepancy
before attempting another submission. Do not reset publication state just to retry.

## Verify the online result

Run [scripts/verify_online.py](scripts/verify_online.py) after publication,
including when an existing publication receipt was reused:

```text
python -X utf8 VERIFY --workspace WORKSPACE --order ORDER_LINK_OR_ID
```

The helper only reads the server and saves a local
`reports/publication_verification.json`. It checks the order identity, unchanged
inputs, output roles, current local manifest hashes, stored sizes and downloaded
bytes. It uses this checkout's `/uploads/<storage_path>` storage route because
the normal customer/admin download URLs require user-session authentication.
It never uploads files, approves an order, or changes remote status.
It also reads the protected worker review-scores endpoint and checks that every
local assessment, score and rubric was stored exactly. The verification receipt
records the verified review runs separately from file hashes.

If submission succeeded but verification failed, say so explicitly; do not
re-upload as a verification retry. Resolve the read/storage error first.
Confirm the server status from the verification result. Expected submission
status is `worker_done_pending_approval`; `admin_review` is also valid. Never
claim final admin approval from a successful upload.

Respond briefly in the user's language with the order link, the four uploaded
file roles, byte-verification result and actual status. If the server reports a
later status, report it accurately without resetting it. Keep the selected
workspace and receipt for continuation. Upload-only work does not require
rebuilding or reattaching unchanged local deliverables.
Include the number of synchronized reviews and their verification result.
