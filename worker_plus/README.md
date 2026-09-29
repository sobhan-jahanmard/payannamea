# Worker Plus

The shared workflow lives in `common/`: order claim, workspace preparation, source handling, content review, DOCX packaging, publishing, and failure handling are implemented once.

Each supported order type has its own folder containing only its profile and any genuinely type-specific utilities:

- `bachelor_thesis/`
- `master_thesis/`
- `thesis_proposal/`
- `university_research/`
- `presentation/`

Run the single worker with `python run.py`. After it claims or resumes an order, it selects the matching profile from that order’s `order_type`. Only the profiles listed above are supported.

To generate a local package from a real order without changing its backend status, lock, run history, or outputs, use `python run.py --offline --order-id <order-id>`. This performs only GET requests for the order and its input files.

## Codex account

By default, the worker uses the normal Codex credential store for the current
Windows user. To use a separate authenticated Codex account for Worker Plus,
set this in `worker_plus/.env`:

```env
WORKER_PLUS_CODEX_HOME=C:/Users/XMART/AppData/Local/OpenAI-Profiles/account2/codex-home
```

When the portable EXE remains in its generated release directory under
`worker_plus/ui`, it reads the same `worker_plus/.env` file automatically:

```text
worker_plus/
├── .env
└── ui/
    └── release-portable-final/
        └── Worker Plus 0.1.0.exe
```

After one rebuild containing this feature, edit `worker_plus/.env` whenever the
account needs to change and double-click the EXE normally. Changing `.env` does
not require another rebuild. The packaged app forwards the values from this file
to the Python worker. If the EXE is moved elsewhere, place a copy of `.env` beside
the EXE instead.

When `WORKER_PLUS_CODEX_HOME` is set, the worker passes that directory to its
`codex exec` processes as `CODEX_HOME`. When it is absent or empty, no override
is applied and Codex uses its normal default. The directory must already contain
a valid Codex login; verify it from Git Bash with:

```bash
CODEX_HOME='C:/Users/XMART/AppData/Local/OpenAI-Profiles/account2/codex-home' codex login status
```

## Windows desktop executable

To build the Electron UI as a portable Windows executable, run the following
from `worker_plus/ui` in PowerShell:

```powershell
npm install
npm run build
```

The standard build produces portable and installer packages under `release/`.
If Windows locks the build directory or electron-builder cannot create the
symlinks required by its signing helper, build the unsigned portable executable
in a fresh directory instead:

```bash
npm run build:portable
```

The portable executable is created at
`worker_plus/ui/release-portable-final/Worker Plus 0.1.0.exe`. The portable
build command first force-closes running Worker Plus processes, builds in a new
uniquely named staging directory, and publishes the resulting EXE to the final
directory. This keeps externally locked stale `app.asar` files from blocking
later builds. Scanner-locked staging directories may be left behind and can be
removed after the lock is released. Concurrent portable builds are rejected, and
stale 7-Zip/app-builder processes from interrupted builds are stopped before a
new build starts. Do not rebuild while an order is running,
because the pre-build cleanup terminates the app and its process tree. Because this
fallback build is unsigned, Windows SmartScreen may show a warning when it is
opened.

Python and the packages in `requirements.txt` must still be installed on the
target computer; the executable bundles the worker source but not a private
Python runtime. Set `WORKER_PLUS_PYTHON` if the desired Python executable is not
available as `python`.
