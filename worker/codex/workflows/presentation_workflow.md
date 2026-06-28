# Presentation Workflow

Use this workflow when `extracted/order_profile.json` has `profile_key=presentation`.

## Stage Contract

Every stage must produce its artifact, run an independent checker, and write `reports/stage_checks/<stage>.md` with `PASS` or `FAIL`. Failed stages loop back to the producer until they pass or the remaining item is listed in `reports/human_review_checklist.md`.

## 1. Intake And Tool Scout

Producer: main worker, then `external_tool_scout.md`.
Checker: `profile_stage_checker.md`.

Outputs:

- `extracted/order_context.json`
- `extracted/order_profile.json`
- `reports/stage_checks/intake.md`
- `reports/stage_checks/external_tool_scout.md`

Evaluate Presenton, PPTAgent, PptxGenJS, or another profile-listed tool before using the local hand-built path. Do not send private files to hosted tools without operator approval.
Confirm the student/customer full name from `customer.full_name`; it must appear on the title slide when present.

## 2. References

Producer: `reference_reader.md`.
Checker: `citation_checker.md`.

Outputs:

- `extracted/references.json`
- `reports/reference_usage_report.md`
- `reports/stage_checks/references.md`

If customer references are absent, gather verified public sources sufficient for a source-grounded deck.

## 3. Visual Extract/Test Loop

Producer: `visual_extractor.md`, then `image_researcher.md` if source files do not contain enough visuals.
Checker: `visual_loop_tester.md`, then `image_quality_checker.md`.

Outputs:

- `final/figures/`
- `final/figures/image_sources.json`
- `reports/stage_checks/visual_loop.md`

Loop extract -> test -> extract/replace/remove -> test until every included visual is sourced, readable, and slide-appropriate.

## 4. Slide Plan

Producer: `outline_builder.md`.
Checker: `profile_stage_checker.md`.

Outputs:

- `planning/outline.md`
- `planning/chapter_plan.md`
- `reports/stage_checks/outline.md`

Plan exact slide titles, slide purpose, source coverage, and visual placement. Match `quantity_value` when `quantity_type=slides`. Include the student/customer full name in the title-slide plan as the presenter name when present.

## 5. Deck Build

Producer: `slide_deck_builder.md`.
Checker: `slide_deck_checker.md`.

Outputs:

- `final/deliverable_source.md`
- `final/deliverable.pptx`
- `reports/stage_checks/slide_deck_build.md`
- `reports/stage_checks/slide_deck_check.md`

Build with the selected prebuilt tool if it passed the scout and privacy checks; otherwise use the local deterministic PPTX path.

## 6. Final Package Checks

Producer: `word_format_editor.md` for companion DOCX/source packaging.
Checker: `slide_deck_checker.md`, `image_quality_checker.md`, `ui_quality_checker.md`, `profile_stage_checker.md`.

Outputs:

- `final/deliverable.docx`
- `final/deliverable.pptx`
- `reports/compliance_report.md`
- `reports/human_review_checklist.md`
- `final/README.md`
- `reports/stage_checks/final_package.md`

Run `python ../../scripts/local_worker.py package-existing` from the order workspace when ready, then run all final checks before submission.
