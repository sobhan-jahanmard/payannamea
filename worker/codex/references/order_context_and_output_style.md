# Order Context And Output Style

Use this reference for every order workspace.

## Required Order Fields To Consider

Read both `customer_input.json` and `input/order_context.md`. Treat the normalized order context as constraints for planning, drafting, formatting, reports, and final package notes.

Core fields:

- `id`
- `order_type`
- `student_name`
- `title`
- `title_english`
- `degree`
- `university`
- `field_of_study`
- `faculty`
- `department`
- `language`
- `academic_style`
- `methodology`
- `quantity_type`
- `quantity_value`
- `image_count`
- `deadline`
- `notes`

People and course fields:

- `advisor_name`
- `consultant_name`
- `instructor_name`
- `course_name`

Content fields:

- `keywords`
- `abstract`
- `references`
- `files`

Use all non-empty fields. If a field is important for the selected `order_type` but is empty, add it to `reports/human_review_checklist.md` instead of guessing.

## Dynamic Quantity

`quantity_type` controls what `quantity_value` means:

- `pages`: page count.
- `words`: word count.
- `slides`: slide count.

Use the quantity in `planning/chapter_plan.md`, `drafts/assisted_draft.md`, `reports/compliance_report.md`, and `final/README.md`. If the quantity is missing, write "not specified" and ask for confirmation in the human review checklist.

Use `image_count` as the expected total number of images/figures in the final deliverable. If it is missing, do not treat the output as image-free: choose a reasonable number of relevant figures based on order length and topic, document that assumption, and include them when the format supports images. If it is `0`, do not plan image placeholders unless source files require them.

Default figure policy when `image_count` is missing:

- Short research/class assignments: at least 1 relevant figure.
- Around 5 pages or more: normally 2 figures unless the topic is purely textual.
- Long papers, proposals, theses, or dissertations: distribute 3 or more figures/tables/diagrams where they improve reviewability.
- Presentations: use visuals regularly, roughly one visual every few slides when no stricter count is supplied.

Prefer customer-supplied images first. If none are provided, use real topic-relevant internet images from public-domain/Creative-Commons or institution/manufacturer/public technical sources when license/source can be recorded. Wikimedia Commons is the preferred automatic lookup source. Do not use AI-generated image fallbacks, random decorative stock images, or automatically created diagrams/flowcharts/charts. Diagrams must be extracted from customer material or reusable public/institutional sources with source metadata. Record image source/extraction notes in the reference usage report, compliance report, or final README.

`deadline` is stored as a UTC timestamp. Display it to Persian users as a Jalali date when possible.

## Order-Type Expectations

For thesis, dissertation, and proposal orders:

- Use `advisor_name`, `consultant_name`, `faculty`, `department`, `title_english`, `keywords`, and `abstract` when present.
- Include title-page metadata in the plan and final README.
- If a guideline file is missing, flag university formatting as uncertain.

For research assignment orders:

- Use `course_name` and `instructor_name` as primary constraints.
- Keep the structure suitable for a class research paper unless the customer files say otherwise.

For presentation orders:

- Treat `quantity_type=slides` as the expected slide count.
- Put the student/customer full name on the title slide as the presenter name when it is present.
- Plan slide titles, presenter notes if requested, and any source/citation slide.
- Keep slide text concise and make missing visual/data inputs explicit.

## Directionality

Persian and Arabic text must be RTL. English titles, URLs, DOIs, emails, file paths, code snippets, citation keys, and IDs must be LTR.

Markdown:

- Use normal RTL Persian paragraphs for Persian deliverables.
- Wrap long English/technical values in backticks where appropriate.
- For HTML-capable output, use `dir="rtl"` on Persian containers and `dir="ltr"` on English/technical spans.

HTML:

- Set `<html lang="fa" dir="rtl">` for Persian deliverables.
- Add `.ltr { direction: ltr; unicode-bidi: isolate; text-align: left; }`.
- Add `.rtl { direction: rtl; unicode-bidi: isolate; text-align: right; }`.

DOCX/PDF:

- Use RTL paragraph direction for Persian text when the conversion tool supports it.
- Keep English abstracts, URLs, references with Latin metadata, and identifiers readable as LTR text, but in Persian deliverables do not let these values change the paragraph/page layout away from RTL/right alignment unless the operator explicitly requests a bilingual LTR section.
- If the tool cannot enforce directionality, state that limitation in `reports/compliance_report.md`.
- Editable DOCX output for Persian orders must include Word-level RTL defaults/settings, not only right-aligned text.
- Page count should be achieved through content length and normal academic spacing, not forced page breaks that leave large gaps.

## Fonts And Visual Structure

Generated files must look organized and reviewable, not like raw notes.

Preferred Persian fonts:

- `Vazirmatn`
- `IRANSans`
- `B Nazanin`
- `B Mitra`
- fallback: `Tahoma`, `Arial`

Preferred English fonts:

- `Times New Roman`
- `Calibri`
- `Arial`

Use consistent hierarchy:

- Clear title.
- Metadata block/table for order details.
- Numbered headings.
- Tables for structured lists.
- Topic-relevant figures, diagrams, screenshots, charts, or process visuals when useful. Missing `image_count` is not a reason to omit all visuals.
- Short paragraphs with enough spacing.
- Checklists for human review items.
- Separate sections for sources, assumptions, missing inputs, and formatting risks.

Do not use decorative layouts that make academic review harder. Keep the design quiet, readable, and print-friendly.

## Final Package Expectations

At minimum, `final/README.md` must include:

- Order ID and order type.
- Student/presenter name when present.
- Title and English title if present.
- University, degree, field, faculty, and department.
- Advisor/consultant or instructor/course when present.
- Language, citation style, methodology, and quantity.
- Expected image/figure count.
- Files included in the final package.
- What is ready for upload.
- What still requires human review.

If creating `final/deliverable_source.md`, begin with a compact metadata table using the order context.
