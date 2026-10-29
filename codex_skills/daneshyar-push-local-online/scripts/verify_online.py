"""Verify an existing online delivery; never submit or mutate a remote order."""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path, PurePosixPath
import subprocess
import sys
from urllib.parse import urlparse


SIBLING_SCRIPTS = Path(__file__).resolve().parents[2] / "daneshyar-order" / "scripts"
sys.path.insert(0, str(SIBLING_SCRIPTS))
from order_tools import WORKER, configured_python


def verify(workspace: Path, requested_order: str) -> dict:
    from common import api
    from common.config import load_config
    from common.local_reviews import collect_review_scores, verify_review_scores
    from codex_order_tools import digest, hashes, order_id, read, signature
    import requests

    workspace = workspace.resolve()
    identifier = order_id(requested_order)
    state = read(workspace / "codex_order_state.json")
    if state["order_id"] != identifier:
        raise ValueError("Requested order does not match the local workspace")
    config = load_config()
    requested_url = urlparse(requested_order)
    if requested_url.scheme and requested_url.netloc != urlparse(config.backend_url).netloc:
        raise ValueError("Configured backend differs from the requested order host")
    manifest = read(workspace / "reports/codex_delivery.json")
    if manifest.get("passed") is not True or manifest.get("order_id") != identifier:
        raise ValueError("Missing or invalid finalized delivery manifest")
    expected = manifest["outputs"]
    if hashes(workspace, expected) != expected:
        raise ValueError("Local files differ from the finalized delivery manifest")
    if hashes(workspace, state["input_hashes"]) != state["input_hashes"]:
        raise ValueError("Original local inputs have changed")
    order = api.fetch_order_read_only(config, identifier)
    if order.get("id") != identifier or signature(order) != state["order_signature"]:
        raise ValueError("Remote order identity or inputs differ from the reviewed order")
    editable = "pptx" if order["order_type"] == "ارائه و پاورپوینت" else "docx"
    roles = {editable: f"final/final.{editable}", "pdf": "final/final.pdf",
             "sample": f"final/sample.{editable}", "sample_pdf": "final/sample.pdf"}
    if set(expected) != set(roles.values()):
        raise ValueError("The API supports exactly four primary delivery files; inspect companion outputs")
    outputs = order.get("final_outputs", [])
    if len(outputs) != 4 or {o["output_type"] for o in outputs} != set(roles):
        raise ValueError("Remote output roles do not match the complete four-file package")

    def check(output: dict) -> dict:
        relative = roles[output["output_type"]]
        local = (workspace / relative).resolve()
        storage = PurePosixPath(output["storage_path"])
        prefix = PurePosixPath("orders") / identifier / "final"
        if (storage.is_absolute() or ".." in storage.parts or "\\" in str(storage)
                or "?" in str(storage) or "#" in str(storage)
                or not storage.is_relative_to(prefix)):
            raise ValueError("Unexpected remote output storage path")
        response = requests.get(config.backend_url + "/uploads/" + str(storage),
                                timeout=30, allow_redirects=False)
        response.raise_for_status()
        if response.status_code != 200:
            raise ValueError("Stored output did not return HTTP 200")
        remote_hash = hashlib.sha256(response.content).hexdigest()
        if (remote_hash != expected[relative] or digest(local) != expected[relative]
                or len(response.content) != output["size_bytes"]
                or len(response.content) != local.stat().st_size):
            raise ValueError(f"Remote bytes do not match the reviewed local file: {relative}")
        return {"id": output["id"], "output_type": output["output_type"],
                "local_path": relative, "bytes": len(response.content),
                "sha256": remote_hash, "verified": True}

    with ThreadPoolExecutor(max_workers=4) as pool:
        verified = list(pool.map(check, outputs))
    reviews = collect_review_scores(workspace, identifier, expected)
    stored_reviews = api.fetch_review_scores(config, identifier)["reviews"]
    verify_review_scores(reviews, stored_reviews)
    receipt = {"order_id": identifier, "backend": config.backend_url,
               "status": order["status"],
               "verified_at": datetime.now(timezone.utc).isoformat(),
               "outputs": verified, "review_runs": [review["run_id"] for review in reviews],
               "review_scores_verified": True}
    destination = workspace / "reports/publication_verification.json"
    temporary = destination.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(destination)
    return {"verified": True, "order_id": identifier, "status": order["status"],
            "files": [o["local_path"] for o in verified], "review_scores_verified": True,
            "reviews": len(reviews), "receipt": str(destination)}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", required=True, type=Path)
    parser.add_argument("--order", required=True, help="Order ID or admin order URL")
    args = parser.parse_args()
    try:
        result = verify(args.workspace, args.order)
        print(json.dumps({"ok": True, "result": result}, ensure_ascii=False))
        return 0
    except Exception as error:
        print(json.dumps({"ok": False, "error_type": type(error).__name__,
                          "error": str(error)}, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    executable = configured_python()
    if executable and executable != Path(sys.executable).resolve():
        import os
        sys.exit(subprocess.run([str(executable), "-X", "utf8", str(Path(__file__).resolve()),
                                 *sys.argv[1:]],
                                env={**os.environ, "PYTHONUTF8": "1"}, check=False).returncode)
    sys.path.insert(0, str(WORKER))
    sys.exit(main())
