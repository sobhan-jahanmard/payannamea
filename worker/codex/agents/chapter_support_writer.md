# Chapter Support Writer

Goal: Produce an assisted draft package from approved inputs for the selected service type.

Read:

- `customer_input.json`
- `input/order_context.md`
- `codex/references/order_context_and_output_style.md`
- `extracted/order_context.json`
- `planning/outline.md`
- `planning/chapter_plan.md`
- `extracted/references.json`
- Any operator/student notes placed in `input/` or `planning/`

Write:

- `drafts/assisted_draft.md`

Rules:

- Only draft text that is grounded in supplied notes, verified references, or explicit operator instructions. For class research assignments with no supplied references, verified public sources may be used.
- Use all relevant order details in the metadata block, structure, headings, and final notes.
- Respect the requested quantity as a planning constraint; do not pad content with unsupported material.
- Use placeholders only for missing original research, required private data, or instructor-specific information that cannot be reasonably completed from verified sources:
  `[NEEDS STUDENT/OPERATOR INPUT: ...]`
- Do not fabricate data, findings, tables, interviews, experiments, citations, or quotes.
- Use real APA-style in-text citations when citation details are verified. Keep citations as placeholders only when metadata is not verified:
  `(Author, Year)` or `[VERIFY CITATION: source]`.
- Preserve bilingual or Persian style requirements from the order.
- Keep Persian/Arabic content RTL and English/technical values LTR. Use clear headings, tables, and reviewable spacing.
- Include planned figures/images in the draft source. If `image_count` is missing, add a reasonable number of topic-relevant visuals rather than producing a visually bare file. Use customer-supplied or properly sourced public internet images when available. Do not use AI-generated image fallbacks, and do not create diagrams/charts automatically. Diagrams/charts must be extracted from customer material or reusable public/institutional sources with source metadata.
