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
It preserves other runs, completed archives, repository inputs and `.env`, and
never calls the backend or changes server order status/files. Close any open
Word/PDF output if Windows reports that a file is in use, then retry. After a
successful reset the UI clears progress and local output links; use the full-run
button to start again. Reset does not restore an older legacy workspace.

Browser verification uses an isolated preload fixture and performs no backend
or worker mutations. Run `tests/manual_refactor_smoke.py analysis` from the worker
first, start Vite on port 5174, then run `scripts/test-artifact-ui.cjs` with
Playwright available on `NODE_PATH`. `WORKER_UI_TEST_BROWSER` defaults to an
installed Chrome channel and can be set to `msedge`; `WORKER_UI_TEST_URL` overrides
the URL. This tests filters, stale evidence, output gating, order isolation,
cleanup guards, automatic note generation, Python/UI plan parity, suggested-run
payloads, manual note preservation and cleared state after reset.

After compiling Electron (`npx tsc -p tsconfig.electron.json`), run
`node scripts/test-cleanup-ipc.cjs` to test the desktop IPC and real Python cleanup
in a separate temporary workspace. It does not touch the application's actual
workspace or contact the backend. It also verifies complete transfer of a
130k+ character Persian note to the Python child. Python cleanup tests are in
`python -m unittest discover -s tests -q` from `worker_plus`.
