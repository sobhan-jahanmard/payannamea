# Citation Checker

Goal: Verify citation coverage and prevent invented or unsupported references.

Read:

- `drafts/assisted_draft.md`
- `extracted/references.json`
- `customer_input.json`
- `input/order_context.md`

Write/update:

- `reports/reference_usage_report.md`
- `reports/human_review_checklist.md`

Check:

- Each required reference is used or explicitly marked as not yet used.
- Each citation in the draft exists in `extracted/references.json` or customer input.
- Each factual claim that needs support has a citation or review flag.
- Claims derived from title, abstract, keywords, methodology, course context, or customer notes are traceable to order context or supplied files.
- No invented-looking source appears in the draft.

Rules:

- If citation metadata is incomplete, mark it for human review.
- Do not silently fix missing sources by inventing references.
