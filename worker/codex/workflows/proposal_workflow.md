# Thesis Proposal Workflow

Use this workflow when `extracted/order_profile.json` has `profile_key=proposal`.

## Stage Contract

Every stage must produce its artifact, run an independent checker, and write `reports/stage_checks/<stage>.md` with `PASS` or `FAIL`. Failed stages loop back to the producer until they pass or the remaining item is listed in `reports/human_review_checklist.md`.

## 1. Intake And Proposal Scope

Producer: main worker.
Checker: `profile_stage_checker.md`.

Outputs:

- `extracted/order_context.json`
- `extracted/order_profile.json`
- `reports/stage_checks/intake.md`

Verify faculty, advisor, abstract/problem statement, topic, methodology, quantity, and university context.

## 2. Proposal Rules

Producer: `rule_extractor.md`.
Checker: `format_checker.md`.

Outputs:

- `extracted/university_rules.json`
- `reports/stage_checks/university_rules.md`

Extract required sections such as problem statement, background, objectives, questions, hypotheses, method, schedule, resources, and references.

## 3. References And Visual Sources

Producer: `reference_reader.md`, then `visual_extractor.md` or `image_researcher.md` when visuals are required.
Checker: `citation_checker.md`, then `visual_loop_tester.md` and `image_quality_checker.md`.

Outputs:

- `extracted/references.json`
- `final/figures/image_sources.json` when figures are expected
- `reports/reference_usage_report.md`
- `reports/stage_checks/references.md`
- `reports/stage_checks/visual_loop.md`

Use sources to support background and method choice. Do not present proposed work as completed work.

## 4. Proposal Plan And Method Check

Producer: `outline_builder.md`.
Checker: `proposal_methodology_checker.md`.

Outputs:

- `planning/outline.md`
- `planning/chapter_plan.md`
- `reports/stage_checks/proposal_methodology.md`

Check alignment among problem, objectives, research questions, hypotheses, method, feasibility, and missing student/operator inputs.

## 5. Assisted Proposal Draft

Producer: `chapter_support_writer.md`.
Checker: `academic_editor.md`, `proposal_methodology_checker.md`, then `citation_checker.md`.

Outputs:

- `drafts/assisted_draft.md`
- `final/deliverable_source.md`
- `reports/stage_checks/draft.md`

Label missing data access, approvals, instruments, or advisor-specific decisions for human review.

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
