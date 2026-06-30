# Bachelor Thesis Workflow

Use this workflow when `extracted/order_profile.json` has `profile_key=bachelor_thesis`.

## Stage Contract

Every stage must produce its artifact, run an independent checker, and write `reports/stage_checks/<stage>.md` with `PASS` or `FAIL`. Failed stages loop back to the producer until they pass or the remaining item is listed in `reports/human_review_checklist.md`.

## 1. Intake And Profile Check

Producer: main worker.
Checker: `profile_stage_checker.md`.

Outputs:

- `extracted/order_context.json`
- `extracted/order_profile.json`
- `reports/stage_checks/intake.md`

Verify faculty, advisor, title, degree, quantity, language, citation style, and supplied files/references.

## 2. University Rules

Producer: `rule_extractor.md`.
Checker: `format_checker.md`.

Outputs:

- `extracted/university_rules.json`
- `reports/stage_checks/university_rules.md`

Extract title page, chapter order, font, margin, citation, abstract, and final-file rules. Flag missing guideline files.

## 3. References And Visual Sources

Producer: `reference_reader.md`, then `visual_extractor.md` or `image_researcher.md` when visuals are required.
Checker: `citation_checker.md`, then `visual_loop_tester.md` and `image_quality_checker.md`.

Outputs:

- `extracted/references.json`
- `final/figures/image_sources.json` when figures are expected
- `reports/reference_usage_report.md`
- `reports/stage_checks/references.md`
- `reports/stage_checks/visual_loop.md`

Use customer references first. Do not invent citations or diagrams.

## 4. Thesis Plan

Producer: `outline_builder.md`.
Checker: `profile_stage_checker.md`.

Outputs:

- `planning/outline.md`
- `planning/chapter_plan.md`
- `reports/stage_checks/outline.md`

Keep scope suitable for bachelor level and mark missing original analysis in the human review checklist, not as raw placeholders inside final deliverables.

## 5. Assisted Draft

Producer: `chapter_support_writer.md`.
Checker: `academic_editor.md`, then `citation_checker.md`.

Outputs:

- `drafts/assisted_draft.md`
- `final/deliverable_source.md`
- `reports/stage_checks/draft.md`

Draft only from supplied inputs, verified references, and allowed public sources.
Draft-stage placeholders are allowed only in `drafts/assisted_draft.md` and stage reports. Before writing `final/deliverable_source.md` or DOCX, replace raw placeholders with polished limitation/scope language and move the action item to `reports/human_review_checklist.md`.

## 6. Package And Final Checks

Producer: `word_format_editor.md`.
Checker: `format_checker.md`, `image_quality_checker.md`, `ui_quality_checker.md`, `confidentiality_checker.md`, `profile_stage_checker.md`.

Outputs:

- `final/deliverable.docx`
- `reports/compliance_report.md`
- `reports/human_review_checklist.md`
- `final/README.md`
- `reports/stage_checks/final_package.md`

Run `python ../../scripts/local_worker.py package-existing` from the order workspace when ready, then run the final checker loop before submission.
Also run `python ../../scripts/local_worker.py validate-final --workspace .` from the order workspace. If it reports placeholder, layout, source, image, or package problems, fix them and regenerate the editable outputs before handing control back to the wrapper.
