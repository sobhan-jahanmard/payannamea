# Deterministic order tools

Run `python <order-skill-directory>/scripts/order_tools.py --help`. The script
resolves its checkout even through an installed skill link. Dependencies are in
`worker_plus/requirements.txt`; PPTX layout uses `presentation/runtime`, fonts and
Microsoft Office on Windows. Do not expose `.env` contents while diagnosing.
The entrypoint honors `WORKER_PLUS_PYTHON` from the environment or worker `.env`,
matching the UI's configured interpreter even when `python` on PATH is different.

`--workspace <absolute-path>` goes **before** the command. Fetch defaults to
`worker_plus/workspace/codex_orders/<ID>`, separate from the UI active workspace.
All other commands require the returned workspace. The last stdout line is JSON
`{ok,command,result}` or `{ok:false,command,error,error_type}`. Failure exits nonzero;
Office/compiler diagnostics can precede the final JSON line.

| Command | Result |
| --- | --- |
| `fetch --order <ID-or-URL>` | GET order and download/cache its files; no remote writes |
| `fetch --order-file <order.json>` | Import local order/files without backend access |
| `prepare` | Validate intake and persist contract/design |
| `extract` | Source text/images, physical pages, guidelines, topics and required analysis categories |
| `progress --step 3 --detail "..."` | Persist one of the ten visible milestones |
| `status` | Current progress, input integrity and fresh/stale checks |
| `validate claims --candidate <json>` | Commit claims only after validation |
| `validate analysis --candidate <json>` | Commit analytical packet only after validation |
| `validate slides --candidate <json>` | Validate count/evidence/coverage/policy; restore previous model on rejection |
| `review-inputs content` / `sources` / `visual` | Hash map binding upcoming review to inspected inputs |
| `review content --report <md>` | Record current agent's full-slide content audit |
| `review sources --report <md>` | Record full-slide source audit |
| `build` | Compile reviewed full and first-half editable PPTX |
| `render` | Export PDF, sample PDF, PNGs and native visual proof |
| `review visual --report <md>` | Reconcile actual image review with native proof |
| `finalize` | Check current prerequisites, package counts and output hashes |
| `publish` | Recheck package and remote inputs, claim/upload and retain receipt |

## Academic document commands

The same entrypoint fetches all five registered types. After fetch the stored
`order_type` selects the document or presentation implementation. For the four
document types use [the document workflow](documents.md) and
[artifact schemas](document-artifacts.md). Document commands are:

| Command | Result |
| --- | --- |
| `prepare` | Intake, formatting defaults and document execution contract |
| `extract` | Tagged, addressable uploaded source/guideline index and images |
| `validate rules --candidate <json>` | Commit complete reviewed typography rules and refresh contract; then run `extract` again |
| `validate evidence --candidate <json>` | Validate research ledger against contractual deliverables |
| `validate document --candidate <md>` | Check plan/evidence IDs, sections, numbered citations, figures and word target; commit Markdown |
| `review-inputs content` / `sources` | Exact complete hash map for the upcoming section audit |
| `review content --report <md>` / `review sources --report <md>` | Commit a complete section audit with the exact input hashes |
| `build` | Create and validate editable Word with the existing local compiler; no AI invocation |
| `render` | Export full PDF and first-half Word/PDF samples, optional planned companion reports, current page PNGs |
| `review-inputs visual`, `review visual --report <md>` | Bind actual review of every current full/sample/companion page to its hashes |
| `finalize` | Recheck fresh gates, real page counts, readable packages and deliverable hashes |
| `publish` | Four primary document files, only when authorized; companion uploads are explicitly unsupported by this API |

`status` and `progress` work for every type. Slide validators apply only to
presentations; document validators apply only to documents. A document source
file is optional when the assignment calls for original desk research. A supplied
unreadable or unsupported file blocks its extraction until it is read/converted;
never drop it silently. Research and writing take place in the current chat.

Document review reports use the same `STATUS` and `INPUTS_SHA256` lines as below,
but `ISSUES_JSON` contains `reviewed_sections` with all plan section IDs for
content/sources, or `reviewed_images` with every path in
`reports/document_render.json.images` for visual review; `issues` must be empty
for PASS. The content audit checks scientific meaning as well as structure.

The current agent authors candidates and reports with normal file tools. No
command browses for content or calls an AI model. Upload requires authorization;
the CLI's presence does not authorize publication.

## Local order JSON

For presentations use the backend shape: `id`, `order_type`, `title`, `course_name`,
`quantity_type="slides"`, `quantity_value`, `language`, optional cover/design/notes,
and `files`. Each file has `id`, `file_type="information_source"`, `original_name`,
positive `size_bytes`, and `local_path` (absolute or relative to the JSON).
Formatting guidelines use `file_type="university_guideline"`.
For documents use the exact stored type, `quantity_type="pages"` or `"words"`,
positive integer `quantity_value`, and the academic fields required by its profile.
Include `references`, `methodology`, `degree`, `faculty`, `advisor_name`, etc.
when supplied. Files use the same local-path contract; `files=[]` is permitted.

Existing workspaces are reused only with unchanged snapshot and original bytes.
Changed inputs use a separate revision via `--workspace`. State is retained in
`codex_order_state.json`; other artifacts retain the worker's compatible formats.

## Audit reports

Before inspecting obtain `review-inputs <kind>`. Paste its complete `inputs` map
into an `INPUTS_SHA256:` line. Write the report in this shape, substituting actual
hashes and the exact list of slides:

```text
STATUS: PASS
INPUTS_SHA256: {"final/presentation.json":"actual hash", "other inspected input":"actual hash"}
ISSUES_JSON: {"reviewed_slides":[1,2,3,4,5],"issues":[]}
Evidence-based observations, including slide numbers and relevant source locators.
```

The map must equal the tool's complete snapshot. All slides must be reviewed
exactly once. FAIL reports contain `issues=[{slide,message}]`. Visual issues also
use `region` (title/body/chart/table/image/footer) and `kind`. Native checks
verify per-slide source comments and forbid internal IDs/source footers on the
canvas. Do not require a visible technical citation. PASS with unresolved issues is rejected.
Inspect actual current files/images; do not certify an anticipated render.

Editing an input invalidates dependent checks through hashes, preserving files.
Use fresh review hashes after repairs. Publication revalidates and does not
blindly repeat an upload after an unknown network outcome. An existing receipt
prevents duplicate automatic upload of the same package.
