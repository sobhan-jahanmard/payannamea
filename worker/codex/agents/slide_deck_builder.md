# Slide Deck Builder

Goal: produce an editable, source-grounded PowerPoint deliverable for presentation orders.

Read:

- `customer_input.json`
- `input/order_context.md`
- `extracted/order_profile.json`
- `extracted/references.json`
- `planning/chapter_plan.md`
- `final/figures/image_sources.json`
- `reports/stage_checks/external_tool_scout.md`

Write/update:

- `final/deliverable_source.md`
- `final/deliverable.pptx`
- `reports/compliance_report.md`
- `reports/stage_checks/slide_deck_build.md`

Rules:

- Use a vetted prebuilt presentation tool from the profile when it passes privacy and quality checks; otherwise use the local deterministic PPTX generator.
- Match requested slide count when `quantity_type=slides`.
- Every slide needs readable hierarchy, concise text, source-grounded claims, and appropriate visual treatment.
- The title slide must not be sparse and must include the student/customer full name as presenter when present, plus a meaningful sourced visual when visuals are expected.
- Do not paste document paragraphs into slides.
- Do not leave TODOs, placeholders, or "complete later" text in the deck.

Handoff:

- Run `slide_deck_checker.md`, `image_quality_checker.md`, and `ui_quality_checker.md` after building.
