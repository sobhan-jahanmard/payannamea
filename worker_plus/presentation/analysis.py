"""Deterministic analytical gates for source-based engineering presentations.

The model supplies structured candidate data. This module checks source quotes,
recomputes arithmetic, and carries unresolved inputs into the slide contract.
It never fills a missing source value with a default engineering assumption.
"""
from __future__ import annotations

import ast
import csv
import math
import re
from pathlib import Path

from presentation.assurance import _arithmetic, _checked_reference, _source_segments
from presentation.content_policy import visible_text
from presentation.deck import source_numbers


ENGINEERING_AREAS = ("layout", "material_flow", "bottleneck", "workforce", "schedule", "risk")
CATEGORY_TOPICS = {"technology_matrix": ("technology",), "site_matrix": ("site",),
                   "mass_balance": ("feedstock", "capacity"), "financial_model": ("economics",),
                   "investment_thresholds": ("economics", "market", "risk"),
                   "industrial_engineering": ("layout", "workforce", "schedule", "risk", "process")}
UNCERTAIN = re.compile(r"فرض|سناریو|پیشنهاد|مقدماتی|مشروط|تأییدنشده|نامشخص|کمبود|شکاف|نیازمند|"
                       r"assum|scenario|propos|preliminar|conditional|unverified|missing|gap|unknown", re.I)
PERCENT_WORDS = {5: ("پنج درصد", "five percent"), 10: ("ده درصد", "ten percent"),
                 15: ("پانزده درصد", "fifteen percent"), 20: ("بیست درصد", "twenty percent"),
                 25: ("بیست و پنج درصد", "twenty five percent"),
                 30: ("سی درصد", "thirty percent"), 35: ("سی و پنج درصد", "thirty five percent"),
                 40: ("چهل درصد", "forty percent"), 50: ("پنجاه درصد", "fifty percent")}


def required_categories(topics: dict[str, list[str]]) -> list[str]:
    """Require an explicit analytical result or a visible gap for present themes."""
    result = []
    if "technology" in topics:
        result.append("technology_matrix")
    if "site" in topics:
        result.append("site_matrix")
    if {"feedstock", "capacity"}.issubset(topics):
        result.append("mass_balance")
    if "economics" in topics:
        result.append("financial_model")
    if "economics" in topics and ("market" in topics or "risk" in topics):
        result.append("investment_thresholds")
    if any(area in topics for area in ("layout", "workforce", "schedule", "risk", "process")):
        result.append("industrial_engineering")
    return result


def _numeric(value, label: str) -> float:
    if type(value) not in (int, float) or not math.isfinite(value):
        raise ValueError(f"{label}: finite numeric value required")
    return float(value)


def _source_value(value, reference, segments, label: str) -> dict:
    checked = _checked_reference(reference, segments, label)
    if _numeric(value, label) not in source_numbers(checked["quote"]):
        raise ValueError(f"{label}: value absent from source quote")
    return checked


def _calculation(item: dict, segments: dict, label: str) -> dict:
    if not isinstance(item, dict) or not isinstance(item.get("name"), str) or not item["name"].strip():
        raise ValueError(f"{label}: named calculation required")
    value = _numeric(item.get("value"), label)
    if not isinstance(item.get("unit"), str) or not item["unit"].strip():
        raise ValueError(f"{label}: unit required")
    inputs = item.get("inputs")
    if not isinstance(inputs, list) or not inputs:
        raise ValueError(f"{label}: sourced inputs required")
    variables = {}
    checked_inputs = []
    for n, source in enumerate(inputs, 1):
        name = source.get("name") if isinstance(source, dict) else None
        if not isinstance(name, str) or not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]*", name) or name in variables:
            raise ValueError(f"{label}: invalid or duplicate input name")
        amount = _numeric(source.get("value"), f"{label}.{name}")
        evidence = _source_value(amount, source.get("evidence"), segments, f"{label}.{name}")
        variables[name] = amount
        checked_inputs.append({**source, "evidence": evidence})
    formula = item.get("formula")
    if not isinstance(formula, str) or not formula.strip():
        raise ValueError(f"{label}: formula required")
    try:
        constants = [node.value for node in ast.walk(ast.parse(formula, mode="eval"))
                     if isinstance(node, ast.Constant) and type(node.value) in (int, float)]
    except SyntaxError as error:
        raise ValueError(f"{label}: invalid formula") from error
    quoted_numbers = set().union(*(source_numbers(source["evidence"]["quote"]) for source in checked_inputs))
    for constant in constants:
        if float(constant) not in {0, 1, 100, 1000, 1000000} and float(constant) not in quoted_numbers:
            raise ValueError(f"{label}: formula constant {constant} lacks source evidence")
    reproduced = _arithmetic(formula, variables)
    if not math.isclose(reproduced, value, rel_tol=.001, abs_tol=.05):
        raise ValueError(f"{label}: formula does not reproduce {value} (got {reproduced})")
    return {**item, "inputs": checked_inputs, "reproduced_value": reproduced}


def _matrix(item: dict, segments: dict, label: str) -> dict:
    matrix = item.get("matrix")
    if not isinstance(matrix, dict):
        raise ValueError(f"{label}: complete decision matrix required")
    criteria, alternatives = matrix.get("criteria"), matrix.get("alternatives")
    if not isinstance(criteria, list) or not 2 <= len(criteria) <= 12 or not isinstance(alternatives, list) or not 2 <= len(alternatives) <= 12:
        raise ValueError(f"{label}: matrix needs criteria and at least two alternatives")
    weights, names, checked_criteria = [], set(), []
    for n, criterion in enumerate(criteria, 1):
        name = criterion.get("name") if isinstance(criterion, dict) else None
        if not isinstance(name, str) or not name.strip() or name in names:
            raise ValueError(f"{label}: criterion names must be unique")
        weight = _numeric(criterion.get("weight"), f"{label}.weight_{n}")
        if not 0 < weight <= 1:
            raise ValueError(f"{label}: criterion weights must be fractions in (0,1]")
        # Source weights may be quoted as percentages; 0.30 is checked against 30.
        reference = _checked_reference(criterion.get("evidence"), segments, f"{label}.weight_{n}")
        quoted = source_numbers(reference["quote"])
        word_match = any(word in reference["quote"].casefold() for word in PERCENT_WORDS.get(round(weight * 100), ()))
        if not word_match and not any(math.isclose(weight, number, abs_tol=1e-9) or math.isclose(weight * 100, number, abs_tol=1e-9) for number in quoted):
            raise ValueError(f"{label}: weight {weight} absent from source quote")
        names.add(name)
        weights.append(weight)
        checked_criteria.append({**criterion, "evidence": reference})
    if not math.isclose(sum(weights), 1, abs_tol=.001):
        raise ValueError(f"{label}: matrix weights must sum to one")
    checked_alternatives, totals = [], {}
    for alternative in alternatives:
        name = alternative.get("name") if isinstance(alternative, dict) else None
        scores = alternative.get("scores") if isinstance(alternative, dict) else None
        if not isinstance(name, str) or not name.strip() or name in totals or not isinstance(scores, list) or len(scores) != len(criteria):
            raise ValueError(f"{label}: each alternative needs one score per criterion")
        checked_scores = []
        for n, score in enumerate(scores, 1):
            amount = _numeric(score.get("value") if isinstance(score, dict) else None, f"{label}.{name}.score_{n}")
            if not 0 <= amount <= 10:
                raise ValueError(f"{label}: scores must be within 0–10")
            reference = _source_value(amount, score.get("evidence"), segments, f"{label}.{name}.score_{n}")
            checked_scores.append({**score, "evidence": reference})
        total = sum(weight * score["value"] for weight, score in zip(weights, checked_scores))
        totals[name] = total
        checked_alternatives.append({"name": name, "scores": checked_scores, "total": total})
    ranked = sorted(totals, key=totals.get, reverse=True)
    winner = next(a for a in checked_alternatives if a["name"] == ranked[0])
    sensitivity = []
    for competitor in checked_alternatives:
        if competitor["name"] == winner["name"]:
            continue
        gap = totals[winner["name"]] - totals[competitor["name"]]
        differences = [a["value"] - b["value"] for a, b in zip(winner["scores"], competitor["scores"])]
        possible = []
        for donor, weight in enumerate(weights):
            for receiver in range(len(weights)):
                improvement = differences[donor] - differences[receiver]
                if donor != receiver and improvement > 0:
                    shift = gap / improvement
                    if 0 < shift <= weight + 1e-9:
                        possible.append({"from": criteria[donor]["name"], "to": criteria[receiver]["name"],
                                         "weight_shift": shift})
        sensitivity.append({"competitor": competitor["name"], "score_gap": gap,
                            "smallest_single_weight_shift_to_tie": min(possible, key=lambda x: x["weight_shift"]) if possible else None})
    return {**matrix, "criteria": checked_criteria, "alternatives": checked_alternatives,
            "totals": totals, "winner": winner["name"], "sensitivity": sensitivity}


def _mass(item: dict, segments: dict, label: str) -> dict:
    calculations = item.get("calculations")
    flows = item.get("flows")
    if not isinstance(calculations, list) or not calculations or not isinstance(flows, list) or len(flows) < 2:
        raise ValueError(f"{label}: mass balance requires calculations and input/output flows")
    checked_calculations = [_calculation(calc, segments, f"{label}.calculation_{n}")
                            for n, calc in enumerate(calculations, 1)]
    calculated = {calc["name"]: calc["value"] for calc in checked_calculations}
    if len(calculated) != len(checked_calculations):
        raise ValueError(f"{label}: duplicate calculation names")
    totals = {"input": 0.0, "output": 0.0, "loss": 0.0}
    checked_flows = []
    units = set()
    for n, flow in enumerate(flows, 1):
        role = flow.get("role") if isinstance(flow, dict) else None
        if role not in totals or not isinstance(flow.get("name"), str) or not flow["name"].strip():
            raise ValueError(f"{label}: each flow needs a name and input/output/loss role")
        amount = _numeric(flow.get("value"), f"{label}.flow_{n}")
        if amount < 0 or not isinstance(flow.get("unit"), str) or not flow["unit"].strip():
            raise ValueError(f"{label}: flow requires a nonnegative value and unit")
        units.add(flow["unit"].strip())
        if flow.get("calculation") in calculated:
            if not math.isclose(amount, calculated[flow["calculation"]], abs_tol=.05, rel_tol=.001):
                raise ValueError(f"{label}: flow differs from its calculation")
            checked = dict(flow)
        else:
            reference = _source_value(amount, flow.get("evidence"), segments, f"{label}.flow_{n}")
            checked = {**flow, "evidence": reference}
        totals[role] += amount
        checked_flows.append(checked)
    if totals["input"] <= 0 or totals["output"] <= 0:
        raise ValueError(f"{label}: mass balance needs input and output")
    if len(units) != 1:
        raise ValueError(f"{label}: flow units must match before summing")
    residual = totals["input"] - totals["output"] - totals["loss"]
    if abs(residual) > max(.05, .001 * totals["input"]):
        raise ValueError(f"{label}: mass balance does not close; residual {residual}")
    return {"calculations": checked_calculations, "flows": checked_flows,
            "totals": totals, "residual": residual}


def _financial(item: dict, segments: dict, label: str) -> dict:
    status = item["status"]
    metrics = item.get("reported_metrics", [])
    checked_metrics = []
    for n, metric in enumerate(metrics, 1):
        if metric.get("name") not in {"NPV", "IRR"}:
            raise ValueError(f"{label}: unsupported financial metric")
        reference = _source_value(metric.get("value"), metric.get("evidence"), segments, f"{label}.metric_{n}")
        checked_metrics.append({**metric, "evidence": reference,
                                "classification": "initial_unverified" if status != "complete" else "verified"})
    if status != "complete":
        return {"reported_metrics": checked_metrics, "verified": False}
    # Verified DCF needs sourced annual cash-flow components and a construction
    # schedule; an NPV total alone cannot certify calendar timing.
    schedule = item.get("annual_cash_flows")
    if not isinstance(schedule, list) or len(schedule) < 3:
        raise ValueError(f"{label}: verified finance needs annual cash flows")
    checked_schedule = []
    required = ("revenue", "opex", "tax", "capex", "working_capital_delta", "net")
    for year, row in enumerate(schedule):
        if not isinstance(row, dict) or row.get("year") != year:
            raise ValueError(f"{label}: annual cash flows must start at year zero and be consecutive")
        checked = {"year": year}
        for field in required:
            amount = _numeric(row.get(field), f"{label}.year_{year}.{field}")
            reference = _source_value(amount, row.get("evidence", {}).get(field), segments, f"{label}.year_{year}.{field}")
            checked[field] = amount
            checked.setdefault("evidence", {})[field] = reference
        expected = checked["revenue"] - checked["opex"] - checked["tax"] - checked["capex"] - checked["working_capital_delta"]
        if not math.isclose(expected, checked["net"], abs_tol=.01):
            raise ValueError(f"{label}: year {year} cash-flow components do not reconcile")
        checked_schedule.append(checked)
    construction = item.get("construction_period")
    if not isinstance(construction, dict):
        raise ValueError(f"{label}: sourced construction period required")
    months = _numeric(construction.get("months"), f"{label}.construction_months")
    reference = _source_value(months, construction.get("evidence"), segments, f"{label}.construction_months")
    if months < 0 or (months > 0 and not any(row["capex"] > 0 for row in checked_schedule[:math.ceil(months / 12) + 1])):
        raise ValueError(f"{label}: construction spending is not reconciled with the schedule")
    if any(row["revenue"] > 0 for row in checked_schedule[:math.floor(months / 12)]):
        raise ValueError(f"{label}: revenue precedes the documented construction period")
    capex_total = item.get("capex_total")
    if not isinstance(capex_total, dict):
        raise ValueError(f"{label}: sourced CAPEX total required")
    capex = _numeric(capex_total.get("value"), f"{label}.capex_total")
    capex_ref = _source_value(capex, capex_total.get("evidence"), segments, f"{label}.capex_total")
    if not math.isclose(sum(row["capex"] for row in checked_schedule), capex, abs_tol=.01):
        raise ValueError(f"{label}: annual CAPEX does not reconcile to sourced total")
    discount = item.get("discount_rate")
    if not isinstance(discount, dict):
        raise ValueError(f"{label}: sourced discount rate required")
    rate = _numeric(discount.get("value"), f"{label}.discount_rate")
    rate_ref = _source_value(rate, discount.get("evidence"), segments, f"{label}.discount_rate")
    rate = rate / 100 if rate > 1 else rate
    if not 0 <= rate < 1:
        raise ValueError(f"{label}: invalid discount rate")
    npv = sum(row["net"] / (1 + rate) ** row["year"] for row in checked_schedule)
    for metric in checked_metrics:
        if metric["name"] == "NPV" and not math.isclose(npv, metric["value"], abs_tol=.02, rel_tol=.001):
            raise ValueError(f"{label}: reported NPV does not reproduce calendar cash flows")
        if metric["name"] == "IRR":
            amounts = [row["net"] for row in checked_schedule]
            signs = [1 if amount > 0 else -1 for amount in amounts if amount]
            if sum(left != right for left, right in zip(signs, signs[1:])) != 1:
                raise ValueError(f"{label}: IRR has ambiguous cash-flow signs")
            present = lambda r: sum(amount / (1 + r) ** year for year, amount in enumerate(amounts))
            low, high = -.99, 10.0
            if present(low) * present(high) > 0:
                raise ValueError(f"{label}: IRR root is not bracketed")
            for _ in range(100):
                middle = (low + high) / 2
                if present(low) * present(middle) <= 0:
                    high = middle
                else:
                    low = middle
            irr = (low + high) / 2
            expected = metric["value"] / 100 if abs(metric["value"]) > 1 else metric["value"]
            if not math.isclose(irr, expected, abs_tol=.001):
                raise ValueError(f"{label}: reported IRR does not reproduce calendar cash flows")
    return {"reported_metrics": checked_metrics, "verified": True, "annual_cash_flows": checked_schedule,
            "construction_period": {**construction, "evidence": reference},
            "discount_rate": {**discount, "evidence": rate_ref},
            "capex_total": {**capex_total, "evidence": capex_ref}, "reproduced_npv": npv}


def validate_packet(packet: dict, sources: dict, topics: dict[str, list[str]]) -> dict:
    required = required_categories(topics)
    if not isinstance(packet, dict) or packet.get("version") != 1 or not isinstance(packet.get("items"), list):
        raise ValueError("Presentation analytical packet needs version 1 and items")
    segments = _source_segments(sources)
    items, categories, identifiers = [], set(), set()
    for raw in packet["items"]:
        if not isinstance(raw, dict):
            raise ValueError("Analytical item must be an object")
        identifier, category, status = raw.get("id"), raw.get("category"), raw.get("status")
        if not isinstance(identifier, str) or not re.fullmatch(r"A[1-9]\d*", identifier) or identifier in identifiers:
            raise ValueError("Analytical IDs must be unique A1, A2, ...")
        if category not in required or category in categories or status not in {"complete", "partial", "gap"}:
            raise ValueError(f"{identifier}: category/status invalid or duplicated")
        evidence = raw.get("evidence")
        if not isinstance(evidence, list) or not evidence:
            raise ValueError(f"{identifier}: source evidence required, including for gaps")
        checked_evidence = [_checked_reference(ref, segments, identifier) for ref in evidence]
        relevant = {locator for topic in CATEGORY_TOPICS[category] for locator in topics.get(topic, [])}
        if relevant and not any(ref["locator"] in relevant for ref in checked_evidence):
            raise ValueError(f"{identifier}: evidence does not address {category}")
        missing = raw.get("missing", [])
        if not isinstance(missing, list) or any(not isinstance(x, str) or not x.strip() for x in missing):
            raise ValueError(f"{identifier}: missing must be a list")
        if status != "complete" and not missing:
            raise ValueError(f"{identifier}: partial/gap item needs explicit missing inputs")
        normalized = {**raw, "evidence": checked_evidence, "missing": missing}
        if category in {"technology_matrix", "site_matrix"} and status == "complete":
            normalized["matrix"] = _matrix(raw, segments, identifier)
        elif category == "mass_balance" and status == "complete":
            normalized["mass_balance"] = _mass(raw, segments, identifier)
        elif category == "financial_model":
            normalized["financial_analysis"] = _financial(raw, segments, identifier)
        elif category == "investment_thresholds" and status == "complete":
            thresholds = raw.get("thresholds")
            if not isinstance(thresholds, list) or not thresholds:
                raise ValueError(f"{identifier}: threshold list required")
            checked = []
            for n, threshold in enumerate(thresholds, 1):
                if not isinstance(threshold, dict) or threshold.get("basis") not in {"proposed", "calculated"}:
                    raise ValueError(f"{identifier}: threshold basis must be proposed or calculated")
                reference = _source_value(threshold.get("value"), threshold.get("evidence"), segments, f"{identifier}.threshold_{n}")
                verified = _calculation(threshold["calculation"], segments, f"{identifier}.threshold_{n}") if threshold["basis"] == "calculated" else None
                if verified and not math.isclose(threshold["value"], verified["value"], abs_tol=.05):
                    raise ValueError(f"{identifier}: threshold calculation mismatch")
                checked.append({**threshold, "evidence": reference, "calculation": verified})
            normalized["thresholds"] = checked
        elif category == "industrial_engineering" and status == "complete":
            areas = raw.get("areas")
            if not isinstance(areas, list) or {a.get("name") for a in areas if isinstance(a, dict)} != set(ENGINEERING_AREAS):
                raise ValueError(f"{identifier}: six engineering areas required")
            checked = []
            for area in areas:
                if area.get("status") not in {"sourced", "gap"}:
                    raise ValueError(f"{identifier}: engineering area status invalid")
                if area["status"] == "sourced":
                    checked.append({**area, "evidence": _checked_reference(area.get("evidence"), segments, f"{identifier}.{area['name']}")})
                elif not area.get("missing"):
                    raise ValueError(f"{identifier}: engineering gap needs missing data")
                else:
                    checked.append(area)
            normalized["areas"] = checked
        identifiers.add(identifier)
        categories.add(category)
        items.append(normalized)
    if categories != set(required):
        raise ValueError("Analytical packet omits required categories: " + ", ".join(sorted(set(required) - categories)))
    return {"version": 1, "items": items, "required_categories": required}


def validate_slide_coverage(spec: dict, packet: dict) -> dict:
    items = {item["id"]: item for item in packet["items"]}
    covered, rows, visible_by_item = set(), [], {identifier: [] for identifier in items}
    for number, slide in enumerate(spec.get("slides", []), 1):
        identifiers = slide.get("analysis_ids", [])
        if not isinstance(identifiers, list) or len(identifiers) != len(set(identifiers)) or any(identifier not in items for identifier in identifiers):
            raise ValueError(f"Slide {number}: invalid analytical IDs")
        cited = {ref.get("locator") for ref in slide.get("evidence", [])}
        visible = " ".join(visible_text(slide))
        for identifier in identifiers:
            item = items[identifier]
            if not cited.intersection({ref["locator"] for ref in item["evidence"]}):
                raise ValueError(f"Slide {number}: analytical item {identifier} lacks source evidence")
            if (item["status"] != "complete" or item["category"] in {"technology_matrix", "site_matrix", "investment_thresholds"}) and not UNCERTAIN.search(visible):
                raise ValueError(f"Slide {number}: analytical item {identifier} needs visible uncertainty")
            covered.add(identifier)
            visible_by_item[identifier].append(visible)
        rows.append({"slide": number, "analysis_ids": identifiers})
    if covered != set(items):
        raise ValueError("Presentation omits analytical items: " + ", ".join(sorted(set(items) - covered)))
    for identifier, item in items.items():
        visible = " ".join(visible_by_item[identifier])
        if item["category"] in {"technology_matrix", "site_matrix"} and item["status"] == "complete":
            matrix = item["matrix"]
            names = [entry["name"] for entry in matrix["criteria"] + matrix["alternatives"]]
            if any(name not in visible for name in names) or not re.search(r"حساسیت|sensitivity", visible, re.I):
                raise ValueError(f"Analytical item {identifier}: complete matrix needs visible criteria, alternatives and sensitivity")
            if not set(float(value) for value in matrix["totals"].values()).issubset(source_numbers(visible)):
                raise ValueError(f"Analytical item {identifier}: weighted totals are absent from slides")
        if item["category"] == "financial_model" and item.get("financial_analysis", {}).get("reported_metrics") and item["status"] != "complete":
            if not re.search(r"اولیه|تأیید[‌ -]?نشده|initial|unverified", visible, re.I):
                raise ValueError(f"Analytical item {identifier}: reported financial metrics need an initial/unverified label")
        if item["category"] == "industrial_engineering" and any(area.get("status") == "gap" for area in item.get("areas", [])):
            if not UNCERTAIN.search(visible):
                raise ValueError(f"Analytical item {identifier}: engineering gaps need visible uncertainty")
    return {"slides": rows, "covered": sorted(covered)}


def calculated_numbers(packet: dict, identifiers: list[str]) -> set[float]:
    """Only validated calculations linked to a slide can license new numerals."""
    by_id = {item["id"]: item for item in packet["items"]}
    values = set()
    for identifier in identifiers:
        item = by_id[identifier]
        if item.get("matrix"):
            matrix = item["matrix"]
            values.update(float(x) for x in matrix["totals"].values())
            for case in matrix["sensitivity"]:
                values.add(float(case["score_gap"]))
                if case["smallest_single_weight_shift_to_tie"]:
                    shift = case["smallest_single_weight_shift_to_tie"]["weight_shift"]
                    values.update((float(shift), float(shift * 100)))
        if item.get("mass_balance"):
            mass = item["mass_balance"]
            values.update(float(calc["value"]) for calc in mass["calculations"])
            values.update(float(value) for value in mass["totals"].values())
            values.add(float(mass["residual"]))
        if item.get("financial_analysis", {}).get("verified"):
            values.add(float(item["financial_analysis"]["reproduced_npv"]))
        for threshold in item.get("thresholds", []):
            if threshold.get("calculation"):
                values.add(float(threshold["calculation"]["value"]))
    return values


def write_slide_validation(workspace: Path, spec: dict, packet: dict, claims: dict, sources: dict) -> None:
    """Export a per-slide claim/source/page/formula/confidence table."""
    segments = _source_segments(sources)
    claim_map = {claim["id"]: claim for claim in claims["claims"]}
    analysis_map = {item["id"]: item for item in packet["items"]}
    rows = []
    for number, slide in enumerate(spec["slides"], 1):
        for identifier in slide.get("claim_ids", []):
            claim = claim_map[identifier]
            evidence = claim["evidence"]
            rows.append({"slide": number, "claim": claim["statement"], "source": evidence["locator"],
                         "pages": ",".join(map(str, segments[evidence["locator"]]["pages"])),
                         "formula": claim.get("formula") or "—", "confidence": claim.get("confidence", "low"),
                         "status": claim["kind"]})
        for identifier in slide.get("analysis_ids", []):
            item = analysis_map[identifier]
            locators = sorted({ref["locator"] for ref in item["evidence"]})
            pages = sorted({page for locator in locators for page in segments[locator]["pages"]})
            formula = ("Σ(weight × score); sensitivity from weight-transfer ties" if item["category"].endswith("matrix") and item["status"] == "complete" else
                       "input = output + loss" if item["category"] == "mass_balance" and item["status"] == "complete" else
                       "Σ annual net cash flow / (1+r)^year" if item["category"] == "financial_model" and item["status"] == "complete" else "—")
            rows.append({"slide": number, "claim": item["category"] + (": " + "; ".join(item["missing"]) if item["missing"] else ""),
                         "source": ", ".join(locators), "pages": ",".join(map(str, pages)),
                         "formula": formula, "confidence": "low" if item["status"] != "complete" else "conditional",
                         "status": item["status"]})
        if not any(row["slide"] == number for row in rows):
            refs = slide.get("evidence", [])
            pages = sorted({page for ref in refs for page in segments[ref["locator"]]["pages"]})
            rows.append({"slide": number, "claim": slide["title"],
                         "source": ", ".join(ref["locator"] for ref in refs) or "order metadata",
                         "pages": ",".join(map(str, pages)) or "—", "formula": "—",
                         "confidence": "source text" if refs else "metadata", "status": "reference/cover"})
    target = workspace / "reports"
    target.mkdir(parents=True, exist_ok=True)
    fields = ("slide", "claim", "source", "pages", "formula", "confidence", "status")
    with (target / "presentation_slide_validation.csv").open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)
    with (target / "presentation_slide_validation.md").open("w", encoding="utf-8") as stream:
        stream.write("# Slide validation\n\n| Slide | Claim or analytical check | Source | Page | Formula | Confidence | Status |\n|---:|---|---|---|---|---|---|\n")
        for row in rows:
            stream.write("| " + " | ".join(str(row[field]).replace("|", "/").replace("\n", " ") for field in fields) + " |\n")
