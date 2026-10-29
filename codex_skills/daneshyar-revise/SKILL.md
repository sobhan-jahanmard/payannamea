---
name: daneshyar-revise
description: Revise an existing local Daneshyar delivery from an independent review or explicit correction request, plan and execute source-backed repairs, revalidate and rebuild all companion files, and show the complete updated delivery for review. Use for revisions, not new orders or grading.
---

# Daneshyar Revise

Complete the revision in the current chat. An invocation such as `revise` after
a Daneshyar review authorizes local correction, rebuilding and verification.
It does not request a new grade or publication. Do not stop after proposing a
plan: save the plan and execute it unless a concrete missing input blocks work.

Read [daneshyar-order](../daneshyar-order/SKILL.md) and its
[tool contract](../daneshyar-order/references/tools.md). Use that skill's
`scripts/order_tools.py`; resolve paths relative to the actual skill directory,
including when installed through a junction. Never launch `run.py`, `codex exec`
or the old AI worker to perform a revision.

## Resolve the current delivery and review

Take the order ID/link, workspace and review bundle from the user or this chat.
For an ID without a workspace, check the checkout's standard local directory
`worker_plus/workspace/codex_orders/<ID>`. Verify the stored order ID. If there
are genuinely ambiguous revisions, ask which one; do not guess by directory name.
If no local delivery exists, report the exact missing files rather than creating
a new order under this workflow.

Run `python <order-tools> --workspace <workspace> status`. Read the order,
contract, current model, outline and relevant sources. For presentations read
[daneshyar-presentation](../daneshyar-presentation/SKILL.md) and its
[artifact guide](../daneshyar-presentation/references/artifacts.md).
For any of the four document types, read the matching dedicated skill from the
main skill's routing table and [the document revision guide](references/documents.md).
Apply its Word/PDF branch wherever the steps below mention presentation-only
models, source policy, slide counts or native PowerPoint comments.

Use the review bundle explicitly chosen by the user or produced in this chat.
Otherwise inspect local review manifests and choose the latest completed review
for this exact order whose submitted-file hashes match the current delivery.
Read `reviewer/report.json`, `report.md` and `repair_request.txt` when present;
the structured issues and their evidence define the proposed corrections.
Verify bundle hashes and current file correspondence using the review helper's
`collect --bundle <bundle>` where a complete report exists. Never treat the
review's `current` flag saved earlier as a fresh integrity check.

A stale review can still guide repairs, but compare each issue against today's
files and mark already-fixed issues; do not restore an older delivery. If the
review is incomplete, repair only supported findings and explicit user requests;
do not infer a complete assessment or score. If there is no usable review but
the user gave concrete edits, proceed from those edits. Ask for a missing review
only when neither an actionable review nor explicit corrections can be found.

## Plan and preserve

Before editing create a unique `revisions/<UTC-timestamp>-<short-id>/` folder
inside the workspace. Preserve the current final files, accepted authoring JSON,
outline, audit reports and state file there, retaining their relative paths and
SHA256 hashes. Snapshot an explicit file list; do not recursively copy the whole
workspace, its reviews or the revision directory into itself. Never overwrite an
earlier revision or change the frozen review bundle.

Save `plan.json` in this revision directory. Include the order/workspace,
selected review run, baseline hashes and one item per review issue or requested
edit: ID, priority, affected slides/files, source/requirement evidence, proposed
change, dependent rebuild/checks, acceptance check, status and result evidence.
Use statuses `pending`, `in_progress`, `fixed`, `already_fixed`,
`not_applicable`, `blocked`; explain the latter three. Record the basis for a
review finding you reject. A professor's proposed correction is not new academic
evidence: verify it against the supplied source and actual order.

Tell the user the concrete repair plan briefly, then execute it. Do not ask for
routine approval again. Keep the dedicated type's ten milestones and record
actual progress with `progress --step <n> --detail ...`; start at the milestone
the revision really needs, and repeat earlier ones when new repairs require it.

## Execute the smallest supported repair

For presentations preserve exact slide count, language, cover requirements, scope, editable objects
and source qualifications. Use only supplied academic information; distinguish
a source defect from a summarization defect. Do not invent data, citations,
experiments or cash flows to satisfy a review. Keep assumptions visible wherever
needed for readers of the PDF, not only in speaker notes.

Never restore technical source IDs or page-reference footers to visible slides.
Source provenance belongs in native PowerPoint comments. Keep the bibliography
slide grounded in the original file's bibliography; it is separate from the
uploaded file identity and internal evidence locators.

Repair the canonical authoring files rather than only patching exported PPTX/PDF.
Use current source locators and actual bibliographic entries. Change claims or
analysis only when necessary, validating their candidates before the dependent
slide candidate. Update the outline where narrative/layout changes require it.
Preserve accepted artifacts on candidate rejection.

For presentation edits follow milestones 4–9 as needed: validate claims/analysis
if changed, then `validate slides --candidate <absolute-json>`. Obtain fresh
`review-inputs content` and `review-inputs sources` before reviewing their current
inputs. Inspect every slide for content and source fidelity, then record honest
full-slide audits using the tool contract's exact hash-bound format.

Run `build`, then `render`. Inspect the actual updated PPTX objects and speaker
notes, full/sample PDFs and every current full-slide PNG. Obtain fresh
`review-inputs visual` before visual inspection and record `review visual` only
after opening all images. Check changed areas at useful magnification, verify
native comments and absence of visible technical references, and ensure samples
match the corresponding full slides. If timing is
requested, distinguish suggested timing from an actually measured rehearsal.
Never claim a rehearsal that did not happen.

If the compiler cannot express a necessary repair, inspect its current schema
and implementation. Make only a narrowly justified compatible change when
needed for the authorized delivery, verify that behavior, then rebuild and
review all affected outputs. Never weaken a validator or write a fake PASS.
After two unsuccessful attempts at the same fix without meaningful progress,
investigate the tool/source mismatch and report a precise blocker if unresolved.
Continue independent repairs that remain possible.

## Verify, close and show the current files

Evaluate each plan item's acceptance check against actual current outputs and
save results in `plan.json` plus a concise `revision_report.md` in the revision
folder. Include unresolved findings, source-based disagreements and any required
user action. An edited JSON field alone does not establish that a visual issue
is fixed. Re-run affected reviews/build/render whenever later edits invalidate
their hashes. Finish with `finalize` and `status`; a failed prerequisite means
the package is not yet a verified final delivery.

In the final response summarize the fixes and remaining limitations, identify
the order, revision and original review run, and link the revision report.
Show the COMPLETE current delivery again: full editable PPTX or Word, full PDF,
matching sample files and required companions, using the actual paths verified by the finalized package.
Follow the main order skill's fresh file-citation directives for every final
file, even when its path is unchanged. Do not substitute internal audit files
for deliverables or refer the user back to old download links. For a blocked
revision, identify which files are still the earlier valid package and which
are unverified; never label a partial rebuild as complete.

This revision's audits are author checks, not a new independent professor grade.
Offer the updated files for review. Invoke `daneshyar-review` for a fresh
independent assessment only if the user requests regrading/review as part of the
revision or afterwards; follow its isolated-reviewer workflow. Do not reuse the
old score as a score of the revised files. Publish only with authorization under
the main order skill; local revision alone does not authorize remote changes.
