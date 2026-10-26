"""Read-only installation check. Does not claim, generate or execute an order."""
import importlib.util
import os
from pathlib import Path
import shutil
import sys

requirements = ["requests", "docx", "dotenv", "pypdf", "matplotlib", "fitz", "pptx"]
if os.name == "nt":
    requirements.append("win32com.client")
missing = []
print(f"Python: {sys.version.split()[0]} ({sys.executable})")
for module in requirements:
    try:
        available = importlib.util.find_spec(module) is not None
    except ModuleNotFoundError:
        available = False
    print(f"{'OK' if available else 'MISSING'}: {module}")
    if not available:
        missing.append(module)
codex = shutil.which("codex") or shutil.which("codex.cmd")
print(f"{'OK' if codex else 'MISSING'}: Codex CLI")
if not codex:
    missing.append("Codex CLI")
if os.name == "nt":
    import winreg
    try:
        with winreg.OpenKey(winreg.HKEY_CLASSES_ROOT, r"PowerPoint.Application\CLSID") as key:
            office = bool(winreg.QueryValue(key, None))
    except OSError:
        office = False
else:
    office = bool(shutil.which("soffice") or shutil.which("libreoffice"))
print(f"{'OK' if office else 'MISSING'}: presentation PDF renderer")
if not office:
    missing.append("presentation renderer")
try:
    from matplotlib.font_manager import FontProperties, findfont
    findfont(FontProperties(family="Tahoma"), fallback_to_default=False)
    print("OK: Tahoma")
except (ImportError, ValueError):
    missing.append("Tahoma")
    print("MISSING: Tahoma")
skill = Path(__file__).resolve().parents[1] / ".agents/skills/academic-presentation/SKILL.md"
print(f"{'OK' if skill.is_file() else 'MISSING'}: academic-presentation skill")
if not skill.is_file():
    missing.append("academic-presentation skill")
print("Installation check only; no order started.")
raise SystemExit(1 if missing else 0)
