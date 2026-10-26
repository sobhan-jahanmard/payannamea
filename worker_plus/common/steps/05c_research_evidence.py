"""Collect executed, traceable web research before planning or drafting."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from common.deliverable_policy import deliverable_contract
from common.helpers import write_json

TITLE = "Research web evidence and execute analysis"

_GUIDELINE_RESEARCH = (
    ("income_statement", ("صورت سود و زیان", "صورت‌های سود و زیان"), "صورت سود و زیان سناریوییِ چندساله با ورودی، استهلاک، مالیات و سود خالص"),
    ("cash_flow", ("جریان نقد", "گردش جریان‌های نقدی"), "جریان نقد سناریوییِ چندساله با سرمایه در گردش و فرض تأمین مالی"),
    ("balance_sheet", ("ترازنامه",), "ترازنامه سناریوییِ متوازن برای کل دوره"),
    ("market_forecast", ("پیش‌بینی تقاضا", "تقاضای ده‌ساله", "تقاضای ۱۰ سال"), "جدول پیش‌بینی عددی تقاضا با فرمول، فرض رشد و نتیجه"),
)


def research_deliverables(base: list[dict[str, str]], source_rules: str) -> list[dict[str, str]]:
    """Promote data-heavy style-guide requirements into the research ledger."""
    result = [dict(item) for item in base]
    for key, markers, output in _GUIDELINE_RESEARCH:
        if any(marker in source_rules for marker in markers):
            result.append({"id": key, "question": output, "evidence": "منبع وب یا فرض سناریویی شفاف", "method": "محاسبهٔ انجام‌شده و قابل‌بازتولید", "output": output})
    return result


def evidence_issues(data: Any, deliverables: list[dict[str, str]], iran_required: bool = True) -> list[str]:
    if not isinstance(data, dict):
        return ["research/evidence.json must be a JSON object"]
    entries = data.get("deliverables")
    if not isinstance(entries, list):
        return ["deliverables must be an array"]
    expected = {item["id"] for item in deliverables}
    found = {item.get("id") for item in entries if isinstance(item, dict)}
    issues = [f"missing deliverable: {key}" for key in sorted(expected - found)]
    if len(found) != len(entries):
        issues.append("deliverable IDs must be unique")
    for entry in entries:
        if not isinstance(entry, dict):
            issues.append("deliverable entry must be an object")
            continue
        key = str(entry.get("id") or "<unknown>")
        if key == "<unknown>":
            issues.append("deliverable entry needs an id")
        # Later review can add supplementary findings. They still receive the
        # same field validation, while contractual IDs remain mandatory.
        status = entry.get("status")
        if status not in {"direct", "proxy", "assumption"}:
            issues.append(f"{key}: status must be direct, proxy, or assumption")
        iran = entry.get("iran_search")
        if iran_required and (not isinstance(iran, dict) or not isinstance(iran.get("queries"), list) or not iran["queries"] or not str(iran.get("finding") or "").strip()):
            issues.append(f"{key}: record Iranian search queries and finding")
        sources = entry.get("sources")
        if not isinstance(sources, list):
            issues.append(f"{key}: sources must be an array")
            sources = []
        for source in sources:
            if not isinstance(source, dict) or not all(str(source.get(field) or "").strip() for field in ("url", "title", "publisher", "geography", "retrieved_at", "extracted_fact")):
                issues.append(f"{key}: source lacks URL, identity, geography, retrieval date, or extracted fact")
                continue
            parsed = urlparse(str(source["url"]))
            if parsed.scheme not in {"http", "https"} or not parsed.netloc:
                issues.append(f"{key}: source URL is invalid")
        if status in {"direct", "proxy"} and not sources:
            issues.append(f"{key}: direct/proxy result needs an actual web source")
        if iran_required and status == "direct" and sources and not any("iran" in str(source.get("geography") or "").lower() or "ایران" in str(source.get("geography") or "") for source in sources if isinstance(source, dict)):
            issues.append(f"{key}: direct Iranian result has no Iranian source")
        if status == "proxy" and not str(entry.get("transfer_limit") or "").strip():
            issues.append(f"{key}: foreign or other-context proxy needs an explicit transfer limit")
        if status == "assumption" and not str(entry.get("failed_searches") or "").strip():
            issues.append(f"{key}: assumption needs documented unsuccessful web searches")
        if not str(entry.get("result") or "").strip() or not str(entry.get("method_executed") or "").strip():
            issues.append(f"{key}: provide an executed method and a concrete result")
        if any(phrase in str(entry.get("result") or "") for phrase in ("می‌توان بررسی کرد", "برای برآورد باید", "داده لازم برای")):
            issues.append(f"{key}: result is guidance rather than completed research")
        if not str(entry.get("limitations") or "").strip():
            issues.append(f"{key}: state limitations")
        if key not in {"problem_conclusion", "traceable_evidence"} and not str(entry.get("calculation_or_comparison") or "").strip():
            issues.append(f"{key}: provide a completed calculation or comparison")
    return issues


def run(context: dict[str, Any], services: Any) -> None:
    workspace: Path = services.workspace
    target = workspace / "research" / "evidence.json"
    report = workspace / "research" / "research_report.md"
    contract = deliverable_contract(context["order"])
    course_research = contract["project_type"] == "course_research"
    source_rules = context["artifacts"]["resolved_source_rules"]
    deliverables = research_deliverables(contract["deliverables"], (workspace / source_rules).read_text(encoding="utf-8"))
    order_contract = context["artifacts"]["order_execution_contract"]
    # Re-running this stage means re-checking current web evidence. Do not let
    # a valid-looking ledger from a previous execution satisfy the new run.
    for stale in (target, workspace / "research" / "analysis.md"):
        if stale.exists():
            previous = stale.with_name(stale.stem + ".previous" + stale.suffix)
            if not previous.exists():
                stale.replace(previous)
            else:
                stale.unlink()
    feedback = ""
    search_guidance = (
        "برای هر خروجی، منابع مستقیم و مرتبط با پرسش، درس و روش تحقیق را جست‌وجو و صفحهٔ منبع را باز کن. اگر سفارش محدودهٔ جغرافیایی مشخصی دارد، همان محدوده را رعایت کن؛ در موضوع بدون محدودهٔ جغرافیایی، پژوهش معتبر بین‌المللی نیز منبع مستقیم است. دادهٔ جانشین از زمینه‌ای متفاوت را با تفاوت زمینه و محدودیت تعمیم ثبت کن. منبع نظری یا روش‌شناختی را آمار میدانی معرفی نکن."
        if course_research else
        "برای تک‌تک خروجی‌ها، اول دادهٔ دقیق و هم‌موضوع ایران را جست‌وجو و صفحهٔ منبع را باز کن. اگر نبود، جست‌وجو را به دادهٔ معتبر کشور دیگر یا صنعت/فناوری نزدیک گسترش بده. جغرافیا، سال، واحد، تفاوت زمینه و محدودیت انتقال را ثبت کن. مثلاً اگر آمار کارخانه‌های پلی‌استر پلی‌ال ایران پیدا نشد، آمار کشور دیگر را با نام همان کشور و هشدار «دادهٔ ایران یافت نشد» استفاده کن؛ آن را به ایران نسبت نده. فقط اگر جست‌وجوی هر دو سطح نتیجه نداد، فرض طراحی شفاف با سناریو و روش محاسبه بساز. مجهول را مقدار مشاهده‌شده جا نزن."
    )
    analysis_guidance = (
        "پرسش پژوهش و روش اعلام‌شده در سفارش را بر شواهد اجرا کن: برای ادعای کمی، ورودی، فرمول، واحد و نتیجه را بیاور؛ برای ادعای نظری، معیار و نتیجهٔ مقایسهٔ مستدل را ثبت کن. مثال محاسباتی با دادهٔ فرضی را صریحاً از یافتهٔ تجربی جدا کن."
        if course_research else
        "تحقیق را به اجرای کار برسان: دادهٔ عددی را از متن/جدول صفحه استخراج کن، محاسبه یا مقایسه را با ورودی، فرمول، واحد و نتیجه انجام بده و برای هر خروجی انتخاب/نتیجه مشخص بده. هیچ بخشی را با شرح اینکه چگونه باید تحقیق، مکان‌یابی، ظرفیت‌سنجی، انتخاب تجهیزات یا اقتصادسنجی انجام شود تمام نکن. ادعای فراتحلیل تجربی بدون مطالعات و دادهٔ قابل‌تجمیع نکن."
    )
    proxy_guidance = ("برای status=proxy علت نبود منبع مستقیم و محدودیت تعمیم زمینهٔ جانشین روشن باشد." if course_research else "برای status=proxy باید علت نبود دادهٔ مستقیم ایران و محدودیت انتقال روشن باشد.")
    for attempt in range(1, 4):
        # A stale conversational report must never cause run_codex to skip a
        # missing or invalid evidence ledger on resume.
        if report.exists():
            report.unlink()
        prompt = f"""پژوهش واقعی سفارش «{context['order'].get('title')}» را اکنون انجام بده. قرارداد `{order_contract}`، قواعد منابع `{source_rules}` و فایل‌های ورودی را بخوان. ابزار جست‌وجو/مرور وب و در صورت لزوم بازیابی صفحات را به کار ببر؛ از حافظهٔ مدل، عنوان نتایج جست‌وجو یا متن سفارش به‌عنوان دادهٔ مشاهده‌شده استفاده نکن.

{search_guidance}

{analysis_guidance}

فایل `research/evidence.json` را با این ساختار بساز: {{"deliverables":[{{"id":"...","status":"direct|proxy|assumption","iran_search":{{"queries":["..."],"finding":"..."}},"failed_searches":"...","sources":[{{"url":"https://...","title":"...","publisher":"...","geography":"...","retrieved_at":"YYYY-MM-DD","extracted_fact":"عدد/واقعیت دقیق و واحد","source_year":"..."}}],"method_executed":"...","calculation_or_comparison":"ورودی‌ها، فرمول/معیار، نتیجه و واحد","result":"پاسخ مشخص","transfer_limit":"...","limitations":"..."}}]}}. هر id دقیقاً یک بار بیاید. {proxy_guidance} برای assumption جست‌وجوهای ناموفق را ثبت کن. URL ساختگی، منبعی که باز نکرده‌ای و اعداد بی‌منشأ ممنوع‌اند.

در `research/analysis.md` برای هر id جدول ورودی‌های استخراج‌شده، محاسبهٔ قابل‌بازتولید، نتیجه و محدودیت بنویس. همین فایل سند پژوهش انجام‌شده است، نه برنامهٔ کار. پاسخ نهایی کوتاه باشد.

خروجی‌های اجباری: {json.dumps(deliverables, ensure_ascii=False)}
{feedback}"""
        services.run_codex(prompt, report)
        try:
            data = json.loads(target.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            data = None
        issues = evidence_issues(data, deliverables, iran_required=not course_research)
        analysis = workspace / "research" / "analysis.md"
        if not analysis.is_file() or not analysis.read_text(encoding="utf-8").strip():
            issues.append("research/analysis.md is missing or empty")
        write_json(workspace / "reports" / "stage_checks" / "research_evidence.json", {"passed": not issues, "attempt": attempt, "issues": issues})
        if not issues:
            context["artifacts"]["research_evidence"] = str(target.relative_to(workspace))
            context["artifacts"]["research_analysis"] = str(analysis.relative_to(workspace))
            return
        feedback = "\nخطاهای اعتبارسنجی دور قبل را با پژوهش و اصلاح خود فایل‌ها برطرف کن:\n" + "\n".join("- " + issue for issue in issues)
    raise RuntimeError("Web research lacks executed, traceable evidence: " + "; ".join(issues[:6]))
