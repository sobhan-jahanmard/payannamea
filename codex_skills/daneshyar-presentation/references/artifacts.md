# Source-only presentation artifacts

Read the contract, source index and topic inventory before writing. Scientific
evidence uses only `extracted/presentation_sources.json`; quotes are exact
excerpts from real locators. Guidelines remain separate. Tools resolve pages.

## Claims

Write `drafts/claims.candidate.json` as `{"claims":[...]}`. Example entry shape:

```json
{"id":"C1","topic":"overview","kind":"observed","statement":"A concise source-backed statement.","evidence":{"locator":"S1:block-1","quote":"An exact excerpt from the actual source segment."},"confidence":"high","assumptions":[],"limitation":""}
```

Use actual topic IDs from `planning/presentation_topics.json` and cover each
listed topic. Kinds: observed, assumption, calculated, scenario, judgment, gap.
Uncertain/gap claims need limitations; assumptions/scenarios/calculations need
stated assumptions. Market claims need `market_basis=direct|proxy|scenario|gap`;
capacity claims need `capacity_basis=theoretical|operational|saleable|gap`.
NPV/IRR without a complete source financial model is scenario/gap, not verified.
For a source calculation also provide `value`, `unit`, `formula`, sourced
`inputs=[{name,value,unit,evidence}]`. Do not create new research.

## Analytical packet

Write `drafts/analysis.candidate.json` as `{"version":1,"items":[...]}`. Extract
prints `required_analysis_categories`. When empty, validate an empty items array.
Each item has unique `id=A1,A2,...`, `category`, `status=complete|partial|gap`,
`evidence=[{locator,quote}]` and `missing=[...]` for partial/gap. Evidence must
address its category. Preserve complete source data; gaps describe genuinely
missing inputs, never an escape from a validator. This packet verifies supplied
analysis; it does not require new data gathering.

Read only relevant functions in the checkout's
`worker_plus/presentation/analysis.py` for the complete category schema:

| Category | Data |
| --- | --- |
| technology_matrix/site_matrix | `matrix.criteria=[{name,weight,evidence}]`, `alternatives=[{name,scores:[{value,evidence}]}]`; weights sum to one |
| mass_balance | Sourced `calculations=[{name,value,unit,formula,inputs}]`, `flows=[{name,role,value,unit,calculation}]` or independent flow evidence |
| financial_model | Consecutive annual_cash_flows from year zero, sourced revenue/opex/tax/capex/working_capital_delta/net components, construction_period, discount_rate, capex_total |
| investment_thresholds | `thresholds=[{label,value,unit,basis,evidence}]`; calculated thresholds require calculation |
| industrial_engineering | `areas` for layout,material_flow,bottleneck,workforce,schedule,risk; each sourced or explicit gap |

Incomplete financial models retain source `reported_metrics=[{name,value,evidence}]`
and missing components. Never invent weights, scores, costs or cash flows to pass.

## Slides

Write `drafts/presentation.candidate.json` as `{"slides":[...]}`. Count includes
cover, references and questions and must equal the contract. Example entry:

```json
{"section":"results","layout":"statement","title":"A supported takeaway","points":["Concise source-backed point"],"notes":"Useful spoken explanation from the same source.","evidence":[{"locator":"S1:block-1","quote":"An exact excerpt from the actual source segment."}],"claim_ids":["C1"],"analysis_ids":[]}
```

First slide alone uses `section=title,layout=title`. Other section IDs and limits
are in the contract. Substantive slides need evidence and matching claim_ids.
Use relevant analysis_ids and keep source uncertainty visible in the slide.

Layouts: title, statement, two_column, image, chart, table, comparison, key_metric,
process, timeline, decision, closing. Optional `description` is a concise subtitle.

- chart: `caption`, `chart={type:"column"|"bar"|"line",unit,categories,series:[{name,values}]}`;
  2–8 categories, 1–3 series, source-matching values/signs/units.
- table: `caption`, `table=[["Column","Column"],["value","value"]]`, 2–6 rows,
  2–4 columns, short string cells. No headers/rows object.
- image: real extracted `image_id`, caption and contextual evidence.
- comparison: `visual.columns=[{heading,items:[...]},{heading,items:[...]}]`.
- process/decision: `visual.nodes=[{label,detail}]`; independent axes/conditions use
  `visual.relationship="dimensions"` rather than an invented sequence.
- timeline: `visual.items=[{label,when,detail}]`; numeric timing needs evidence.
- key_metric: `visual.metrics=[{label,value,detail}]`; values need evidence.

No order/upload commentary or source filenames in presentation text. References
come only from real bibliographic entries in the supplied source; without them
omit the references slide and allocate the exact count to substantive material.
Use editable charts/tables and meaningful speaker notes.

Keep evidence locators in the model; never copy them, `Source S1` labels or
source-page ranges into visible text. Per-slide source references are stored as
native PowerPoint comments by the compiler. A references slide contains only
the supplied file's real bibliography entries, not the input file's identity.

Content review checks order coverage, narrative, qualification and redundancy.
Source review checks claim meaning, units, years/geography, chart mappings and
source links and native comments. Visual review opens every final PNG and relevant magnified crops.
Use the main tool contract's audit format and exact inspected input hashes.
