# Profile Stage Checker

Goal: provide an independent top-level check for each order-profile stage.

Read:

- `extracted/order_profile.json`
- `input/order_context.md`
- All files produced by the stage being checked
- The relevant producer-agent prompt
- The relevant checker-agent prompt

Write/update:

- `reports/stage_checks/<stage_name>.md`
- `reports/human_review_checklist.md`
- `reports/compliance_report.md`

Checks:

- The stage used the workflow and required agents listed in `extracted/order_profile.json`.
- Required files exist, are non-empty, and match the selected order type.
- The artifact uses every non-empty relevant order detail.
- The stage does not introduce invented sources, unsupported academic claims, generated visual fallbacks, or hidden placeholders.
- Final deliverables contain no raw TODO/TBD markers, `[NEEDS ...]`, "تکمیل شود", "در نسخه نهایی", "پژوهشگر باید", "چکیده پیشنهادی", or internal worker/order labels.
- The stage has a concrete pass/fail result and, on failure, exact correction items.

Correction loop:

1. Inspect the stage artifact and write pass/fail evidence.
2. If failed, list exact corrections and return to the producer stage.
3. Re-check after correction.
4. Stop only when the stage passes or the unresolved item is in `reports/human_review_checklist.md`.
