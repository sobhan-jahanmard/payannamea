import importlib
import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from common.runner import STEPS, is_deferred_service_error, recovery_start, selected_workspace


class ResearchEvidenceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.stage = importlib.import_module("common.steps.05c_research_evidence")
        self.deliverables = [{"id": "market_demand"}]
        self.entry = {
            "id": "market_demand",
            "status": "proxy",
            "iran_search": {"queries": ["Iran polyester polyol capacity"], "finding": "No comparable Iranian figure found"},
            "sources": [{"url": "https://example.org/report", "title": "Industry report", "publisher": "Agency", "geography": "Germany", "retrieved_at": "2026-10-18", "extracted_fact": "1000 tonnes/year", "source_year": "2024"}],
            "method_executed": "Compared capacity scenarios",
            "calculation_or_comparison": "1000 x 0.1 = 100 tonnes/year",
            "result": "100 tonnes/year base case",
            "transfer_limit": "German supply is not an Iranian observation",
            "limitations": "Indicative scenario only",
        }

    def test_proxy_needs_source_and_transfer_disclosure(self) -> None:
        self.assertEqual([], self.stage.evidence_issues({"deliverables": [self.entry]}, self.deliverables))
        self.entry["sources"] = []
        self.entry["transfer_limit"] = ""
        issues = self.stage.evidence_issues({"deliverables": [self.entry]}, self.deliverables)
        self.assertTrue(any("actual web source" in issue for issue in issues))
        self.assertTrue(any("transfer limit" in issue for issue in issues))

    def test_guidance_without_executed_result_fails(self) -> None:
        self.entry["result"] = ""
        self.entry["calculation_or_comparison"] = ""
        issues = self.stage.evidence_issues({"deliverables": [self.entry]}, self.deliverables)
        self.assertTrue(any("concrete result" in issue for issue in issues))
        self.assertTrue(any("completed calculation" in issue for issue in issues))

    def test_course_research_accepts_direct_international_evidence(self) -> None:
        entry = dict(self.entry, id="method_application", status="direct", transfer_limit="")
        entry.pop("iran_search")
        deliverables = [{"id": "method_application"}]
        self.assertEqual([], self.stage.evidence_issues({"deliverables": [entry]}, deliverables, iran_required=False))
        self.assertTrue(self.stage.evidence_issues({"deliverables": [entry]}, deliverables, iran_required=True))

    def test_supplementary_research_does_not_replace_required_ids(self) -> None:
        extra = dict(self.entry, id="extra_context")
        issues = self.stage.evidence_issues({"deliverables": [extra]}, self.deliverables)
        self.assertTrue(any("missing deliverable: market_demand" in issue for issue in issues))
        self.assertFalse(any("unexpected deliverable" in issue for issue in issues))

    def test_style_guide_financial_statements_join_research_ledger(self) -> None:
        deliverables = self.stage.research_deliverables(self.deliverables, "صورت سود و زیان، جریان نقد و ترازنامه برای کل دوره")
        self.assertEqual({"market_demand", "income_statement", "cash_flow", "balance_sheet"}, {item["id"] for item in deliverables})

    def test_electron_stage_registry_matches_python(self) -> None:
        registry = json.loads((Path(__file__).resolve().parents[1] / "common" / "stages.json").read_text(encoding="utf-8"))
        self.assertEqual(STEPS, [stage["id"] for stage in registry])
        self.assertEqual("05c_research_evidence", STEPS[8])

    def test_resume_selects_active_workspace_shown_by_electron(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            active = root / "runs" / "current"
            active.mkdir(parents=True)
            (active / "order_context.json").write_text("{}", encoding="utf-8")
            (root / "active.json").write_text('{"path":"runs/current"}', encoding="utf-8")
            self.assertEqual(active, selected_workspace(root, True))
            self.assertEqual(root / "in_progress", selected_workspace(root, False))
            (root / "active.json").write_text('{"path":"../outside"}', encoding="utf-8")
            self.assertEqual(root / "in_progress", selected_workspace(root, True))

    def test_interim_reports_split_completed_chapters(self) -> None:
        stage = importlib.import_module("common.steps.09c_package_interim_reports")
        source = "# چکیده\nمتن\n# فهرست مطالب\n- فصل\n# ۱. آغاز\nداده یک\n# ۲. فنی\nداده دو\n# منابع\n[1] منبع"
        abstract, chapters, references = stage.split_chapters(source)
        self.assertNotIn("فهرست مطالب", abstract)
        self.assertIn("داده یک", chapters[1])
        self.assertIn("داده دو", chapters[2])
        self.assertIn("منبع", references)

    def test_interim_reports_follow_actual_chapter_topics(self) -> None:
        stage = importlib.import_module("common.steps.09c_package_interim_reports")
        chapters = {
            1: "# ۱. تعریف مسئله\nمتن",
            2: "# ۲. تحلیل بازار\nمتن",
            3: "# ۳. طراحی فرایند\nمتن",
            4: "# ۴. تحلیل مالی و اقتصادی\nمتن",
            5: "# ۵. نتیجه‌گیری\nمتن",
        }
        self.assertEqual(((1,), (2, 3), (4, 5)), stage.report_chapter_groups(chapters))

    def test_course_interim_reports_do_not_require_market_or_finance_chapters(self) -> None:
        stage = importlib.import_module("common.steps.09c_package_interim_reports")
        source = "# چکیده\nخلاصه\n# ۱ مسئله\nمتن\n# ۲ روش\nمتن\n# ۳ یافته‌ها\nمتن\n# ۴ نتیجه\nمتن\n# منابع\n[1] منبع"
        _, chapters, _ = stage.split_chapters(source)
        self.assertEqual(((1, 2), (3,), (4,)), stage.report_chapter_groups(chapters, research_report=True))

    def test_credit_and_auth_errors_pause_instead_of_retrying(self) -> None:
        self.assertTrue(is_deferred_service_error(RuntimeError("Your workspace is out of credits")))
        self.assertTrue(is_deferred_service_error(RuntimeError("401 Unauthorized: Missing bearer or basic authentication")))

    def test_failed_visual_audit_restarts_at_visual_plan(self) -> None:
        start = recovery_start("10_validate_and_publish", RuntimeError("AI visual quality audit failed; publication is blocked"))
        self.assertEqual("06a_plan_visuals", STEPS[start])

    def test_missing_research_id_restarts_research(self) -> None:
        start = recovery_start("08_review_content", RuntimeError("Decision-content quality gate failed: missing deliverable: balance_sheet"))
        self.assertEqual("05c_research_evidence", STEPS[start])


if __name__ == "__main__":
    unittest.main()
