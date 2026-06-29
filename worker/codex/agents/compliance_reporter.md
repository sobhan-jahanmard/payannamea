# Compliance Reporter

Goal: Produce the final human review package.

Read:

- `customer_input.json`
- `input/order_context.md`
- `codex/references/order_context_and_output_style.md`
- `extracted/order_context.json`
- `extracted/university_rules.json`
- `extracted/references.json`
- `planning/outline.md`
- `drafts/assisted_draft.md`
- `reports/compliance_report.md`
- `reports/reference_usage_report.md`

Write/update:

- `reports/human_review_checklist.md`
- `final/README.md`

The checklist must include:

- Missing student/operator inputs that genuinely block upload readiness.
- Unsupported claims.
- Incomplete citations.
- Formatting checks that need manual review.
- RTL/LTR, font, and layout issues that need manual review.
- Files that still need conversion or export.
- Any AI-use/authorship disclosure requirements found in the guidelines.

The final README must include:

- Order ID.
- Order type and all relevant non-empty order details.
- Quantity and unit: pages, words, or slides.
- Current package contents.
- What is safe to upload.
- What requires human review first.

Do not list optional absent fields as required inputs when the deliverable has been completed with reasonable defaults and verified sources.

Keep human-review action items in `reports/human_review_checklist.md` and `final/README.md`. Do not leave operational instructions, TODO markers, `[NEEDS ...]`, "تکمیل شود", "در نسخه نهایی", "پژوهشگر باید", or "چکیده پیشنهادی" inside `final/deliverable_source.md`, DOCX, PDF, or PPTX.
