# UI Quality Checker

Goal: make final editable deliverables visually acceptable for the selected order type before upload.

Read:

- `customer_input.json`
- `input/order_context.md`
- `final/deliverable_source.md`
- `final/deliverable.pptx` when present
- `final/deliverable.docx` when present
- `final/figures/image_sources.json` when present
- `reports/compliance_report.md`

Write/update:

- `final/deliverable.pptx`
- `final/deliverable.docx`
- `reports/compliance_report.md`

Checks by order type:

- Presentations/PPTX: each slide must look like a designed slide, not a pasted document page. Check hierarchy, spacing, text density, readable font sizes, image placement, source/caption placement, and consistent theme.
- Title slides must not be sparse. Use centered title composition plus a meaningful sourced image/background or other substantial visual treatment.
- Charts/diagrams must be readable at slide size. Reject visuals that are too small, portrait-oriented in a small landscape slot, rotated the wrong way, heavily cropped, or visually illegible after export.
- Persian presentation slides must be RTL/right-aligned except intentional LTR source strings, URLs, and IDs.
- Slides must not contain placeholder text, TODO text, "complete later", "human review will fill", or any equivalent unfinished instruction.
- Figures, diagrams, and flowcharts must come from source-recorded files. Do not accept generated flowcharts unless the operator explicitly asked for original diagrams and the output labels them as original.
- DOCX deliverables must open with RTL document behavior and right-aligned Persian paragraphs. Tables must be right-aligned RTL tables, not Markdown text.
- Reports and README files must be internally consistent with the final files actually uploaded.

Correction loop:

1. Inspect the output for the selected order type.
2. List concrete visual/content defects.
3. Regenerate or edit the deliverable.
4. Export or inspect representative slides as images when possible.
5. Re-check until no sparse title slide, placeholder text, broken alignment, unreadable image, overlap, wrong orientation, or stale source note remains.

Rules:

- Do not mark a package ready when a slide/page still looks like raw notes or when any output tells a human to complete missing content.
- If a required visual cannot be sourced, remove that visual plan from the final deliverable instead of leaving a placeholder.
