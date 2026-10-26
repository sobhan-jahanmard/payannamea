# Daneshyar Desktop

Electron control panel for the Python worker. The same source builds for Windows and Ubuntu.

```bash
cd worker_plus/ui
npm install
npm run dev
```

Production packages:

```bash
npm run build
```

After selecting an order in the main Worker Plus window, the **بازبینی توسط هوش مصنوعی** panel appears directly below the order summary. It reads that order's original input files and current final output from its saved local workspace, displays the 0–20 score, report and editable revision prompt, and keeps review/fix history in `reports/ai_reviews.json`. **اصلاح با موارد ذکرشده** treats the edited prompt as guidance for this order, selects the earliest affected presentation stage, saves a version snapshot, clears reusable model responses from that stage onward, and reruns the order locally with the guidance. It does not edit worker code. Each review is recorded as a scored node in the execution graph. The resulting local package can then be inspected and published with the existing publish button. This review flow works without deploying new backend routes; an order must have a complete local output first.
The review worker extracts the full readable source/output text and attaches rendered pages directly to its model request because the Codex CLI may be denied file-reading tools by the host. A score is saved only when the response acknowledges every supplied file, includes valid source/output locators, and its rubric subscores sum to the displayed score. Access failures are recorded as failed reviews without a numeric score. The original output and revision plan are saved under `workspace/review_versions/` and `reports/order_revisions/` before a rerun starts.

Windows creates NSIS and portable packages; Linux creates AppImage and deb packages. The app reads `../.env` and starts `../run.py`. Set `WORKER_PLUS_PYTHON` when the desired Python executable is not named `python` (Windows) or `python3` (Linux).

Python and the packages in `requirements.txt` must currently be installed on the target machine. Production packages include the worker source but do not yet bundle a private Python runtime.

The app reads `workspace/active.json` and isolated run directories, with legacy
`workspace/in_progress` fallback. The workspace lock permits one active worker.
Stages and Persian labels come from `common/stages.json`. The evidence panel
shows current and historical artifact versions, validation issues and exact
upstream versions. Old/stale outputs can be inspected through artifact history.
The Python runner uses that same stage registry. Its web-research stage runs
before outlining and drafting, and the action panel shows direct, proxy, and
assumption counts with links to the evidence ledger and completed analysis.
"Without server registration" leaves backend status unchanged while web
research still runs. Resume and stage restart use the active workspace shown
by the desktop app.
After a completed local run, **انتشار نسخهٔ محلی** uploads the existing final
and sample files for that order. It does not rerun any stage, render files, or
call AI. The server moves the order to the relevant approval state only after
the upload succeeds. Review the Word/PowerPoint and PDF files together before
publishing if any of them were edited locally after the run.

The stages have no internal vertical scroll. The directed execution graph on
their right records each actual attempt separately. A retry or backward jump
starts a parallel column, preserving previous failures and their arrows. Select
a node for its stage, time and error; scroll horizontally or zoom for long
histories. The canonical trace is stored in `order_context.json` and projected
atomically to `reports/execution_graph.json`. Resume preserves it, fresh runs
start a new trace, and completed archives include the final graph. This applies
to every order profile. Older contexts can reconstruct paths from recovery
records, explicitly labelled as inferred and without invented timestamps.
Each Codex turn is attached to its stage attempt. The worker saves its prompt,
JSONL events, final response or error, and thread ID under
`reports/codex_calls/`. A later turn for the same stage resumes that thread;
different stages keep separate threads while the order graph links their
attempts. Select a graph node to inspect these records and any tested code
repair triggered by **اصلاح و ادامه از مرحلهٔ پیشنهادی**. If the local Codex
session has disappeared, the worker records that break and starts a new turn
with the saved stage history and workspace artifacts.
`node scripts/test-execution-graph.cjs` checks directed retry paths, scrolling,
diagnostics and order isolation with a safe browser fixture.

The desktop status widget is an independent, always-on-top native window at the
bottom right of the Windows work area, above the taskbar. It stays visible when
the main app is minimized. Click its header to collapse or expand; the preference
is saved locally, and its native window shrinks to match. The main app's desktop
widget button hides/shows it, and the widget can restore the main app. It follows
the active execution, with stage, progress, errors, and stopped/completed states.
Windows topmost status is reapplied after showing/resizing and every five seconds,
without taking keyboard focus. Unexpected hides, off-screen positions, display
changes, sleep/unlock, destroyed windows and renderer crashes recover automatically.
An explicit hide from the button or window close remains hidden until reopened.
`node scripts/test-run-widget.cjs` verifies renderer interactions with an isolated
preload fixture while Vite runs on port 5174 (Playwright on `NODE_PATH`).
`node scripts/test-desktop-widget.cjs` tests real Electron window behavior against
an isolated build selected by `WORKER_UI_TEST_APP`.

Paused executions show every structured validation issue and source location in
the failure panel, alongside the full report and suggested restart stage.
Stage 9 gathers and validates web evidence before the outline is written.
Failed entries are retried with validation feedback. A source with no country,
extracted fact, or URL does not satisfy the ledger. Foreign proxies must carry
their transfer limitation, and the prose audit checks that the absence of
Iranian data is disclosed. The ledger is `research/evidence.json`; the executed
calculations are in `research/analysis.md`.
Visual planning caps the number of figures. Each numeric chart carries values,
a unit, and a visible source or assumption. A failed visual audit restarts at
planning so the figures and text that cites them are rebuilt together.
The worker applies no token, call-count or prompt-character ceiling. After a
failure the AI textarea contains an actionable plan based on the responsible
stage, exact issues and report, including for existing paused executions.
Suggested Run sends that plan and manual additions to the responsible stage;
typed notes are preserved and kept separate for each selected order. Automatic
guidance alone does not invalidate successful task caches. The desktop sends
complete guidance over UTF-8 stdin to avoid Windows command-line length limits.
An extraction pause before a resolved contract exists preserves the validated
order/input prefix, including older runs whose intake fingerprint was saved
before downloading the inputs. Changed order data or input bytes still trigger
the appropriate intake replay.

The `reset and cleanup` button removes the selected order's **current local run**
(including its artifact history, downloaded input copies, logs and generated
outputs). Stop the worker first. The cleanup shares the worker's OS lock and
checks the selected order and expected run directory before deleting anything.
The button first asks for confirmation. An active `order_<id>` directory can be
the selected completed run and is removed on confirmation. Other runs and
archives, repository inputs and `.env` are preserved. Cleanup
never calls the backend or changes server order status/files. Close any open
Word/PDF output if Windows reports that a file is in use, then retry. After a
successful reset the UI clears progress and local output links; use the full-run
button to start again. Reset does not restore an older legacy workspace.

Browser verification uses an isolated preload fixture and performs no backend
or worker mutations. Run `tests/manual_refactor_smoke.py analysis` from the worker
first, start Vite on port 5174, then run `scripts/test-artifact-ui.cjs`.
Playwright is a dev dependency. `WORKER_UI_TEST_BROWSER` defaults to an
installed Chrome channel and can be set to `msedge`; `WORKER_UI_TEST_URL` overrides
the URL. This tests filters, stale evidence, output gating, order isolation,
cleanup guards, automatic note generation, Python/UI plan parity, suggested-run
payloads, manual note preservation and cleared state after reset.

After compiling Electron (`npx tsc -p tsconfig.electron.json --noEmit false`), run
`node scripts/test-cleanup-ipc.cjs` to test the desktop IPC and real Python cleanup
in a separate temporary workspace. It does not touch the application's actual
workspace or contact the backend. It also verifies complete transfer of a
130k+ character Persian note to the Python child. Python cleanup tests are in
`python -m unittest discover -s tests -q` from `worker_plus`.
With Vite on port 5174 and Playwright available on `NODE_PATH`, run
`node scripts/test-cleanup-ui.cjs` to verify the warning, cancellation, and
confirmed reset without touching real files.
The suggested-stage payload for all five supported order types is covered by
`node scripts/test-suggested-recovery-ui.cjs` with Vite on port 5175.
That button also sends `--auto-repair`: the worker diagnoses the saved failure
in a temporary copy of code and text reports, applies only a tested stage or
profile Python change, then resumes the selected step. A rejected code change
does not prevent the normal order-artifact recovery. The decision is saved to
`reports/stage_checks/auto_code_repair.json` in the active run.
