"""Serialize collected independent grades without exposing local paths or review images."""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import re


RUBRIC = {"accuracy": 5, "requirements": 4, "reasoning": 4, "visual": 3, "delivery": 2, "technical": 2}


def read(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def valid_number(value, maximum):
    return type(value) in (int, float) and math.isfinite(value) and 0 <= value <= maximum


def collect_review_scores(workspace: Path, order_id: str, outputs: dict[str, str]) -> list[dict]:
    """Include every collected run, including old grades and incomplete assessments.

    Original inputs may have changed since an earlier review. Its frozen output
    hashes determine whether that assessment describes the package being sent.
    Pending bundles without a reviewer report have no assessment to publish.
    """
    reviews = []
    for report_path in sorted((workspace / "reviews").glob("*/reviewer/report.json")):
        bundle = report_path.parent.parent
        try:
            if not bundle.resolve().is_relative_to(workspace.resolve()):
                raise ValueError("Review directory escapes workspace")
            report = read(report_path)
            manifest = read(bundle / "manifest.json")
            state = read(bundle / "run_state.json")
            collection = read(bundle / "collection.json")
            run_id = bundle.name
            if any(value.get("order_id") != order_id or value.get("run_id") != run_id
                   for value in (manifest, report, collection)):
                raise ValueError("Review identity does not match this order and run")
            if sha(bundle / "manifest.json") != state.get("manifest_sha256"):
                raise ValueError("Review snapshot manifest has changed")
            if collection.get("score") != report.get("score") or collection.get("status") != report.get("status"):
                raise ValueError("Assessment changed after collection; collect the review again")
            if not re.fullmatch(r"\d{8}T\d{6}Z-[a-f0-9]{10}", run_id):
                raise ValueError("Invalid review run ID")
            reviewed_at = datetime.strptime(run_id.split("-")[0], "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
            rubric = report.get("rubric", [])
            score, status = report.get("score"), report.get("status")
            blockers = report.get("blockers", [])
            if status == "complete":
                if (not valid_number(score, 20) or len(rubric) != 6 or
                        {row["id"] for row in rubric} != set(RUBRIC) or blockers or
                        any(not valid_number(row["score"], RUBRIC[row["id"]]) or
                            not str(row.get("reason", "")).strip() for row in rubric) or
                        not math.isclose(sum(row["score"] for row in rubric), score, abs_tol=.001)):
                    raise ValueError("Invalid complete review grade or rubric")
            elif status != "incomplete" or score is not None or rubric or not blockers:
                raise ValueError("Invalid incomplete review")
            if not isinstance(report.get("summary"), str) or not report["summary"].strip():
                raise ValueError("Missing review summary")
            if (len(report["summary"].strip()) > 20000 or len(blockers) > 100 or
                    any(not isinstance(value, str) or not value.strip() or len(value.strip()) > 10000 for value in blockers) or
                    any(not isinstance(row.get("reason"), str) or len(row["reason"].strip()) > 10000 for row in rubric)):
                raise ValueError("Review text exceeds the online review contract")
            output_hashes = {item["path"].removeprefix("inputs/"): item["sha256"]
                             for item in manifest["files"] if item["role"] == "deliverable"}
            if any(not re.fullmatch(r"final/[^\\]+", path) or not re.fullmatch(r"[a-f0-9]{64}", value)
                   for path, value in output_hashes.items()):
                raise ValueError("Invalid frozen output identity")
            reviews.append({
                "run_id": run_id, "report_sha256": sha(report_path),
                "reviewed_at": reviewed_at.isoformat().replace("+00:00", "Z"),
                "status": status, "score": score, "summary": report["summary"].strip(),
                "rubric": [{"id": row["id"], "score": row["score"], "reason": row["reason"].strip()} for row in rubric],
                "blockers": [value.strip() for value in blockers], "output_hashes": output_hashes,
                "matches_delivery": output_hashes == outputs,
            })
        except (OSError, ValueError, KeyError, TypeError) as error:
            raise ValueError(f"Cannot publish review {bundle.name}: {error}. Validate/collect this review first.") from error
    if len(reviews) > 1000 or len(json.dumps({"reviews": reviews}).encode("utf-8")) > 2_000_000:
        raise ValueError("Review history exceeds the supported online payload size")
    return reviews


def verify_review_scores(expected: list[dict], stored: list[dict]) -> None:
    by_run = {review["run_id"]: review for review in stored}
    for review in expected:
        if by_run.get(review["run_id"]) != review:
            raise ValueError(f"Online review differs from local assessment: {review['run_id']}")
