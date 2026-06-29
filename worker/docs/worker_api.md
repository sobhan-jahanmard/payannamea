# Worker Control API

The worker can be controlled through a local HTTP API. The API wraps the existing worker commands, so the behavior is the same as running `scripts/local_worker.py` or `scripts/run_order_codex.py` from the shell.

## Start The API

```bash
cd /home/sobhan/projects/payanname/worker
source .venv/bin/activate
python scripts/worker_api.py --host 127.0.0.1 --port 8765
```

Authentication uses `WORKER_CONTROL_API_KEY` when set, otherwise `WORKER_API_KEY`.

Send either header:

```txt
Authorization: Bearer local-worker-dev-key
```

or:

```txt
X-Worker-API-Key: local-worker-dev-key
```

## Job Model

Most calls are asynchronous by default and return a job:

```json
{
  "id": "uuid",
  "command": "run-order",
  "status": "queued|running|succeeded|failed",
  "exit_code": null,
  "output": ""
}
```

Poll:

```bash
curl -H "Authorization: Bearer $WORKER_API_KEY" \
  http://127.0.0.1:8765/v1/jobs/<job_id>
```

List jobs:

```bash
curl -H "Authorization: Bearer $WORKER_API_KEY" \
  http://127.0.0.1:8765/v1/jobs
```

Cancel a running job:

```bash
curl -X POST -H "Authorization: Bearer $WORKER_API_KEY" \
  http://127.0.0.1:8765/v1/jobs/<job_id>/cancel
```

For short commands, add `?async=false` or body `"async": false`.

## Main Flows

Claim, run Codex, and submit final package:

```bash
curl -X POST http://127.0.0.1:8765/v1/commands/run-order \
  -H "Authorization: Bearer $WORKER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Review an already submitted package after admin notes were added:

```bash
curl -X POST http://127.0.0.1:8765/v1/commands/review-order \
  -H "Authorization: Bearer $WORKER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"review_workspace":"workspace/order_<id>"}'
```

`review-order` also accepts `"workspace": "workspace/order_<id>"` as an alias for `review_workspace`.

Claim only:

```bash
curl -X POST 'http://127.0.0.1:8765/v1/commands/claim?async=false' \
  -H "Authorization: Bearer $WORKER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Run one specific failed/in-review order again:

```bash
curl -X POST http://127.0.0.1:8765/v1/commands/run-order \
  -H "Authorization: Bearer $WORKER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"order_id":"872225ec-d68b-4f6e-aeaf-04b6c1c2ed85","redo":true}'
```

## Command Reference

All command endpoints use:

```txt
POST /v1/commands/<command>
Content-Type: application/json
```

Common body fields:

```json
{
  "order_id": "optional order id",
  "workspace": "workspace/in_progress",
  "async": true
}
```

Supported commands:

| Command | Purpose | Important fields |
| --- | --- | --- |
| `run-order` | Full automation: claim, run Codex, validate/fix, submit final | `order_id`, `redo`, `prompt`, `no_submit_final`, `submit_notes`, `max_fix_attempts`, `codex_bin`, `codex_sandbox`, `codex_arg` |
| `review-order` | Fetch admin notes, run correction pass, validate/fix, resubmit | `review_workspace` required, `order_id`, `prompt`, `no_submit_final`, `submit_notes`, `max_fix_attempts` |
| `claim` / `run` | Claim oldest approved/failed order or a specific order and create workspace | `order_id`, `redo` |
| `current` | Show local workspace order profile | `workspace` or `order_id` |
| `heartbeat` | Refresh active worker lock | `workspace` or `order_id` |
| `submit-draft` | Upload draft package | `workspace`, `draft_file`, `notes` |
| `submit-final` | Upload final review package | `workspace`, output paths, `notes`, `replace_existing`, `skip_package_check` |
| `validate-final` | Validate final review package without uploading | `workspace`, optional output paths |
| `fetch-review-notes` | Fetch internal admin notes into workspace | `workspace` or `order_id` |
| `package-existing` | Build DOCX/PPTX from existing Markdown source | `workspace`, `source`, `submit_final`, `replace_existing`, `skip_package_check`, `notes` |
| `mock-generate` | Generate mock package files for testing | `workspace` or `order_id` |
| `reset` | Reset order to approved pickup list | `workspace` or `order_id`, `notes` |
| `fail` | Mark order failed | `workspace` or `order_id`, `notes` |

## Submit Final Example

```bash
curl -X POST http://127.0.0.1:8765/v1/commands/submit-final \
  -H "Authorization: Bearer $WORKER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "workspace": "workspace/in_progress",
    "notes": "Ready for admin review",
    "replace_existing": true
  }'
```

## Package Existing Example

```bash
curl -X POST http://127.0.0.1:8765/v1/commands/package-existing \
  -H "Authorization: Bearer $WORKER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "workspace": "workspace/in_progress",
    "source": "workspace/in_progress/final/deliverable_source.md",
    "submit_final": true,
    "replace_existing": true
  }'
```

## Notes

- Paths are resolved by the underlying worker commands. Prefer passing `workspace/in_progress` for active work and `workspace/order_<id>` for review-mode corrections after a package has been submitted.
- `run-order` validates the final package before submit. If validation fails, it can run a focused Codex fix pass using `max_fix_attempts` before uploading.
- `run-order` and `review-order` can take a long time because they run `codex exec`; keep them asynchronous and poll the job.
- The API does not bypass backend validation. `submit-final` still validates required files locally and the backend still enforces the final-output matrix.
