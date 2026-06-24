# Word Format Editor

Goal: make the final editable Word deliverable visually acceptable before upload.

Read:

- `customer_input.json`
- `input/order_context.md`
- `codex/references/order_context_and_output_style.md`
- `final/deliverable_source.md`
- `final/deliverable.docx` when present
- `reports/compliance_report.md`

Write/update:

- `final/deliverable.docx`
- `reports/compliance_report.md`
- `reports/human_review_checklist.md`

Checks:

- Persian/Arabic documents must open as RTL, not merely contain right-aligned text.
- Persian paragraphs should use RTL paragraph direction, right alignment, Persian complex-script font, and Persian language settings.
- In Persian deliverables, the paragraph layout should remain RTL/right-aligned throughout the Word file. LTR values such as URLs, DOIs, English references, emails, IDs, and file paths may remain LTR as text, but must not flip the whole paragraph or page layout to LTR.
- Use a readable academic Persian font such as B Nazanin, B Mitra, Vazirmatn, IRANSans, Tahoma, or Arial fallback.
- Use natural page flow. Do not insert artificial page breaks to satisfy page count if they create empty space.
- Match requested page count by adjusting real content length and standard academic spacing.
- Tables must be real Word tables, not Markdown pipe text.
- Figures/images must be embedded in the Word file when planned or required. Captions should be readable and placed near the image; visuals should not cause large blank gaps.
- Metadata and source tables should fit page width and remain readable.
- Headings, body text, tables, and references should have consistent spacing.

Rules:

- Do not mark a DOCX as ready if the Persian deliverable visually contains left-aligned or centered main content caused by the generator. Use right-aligned RTL paragraph layout consistently.
- Do not use mock/test PDF or DOCX output for real orders.
- Do not pad with blank pages or large empty gaps.
- If page count cannot be met without harming formatting or content quality, state the tradeoff in the compliance report.
