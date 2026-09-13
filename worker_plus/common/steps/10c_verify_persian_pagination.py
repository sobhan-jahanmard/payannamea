import re
import json
import subprocess
from pathlib import Path
from typing import Any
from common.helpers import write_json

TITLE = "Verify every Persian page number"

def run(context: dict[str, Any], services: Any) -> None:
    docx = services.workspace / context["artifacts"]["docx"]
    rules = json.loads((services.workspace / context["artifacts"]["university_rules"]).read_text(encoding="utf-8"))
    font_name = rules["font"]["persian"]
    script = Path(__file__).resolve().parent.parent / "scripts" / "verify_persian_pagination.ps1"
    result = subprocess.run(["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-STA", "-File", str(script), "-Path", str(docx), "-FontName", font_name], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace", timeout=180, check=False)
    match = re.search(r"pages=(\d+);sections=(\d+);errors=(\d+)", result.stdout)
    if not match or result.returncode:
        raise RuntimeError("per-page Persian pagination verification failed: " + result.stdout[-1500:])
    write_json(services.workspace / "reports" / "stage_checks" / "persian_pagination_verification.json", {"passed": True, "pages": int(match.group(1)), "sections": int(match.group(2)), "checked_pages": int(match.group(1)), "font": font_name, "errors": 0})
