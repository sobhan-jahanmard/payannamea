# Order Workflow

## Stage 1: Intake

1. Read `customer_input.json`.
2. Read `input/order_context.md`.
3. Read `codex/references/order_context_and_output_style.md`.
4. Inventory all files under `input/`.
5. Create or update `extracted/order_context.json` with a normalized summary of every non-empty order detail and a list of missing details that matter for the selected order type.
6. Create `reports/human_review_checklist.md` with an initial "Missing or unclear inputs" section.
7. If a required file, order detail, or quantity value is unreadable, missing, or ambiguous, add it to the checklist. Do not treat absent optional fields as blockers.

`extracted/order_context.json` must include:

- Core metadata: order ID, type, title, English title, degree, university, field, faculty, department.
- People/course metadata: advisor, consultant, instructor, course.
- Output requirements: language, citation style, methodology, `quantity_type`, `quantity_value`, `image_count`, deadline.
- Content inputs: abstract, keywords, notes, uploaded files, references.
- Direction and font assumptions used for the package.

## Stage 2: University Rules

Use `codex/agents/rule_extractor.md`.

Outputs:

- `extracted/university_rules.json`
- A short "format risks" section in `reports/compliance_report.md`

Capture concrete rules such as page margins, fonts, heading levels, chapter order, citation style, abstract requirements, language requirements, forms, and final file requirements. Use order context values as customer requirements when uploaded university rules do not override them.

## Stage 3: References

Use `codex/agents/reference_reader.md`.
Use `codex/agents/image_researcher.md` when visuals are required or when `image_count` is missing and the deliverable would look bare without images.
Use `codex/agents/image_quality_checker.md` after image research whenever any visual is planned or present.

Outputs:

- `extracted/references.json`
- Initial `reports/reference_usage_report.md`

If the customer supplied no references for a class research assignment or presentation, gather verified public sources sufficient for a complete, source-grounded deliverable. Prefer academic, standards, institutional, manufacturer technical, or reputable engineering sources. Record external source URLs and access notes.

For images, use customer-provided visuals first, then real topic-relevant internet images with clear source/license metadata. Use Wikimedia Commons or other reusable technical sources first. Record image source URLs, license labels, authors when available, and why each image fits the topic. Do not use AI-generated image fallbacks. Do not auto-create diagrams/flowcharts/charts from scratch; extract diagrams only from customer material or reusable public/institutional sources. If the expected image count cannot be met this way, include fewer visuals and flag the gap for human review.

Every reference entry must include:

- Title
- Authors if available
- Year if available
- Source file or URL if available
- Required/optional status
- Notes on how it may support the selected academic deliverable
- Any missing metadata

## Stage 4: Outline

Use `codex/agents/outline_builder.md`.

Outputs:

- `planning/outline.md`
- `planning/chapter_plan.md`

The outline must be reviewable by the operator before any long-form drafting. For class research assignments, allocate the requested quantity into a complete deliverable structure and avoid unnecessary placeholders when the topic can be completed with verified sources. Include placeholders only for genuinely unavailable original analysis, required private data, or instructor-specific demands.

Include a figure/image plan. If `image_count` is missing, choose a reasonable default count based on the order length and topic; if `image_count=0`, keep the deliverable text-only unless supplied source files require visuals.

## Stage 5: Assisted Draft Package

Use `codex/agents/chapter_support_writer.md`.

Output:

- `drafts/assisted_draft.md`

Write from supplied inputs, extracted rules, verified references, and operator-approved notes. For class research assignments, external verified references may be used when no customer references are supplied. In drafts, label unsupported sections clearly:

```txt
[NEEDS STUDENT/OPERATOR INPUT: describe the missing analysis or evidence]
```

Start the draft or `final/deliverable_source.md` with a compact metadata table that uses the order context. Keep Persian text RTL and technical/English values LTR.

Before copying draft material into `final/deliverable_source.md`, remove draft-only placeholders and internal worker metadata. Missing original research, interviews, statistics, advisor decisions, or private data must be documented in `reports/human_review_checklist.md`; the final deliverable itself should use polished academic limitation language instead of TODO markers.

Include planned visuals in the draft/final source where they improve readability. Use customer images first; otherwise use licensed/source-recorded public images. Use library-created diagrams/charts only when the source data and validation notes are recorded. When no exact image count is supplied, missing count should not result in a plain text-only file by default.

## Stage 6: Editing

Use `codex/agents/academic_editor.md`.

Outputs:

- Updated `drafts/assisted_draft.md`
- Style notes in `reports/human_review_checklist.md`

Do not pretend missing information has been provided. Move any integrity placeholders out of final deliverables and into `reports/human_review_checklist.md`, then revise the final text so it remains honest, readable, and free of raw TODO markers.

## Stage 7: Citation And Format Checks

Use:

- `codex/agents/citation_checker.md`
- `codex/agents/format_checker.md`
- `codex/agents/image_quality_checker.md` when visuals are present
- `codex/agents/ui_quality_checker.md`
- `codex/agents/word_format_editor.md`

Outputs:

- Updated `reports/reference_usage_report.md`
- Updated `reports/compliance_report.md`
- Updated `final/deliverable.docx` when an editable Word output is required

Flag every uncited claim, missing source, suspicious citation, invented-looking citation, and format mismatch. Also flag directionality, font, spacing, or layout problems that would make the output hard to review or unsuitable for upload.

Reject final deliverables that contain TODO/TBD markers, `[NEEDS ...]`, "تکمیل شود", "در نسخه نهایی", "پژوهشگر باید", "چکیده پیشنهادی", or internal worker/order labels. Fix the final text and regenerate editable outputs before final submission.

For Persian Word deliverables, the Word format editor must verify that the file opens with RTL document behavior, Persian complex-script fonts, natural page flow, real Word tables, and no artificial blank-page gaps.

Verify that required or default-assumed figures are present in the editable Word output, have readable captions, and do not create large blank gaps or break page count unnecessarily.

## Stage 8: Human Review Package

Use `codex/agents/compliance_reporter.md`.

Outputs:

- `reports/human_review_checklist.md`
- `final/README.md`

The final package must tell the operator exactly what needs human review before upload.

Do not call worker/admin backend endpoints from Codex chat. After this review package is created, the worker helper should upload it and move the order to `worker_done_pending_approval`; admins should mark the order `completed` only after checking it in the admin panel. Unless the order explicitly requests source-only output, include an editable Word file at `final/deliverable.docx`.
