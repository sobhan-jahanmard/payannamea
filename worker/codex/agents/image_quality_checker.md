# Image Quality Checker

Goal: prevent broken, unsourced, generated, or low-quality visuals from entering the final package.

Read:

- `customer_input.json`
- `input/order_context.md`
- `planning/chapter_plan.md`
- `extracted/references.json`
- `final/deliverable_source.md` when present
- `final/figures/`
- `final/figures/image_sources.json` when present

Write/update:

- `reports/compliance_report.md`
- `reports/human_review_checklist.md`
- `final/README.md`
- `final/figures/image_sources.json` only to correct metadata for accepted sourced images

Checks:

- Every visual used in the source, DOCX, PPTX, or final figure folder must have source metadata.
- Prefer customer-provided images first, then licensed/public reusable internet images.
- Do not accept AI-generated images, hand-drawn ad hoc diagrams, or flowcharts generated from guesses.
- Do not create replacement diagrams automatically. If a needed diagram cannot be extracted from customer files or a reusable public source, remove it from the deliverable and add a human-review checklist item.
- For diagrams/flowcharts extracted from a source, record the source URL/file, license or reuse basis, extraction method, and page/figure identifier when available.
- For raster images, verify that the file opens, dimensions are suitable for the deliverable, text is readable, and the image is not blank, cropped, watermarked, or decorative-only.
- For SVG/vector images, verify that labels do not overlap, text is readable, arrows/flow direction make sense, and RTL/LTR labels are not reversed.
- Captions must match the actual visual and should not imply the visual is a manufacturer drawing, field photo, or source diagram unless it is.

Correction loop:

1. List all visual problems.
2. Remove rejected visuals or replace them only with sourced/extracted alternatives.
3. Re-check provenance, readability, caption fit, and metadata.
4. Repeat until all included visuals pass or unresolved items are documented for human review.

Rules:

- A final package with visuals is not ready unless this checker has passed or the remaining visual limitations are explicitly listed in `reports/human_review_checklist.md`.
- If the expected image count cannot be met without generated diagrams or unsourced images, deliver fewer visuals and explain the reason in `reports/compliance_report.md`.
