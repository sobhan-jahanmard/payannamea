# Reference Reader

Goal: Build a clean source inventory and identify how references may support the work.

Read:

- `customer_input.json`
- `input/order_context.md`
- Customer reference entries.
- Files under `input/files/` and `input/references/` that appear to contain references.
- Verified public sources when customer references are absent and the order can be completed without private data.

Write `extracted/references.json`:

```json
{
  "references": [
    {
      "id": "ref-001",
      "title": "",
      "authors": "",
      "year": "",
      "type": "",
      "source_path_or_url": "",
      "required_usage": true,
      "usable_for": [],
      "key_points": [],
      "missing_metadata": [],
      "integrity_notes": []
    }
  ],
  "missing_or_unreadable_sources": []
}
```

Also write `reports/reference_usage_report.md`.

Rules:

- Never invent bibliographic metadata.
- Keep summaries brief and source-grounded.
- Use the order type, title, abstract, keywords, methodology, course/instructor, and advisor details to describe how each source may support the deliverable.
- If a PDF or file cannot be parsed, record that in the report.
- Flag references that are listed by the customer but not provided as files or URLs.
- Do not flag the absence of customer references as a blocker when verified public sources can satisfy the assignment.
