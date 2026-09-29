# Worker Plus: architecture review and proposed roadmap

Date: 2026-09-29. Status: proposal for review, not an implementation commitment.

## Scope and confidence

Reviewed the current working tree, including existing uncommitted changes: Python runner, shared stages, profiles, input handling, desktop launcher, backend worker contract, tests, and saved workspace metadata. No orders were executed, no backend mutations were made, and no runtime code was changed. This is a static architecture review, not an end-to-end correctness certification or cost benchmark.

One archived workspace contains 24 historical recovery entries, across generation, visual placement, and final validation. These may span multiple invocations and older code; they are not evidence of 24 retries in one current run. Embedded backend run histories are not a clean stage-level cost baseline. No savings percentage or reliable per-order price is established.

## Current architecture

Electron/React UI -> Python run.py -> common.runner -> backend claim -> shared sequential workflow -> review package submission.

The runner has 20 normal stages plus a failure handler:

1. Claim order, prepare local workspace, validate intake.
2. Extract university rules and build the order execution contract.
3. Collect uploaded sources, extract their text, combine source/admin rules.
4. Create outline, plan visuals, generate visual assets.
5. Generate the entire Markdown document, extend it if short.
6. Check visual placement, review decision content/admin instructions, audit source compliance.
7. Package Word, polish cover, finalize and verify Persian pagination.
8. Validate, potentially extend content again for page count, render PDF, audit visuals, create first-half sample, submit artifacts.

Five profiles share this workflow: bachelor thesis, master thesis, proposal, university research, presentation. Most behavior remains shared; profile names do not imply genuinely different artifact pipelines.

Useful foundations to preserve: explicit order contracts, deterministic checks, source input caching, local resume artifacts, backend transactional claim, Word/RTL handling, PDF rendering, and human review statuses.

## Findings and priority

| Priority | Finding | Code evidence | Consequence |
|---|---|---|---|
| P0 | Content can change after content review | `common/steps/10_validate_and_publish.py`, `complete_page_target()` | Page completion edits source after content/source gates, without replaying those gates. Final PASS can refer to an earlier revision. |
| P0 | Cache validity is file existence | `common/runner.py`, `Services.run_codex()` | A nonempty target skips execution regardless of source, prompt, model, or contract changes. Some callers unlink reports; others can reuse stale ones. |
| P0 | Nested retries without order budget | `runner.py` plus stages 07, 07a, 08, 08b, 10 | Outer recovery permits 12 cycles / 6 matching failures; generation has up to 8 continuations, decision audit 3 passes, admin audit 6 passes, and page completion 12 iterations. Combined work can multiply. |
| P0 | Long calls have no subprocess deadline or periodic heartbeat | `runner.py:run_codex`; `01_fetch_order.py`; backend `config.ts` | The 30-minute output wait starts after subprocess completion. Lock defaults to 60 minutes; a long execution can outlive its lease. |
| P0 | Presentation output contract mismatch | `presentation/profile.py`; stage 10; `frontend/src/server/worker.ts:requiredFinalOutputTypes` | Shared stage submits DOCX/PDF/sample artifacts; backend also requires PPTX for presentation orders. |
| P1 | Usage is aggregated only in memory until run completion | `runner.py:Services`, final `record_run` | No durable per-call ledger; abrupt stop loses accounting and deferred runs skip final recording. Need to verify CLI event semantics before relying on max-event accumulation. |
| P1 | A single model is hardcoded | `common/config.py` | Every AI task uses `gpt-5.6-sol`; no task-specific model/effort/context budgets. No model replacement is selected by this review. |
| P1 | Source contracts duplicate raw documents | `05a_analyze_customer_sources.py`, `05b_resolve_source_rules.py` | Repeated broad file reads can consume large contexts. Reference material and authoritative instructions are conflated. |
| P1 | Inconsistent volume policy | stages 07, 08b, `profile_support.py` | 6,000-word prompt, 5,200-word generation floor, 6,000 Persian-word source audit, and 5,000 default full-quality floor. Counting rules differ too. |
| P1 | Input and evidence handling is narrow | stages 05, 05a, 08b | Collection mostly materializes supplied files; extraction supports PDF/TXT/MD and rejects no-source cases. Citation-number matching does not verify that a source supports a claim. |
| P1 | Shared workspace and fixed worker identity | `config.py`, `runner.py` | `workspace/in_progress` and `worker-plus-1` constrain safe multi-order execution. |
| P1 | Prompt permissions exceed task needs | `run_codex()` | All calls bypass sandbox/approvals, even read-only auditors. File-read-only prompt text is not runtime enforcement. |
| P2 | Orchestration and document implementation are coupled | `runner.py` | The same large module owns model calls, workflow, recovery, Word output, rendering and validation. |

Sample mode currently generates a full document and extracts half of the rendered pages. Treat a true sample-first pipeline as a product decision, since it changes current delivery behavior.

## Proposed design

Use a deterministic workflow controller with narrowly scoped AI tasks. Each task has typed inputs, declared outputs, allowed tools, budget and validation. Multiple roles do not require conversational agents or parallel execution.

```text
Intake -> Canonical order contract -> Evidence collection -> Section plan
       -> Section writing + computed tables/figures -> Assemble
       -> Deterministic checks -> Semantic review -> Targeted repairs
       -> Render/layout checks -> Freeze reviewed revision -> Publish
```

If rendering requires content changes, return to the affected writing/check/review nodes before freezing. Publishing cannot edit content and must check hashes of the reviewed source and rendered artifacts.

Suggested boundaries:

```text
common/
  orchestration/   # stage graph, checkpoint, retry policy, lease heartbeat
  contracts/       # order, section, evidence, review and artifact schemas
  providers/       # current Codex CLI adapter; optional API adapter later
  context/         # source extraction, chunk index, task context builder
  research/        # researcher adapters and evidence verification
  content/         # section planning, writing, patching and assembly
  rendering/       # Word/PDF/PPTX renderers and platform automation
  quality/         # deterministic, semantic and visual gates
  telemetry/       # append-only invocation events and usage/budget ledger
  publishing/      # idempotent submission of frozen artifacts
profiles/          # per-order-type policies and required artifact sets
```

Migrate behind existing entry points and preserve legacy execution as a temporary fallback. Keep Windows Word rendering isolated from provider orchestration. Avoid a wholesale framework rewrite in the first phase.

## Token and quality policy

- Record every call with run/stage/task/attempt IDs, model, prompt version, input hashes, duration, status, input/cached/output/reasoning usage and uncertainty flags. Persist events during execution and retain failed/cancelled/deferred calls. Do not add cached tokens on top of input or reasoning on top of output when already included.
- Add task and order limits for calls, time, input context, output and repair budget. Reserve budget before scheduling. Where CLI usage arrives only after a turn, describe budget enforcement as bounded scheduling with possible in-flight overshoot; do not promise a strict token ceiling.
- Default proposal: one initial attempt plus two targeted repairs per defect, with an order-wide cap. A repeated issue with unchanged artifact hash stops automatically and becomes actionable review, not another full replay.
- Route cheap extraction and formatting to deterministic code. Evaluate a smaller model for classification and compact reviews; use a stronger model for synthesis and difficult repairs only when evaluations justify it.
- Extract each input once. Store page-addressed evidence snippets and source metadata separately from executable policy. Give a writer its section specification, relevant evidence, global definitions and neighboring summaries rather than the complete workspace/history.
- Use stable internal reference IDs and assemble final citation numbering deterministically. Verify both source identity and claim support; do not treat a resolving URL as proof of support.
- Generate section artifacts independently with stable IDs. Repair a section or figure, then invalidate dependent checks; do not rewrite healthy chapters.
- Cache on input hash + contract hash + prompt version + provider/model settings + validator version. A file being present is insufficient.
- Keep deterministic checks before expensive reviews. Retain semantic and visual reviews where necessary; measure repair success and final human acceptance rather than maximizing AI PASS counts.
- Define volume, citation style, required sections, figures and output formats once per order profile. Rendering-based page feedback must have a bounded path back to content review.
- Separate subscription usage metrics from API/provider expenditure. An API-price estimate for CLI token usage is not proof of an actual charge. Confirm provider authentication, available models and billing before an API pilot.

## External candidates, verified 2026-09-29

| Candidate | What it provides | Proposed use |
|---|---|---|
| [GPT Researcher](https://docs.gptr.dev/) | Research over web/documents; [deep research configuration](https://docs.gptr.dev/docs/gpt-researcher/gptr/deep_research) exposes breadth, depth and concurrency | First candidate for a bounded evidence-collection pilot. Adapt output into our evidence schema; do not delegate final Persian formatting or acceptance to it. |
| [STORM / Co-STORM](https://github.com/stanford-oval/storm) | Python research/outline/article pipeline with citations and configurable component models | Alternative for literature review and outline quality; benchmark Persian and order-contract adherence locally. |
| [OpenAI deep research API](https://developers.openai.com/api/docs/guides/deep-research) | Specialized research with tools; supports limiting tool calls through `max_tool_calls` | Optional research provider for difficult evidence gaps. Tool-call limits constrain work but do not establish a fixed order cost. |
| [LangGraph](https://docs.langchain.com/oss/python/langgraph/persistence) | Checkpoints and persistent execution state | Candidate orchestration infrastructure if workflow complexity warrants migration. It is not a ready-made thesis worker. |
| [OpenAI Agents SDK](https://developers.openai.com/api/docs/guides/agents/sdk) | Code-defined agents, tools, orchestration, state, tracing and evaluation integration | Optional execution layer if adopting API-based tasks. Domain rules, artifact validation and budgets remain application responsibilities. |
| [LangChain Open Deep Research](https://github.com/langchain-ai/open_deep_research) | Research implementation; repository marked archived on 2026-08-21 | Reference material only; not the preferred new core dependency. |

These are integration candidates, not tested replacements. Research-provider/model/search credentials and deployment requirements must be validated in the pilot. Check the chosen release's license and dependencies before embedding. No reviewed documentation establishes complete compatibility with this project's Persian Word/PPTX contracts.

Recommendation: keep the current provider initially, repair workflow correctness and observability, then compare GPT Researcher against the existing research path. Evaluate LangGraph separately only after stage interfaces stabilize; no need to adopt LangGraph and Agents SDK simultaneously.

## Delivery roadmap and acceptance gates

| Phase | Deliverable | Acceptance gate |
|---|---|---|
| 0. Baseline | Curated fixtures covering all five profiles, long page counts, missing sources, admin notes, visuals, resume and failures; durable call telemetry | Reproducible quality/call/usage/time report; missing usage explicitly unknown, never zero by assumption. |
| 1. Correctness and containment | Revision-bound quality gates, periodic heartbeat, process deadline/cancellation, centralized retry policy, uniform volume rules, explicit unsupported-output preflight | Source changes invalidate reviews; repeated no-progress errors stop; cancelled/deferred usage is retained; no stale PASS can publish. |
| 2. Structural extraction | Provider interface, stage schemas, separate renderers, content-addressed artifacts, isolated order/run workspaces | Existing document fixtures render equivalently; resume only reexecutes affected dependencies; no cross-order file reuse. |
| 3. Context and writing | Evidence index, section plans, bounded context packets, section artifacts, deterministic citations, targeted patches | Same or better blind human review scores with lower measured median and high-percentile usage. Establish savings from data. |
| 4. Research experiment | GPT Researcher adapter versus baseline on the same missing-evidence fixtures; optional STORM/API comparison | Compare verified citation support, coverage, Persian quality, latency, tool calls and provider spend; adopt only if useful. |
| 5. Profile completion and rollout | Dedicated presentation renderer, proposal/research policies, pilot UI budget/status controls, gradual rollout | Required output matrix passes for each supported profile; release can revert to previous runtime without losing artifacts. |

Build meaningful regression tests for stale reports, post-review edits, interrupted usage, resume invalidation, lock expiry, retry/no-progress limits and PPTX requirements. Mock providers/backend first; run opt-in offline generation separately. Offline generation still invokes model services unless dry-run is selected, so it is not inherently free.

Roll out to a small controlled set of orders before general activation. Stop rollout for unsupported citations, stale quality acceptance, duplicate publication or quality regression. Record publication keys based on order, deliverable revision and artifact hashes.

Open product decisions for later review: subscription-only versus optional API budget; acceptable per-profile latency/budget; true sample-first behavior; whether presentation completion belongs in the first release. These do not block correctness and telemetry work.
