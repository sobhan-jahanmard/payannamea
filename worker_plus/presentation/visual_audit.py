"""Combine machine-verified citation rendering with the model's visual review."""
from __future__ import annotations

import json
from pathlib import Path

from presentation.visual_checks import POLICY_VERSION, visual_inputs


def load_visual_proof(workspace: Path, spec: dict, rules: dict) -> dict:
    proof = json.loads((workspace / "reports/visual_evidence/checks.json").read_text(encoding="utf-8"))
    count = len(spec["slides"])
    if (proof.get("policy_version") != POLICY_VERSION or proof.get("passed") is not True
            or proof.get("inputs") != visual_inputs(workspace, spec, rules)
            or [s.get("slide") for s in proof.get("slides", [])] != list(range(1, count + 1))
            or not all(s.get("raster", {}).get("passed") is True for s in proof["slides"])):
        raise ValueError("Native visual evidence is missing, failed or stale; no visual approval can be issued")
    return proof


def aggregate_visual_audit(workspace: Path, text: str, spec: dict, rules: dict) -> dict:
    proof = load_visual_proof(workspace, spec, rules)
    count = len(spec["slides"])
    status = text.strip().splitlines()[:1]
    if status not in (["STATUS: PASS"], ["STATUS: FAIL"]):
        raise ValueError("Visual model report must start with STATUS: PASS or STATUS: FAIL")
    try:
        payload, _ = json.JSONDecoder().raw_decode(text.split("ISSUES_JSON:", 1)[1].lstrip())
    except (IndexError, ValueError) as error:
        raise ValueError("Visual model report needs a valid ISSUES_JSON object") from error
    if not isinstance(payload, dict):
        raise ValueError("Visual model payload must be a JSON object")
    issues, reviewed = payload.get("issues"), payload.get("reviewed_slides")
    if (not isinstance(reviewed, list) or any(type(n) is not int for n in reviewed)
            or sorted(reviewed) != list(range(1, count + 1))):
        raise ValueError("Visual model report must identify every reviewed slide exactly once")
    if not isinstance(issues, list) or any(not isinstance(i, dict) or type(i.get("slide")) is not int
                                         or not 1 <= i["slide"] <= count or not isinstance(i.get("message"), str)
                                         or not i["message"].strip() for i in issues):
        raise ValueError("Visual model report contains invalid issues")
    if status == ["STATUS: FAIL"] and not issues:
        raise ValueError("Visual model FAIL has no located issue; it cannot be converted to PASS")
    unresolved, resolved = [], []
    for issue in issues:
        row = proof["slides"][issue["slide"] - 1]
        # Only two objective claims can be settled by the per-character proof.
        # Body defects, subjective legibility and unclassified legacy messages
        # remain failures. Never turn an arbitrary model FAIL into approval.
        locator = next((r for r in row["raster"]["locators"] if issue.get("locator") in [r["locator"], r.get("source_id"), *r.get("source_locators", [])]), None)
        if (isinstance(issue.get("locator"), str) and issue["locator"] and issue.get("region") == "footer" and issue.get("kind") in {"citation_missing", "citation_clipped"}
                and locator and locator["passed"]
                and locator.get("glyphs") and all(g["passed"] and g["coverage"] >= .98 for g in locator["glyphs"])):
            resolved.append({"claim": issue, "decision": "contradicted_by_native_glyph_pixels",
                             "proof": "reports/visual_evidence/checks.json", "image": locator["image"],
                             "minimum_glyph_coverage": min(g["coverage"] for g in locator["glyphs"])})
        else:
            unresolved.append(issue)
    return {"policy_version": POLICY_VERSION, "passed": not unresolved, "model_status": status[0],
            "reviewed_slides": reviewed, "issues": unresolved, "resolved_claims": resolved, "inputs": proof["inputs"]}
