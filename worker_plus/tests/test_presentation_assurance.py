from copy import deepcopy
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest

from presentation.assurance import source_topics, validate_claim_ledger, validate_slide_claims
from presentation import workflow
from presentation.recovery import PresentationAuditError


class PresentationAssuranceTests(unittest.TestCase):
    def setUp(self):
        self.sources = {"sources": [{"id": "S1", "segments": [
            {"id": "S1:block-1", "pages": [7], "text": "بازار محصول در این بررسی با واردات ۱۰۰ تن در سال ۲۰۲۴ به عنوان داده جانشین سنجیده شد؛ این رقم مصرف واقعی محصول نیست."},
            {"id": "S1:block-2", "pages": [12], "text": "ظرفیت نظری با حجم ۱۲ مترمکعب، ضریب پرشدگی ۰٫۷۵ و چگالی ۱٫۱۵ تن بر مترمکعب محاسبه می‌شود و به زمان چرخه وابسته است."},
            {"id": "S1:block-3", "pages": [16], "text": "اقتصاد طرح در سناریوی فرضی، NPV مثبت ۲٫۵۶ میلیون دلار را گزارش می‌کند؛ داده کامل جریان نقدی و مالیات برای اعتبارسنجی موجود نیست."},
        ]}]}
        self.topics = {"market": ["S1:block-1"], "capacity": ["S1:block-2"], "economics": ["S1:block-3"]}
        self.ledger = {"claims": [
            {"id": "C1", "topic": "market", "kind": "observed", "market_basis": "proxy", "statement": "واردات جانشین ۱۰۰ تن در سال ۲۰۲۴ ثبت شده است.",
             "evidence": {"locator": "S1:block-1", "quote": "واردات ۱۰۰ تن در سال ۲۰۲۴ به عنوان داده جانشین سنجیده شد"}, "confidence": "medium",
             "limitation": "واردات، مصرف محصول هدف نیست"},
            {"id": "C2", "topic": "capacity", "kind": "calculated", "capacity_basis": "theoretical", "statement": "ظرفیت نظری یک بچ ۱۰٫۳۵ تن است.",
             "evidence": {"locator": "S1:block-2", "quote": "ظرفیت نظری با حجم ۱۲ مترمکعب، ضریب پرشدگی ۰٫۷۵ و چگالی ۱٫۱۵ تن بر مترمکعب محاسبه می‌شود"},
             "value": 10.35, "unit": "تن", "formula": "volume * fill * density", "confidence": "medium",
             "assumptions": ["ضریب پرشدگی و چگالی فرض طراحی هستند"],
             "inputs": [{"name": name, "value": value, "unit": unit,
                         "evidence": {"locator": "S1:block-2", "quote": quote}} for name, value, unit, quote in [
                             ("volume", 12, "مترمکعب", "حجم ۱۲ مترمکعب"),
                             ("fill", .75, "نسبت", "ضریب پرشدگی ۰٫۷۵"),
                             ("density", 1.15, "تن/مترمکعب", "چگالی ۱٫۱۵ تن بر مترمکعب")]]},
            {"id": "C3", "topic": "economics", "kind": "scenario", "statement": "NPV سناریویی ۲٫۵۶ میلیون دلار است.",
             "evidence": {"locator": "S1:block-3", "quote": "در سناریوی فرضی، NPV مثبت ۲٫۵۶ میلیون دلار را گزارش می‌کند"},
             "confidence": "low", "assumptions": ["سناریوی فرضی اقتصاد"], "limitation": "مدل کامل جریان نقدی وجود ندارد"},
        ]}

    def test_claims_keep_real_pages_and_reproduce_arithmetic(self):
        result = validate_claim_ledger(self.ledger, self.sources, self.topics)
        self.assertEqual([7], result["claims"][0]["evidence"]["pages"])
        self.assertAlmostEqual(10.35, result["claims"][1]["reproduced_value"])
        self.assertEqual("scenario", result["claims"][2]["kind"])

    def test_targeted_claim_repair_preserves_previous_fixes_and_healthy_claims(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            candidate = deepcopy(self.ledger)
            candidate["claims"][0]["evidence"] = {
                "locator": "S1:block-2", "quote": "ظرفیت نظری با حجم ۱۲ مترمکعب"}
            candidate["claims"][1]["value"] = 12
            healthy = deepcopy(candidate["claims"][2])
            prompts = []

            def response(prompt, target):
                prompts.append(prompt)
                identifier = "C1" if "C1: evidence does not address topic market" in prompt else "C2"
                target.write_text(json.dumps({"claim": self.ledger["claims"][int(identifier[1:]) - 1]}, ensure_ascii=False), encoding="utf-8")

            repaired = workflow.repair_claim_ledger(
                SimpleNamespace(workspace=root, run_codex=response), candidate, self.sources, self.topics)
            self.assertEqual(2, len(prompts))
            self.assertEqual(healthy["statement"], repaired["claims"][2]["statement"])
            self.assertEqual(healthy["evidence"]["locator"], repaired["claims"][2]["evidence"]["locator"])
            self.assertEqual("S1:block-1", repaired["claims"][0]["evidence"]["locator"])
            self.assertAlmostEqual(10.35, repaired["claims"][1]["reproduced_value"])

    def test_wrong_arithmetic_missing_topic_and_unqualified_finance_fail(self):
        wrong = deepcopy(self.ledger)
        wrong["claims"][1]["value"] = 12
        with self.assertRaisesRegex(ValueError, "does not reproduce"):
            validate_claim_ledger(wrong, self.sources, self.topics)
        unsafe = deepcopy(self.ledger)
        unsafe["claims"][1]["formula"] = "__import__('os').system('echo unsafe')"
        with self.assertRaisesRegex(ValueError, "unsupported operation"):
            validate_claim_ledger(unsafe, self.sources, self.topics)
        missing = deepcopy(self.ledger)
        missing["claims"].pop()
        with self.assertRaisesRegex(ValueError, "omits source subjects"):
            validate_claim_ledger(missing, self.sources, self.topics)
        overconfident = deepcopy(self.ledger)
        overconfident["claims"][2]["kind"] = "observed"
        with self.assertRaisesRegex(ValueError, "scenario or gap"):
            validate_claim_ledger(overconfident, self.sources, self.topics)

    def test_slide_coverage_and_visible_qualification(self):
        ledger = validate_claim_ledger(self.ledger, self.sources, self.topics)
        slides = {"slides": [
            {"section": "title", "title": "موضوع", "claim_ids": [], "evidence": []},
            {"section": "problem", "title": "شاخص جانشین بازار", "points": ["واردات ۱۰۰ تن در سال ۲۰۲۴ ثبت شد"],
             "claim_ids": ["C1"], "evidence": [{"locator": "S1:block-1"}]},
            {"section": "results", "title": "ظرفیت نظری بر اساس مفروضات", "points": ["هر بچ ۱۰٫۳۵ تن است"],
             "claim_ids": ["C2"], "evidence": [{"locator": "S1:block-2"}]},
            {"section": "results", "title": "ارزیابی اقتصادی سناریویی", "points": ["NPV بر اساس فرض‌های منبع مثبت است"],
             "claim_ids": ["C3"], "evidence": [{"locator": "S1:block-3"}]},
        ]}
        self.assertEqual(3, len(validate_slide_claims(slides, ledger, {})["covered_topics"]))
        slides["slides"][3]["title"] = "ارزیابی اقتصادی"
        slides["slides"][3]["points"] = ["NPV مثبت است"]
        with self.assertRaisesRegex(ValueError, "needs a visible qualification"):
            validate_slide_claims(slides, ledger, {})
        slides["slides"][3]["title"] = "طرح سودآور است"
        slides["slides"][3]["points"] = ["NPV در سناریوی فرضی مثبت است"]
        with self.assertRaisesRegex(ValueError, "title overstates"):
            validate_slide_claims(slides, ledger, {})

    def test_npv_needs_complete_sourced_cashflows_and_is_recomputed(self):
        parts = ["اقتصاد طرح: CAPEX ۱۰ میلیون دلار", "OPEX ۲ میلیون دلار", "هزینه ثابت ۱ میلیون دلار",
                 "هزینه متغیر ۲ میلیون دلار", "قیمت فروش ۵ دلار", "حجم تولید ۱۰۰ تن",
                 "سرمایه در گردش ۳ میلیون دلار", "مالیات ۲۰ درصد", "استهلاک ۱ میلیون دلار",
                 "دوره ساخت ۰ سال", "نرخ تنزیل ۱۰ درصد", "سال ۰: -۱۰ میلیون دلار",
                 "سال ۱: ۷ میلیون دلار", "سال ۲: ۷ میلیون دلار", "NPV برابر ۲٫۱۵ میلیون دلار"]
        sources = {"sources": [{"id": "S1", "segments": [{"id": "S1:block-1", "pages": [4], "text": ". ".join(parts)}]}]}
        labels = ["capex", "opex", "fixed_cost", "variable_cost", "selling_price", "production_volume",
                  "working_capital", "tax", "depreciation", "construction_period", "discount_rate"]
        values = [10, 2, 1, 2, 5, 100, 3, 20, 1, 0, 10]
        model = {key: {"value": number, "unit": "%" if key in {"tax", "discount_rate"} else "سال" if key == "construction_period" else "تن" if key == "production_volume" else "دلار" if key == "selling_price" else "میلیون دلار",
                       "evidence": {"locator": "S1:block-1", "quote": parts[index]}}
                 for index, (key, number) in enumerate(zip(labels, values))}
        model["cash_flows"] = [{"year": year, "amount": amount,
                                "evidence": {"locator": "S1:block-1", "quote": parts[11 + year]}}
                               for year, amount in enumerate([-10, 7, 7])]
        claim = {"id": "C1", "topic": "economics", "kind": "calculated", "metric": "NPV",
                 "statement": "NPV محاسبه‌شده ۲٫۱۵ میلیون دلار است.", "value": 2.15, "unit": "میلیون دلار",
                 "evidence": {"locator": "S1:block-1", "quote": parts[-1]},
                 "confidence": "medium", "assumptions": ["جریان نقدی سال‌های ۰ تا ۲ و تنزیل ۱۰ درصد"]}
        with self.assertRaisesRegex(ValueError, "complete financial_model"):
            validate_claim_ledger({"claims": [claim]}, sources, {"economics": ["S1:block-1"]})
        incomplete = deepcopy(claim)
        incomplete["financial_model"] = deepcopy(model)
        del incomplete["financial_model"]["working_capital"]
        with self.assertRaisesRegex(ValueError, "working_capital"):
            validate_claim_ledger({"claims": [incomplete]}, sources, {"economics": ["S1:block-1"]})
        claim["financial_model"] = model
        self.assertAlmostEqual(2.1487603, validate_claim_ledger({"claims": [claim]}, sources, {"economics": ["S1:block-1"]})["claims"][0]["reproduced_value"], places=5)
        claim["value"] = 2.56
        with self.assertRaisesRegex(ValueError, "does not reproduce"):
            validate_claim_ledger({"claims": [claim]}, sources, {"economics": ["S1:block-1"]})

    def test_new_content_audit_cannot_pass_without_every_slide_reviewed(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "reports").mkdir()
            for name, data in [
                ("planning/presentation_contract.json", {"slide_count": 2, "evidence_policy_version": 2}),
                ("extracted/presentation_sources.json", {"sources": []}),
                ("final/presentation.json", {"slides": []}),
            ]:
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(json.dumps(data), encoding="utf-8")
            def response(_prompt, target):
                target.write_text('STATUS: PASS\nISSUES_JSON: {"reviewed_slides":[1],"issues":[]}', encoding="utf-8")
            with self.assertRaises(PresentationAuditError):
                workflow.audit(SimpleNamespace(workspace=root, run_codex=response), "presentation_content_audit.md", "check")
            self.assertIn("Invalid full-slide audit", (root / "reports/presentation_content_audit.md").read_text(encoding="utf-8"))

    def test_evidence_and_outline_stages_require_source_topic_coverage(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            sources = {"sources": [{"id": "S1", "name": "source.txt", "sha256": "fixture",
                                    "segments": [{"id": "S1:block-1", "pages": [2],
                                                  "text": "روش پژوهش با مقایسه زمان اجرای روش الف ۱۰ دقیقه و روش ب ۲۰ دقیقه در یک آزمایش گزارش شده است."}],
                                    "images": []}]}
            contract = {"slide_count": 3, "evidence_policy_version": 2}
            for name, value in [("extracted/presentation_sources.json", sources),
                                ("planning/presentation_contract.json", contract)]:
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(json.dumps(value), encoding="utf-8")
            ledger_response = {"claims": [{"id": "C1", "topic": "method", "kind": "observed",
                                           "statement": "روش الف ۱۰ دقیقه و روش ب ۲۰ دقیقه زمان برده‌اند.",
                                           "evidence": {"locator": "S1:block-1", "quote": "روش الف ۱۰ دقیقه و روش ب ۲۰ دقیقه"},
                                           "confidence": "medium", "assumptions": []}]}
            outline_response = {"slides": [
                {"section": "title", "claim_ids": []},
                {"section": "method", "claim_ids": ["C1"]},
                {"section": "conclusion", "claim_ids": ["C1"]},
            ]}
            def response(_prompt, target):
                value = ledger_response if target.stem.startswith("presentation_claims") else outline_response
                target.write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")
            services = SimpleNamespace(workspace=root, run_codex=response)
            context = {"artifacts": {}}
            workflow.evidence(context, services)
            self.assertEqual("planning/presentation_claims.json", context["artifacts"]["presentation_claims"])
            workflow.plan(context, services)
            self.assertEqual(3, len(json.loads((root / "planning/presentation_outline.json").read_text(encoding="utf-8"))["slides"]))
            outline_response["slides"][1]["claim_ids"] = []
            outline_response["slides"][2]["claim_ids"] = []
            with self.assertRaisesRegex(ValueError, "omits source topics"):
                workflow.plan(context, services)


if __name__ == "__main__":
    unittest.main()
