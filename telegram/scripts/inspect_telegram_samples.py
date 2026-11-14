from pathlib import Path
import json
import subprocess
from pypdf import PdfReader
from PIL import Image, ImageOps, ImageDraw

root = Path(__file__).resolve().parents[2]
folder = root / "frontend/public/sample"
preview_dir = root / "telegram/previews"
preview_dir.mkdir(parents=True, exist_ok=True)
names = ["bachelor-thesis.pdf", "master-thesis.pdf", "proposal.pdf", "research-assignment.pdf", "presentation.pdf"]
sheet = Image.new("RGB", (1500, 880), "#e4e7eb")
draw = ImageDraw.Draw(sheet)
for col, name in enumerate(names):
    with open(folder / name, "rb") as source:
        doc = PdfReader(source).pages
        print(json.dumps({"file": name, "pages": len(doc),
                          "text": "\n".join(doc[i].extract_text() for i in range(min(3, len(doc))))[:2200]}, ensure_ascii=True))
        for row in range(2):
            if row >= len(doc):
                continue
            prefix = preview_dir / f"telegram-{Path(name).stem}-{row+1}"
            subprocess.run(["pdftoppm", "-f", str(row+1), "-l", str(row+1),
                            "-singlefile", "-scale-to", "800", "-png", str(folder / name), str(prefix)],
                           check=True, capture_output=True)
            image = Image.open(prefix.with_suffix(".png")).convert("RGB")
            image = ImageOps.contain(image, (280, 400))
            x = col * 300 + (300 - image.width) // 2
            y = row * 440 + 28
            sheet.paste(image, (x, y))
            draw.text((col * 300 + 10, row * 440 + 8), f"{name} / page {row+1}", fill="black")
out = preview_dir / "telegram-samples-contact-sheet.jpg"
sheet.save(out, quality=90)
