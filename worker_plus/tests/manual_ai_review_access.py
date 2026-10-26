"""Probe whether the configured Codex CLI can read an isolated review packet."""
from __future__ import annotations

import os
from pathlib import Path
import subprocess
import tempfile

from common.config import load_config


def main() -> None:
    config = load_config()
    with tempfile.TemporaryDirectory(prefix="worker-plus-review-access-") as temporary:
        folder = Path(temporary)
        (folder / "manifest.json").write_text('{"probe":"K7M42"}', encoding="utf-8")
        import fitz
        document = fitz.open()
        page = document.new_page(width=200, height=100)
        page.insert_text((20, 50), "RED TEST", fontsize=18, color=(1, 0, 0))
        image = folder / "page.png"
        page.get_pixmap().save(image)
        document.close()
        output = folder / "answer.txt"
        command = [config.codex_bin, "exec", "--model", config.codex_model,
                   "--sandbox", "workspace-write", "--skip-git-repo-check", "--ignore-user-config",
                   "--ephemeral", "--output-last-message", str(output), "-C", str(folder),
                   "--image", str(image), "-"]
        if os.name == "nt":
            command = ["cmd.exe", "/d", "/s", "/c", subprocess.list2cmdline(command)]
        result = subprocess.run(command, cwd=folder,
                                input="No tools. The inline manifest is {\"probe\":\"K7M42\"}. Return the probe value and the two words visible in the attached image.",
                                text=True, encoding="utf-8", errors="replace", stdout=subprocess.PIPE,
                                stderr=subprocess.STDOUT, timeout=180, check=False)
        print("exit:", result.returncode)
        print("answer:", output.read_text(encoding="utf-8") if output.is_file() else "<none>")
        print("trace_tail:", result.stdout[-3000:])


if __name__ == "__main__":
    main()
