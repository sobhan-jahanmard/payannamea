# Local Worker

This folder is the operator-side workflow for handling approved academic-service orders. It connects to the unified Next.js app pickup flow, creates a local workspace per order, downloads customer files, and gives Codex a structured set of instructions for academic support, formatting, review, and compliance reporting.

## Important Boundary

This worker is designed for legitimate academic assistance. Codex must not invent or misrepresent academic work for submission as someone else's original scholarship. The operator/student must supply the research contribution, analysis, claims, data interpretation, and final approval where those are required.

Allowed work:

- Extract university formatting and submission rules.
- Summarize and organize customer-provided references.
- Build an outline and writing plan from customer-approved research material.
- Draft support text from supplied notes, data, and operator-approved claims.
- Edit Persian/English academic style.
- Check citation coverage and formatting consistency.
- Produce compliance and reference-usage reports.
- Package worker outputs for admin review.

Not allowed:

- Invent sources, data, findings, experiments, interviews, or citations.
- Present AI-generated research contributions as the student's own work.
- Bypass university authorship, AI-use, or disclosure rules.

## Setup

```bash
cd /home/sobhan/projects/payanname/worker
cp .env.example .env
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

The default `.env.example` matches the local unified Next.js app:

```txt
BACKEND_URL=http://localhost:5173
WORKER_API_KEY=local-worker-dev-key
WORKER_ID=local-pc-1
```

## Typical Run

Start the Next.js app from `frontend/`, then:

```bash
cd /home/sobhan/projects/payanname/worker
source .venv/bin/activate
python scripts/run_order_codex.py
```

This single command:

1. Claims the oldest admin-approved order.
2. Marks it `in_progress`.
3. Creates `worker/workspace/order_<id>/`.
4. Downloads customer files and writes the generated order context.
5. Runs `codex exec` inside that exact workspace with the order workflow prompt.
6. If Codex exits successfully, runs `local_worker.py submit-final` so the admin panel sees the new `final_outputs`.

Use this when you want the full worker automation path. To stop after Codex writes the review package without uploading to the backend:

```bash
python scripts/run_order_codex.py --no-submit-final
```

The older manual flow is still available for debugging:

```bash
python scripts/local_worker.py run
```

This will:

1. Claim the oldest admin-approved or failed order.
2. Mark it `in_progress`.
3. Create `worker/workspace/order_<id>/`.
4. Save `customer_input.json`.
5. Generate `input/order_context.md` and seed `extracted/order_context.json` from every order detail.
6. Generate `extracted/order_profile.json` from the selected order type.
7. Download order files into `input/files/`.
8. Copy Codex instructions, order profiles, workflows, and agent prompts into the order workspace.

Every `run` calls the Next.js worker queue again. It does not use a remembered active order.

Then open the generated workspace and run Codex there:

```bash
cd workspace/order_<id>
codex
```

Tell Codex:

```txt
Read AGENTS.md, then execute the workflow selected in extracted/order_profile.json through the review-package stage.
```

Each current order type has a worker profile under `codex/order_profiles/`. The profile selects the producer agents, checker agents, required outputs, visual policy, prebuilt tool candidates, and workflow. Every workflow stage should write a pass/fail note under `reports/stage_checks/`; failed checks loop back to the producer stage until they pass or are explicitly listed for human review.

For system testing without a real customer order, generate a tiny mock package instead:

```bash
cd /home/sobhan/projects/payanname/worker/workspace/order_<id>
../../.venv/bin/python ../../scripts/local_worker.py mock-generate
```

If Codex already created `final/deliverable_source.md` or `drafts/assisted_draft.md`, package that
existing source into test DOCX/PDF files:

```bash
cd /home/sobhan/projects/payanname/worker/workspace/order_<id>
../../.venv/bin/python ../../scripts/local_worker.py package-existing
```

After Codex creates the human review package, upload it for admin review:

```bash
cd /home/sobhan/projects/payanname/worker/workspace/order_<id>
../../.venv/bin/python ../../scripts/local_worker.py submit-final \
  --notes "Ready for admin review"
```

This sets the order status to `worker_done_pending_approval`. Admins should inspect the uploaded
package in the admin panel and set the order to `completed` only after approval.
By default, `submit-final` now validates the standard human-review package before
submitting it. `--skip-package-check` skips detailed local file inspection only;
the backend still requires the complete final-output matrix. Partial replacement
uploads are accepted only when the existing saved package plus the replacement
files still covers every required output type.

When run inside an order workspace, `submit-final` infers the order ID from
`customer_input.json` and looks for:

```txt
workspace/order_<id>/final/deliverable_source.md
workspace/order_<id>/final/deliverable.pptx
workspace/order_<id>/final/thesis.docx
workspace/order_<id>/final/thesis.pdf
workspace/order_<id>/final/deliverable.docx
workspace/order_<id>/final/deliverable.pdf
workspace/order_<id>/final/README.md
workspace/order_<id>/reports/compliance_report.md
workspace/order_<id>/reports/reference_usage_report.md
workspace/order_<id>/reports/human_review_checklist.md
```

From the `worker/` directory you can also pass a workspace path:

```bash
python scripts/local_worker.py submit-final \
  --workspace workspace/order_<id> \
  --notes "Ready for admin review"
```

## Multiple Workers

Run each worker with a different `WORKER_ID`. The app lock prevents two workers from
claiming the same order.

```bash
WORKER_ID=local-pc-1 python scripts/local_worker.py run
WORKER_ID=local-pc-2 python scripts/local_worker.py run
```

Each worker writes to:

```txt
workspace/order_<claimed-id>/
```

## Reset Interrupted Work

If a worker is stopped in the middle of an order, reset that order back to the approved pickup list from inside
its workspace:

```bash
cd /home/sobhan/projects/payanname/worker/workspace/order_<id>
../../.venv/bin/python ../../scripts/local_worker.py reset --notes "Worker interrupted"
```

Or from the `worker/` directory:

```bash
python scripts/local_worker.py reset \
  --workspace workspace/order_<id> \
  --notes "Worker interrupted"
```

## Workspace Layout

```txt
workspace/order_<id>/
  customer_input.json
  input/order_context.md
  AGENTS.md
  codex/
    AGENTS.md
    order_profiles/*.json
    references/order_context_and_output_style.md
    references/external_tool_registry.md
    workflows/*.md
    agents/*.md
  input/
    files/
    references/
  extracted/
    order_profile.json
    order_context.json
    university_rules.json
    references.json
  planning/
    outline.md
    chapter_plan.md
  drafts/
  reports/
    compliance_report.md
    reference_usage_report.md
    human_review_checklist.md
    stage_checks/
  final/
    figures/
```

## Order Context And Formatting

The worker writes a readable order summary to `input/order_context.md` and a selected processing profile to
`extracted/order_profile.json`. Codex must use them together with `customer_input.json` for every plan, draft,
report, and final README.

The context includes:

- Order type, title, English title, degree, university, field, faculty, department.
- Selected worker profile and workflow.
- Advisor/consultant or instructor/course.
- Abstract, keywords, methodology, language, citation style, deadline, expected image count, and customer notes.
- Requested quantity using `quantity_type` and `quantity_value`: pages, words, or slides.
- Uploaded files and customer reference entries.

Codex instructions also define output presentation rules:

- Persian/Arabic content is RTL.
- English titles, URLs, DOIs, emails, IDs, file paths, code, and citation keys are LTR.
- Preferred Persian fonts are Vazirmatn, IRANSans, B Nazanin, B Mitra, then Tahoma/Arial fallback.
- Preferred English fonts are Times New Roman, Calibri, and Arial.
- Generated Markdown/HTML/source files should use clear headings, metadata tables, checklists, readable spacing, and print-friendly structure.

## Commands

Claim oldest order:

```bash
python scripts/local_worker.py run
```

Refresh lock:

```bash
python scripts/local_worker.py heartbeat --workspace workspace/order_<id>
```

Submit draft package:

```bash
python scripts/local_worker.py submit-draft \
  --workspace workspace/order_<id> \
  --notes "Ready for operator review"
```

Submit the worker package for admin review:

```bash
python scripts/local_worker.py submit-final \
  --workspace workspace/order_<id> \
  --notes "Ready for admin review"
```

Reset an interrupted order:

```bash
python scripts/local_worker.py reset \
  --workspace workspace/order_<id> \
  --notes "Worker interrupted"
```

Generate mock academic files for testing:

```bash
python scripts/local_worker.py mock-generate --workspace workspace/order_<id>
```

Package an existing generated Markdown source as DOCX/PDF:

```bash
python scripts/local_worker.py package-existing --workspace workspace/order_<id>
```

Mark failed:

```bash
python scripts/local_worker.py fail --workspace workspace/order_<id> --notes "Reason"
```

Show workspace order context:

```bash
python scripts/local_worker.py current --workspace workspace/order_<id>
```

You can still pass `--order-id` manually for recovery/debugging, but the normal flow should use
the order workspace instead of copying IDs.
