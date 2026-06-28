# Research Assignment Workflow

Use this workflow when `extracted/order_profile.json` has `profile_key=research_assignment`.

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

Verify course, instructor, topic, quantity, language, and allowed source policy.

## 2. Source Research

Producer: `reference_reader.md`.
Checker: `citation_checker.md`.

Outputs:

- `extracted/references.json`
- `reports/reference_usage_report.md`
- `reports/stage_checks/references.md`

If customer references are absent, gather verified public sources sufficient for a source-grounded assignment. Do not invent citations.

## 3. Visual Extraction Or Research

Producer: `visual_extractor.md` or `image_researcher.md`.
Checker: `visual_loop_tester.md`, then `image_quality_checker.md`.

Outputs:

- `final/figures/image_sources.json` when figures are expected
- `reports/stage_checks/visual_loop.md`

Extract or select only relevant sourced visuals. Loop until accepted or remove the visual plan and document the limitation.

## 4. Assignment Outline

Producer: `outline_builder.md`.
Checker: `profile_stage_checker.md`.

Outputs:

- `planning/outline.md`
- `planning/chapter_plan.md`
- `reports/stage_checks/outline.md`

Allocate the requested pages/words into a complete class-paper structure.

## 5. Source-Grounded Draft

Producer: `chapter_support_writer.md`.
Checker: `academic_editor.md`, then `citation_checker.md`.

Outputs:

- `drafts/assisted_draft.md`
- `final/deliverable_source.md`
- `reports/stage_checks/draft.md`

Use concise, traceable claims and cite sources. Mark only genuinely missing private/instructor-specific inputs.

## 6. Package And Final Checks

Producer: `word_format_editor.md`.
Checker: `format_checker.md`, `image_quality_checker.md`, `ui_quality_checker.md`, `profile_stage_checker.md`.

Outputs:

- `final/deliverable.docx`
- `reports/compliance_report.md`
- `reports/human_review_checklist.md`
- `final/README.md`
- `reports/stage_checks/final_package.md`

Run `python ../../scripts/local_worker.py package-existing` from the order workspace when ready, then run the final checker loop before submission.
