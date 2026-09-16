import re
import json
import subprocess
from pathlib import Path
from typing import Any
from common.helpers import write_json

TITLE = "Finalize dynamic Persian pagination"

def run(context: dict[str, Any], services: Any) -> None:
    docx = services.workspace / context["artifacts"]["docx"]
    rules = json.loads((services.workspace / context["artifacts"]["university_rules"]).read_text(encoding="utf-8"))
    font_name = rules["font"]["persian"]
    script = Path(__file__).resolve().parent.parent / "scripts" / "finalize_persian_pagination.ps1"
    command = ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-STA", "-File", str(script), "-Path", str(docx), "-FontName", font_name]
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace")
    try:
        stdout, _ = process.communicate(timeout=300)
    except subprocess.TimeoutExpired:
        # Word is an out-of-process COM server. Terminating the PowerShell tree
        # prevents this worker's hidden WINWORD instance from surviving to lock
        # the DOCX on the next retry, without touching unrelated Word sessions.
        subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
        process.communicate()
        raise RuntimeError("dynamic Persian pagination timed out; the worker process tree was closed")
    if process.returncode:
        raise RuntimeError("dynamic Persian pagination failed: " + stdout[-800:])
    match = re.search(r"pages=(\d+);sections=(\d+)", stdout)
    if not match:
        raise RuntimeError("dynamic Persian pagination returned no verification result: " + stdout[-800:])
    write_json(services.workspace / "reports" / "stage_checks" / "persian_pagination.json", {"passed": True, "pages": int(match.group(1)), "sections": int(match.group(2)), "font": font_name, "mode": "dynamic_persian_page_field_hindi_numerals"})
