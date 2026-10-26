"""Source-grounded claims and coverage gates for academic presentations."""
from __future__ import annotations

import ast
import math
import re
from copy import deepcopy


TOPICS = {
    "overview": r".+",
    "problem": r"بیان مسئله|مسئله پژوهش|پرسش پژوهش|problem statement|research question",
    "background": r"پیشینه پژوهش|مبانی نظری|مرور ادبیات|literature review|theoretical background",
    "method": r"روش پژوهش|روش تحقیق|روش مطالعه|روش،|methodology|research method",
    "findings": r"یافته[‌ -]?ها|نتایج پژوهش|نتایج مطالعه|findings|research results",
    "product": r"مشخصات کیفی|کیفیت محصول|تعریف محصول|product specification|product quality",
    "market": r"بازار|تقاضا|پیش[‌ -]?فروش|market|demand",
    "feedstock": r"خوراک|تأمین مواد|مواد اولیه|feedstock|raw material",
    "technology": r"فناوری|تکنولوژی|انتخاب فرایند|technology selection",
    "process": r"فرایند تولید|فرآیند تولید|جریان مواد|process flow",
    "capacity": r"موازنه جرم|ظرفیت تولید|ظرفیت راکتور|بچ در روز|mass balance|production capacity",
    "equipment": r"تجهیزات اصلی|تجهیزات جانبی|راکتور|کندانسور|مخزن محصول|equipment|reactor",
    "site": r"مکان[‌ -]?یابی|انتخاب سایت|استقرار|site selection|location selection",
    "layout": r"چیدمان|جانمایی|مجاورت|layout|material flow",
    "workforce": r"نیروی انسانی|کارسنجی|workforce|labor requirement",
    "schedule": r"زمان[‌ -]?بندی اجرا|برنامه اجرا|برنامه [\d۰-۹]+ ماهه|implementation schedule",
    "safety": r"ایمنی|محیط[‌ -]?زیست|HAZOP|safety|environmental",
    "risk": r"مدیریت ریسک|کنترل ریسک|عدم[‌ -]?قطعیت|risk management",
    "economics": r"اقتصاد|NPV|IRR|CAPEX|OPEX|جریان نقدی|economic|financial",
    "limitations": r"محدودیت[‌ -]?ها|نیازمند اعتبارسنجی|داده مستقیم.*نیست|limitations",
    "conclusion": r"نتیجه[‌ -]?گیری|جمع[‌ -]?بندی نهایی|conclusion",
}
KINDS = {"observed", "assumption", "calculated", "scenario", "judgment", "gap"}
QUALIFIER = re.compile(r"فرض|سناریو|مقدماتی|مشروط|نظری|برآورد|تخمین|محاسبه|قضاوت|نامطمئن|نیازمند|جانشین|"
                       r"assum|scenario|preliminar|conditional|theoretical|estimat|calculat|uncertain|proxy", re.I)
OVERCLAIM = re.compile(r"اثبات شد|قطعی است|توجیه دارد|سودآور است|ارزش[‌ -]?زاست|"
                       r"انتخاب قطعی|ظرفیت هدف را پوشش می[‌ -]?دهد|احداث.*مجاز است|proven|definitively|profitable", re.I)
FINANCIAL_METRIC = re.compile(r"\b(?:NPV|IRR)\b|ارزش فعلی خالص|نرخ بازده داخلی", re.I)


def source_topics(sources: dict) -> dict[str, list[str]]:
    """Find source-backed candidate subjects; short headings/TOCs do not count."""
    result = {topic: [] for topic in TOPICS}
    from presentation.content_policy import HEADING, clean
    for source in sources.get("sources", []):
        in_bibliography = False
        for segment in source.get("segments", []):
            if in_bibliography:
                continue
            content = str(segment.get("text") or "")
            lines = content.splitlines()
            for index, line in enumerate(lines):
                if line.strip() and HEADING.fullmatch(clean(line.strip())):
                    content = "\n".join(lines[:index])
                    in_bibliography = True
                    break
            if len(content) < 70:
                continue
            # A table of contents is a list of subjects, not evidence that a
            # subject received substantive treatment in the document.
            if content.count(" | ") >= 2 and min(segment.get("pages") or [999]) <= 5:
                continue
            for topic, pattern in TOPICS.items():
                if topic == "overview":
                    continue
                if re.search(pattern, content, re.I):
                    result[topic].append(segment["id"])
    found = {topic: locators[:8] for topic, locators in result.items() if locators}
    if found:
        return found
    candidates = [segment for source in sources.get("sources", []) for segment in source.get("segments", [])
                  if len(str(segment.get("text") or "")) >= 70 and segment.get("pages")]
    return {"overview": [max(candidates, key=lambda segment: len(segment["text"]))["id"]]} if candidates else {}


def _normalized(value) -> str:
    return " ".join(str(value).translate(str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")).split())


def _source_segments(sources: dict) -> dict[str, dict]:
    return {segment["id"]: segment for source in sources.get("sources", []) for segment in source.get("segments", [])}


def _checked_reference(reference: dict, segments: dict[str, dict], label: str) -> dict:
    if not isinstance(reference, dict):
        raise ValueError(f"{label}: source reference must be an object")
    locator, quote = reference.get("locator"), _normalized(reference.get("quote", ""))
    segment = segments.get(locator)
    if segment is None or len(quote) < 8 or quote not in _normalized(segment.get("text", "")):
        raise ValueError(f"{label}: quote is not present at the source locator {locator}")
    if not segment.get("pages"):
        raise ValueError(f"{label}: source locator {locator} has no verified physical page")
    return {"locator": locator, "quote": reference["quote"], "pages": segment["pages"]}


def _arithmetic(expression: str, variables: dict[str, float]) -> float:
    """Evaluate only finite arithmetic on declared inputs; never run Python code."""
    if len(expression) > 200:
        raise ValueError("Calculation formula is too long")
    def walk(node):
        if isinstance(node, ast.Expression):
            return walk(node.body)
        if isinstance(node, ast.Constant) and type(node.value) in {int, float}:
            return float(node.value)
        if isinstance(node, ast.Name) and node.id in variables:
            return variables[node.id]
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
            return walk(node.operand) * (-1 if isinstance(node.op, ast.USub) else 1)
        if isinstance(node, ast.BinOp) and isinstance(node.op, (ast.Add, ast.Sub, ast.Mult, ast.Div)):
            left, right = walk(node.left), walk(node.right)
            return {ast.Add: lambda: left + right, ast.Sub: lambda: left - right,
                    ast.Mult: lambda: left * right, ast.Div: lambda: left / right}[type(node.op)]()
        raise ValueError("Calculation formula contains an unsupported operation")
    try:
        result = walk(ast.parse(expression, mode="eval"))
    except (SyntaxError, ZeroDivisionError, OverflowError) as error:
        raise ValueError("Calculation formula is invalid") from error
    if not math.isfinite(result):
        raise ValueError("Calculation result is not finite")
    return result


def _financial_result(claim: dict, segments: dict[str, dict]) -> tuple[float, dict]:
    """Recompute NPV/IRR only from a fully sourced annual cash-flow schedule."""
    model = claim.get("financial_model")
    if not isinstance(model, dict):
        raise ValueError("NPV/IRR requires a complete financial_model or must be labelled scenario")
    required = ("capex", "opex", "fixed_cost", "variable_cost", "selling_price",
                "production_volume", "working_capital", "tax", "depreciation",
                "construction_period", "discount_rate")
    checked = {}
    from presentation.deck import source_numbers
    for name in required:
        item = model.get(name)
        if not isinstance(item, dict) or type(item.get("value")) not in {int, float} or not math.isfinite(item["value"]) or not str(item.get("unit") or "").strip():
            raise ValueError(f"Financial model lacks sourced {name}")
        reference = _checked_reference(item.get("evidence"), segments, "financial_model." + name)
        if float(item["value"]) not in source_numbers(reference["quote"]):
            raise ValueError(f"Financial model {name} is absent from its source quote")
        checked[name] = {**item, "evidence": reference}
    flows = model.get("cash_flows")
    if not isinstance(flows, list) or len(flows) < 3:
        raise ValueError("Financial model needs a sourced annual cash-flow schedule")
    checked_flows = []
    for year, item in enumerate(flows):
        if not isinstance(item, dict) or item.get("year") != year or type(item.get("amount")) not in {int, float} or not math.isfinite(item["amount"]):
            raise ValueError("Financial cash flows must cover consecutive years from year 0")
        reference = _checked_reference(item.get("evidence"), segments, f"cash_flow.year_{year}")
        if float(item["amount"]) not in source_numbers(reference["quote"]):
            raise ValueError(f"Financial cash flow in year {year} is absent from its source quote")
        checked_flows.append({**item, "evidence": reference})
    amounts = [float(item["amount"]) for item in checked_flows]
    if amounts[0] >= 0 or not any(amount > 0 for amount in amounts[1:]):
        raise ValueError("Financial cash flows need an initial outflow and later inflow")
    discount = float(checked["discount_rate"]["value"])
    rate_unit = str(checked["discount_rate"]["unit"]).lower()
    if "%" in rate_unit or "درصد" in rate_unit or "percent" in rate_unit:
        discount /= 100
    if not 0 <= discount < 1:
        raise ValueError("Financial discount rate must be between 0 and 100 percent")
    metric = claim.get("metric") or ("IRR" if re.search(r"\bIRR\b|نرخ بازده داخلی", claim["statement"], re.I) else "NPV")
    present_value = lambda rate: sum(amount / ((1 + rate) ** year) for year, amount in enumerate(amounts))
    if metric == "NPV":
        result = present_value(discount)
    elif metric == "IRR":
        signs = [1 if amount > 0 else -1 for amount in amounts if amount]
        if sum(left != right for left, right in zip(signs, signs[1:])) != 1:
            raise ValueError("Financial cash flows have an ambiguous or absent IRR sign change")
        low, high = -0.99, 10.0
        if present_value(low) * present_value(high) > 0:
            raise ValueError("Financial cash flows do not bracket a reproducible IRR")
        for _ in range(100):
            midpoint = (low + high) / 2
            if present_value(low) * present_value(midpoint) <= 0:
                high = midpoint
            else:
                low = midpoint
        result = 100 * (low + high) / 2
    else:
        raise ValueError("Financial metric must be NPV or IRR")
    return result, {**checked, "cash_flows": checked_flows}


def validate_claim_ledger(value: dict, sources: dict, topics: dict[str, list[str]]) -> dict:
    if not isinstance(value, dict) or not isinstance(value.get("claims"), list):
        raise ValueError("Presentation claim ledger needs a claims array")
    claims = value["claims"]
    if not 1 <= len(claims) <= 100:
        raise ValueError("Presentation claim ledger must contain 1–100 material claims")
    segments = _source_segments(sources)
    result, seen, covered = [], set(), set()
    from presentation.deck import source_numbers
    for claim in claims:
        if not isinstance(claim, dict):
            raise ValueError("Every presentation claim must be an object")
        identifier, kind, topic = claim.get("id"), claim.get("kind"), claim.get("topic")
        if not isinstance(identifier, str) or not re.fullmatch(r"C[1-9]\d*", identifier) or identifier in seen:
            raise ValueError("Presentation claim IDs must be unique C1, C2, ... identifiers")
        if kind not in KINDS or topic not in topics:
            raise ValueError(f"{identifier}: unsupported claim kind or source topic")
        statement = claim.get("statement")
        if not isinstance(statement, str) or not 10 <= len(statement.strip()) <= 500:
            raise ValueError(f"{identifier}: a concise factual statement is required")
        evidence = _checked_reference(claim.get("evidence"), segments, identifier)
        if evidence["locator"] not in topics[topic]:
            # The topic can be evidenced by any source passage, but its topic
            # inventory must include that passage to prevent arbitrary labels.
            if not re.search(TOPICS[topic], segments[evidence["locator"]]["text"], re.I):
                raise ValueError(f"{identifier}: evidence does not address topic {topic}")
        normalized = deepcopy(claim)
        normalized["evidence"] = evidence
        normalized["confidence"] = claim.get("confidence") or "low"
        if normalized["confidence"] not in {"high", "medium", "low"}:
            raise ValueError(f"{identifier}: confidence must be high, medium or low")
        assumptions = claim.get("assumptions", [])
        if not isinstance(assumptions, list) or any(not isinstance(item, str) or not item.strip() for item in assumptions):
            raise ValueError(f"{identifier}: assumptions must be a list of nonempty statements")
        if kind in {"assumption", "scenario", "calculated"} and not assumptions:
            raise ValueError(f"{identifier}: assumption/scenario/calculation needs stated assumptions")
        normalized["assumptions"] = assumptions
        if topic == "market":
            if claim.get("market_basis") not in {"direct", "proxy", "scenario", "gap"}:
                raise ValueError(f"{identifier}: market claim needs direct/proxy/scenario/gap basis")
            if claim["market_basis"] != "direct" and not str(claim.get("limitation") or "").strip():
                raise ValueError(f"{identifier}: indirect market evidence needs its transfer limitation")
        if topic == "capacity":
            if claim.get("capacity_basis") not in {"theoretical", "operational", "saleable", "gap"}:
                raise ValueError(f"{identifier}: capacity claim needs theoretical/operational/saleable/gap basis")
            if claim["capacity_basis"] in {"operational", "saleable"} and not str(claim.get("limitation") or "").strip():
                raise ValueError(f"{identifier}: operational or saleable capacity needs a validation limitation")
        if kind == "calculated":
            value_number, expression, inputs = claim.get("value"), claim.get("formula"), claim.get("inputs")
            if type(value_number) not in {int, float} or not math.isfinite(value_number) or not str(claim.get("unit") or "").strip():
                raise ValueError(f"{identifier}: calculated result needs a finite value and unit")
            if FINANCIAL_METRIC.search(statement):
                reproduced, checked_model = _financial_result(claim, segments)
                normalized["financial_model"] = checked_model
            else:
                if not isinstance(expression, str) or not isinstance(inputs, list) or not inputs:
                    raise ValueError(f"{identifier}: calculated result needs formula and sourced inputs")
                variables, checked_inputs = {}, []
                for item in inputs:
                    if not isinstance(item, dict) or not isinstance(item.get("name"), str) or not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]*", item["name"]) or item["name"] in variables:
                        raise ValueError(f"{identifier}: calculation input name is invalid or duplicated")
                    if type(item.get("value")) not in {int, float} or not math.isfinite(item["value"]) or not str(item.get("unit") or "").strip():
                        raise ValueError(f"{identifier}: calculation input value is invalid")
                    cited = _checked_reference(item.get("evidence"), segments, identifier + "." + item["name"])
                    if float(item["value"]) not in source_numbers(cited["quote"]):
                        raise ValueError(f"{identifier}: input {item['name']} is absent from its source quote")
                    variables[item["name"]] = float(item["value"])
                    checked_inputs.append({**item, "evidence": cited})
                reproduced = _arithmetic(expression, variables)
                normalized["inputs"] = checked_inputs
            tolerance = 0.1 if FINANCIAL_METRIC.search(statement) and (claim.get("metric") == "IRR" or re.search(r"\bIRR\b|نرخ بازده داخلی", statement, re.I)) else 0.01 if FINANCIAL_METRIC.search(statement) else 0.5
            if not math.isclose(reproduced, float(value_number), rel_tol=0.001, abs_tol=tolerance):
                raise ValueError(f"{identifier}: calculation does not reproduce the stated result ({reproduced})")
            normalized["reproduced_value"] = reproduced
        else:
            unsupported = source_numbers(statement) - source_numbers(segments[evidence["locator"]]["text"])
            if unsupported:
                raise ValueError(f"{identifier}: stated numbers are absent from the cited source passage: {sorted(unsupported)}")
        if kind in {"assumption", "scenario", "judgment", "gap"} and not str(claim.get("limitation") or "").strip():
            raise ValueError(f"{identifier}: uncertainty or missing data needs an explicit limitation")
        if FINANCIAL_METRIC.search(statement) and kind not in {"calculated", "scenario", "gap"}:
            raise ValueError(f"{identifier}: NPV/IRR without a complete financial model is a scenario or gap, not an established result")
        seen.add(identifier)
        covered.add(topic)
        result.append(normalized)
    missing = set(topics) - covered
    if missing:
        raise ValueError("Claim ledger omits source subjects: " + ", ".join(sorted(missing)))
    return {"version": 2, "claims": result, "topics": topics}


def validate_slide_claims(spec: dict, ledger: dict, contract: dict) -> dict:
    """Fail before rendering when key source subjects or qualifications vanish."""
    claims = {claim["id"]: claim for claim in ledger["claims"]}
    covered, per_slide = set(), []
    from presentation.content_policy import visible_text
    for number, slide in enumerate(spec.get("slides", []), 1):
        identifiers = slide.get("claim_ids", [])
        if not isinstance(identifiers, list) or any(identifier not in claims for identifier in identifiers) or len(identifiers) != len(set(identifiers)):
            raise ValueError(f"Slide {number}: claim_ids must identify unique ledger claims")
        section = slide.get("section")
        if section not in {"title", "references", "questions", "agenda"} and not identifiers:
            raise ValueError(f"Slide {number}: content requires source-backed claim_ids")
        cited = {item.get("locator") for item in slide.get("evidence", [])}
        visible = " ".join(visible_text(slide))
        for identifier in identifiers:
            claim = claims[identifier]
            if claim["evidence"]["locator"] not in cited:
                raise ValueError(f"Slide {number}: claim {identifier} has no matching slide evidence")
            uncertain = (claim["kind"] in {"assumption", "calculated", "scenario", "judgment", "gap"}
                         or claim.get("market_basis") in {"proxy", "scenario", "gap"}
                         or claim.get("capacity_basis") in {"theoretical", "gap"})
            if uncertain:
                if not QUALIFIER.search(visible):
                    raise ValueError(f"Slide {number}: uncertain claim {identifier} needs a visible qualification")
                if OVERCLAIM.search(slide.get("title", "")):
                    raise ValueError(f"Slide {number}: title overstates uncertain claim {identifier}")
            covered.add(claim["topic"])
        per_slide.append({"slide": number, "claim_ids": identifiers,
                          "topics": sorted({claims[identifier]["topic"] for identifier in identifiers})})
    missing = set(ledger["topics"]) - covered
    if missing:
        raise ValueError("Presentation omits source subjects: " + ", ".join(sorted(missing)))
    return {"version": 2, "covered_topics": sorted(covered), "slides": per_slide}
