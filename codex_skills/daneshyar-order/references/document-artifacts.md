# Document artifact contracts

Paths are relative to the returned workspace. Write UTF-8. Use the same CLI as
presentations; documents accept `validate rules`, `evidence`, and `document`.

## Required files

| Path | Purpose |
| --- | --- |
| `extracted/document_sources.json` | Tool-generated source/guideline segments and physical locators |
| `extracted/university_rules.json` | Complete compiler typography rules; defaults from prepare |
| `planning/document_contract.json` | Tool-generated intake, deliverable, page and visual requirements |
| `planning/resolved_source_rules.md` | Agent's interpretation of all real guidelines and notes, with locators and acceptance checks |
| `research/evidence.json` | Research ledger validated against contractual deliverable IDs |
| `research/analysis.md` | Executed analysis/design rationale, data gaps and calculation outputs |
| `planning/document_plan.json` | Section allocation, evidence mapping and explicit companions |
| `planning/visual_plan.json` | `visuals` array matching the contractual minimum |
| `final/figures/manifest.json` | `figures` array with kind, workspace-relative path, caption and source/assumption |
| `final/deliverable_source.md` | Authoritative full document Markdown |

## Research ledger

`deliverables` must include every ID in
`planning/document_contract.json.deliverable_contract.deliverables`. Extra IDs are
allowed with the same schema. Financial requirements explicitly present in
`resolved_source_rules.md` can add `income_statement`, `cash_flow`,
`balance_sheet`, `market_forecast` through the existing research validator.

```json
{
  "deliverables": [{
    "id": "problem_conclusion",
    "status": "direct",
    "sources": [{
      "url": "https://publisher.example/actual-opened-page",
      "title": "Actual publication title",
      "publisher": "Actual publisher",
      "geography": "Scope of the study",
      "year": 2025,
      "retrieved_at": "Actual retrieval date",
      "extracted_fact": "Accurate fact or passage with units and locator"
    }],
    "method_executed": "What was actually compared, calculated or synthesized",
    "calculation_or_comparison": "Inputs, units, formula/script and observed output",
    "result": "Concrete bounded result, or completed proposal design conclusion",
    "limitations": "Actual limitations and uncertainty"
  }]
}
```

Examples demonstrate schema, not real evidence. Replace every example value.
`status` is `direct`, `proxy` (requires `transfer_limit`), or `assumption`
(requires `failed_searches` documenting the unsuccessful search). Direct/proxy
entries require actually opened web sources or verified uploaded evidence.
For uploaded-only material use `sources: []` and
`"uploaded_evidence":[{"locator":"S1:line-1","quote":"Actual exact passage"}]`.
The tool verifies locator/quote correspondence to extracted academic uploads;
formatting guidelines do not count as scientific evidence. Respect a supplied-only
assignment; add relevant verified literature when research is allowed/needed.
Do not fabricate a URL for a private source. Scientific statements require verified scientific references;
an explicit design assumption may support a scenario, never an invented fact.

## Plan, figures and source

```json
{
  "sections": [{
    "id": "intro", "title": "مقدمه",
    "question": "The bounded research question",
    "evidence_ids": ["problem_conclusion"],
    "expected_result": "What this section establishes",
    "target_words": 400
  }],
  "companions": []
}
```

Section IDs must be unique and titles must appear in the document. Every
`evidence_ids` value must exist in the ledger. Add every required companion as
`{"title":"Actual requested report title","source":"final/report_1.md"}`.
Companion Markdown is authored from the current research and validated in the
section/source audit; render creates editable DOCX/PDF and reviewable page PNGs.
The existing API accepts the four primary files only; companions are included
in local delivery and cannot be silently omitted or described as uploaded.

`planning/visual_plan.json` uses `{"visuals":[{"id":"V1","kind":"chart","caption":"..."}]}`.
`final/figures/manifest.json` uses
`{"figures":[{"id":"V1","kind":"chart","path":"final/figures/v1.png","caption":"...","source":"..."}]}`.
Use `{"visuals":[]}` / `{"figures":[]}` only when the contract permits zero.
Each real asset is referenced by `![Caption](figures/v1.png)` in the full source,
has an in-text discussion and a source or explicit assumption. Use diagrams for
non-numeric concepts; requested charts require real numeric data or an explicitly
labelled permissible scenario. Keep native tables editable.

Use `#`, `##`, `###` headings, ordinary paragraphs, Markdown tables and numbered
citations `[1]`. End with a top-level `# منابع` or `# References` and unique entries
starting `[1]`. Check bibliography identity and support, not just matching numbers.
Word orders count body text before references using the tool's Unicode word
counter; page orders use actual Word/PDF pagination and the existing page budget.
Do not shrink typography, inflate blank pages or repeat text to meet quantity.

## Audit format

Obtain a fresh complete `inputs` map with `review-inputs <kind>` before inspection.

```text
STATUS: PASS
INPUTS_SHA256: {"every/path/from/snapshot":"actual hash"}
ISSUES_JSON: {"reviewed_sections":["intro","all-other-plan-ids"],"issues":[]}
Specific observations, source locators, calculations and requirement checks.
```

For a visual audit replace `reviewed_sections` with `reviewed_images`, containing
every current image path from `reports/document_render.json.images`, including
sample and companions. PASS requires no unresolved issues and complete coverage.
A FAIL report documents concrete section/page/region and correction. Schemas
cannot prove that the agent opened an image or that a citation is true: perform
the actual inspection before certifying it. Revisions require fresh hashes.
