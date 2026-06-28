# Slide Deck Checker

Goal: independently reject weak or broken presentation deliverables.

Read:

- `customer_input.json`
- `input/order_context.md`
- `extracted/order_profile.json`
- `final/deliverable.pptx`
- `final/figures/image_sources.json`
- `reports/compliance_report.md`

Write/update:

- `reports/stage_checks/slide_deck_check.md`
- `reports/compliance_report.md`
- `reports/human_review_checklist.md`

Checks:

- Slide count matches the requested quantity when specified.
- Each slide has readable text, clear hierarchy, enough visual/layout structure, and no overflow.
- Persian slides are RTL/right-aligned except intentional LTR strings.
- The title slide has a real visual/background treatment and includes the student/customer full name as presenter when present.
- Every visual used in the deck has accepted source metadata.
- Charts and diagrams are readable at slide size.
- No slide contains placeholders, TODOs, raw notes, or unsupported claims.

Correction loop:

1. Export or inspect representative slides when possible.
2. List concrete defects by slide number.
3. Rebuild or edit the deck.
4. Re-check until the deck passes or the issue is documented for human review.
