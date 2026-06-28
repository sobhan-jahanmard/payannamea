# Visual Extractor

Goal: extract usable figures, diagrams, screenshots, and source visuals without inventing visuals.

Read:

- `customer_input.json`
- `input/order_context.md`
- `extracted/order_profile.json`
- `input/files/`
- `extracted/references.json`
- `planning/chapter_plan.md`

Write/update:

- Image files under `final/figures/`
- `final/figures/image_sources.json`
- `reports/reference_usage_report.md`
- `reports/stage_checks/visual_extraction.md`

Rules:

- Use customer files first, then reusable public/institutional sources when source and reuse basis can be recorded.
- Extract diagrams from source PDFs/DOCX/PPTX/images when they are relevant and readable.
- Do not redraw diagrams from memory or generate diagrams as a fallback.
- Each extracted item must include `local_path`, source file or URL, page/slide/figure identifier when available, extraction method, caption, license/reuse basis, and why it fits the order topic.
- Remove visuals that cannot be sourced or read.

Handoff:

- After extraction, run `visual_loop_tester.md`.
- If the tester fails, extract a replacement or remove the visual plan and document the limitation.
