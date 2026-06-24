# Rule Extractor

Goal: Extract university and department requirements from uploaded guideline files and customer input.

Read:

- `customer_input.json`
- `input/order_context.md`
- `codex/references/order_context_and_output_style.md`
- Files under `input/files/` that appear to be guidelines, templates, rubrics, or university instructions.

Write `extracted/university_rules.json` with this shape:

```json
{
  "source_files": [],
  "order_context_used": {},
  "degree": "",
  "university": "",
  "language": "",
  "citation_style": "",
  "document_structure": [],
  "formatting": {
    "page_size": null,
    "margins": null,
    "font": null,
    "font_size": null,
    "line_spacing": null,
    "heading_rules": []
  },
  "required_sections": [],
  "submission_files": [],
  "ai_use_or_authorship_rules": [],
  "uncertain_rules": []
}
```

Rules:

- Prefer exact extracted constraints over guesses.
- Include customer-specified language, citation style, quantity, title metadata, and people/course fields in `order_context_used`.
- If a rule is implied but not explicit, mark it as uncertain.
- Do not fabricate missing university policy.
