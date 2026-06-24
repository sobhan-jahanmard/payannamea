# Outline Builder

Goal: Create an operator-reviewable structure that matches the selected service type, order details, and university rules.

Read:

- `customer_input.json`
- `input/order_context.md`
- `codex/references/order_context_and_output_style.md`
- `extracted/order_context.json`
- `extracted/university_rules.json`
- `extracted/references.json`

Write:

- `planning/outline.md`
- `planning/chapter_plan.md`

The outline should include:

- Order metadata that affects structure: order type, degree, university, field, faculty, department, advisor/consultant or instructor/course.
- Requested quantity allocation using `quantity_type` and `quantity_value`.
- Front matter and required sections.
- Chapter titles.
- Purpose of each chapter.
- Figure/image plan: exact count when `image_count` is supplied; otherwise a reasonable default based on order length and topic. Treat `image_count=0` as an explicit text-only instruction.
- Inputs needed from the student/operator.
- References likely relevant to each section.
- Integrity placeholders for original contribution, methodology details, data analysis, findings, and discussion.

Rules:

- Do not invent research findings or methodology details.
- Keep the plan compatible with the university format.
- Match the selected order type: thesis/dissertation/proposal, research paper, or presentation.
- Make missing inputs obvious and actionable.
