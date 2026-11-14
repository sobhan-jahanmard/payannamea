"""One-time path migration after collecting Telegram files under telegram/."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
targets = [ROOT / "README.md", ROOT / ".codex/config.toml"]
targets += [p for p in (ROOT / "telegram/integration").iterdir() if p.suffix in {".py", ".md", ".txt"}]
targets += [p for p in (ROOT / "telegram/scripts").iterdir() if p.suffix == ".py" and p != Path(__file__).resolve()]
targets += [p for p in (ROOT / "telegram/content").rglob("*") if p.suffix in {".json", ".txt", ".md"}]
replacements = [
    ("marketing/ads/2026-11-02/daneshyar-telegram-v1.png", "telegram/assets/daneshyar-telegram-v1.png"),
    ("integrations/telegram", "telegram/integration"),
    ("integrations\\telegram", "telegram\\integration"),
    ("integrations\\\\telegram", "telegram\\\\integration"),
    ("marketing/telegram", "telegram/content"),
    ("marketing\\telegram", "telegram\\content"),
    ("marketing\\\\telegram", "telegram\\\\content"),
    ("tmp/telegram-samples-contact-sheet.jpg", "telegram/previews/telegram-samples-contact-sheet.jpg"),
]
changed = []
for path in targets:
    before = path.read_text(encoding="utf-8")
    after = before
    for old, new in replacements:
        after = after.replace(old, new)
    if path.parent == ROOT / "telegram/scripts":
        after = after.replace("Path(__file__).resolve().parents[1]", "Path(__file__).resolve().parents[2]")
        after = after.replace('root / "tmp"', 'root / "telegram/previews"')
        after = after.replace('ROOT / "tmp"', 'ROOT / "telegram/previews"')
    if before != after:
        path.write_text(after, encoding="utf-8")
        changed.append(str(path.relative_to(ROOT)))
print("Updated", len(changed), "Telegram path references. No credential values were read.")
