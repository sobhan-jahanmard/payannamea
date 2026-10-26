from copy import deepcopy
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest

from presentation.analysis import (calculated_numbers, required_categories, validate_packet,
                                   validate_slide_coverage, write_slide_validation)
from presentation.deck import validate_spec
from presentation import workflow


class PresentationAnalysisTests(unittest.TestCase):
    def setUp(self):
        texts = [
            "انتخاب فناوری با معیار کیفیت وزن ۶۰٪ و ایمنی وزن ۴۰٪ انجام شد. گزینه الف کیفیت ۵ و ایمنی ۲؛ گزینه ب کیفیت ۴ و ایمنی ۴ دارد.",
            "موازنه جرم: خوراک ۱۰۰ تن، خروجی ۸۰ تن و اتلاف ۲۰ تن است. خوراک سناریویی ۱۰۰ تن در سال است.",
            "اقتصاد طرح NPV اولیه ۲٫۵۶ میلیون دلار دارد، اما زمان ساخت ۱۷ ماه و جدول جریان نقدی سالانه ارائه نشده است.",
            "آستانه سرمایه‌گذاری پیشنهادی ۳۵۰۰ تن پیش‌فروش است؛ مبنای آماری فروش موجود نیست.",
        ]
        self.sources = {"sources": [{"id": "S1", "segments": [
            {"id": f"S1:block-{i}", "pages": [i], "text": text} for i, text in enumerate(texts, 1)
        ]}]}
        self.topics = {"technology": ["S1:block-1"], "feedstock": ["S1:block-2"],
                       "capacity": ["S1:block-2"], "economics": ["S1:block-3"],
                       "market": ["S1:block-4"]}

    def ref(self, number):
        segment = self.sources["sources"][0]["segments"][number - 1]
        return {"locator": segment["id"], "quote": segment["text"]}

    def packet(self):
        matrix = {
            "criteria": [{"name": "کیفیت", "weight": .6, "evidence": self.ref(1)},
                         {"name": "ایمنی", "weight": .4, "evidence": self.ref(1)}],
            "alternatives": [{"name": "الف", "scores": [{"value": 5, "evidence": self.ref(1)},
                                                     {"value": 2, "evidence": self.ref(1)}]},
                             {"name": "ب", "scores": [{"value": 4, "evidence": self.ref(1)},
                                                   {"value": 4, "evidence": self.ref(1)}]}],
        }
        mass_calc = {"name": "feed", "value": 100, "unit": "تن", "formula": "target",
                     "inputs": [{"name": "target", "value": 100, "unit": "تن", "evidence": self.ref(2)}]}
        return {"version": 1, "items": [
            {"id": "A1", "category": "technology_matrix", "status": "complete", "evidence": [self.ref(1)], "matrix": matrix},
            {"id": "A2", "category": "mass_balance", "status": "complete", "evidence": [self.ref(2)],
             "calculations": [mass_calc], "flows": [
                 {"name": "خوراک", "role": "input", "value": 100, "unit": "تن", "calculation": "feed"},
                 {"name": "محصول", "role": "output", "value": 80, "unit": "تن", "evidence": self.ref(2)},
                 {"name": "اتلاف", "role": "loss", "value": 20, "unit": "تن", "evidence": self.ref(2)}]},
            {"id": "A3", "category": "financial_model", "status": "partial", "evidence": [self.ref(3)],
             "missing": ["جریان نقدی سالانه", "زمان پرداخت CAPEX"],
             "reported_metrics": [{"name": "NPV", "value": 2.56, "evidence": self.ref(3)}]},
            {"id": "A4", "category": "investment_thresholds", "status": "complete", "evidence": [self.ref(4)],
             "thresholds": [{"label": "پیش‌فروش", "value": 3500, "unit": "تن", "basis": "proposed",
                             "evidence": self.ref(4)}]},
        ]}

    def test_matrix_mass_finance_and_thresholds_are_validated(self):
        result = validate_packet(self.packet(), self.sources, self.topics)
        matrix = result["items"][0]["matrix"]
        self.assertAlmostEqual(3.8, matrix["totals"]["الف"])
        self.assertAlmostEqual(4.0, matrix["totals"]["ب"])
        self.assertEqual("ب", matrix["winner"])
        self.assertAlmostEqual(0, result["items"][1]["mass_balance"]["residual"])
        self.assertFalse(result["items"][2]["financial_analysis"]["verified"])
        self.assertEqual("initial_unverified", result["items"][2]["financial_analysis"]["reported_metrics"][0]["classification"])
        self.assertIn(4.0, calculated_numbers(result, ["A1"]))

    def test_bad_matrix_mass_and_missing_financial_inputs_fail(self):
        bad = self.packet()
        bad["items"][0]["matrix"]["criteria"][0]["weight"] = .4
        with self.assertRaisesRegex(ValueError, "weights must sum"):
            validate_packet(bad, self.sources, self.topics)
        bad = self.packet()
        bad["items"][1]["flows"][2]["value"] = 100
        with self.assertRaisesRegex(ValueError, "does not close"):
            validate_packet(bad, self.sources, self.topics)
        bad = self.packet()
        bad["items"][2]["status"] = "complete"
        bad["items"][2]["missing"] = []
        with self.assertRaisesRegex(ValueError, "annual cash flows"):
            validate_packet(bad, self.sources, self.topics)
        bad = self.packet()
        bad["items"][1]["calculations"][0]["formula"] = "target * 0.8"
        bad["items"][1]["calculations"][0]["value"] = 80
        with self.assertRaisesRegex(ValueError, "formula constant"):
            validate_packet(bad, self.sources, self.topics)
        bad = self.packet()
        bad["items"][0]["evidence"] = [self.ref(3)]
        with self.assertRaisesRegex(ValueError, "does not address technology_matrix"):
            validate_packet(bad, self.sources, self.topics)

    def test_complete_financial_model_reproduces_npv_and_irr(self):
        quote = ("مدل مالی با دوره ساخت ۰ ماه، CAPEX کل ۱۰ و نرخ تنزیل ۱۰٪: "
                 "سال ۰ درآمد ۰، OPEX ۰، مالیات ۰، CAPEX ۱۰، تغییر سرمایه در گردش ۰، جریان خالص -۱۰؛ "
                 "سال ۱ درآمد ۷، OPEX ۰، مالیات ۰، CAPEX ۰، تغییر سرمایه در گردش ۰، جریان خالص ۷؛ "
                 "سال ۲ درآمد ۷، OPEX ۰، مالیات ۰، CAPEX ۰، تغییر سرمایه در گردش ۰، جریان خالص ۷. "
                 "NPV برابر ۲٫۱۵ و IRR برابر ۲۵٫۶۹٪ گزارش شد.")
        sources = {"sources": [{"id": "S1", "segments": [{"id": "S1:block-1", "pages": [1], "text": quote}]}]}
        ref = {"locator": "S1:block-1", "quote": quote}
        fields = ("revenue", "opex", "tax", "capex", "working_capital_delta", "net")
        rows = []
        for year, values in enumerate(((0, 0, 0, 10, 0, -10),
                                       (7, 0, 0, 0, 0, 7),
                                       (7, 0, 0, 0, 0, 7))):
            rows.append({"year": year, **dict(zip(fields, values)),
                         "evidence": {field: ref for field in fields}})
        item = {"id": "A1", "category": "financial_model", "status": "complete", "evidence": [ref],
                "annual_cash_flows": rows,
                "construction_period": {"months": 0, "evidence": ref},
                "capex_total": {"value": 10, "evidence": ref},
                "discount_rate": {"value": 10, "evidence": ref},
                "reported_metrics": [{"name": "NPV", "value": 2.15, "evidence": ref},
                                     {"name": "IRR", "value": 25.69, "evidence": ref}]}
        packet = {"version": 1, "items": [item]}
        verified = validate_packet(packet, sources, {"economics": ["S1:block-1"]})
        self.assertTrue(verified["items"][0]["financial_analysis"]["verified"])
        self.assertAlmostEqual(2.14876, verified["items"][0]["financial_analysis"]["reproduced_npv"], places=4)
        broken = deepcopy(packet)
        broken["items"][0]["reported_metrics"][0]["value"] = 7
        with self.assertRaisesRegex(ValueError, "reported NPV does not reproduce"):
            validate_packet(broken, sources, {"economics": ["S1:block-1"]})

    def test_every_analysis_requires_a_qualified_slide_and_report(self):
        packet = validate_packet(self.packet(), self.sources, self.topics)
        spec = {"slides": [
            {"title": "قضاوت مقدماتی فناوری", "points": ["کیفیت و ایمنی: الف ۳٫۸، ب ۴٫۰؛ حساسیت وزن بررسی شد؛ امتیازها فرض طراحی‌اند"],
             "analysis_ids": ["A1"], "evidence": [self.ref(1)]},
            {"title": "محاسبه موازنه", "points": ["موازنه از فرض خوراک برآمده است"],
             "analysis_ids": ["A2"], "evidence": [self.ref(2)]},
            {"title": "NPV تأییدنشده", "points": ["جریان نقدی سالانه نامشخص است"],
             "analysis_ids": ["A3"], "evidence": [self.ref(3)]},
            {"title": "پیش‌فروش پیشنهادی", "points": ["نیازمند قرارداد است"],
             "analysis_ids": ["A4"], "evidence": [self.ref(4)]},
        ]}
        self.assertEqual(4, len(validate_slide_coverage(spec, packet)["covered"]))
        spec["slides"][2]["title"] = "NPV مثبت است"
        spec["slides"][2]["points"] = ["طرح سودآور است"]
        with self.assertRaisesRegex(ValueError, "visible uncertainty"):
            validate_slide_coverage(spec, packet)
        spec["slides"][2]["title"] = "NPV تأییدنشده"
        with TemporaryDirectory() as folder:
            write_slide_validation(Path(folder), spec, packet, {"claims": []}, self.sources)
            self.assertTrue((Path(folder) / "reports/presentation_slide_validation.csv").is_file())
            self.assertEqual(5, len((Path(folder) / "reports/presentation_slide_validation.csv").read_text(encoding="utf-8-sig").splitlines()))

    def test_new_order_evidence_stage_creates_analysis_packet(self):
        # The new gate is additive. Existing v2 workspaces without the contract
        # flag retain their earlier behavior.
        with TemporaryDirectory() as folder:
            root = Path(folder)
            sources = {"sources": [{"id": "S1", "name": "source.txt", "sha256": "fixture",
                                    "segments": [{"id": "S1:block-1", "pages": [1],
                                                  "text": "اقتصاد طرح NPV اولیه ۲٫۵۶ میلیون دلار دارد، اما جدول جریان نقدی سالانه موجود نیست."}],
                                    "images": []}]}
            for filename, value in (("extracted/presentation_sources.json", sources),
                                    ("planning/presentation_contract.json", {"evidence_policy_version": 2,
                                                                               "analytical_assurance_version": 1,
                                                                               "slide_count": 2})):
                path = root / filename
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")
            claim = {"claims": [{"id": "C1", "topic": "economics", "kind": "scenario",
                                 "statement": "NPV اولیه ۲٫۵۶ میلیون دلار گزارش شده است.",
                                 "evidence": {"locator": "S1:block-1", "quote": sources["sources"][0]["segments"][0]["text"]},
                                 "confidence": "low", "assumptions": ["مدل اولیه"], "limitation": "جریان سالانه ناموجود"}]}
            packet = {"version": 1, "items": [{"id": "A1", "category": "financial_model", "status": "partial",
                                               "evidence": [{"locator": "S1:block-1", "quote": sources["sources"][0]["segments"][0]["text"]}],
                                               "missing": ["جریان نقدی سالانه"],
                                               "reported_metrics": [{"name": "NPV", "value": 2.56,
                                                                     "evidence": {"locator": "S1:block-1", "quote": sources["sources"][0]["segments"][0]["text"]}}]}]}
            def response(_prompt, target):
                target.write_text(json.dumps(packet if "analysis" in target.stem else claim, ensure_ascii=False), encoding="utf-8")
            context = {"artifacts": {}}
            workflow.evidence(context, SimpleNamespace(workspace=root, run_codex=response))
            self.assertTrue((root / "planning/presentation_analysis.json").is_file())

    def test_deck_accepts_only_linked_reproduced_matrix_totals(self):
        sources = {"sources": [{"id": "S1", "name": "source.txt", "images": [], "segments": [{
            "id": "S1:block-1", "pages": [1], "text":
            "انتخاب فناوری با معیار کیفیت وزن ۶۰٪ و ایمنی وزن ۴۰٪ انجام شد. گزینه الف کیفیت ۵ و ایمنی ۲؛ گزینه ب کیفیت ۴ و ایمنی ۴ دارد."}]}]}
        ref = {"locator": "S1:block-1", "quote": sources["sources"][0]["segments"][0]["text"]}
        matrix = {"version": 1, "items": [{"id": "A1", "category": "technology_matrix", "status": "complete",
            "evidence": [ref], "matrix": {"criteria": [
                {"name": "کیفیت", "weight": .6, "evidence": ref},
                {"name": "ایمنی", "weight": .4, "evidence": ref}], "alternatives": [
                {"name": "الف", "scores": [{"value": 5, "evidence": ref}, {"value": 2, "evidence": ref}]},
                {"name": "ب", "scores": [{"value": 4, "evidence": ref}, {"value": 4, "evidence": ref}]}]}}]}
        contract = {"slide_count": 2, "sections": ["title", "results"], "max_points": 4,
                    "max_body_words": 65, "analytical_assurance_version": 1}
        deck = {"slides": [
            {"section": "title", "layout": "title", "title": "مقایسه فناوری", "points": [], "notes": "جلد"},
            {"section": "results", "layout": "statement", "title": "قضاوت مقدماتی فناوری",
             "points": ["کیفیت و ایمنی: الف ۳٫۸، ب ۴٫۰؛ حساسیت وزن بررسی شد؛ امتیازها فرضی‌اند"], "notes": "جمع وزن‌دار بر پایه منبع",
             "evidence": [ref], "analysis_ids": ["A1"]}]}
        with TemporaryDirectory() as folder:
            root = Path(folder)
            path = root / "planning/presentation_analysis.json"
            path.parent.mkdir(parents=True)
            path.write_text(json.dumps(matrix, ensure_ascii=False), encoding="utf-8")
            validate_spec(deck, contract, sources, root)
            deck["slides"][1]["points"] = ["کیفیت و ایمنی: الف ۳٫۸، ب ۴٫۰؛ حساسیت وزن بررسی شد؛ امتیازها فرضی‌اند؛ شاخص ۹٫۹"]
            with self.assertRaisesRegex(ValueError, "numbers lack evidence"):
                validate_spec(deck, contract, sources, root)
            deck["slides"][1]["analysis_ids"] = []
            with self.assertRaisesRegex(ValueError, "omits analytical items"):
                validate_spec(deck, contract, sources, root)


if __name__ == "__main__":
    unittest.main()
