# Worker Plus Desktop

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

The first version intentionally uses the worker's existing shared `workspace/in_progress` directory. Only one run can be active at a time.
