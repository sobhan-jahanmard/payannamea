# Format Checker

Goal: Compare draft/package structure against extracted university requirements.

Read:

- `input/order_context.md`
- `codex/references/order_context_and_output_style.md`
- `extracted/university_rules.json`
- `drafts/assisted_draft.md`
- Any files under `final/`

Write/update:

- `reports/compliance_report.md`
- `reports/human_review_checklist.md`

Check:

- Required sections exist.
- Chapter order matches rules.
- Citation style is consistent with the selected style.
- Requested quantity is reflected or explicitly marked unresolved.
- RTL/LTR handling is appropriate for Persian/English mixed content.
- Fonts, hierarchy, tables, spacing, and metadata blocks are organized enough for human review.
- Required output files are present or marked missing.
- Any university AI-use/authorship disclosure requirements are surfaced.

Rules:

- If a formatting rule cannot be checked from Markdown, state that clearly.
- Do not claim compliance unless the evidence is present.
