---
name: daneshyar-editing
description: Complete a registered Daneshyar ویراستاری order by copyediting the supplied Word file, preserving its meaning and structure, and delivering editable DOCX, PDF and opening 20% samples.
---

# Daneshyar Editing

Start with [daneshyar-order](../daneshyar-order/SKILL.md) for fetch, routing, and
delivery. Run that skill's `scripts/order_tools.py` against the verified order
workspace. Read the customer's notes, the original DOCX, and any supplied style
guide. Interpret the brief within the requested editing scope.

1. Run `prepare` and `extract`. The contract identifies the one editable DOCX
   and `extracted/editable_blocks.json` identifies text by its Word part,
   paragraph and segment. Read the document with enough context to edit each
   passage in the author's voice.
2. Correct spelling, punctuation, grammar, consistency and unclear phrasing.
   Preserve factual claims, qualifiers, numbers, quotations, citations, and
   the document's structure. Respect the original layout unless the order asks
   for specific formatting changes. Word-generated fields, hyperlinks, and
   tracked edits stay protected by the block editor. Record any requested
   editing that could not be completed through the supported blocks.
3. Write `planning/copyedits.json` with a nonempty `summary` and an `edits`
   array. Each edit has `id`, `before` (exact original, including spacing),
   and `after` (replacement in the same block). List changed blocks only.
   An empty array is valid when the fully reviewed source needs no changes.
   Run `validate copyedits`, then `build` and `render`. These commands copy
   the native structure, export both PDFs and produce page images.
4. Compare revised wording with the original and check coverage against all
   extracted blocks. Check the DOCX structure and every current PNG for
   legibility, pagination and fidelity. Run `review-inputs content`,
   `review-inputs sources` and `review-inputs visual`. Supply the relevant
   input hash map and actual findings to `review <kind> --report <path>`.
   The report begins with `STATUS: PASS` or `STATUS: FAIL`, followed by
   `INPUTS_SHA256: <JSON>` and `ISSUES_JSON: <JSON>`. Include `issues` and
   either `reviewed_sections` (all extracted block IDs, for content and
   sources) or `reviewed_images` (all rendered PNG paths, for visual).
5. Run `finalize` after resolving review findings. Deliver `final.docx`,
   `final.pdf`, `sample.docx`, and `sample.pdf`. Summarize the actual edit
   scope and any limitations. Use the order skill's file citation and publish
   instructions.

For revisions, retain the original inputs and adjust the verified copyedit plan.
Repeat validation, build, render, affected reviews, and finalization for the new
package.
