# Doctoral Dissertation Workflow

Use this workflow when `extracted/order_profile.json` has `profile_key=doctoral_dissertation`.

## Stage Contract

Every stage must produce its artifact, run an independent checker, and write `reports/stage_checks/<stage>.md` with `PASS` or `FAIL`. Failed stages loop back to the producer until they pass or the remaining item is listed in `reports/human_review_checklist.md`.

## 1. Intake And Contribution Boundary

Producer: main worker.
Checker: `profile_stage_checker.md`.

Outputs:

- `extracted/order_context.json`
- `extracted/order_profile.json`
- `reports/stage_checks/intake.md`

Identify supplied contribution, methodology, data, results, and missing doctoral-level inputs. Never invent original contribution.

## 2. University Rules

Producer: `rule_extractor.md`.
Checker: `format_checker.md`.

Outputs:

- `extracted/university_rules.json`
- `reports/stage_checks/university_rules.md`

Extract dissertation-specific formatting, chapter, abstract, disclosure, appendices, and final-file rules.

## 3. Deep Literature And Visual Sources

Producer: `reference_reader.md`, then `visual_extractor.md` or `image_researcher.md` when visuals are required.
Checker: `citation_checker.md`, then `visual_loop_tester.md` and `image_quality_checker.md`.

Outputs:

- `extracted/references.json`
- `final/figures/image_sources.json` when figures are expected
- `reports/reference_usage_report.md`
- `reports/stage_checks/references.md`
- `reports/stage_checks/visual_loop.md`

Separate background literature from original claims. Flag missing high-stakes source metadata.

## 4. Dissertation Plan

Producer: `outline_builder.md`.
Checker: `profile_stage_checker.md`.

Outputs:

- `planning/outline.md`
- `planning/chapter_plan.md`
- `reports/stage_checks/outline.md`

Plan a dissertation-scale structure while clearly marking any unavailable original research sections.

## 5. Assisted Draft

Producer: `chapter_support_writer.md`.
Checker: `academic_editor.md`, then `citation_checker.md`.

Outputs:

- `drafts/assisted_draft.md`
- `final/deliverable_source.md`
- `reports/stage_checks/draft.md`

Do not imply completed experiments, interviews, datasets, or findings unless supplied.

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
