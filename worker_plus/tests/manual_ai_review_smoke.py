"""Manual synthetic smoke test for the configured Codex reviewer."""
from pathlib import Path
from unittest.mock import patch
import json

import ai_review
from common.config import load_config


def synthetic_inputs(_config, _job, folder: Path):
    evidence = folder / "evidence"
    evidence.mkdir()
    (evidence / "F1.txt").write_text(
        "[F1:line-1; pages=unknown]\nThe original report states that 100 units enter the process "
        "and 80 units leave as product, with 20 units lost. It gives no financial cash flow table.",
        encoding="utf-8")
    (evidence / "F2.txt").write_text(
        "[F2:slide-1; pages=[1]]\nThe presentation says that 120 units of product are produced "
        "from 100 units of input and that NPV is definitely positive.",
        encoding="utf-8")
    (folder / "manifest.json").write_text(json.dumps({
        "order": {"id": "synthetic", "title": "Synthetic process presentation",
                  "order_type": "ارائه و پاورپوینت", "degree": "کارشناسی",
                  "methodology": "defense presentation", "quantity_value": 5},
        "files": [
            {"role": "input", "name": "synthetic-source.txt", "extracted_text": "evidence/F1.txt"},
            {"role": "output", "name": "synthetic-slide.txt", "extracted_text": "evidence/F2.txt"}]
    }, ensure_ascii=False), encoding="utf-8")
    return ["evidence/F1.txt"], ["evidence/F2.txt"]


if __name__ == "__main__":
    with patch.object(ai_review, "prepare_review", side_effect=synthetic_inputs):
        result = ai_review.run_review(load_config(), {"id": "synthetic", "action": "review"})
    print(json.dumps({"score": result["score"], "report_chars": len(result["report"]),
                      "fix_prompt_chars": len(result["fix_prompt"])}, ensure_ascii=False))
