"""Run checkout tools independently of the current working directory."""
from pathlib import Path
import os
import re
import shutil
import subprocess
import sys

WORKER = Path(__file__).resolve().parents[3] / "worker_plus"


def configured_python():
    value = os.environ.get("WORKER_PLUS_PYTHON", "").strip()
    env_file = WORKER / ".env"
    if not value and env_file.is_file():
        match = re.search(r"^\s*WORKER_PLUS_PYTHON\s*=\s*(.*?)\s*$", env_file.read_text(encoding="utf-8-sig"), re.M)
        value = match[1].strip("\"'") if match else ""
    if not value:
        return None
    executable = Path(shutil.which(value) or value).expanduser().resolve()
    if not executable.is_file():
        raise RuntimeError("Configured WORKER_PLUS_PYTHON does not exist")
    return executable


if __name__ == "__main__":
    executable = configured_python()
    if executable and executable != Path(sys.executable).resolve():
        sys.exit(subprocess.run([str(executable), "-X", "utf8", str(Path(__file__).resolve()), *sys.argv[1:]],
                               env={**os.environ, "PYTHONUTF8": "1"}, check=False).returncode)

sys.path.insert(0, str(WORKER))
from codex_order_tools import main

if __name__ == "__main__":
    sys.exit(main())
