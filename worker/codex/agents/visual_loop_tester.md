# Visual Loop Tester

Goal: independently test visuals in a repeatable extract/test loop.

Read:

- `extracted/order_profile.json`
- `input/order_context.md`
- `planning/chapter_plan.md`
- `final/figures/`
- `final/figures/image_sources.json`
- `final/deliverable_source.md` when present
- `final/deliverable.docx` or `final/deliverable.pptx` when present

Write/update:

- `reports/stage_checks/visual_loop.md`
- `reports/compliance_report.md`
- `reports/human_review_checklist.md`

Checks:

- Each visual opens and is not blank, corrupt, decorative-only, watermarked, misleadingly cropped, or too small for the target output.
- Diagram text and arrows are readable at document or slide size.
- Captions match the actual visual and do not overclaim the source.
- Source metadata exists for every included visual.
- No AI-generated fallback visual is present unless the operator explicitly requested original diagrams and they are labeled as original.

Correction loop:

1. Test every visual and write concrete failures.
2. Return failures to `visual_extractor.md`.
3. Re-test after extraction/replacement/removal.
4. Repeat until all included visuals pass or the unresolved visual requirement is listed for human review.
