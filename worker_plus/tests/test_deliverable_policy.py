from __future__ import annotations

import unittest

from common.deliverable_policy import (
    classify_project,
    deliverable_contract,
    deterministic_content_issues,
    heading_duplicates,
)


class DeliverablePolicyTests(unittest.TestCase):
    def test_factory_design_is_detected_from_title(self) -> None:
        order = {"title": "پروژه طراحی ایجاد کارخانه تولید رزین", "degree": "کارشناسی"}
        self.assertEqual(classify_project(order), "factory_design")
        ids = {item["id"] for item in deliverable_contract(order)["deliverables"]}
        self.assertTrue({"market_demand", "technology_selection", "capacity_equipment", "layout"} <= ids)

    def test_unrelated_research_does_not_receive_factory_deliverables(self) -> None:
        order = {"title": "بررسی سبک‌های یادگیری دانشجویان", "order_type": "تحقیق دانشگاهی"}
        contract = deliverable_contract(order)
        self.assertEqual(contract["project_type"], "academic_research")
        self.assertNotIn("layout", {item["id"] for item in contract["deliverables"]})

    def test_guidance_instead_of_execution_fails(self) -> None:
        order = {"title": "امکان‌سنجی کارخانه محصول نمونه"}
        issues = deterministic_content_issues(
            "# بازار\nبرای برآورد باید مشتریان بررسی شوند.\n# فناوری\nفناوری‌ها معرفی می‌شوند.",
            deliverable_contract(order),
        )
        self.assertTrue(any("راهنماگونه" in issue for issue in issues))
        self.assertTrue(any("market_demand" in issue for issue in issues))
        self.assertTrue(any("technology_selection" in issue for issue in issues))

    def test_factory_evidence_markers_pass_deterministic_checks(self) -> None:
        order = {"title": "طراحی کارخانه محصول نمونه"}
        text = """# ۱ بازار
تقاضا در سناریوی مبنا ۱۲۰۰ تن محاسبه شد.
# ۲ فناوری
پس از مقایسه، فناوری الف به‌عنوان گزینه منتخب پیشنهاد نهایی شد.
# ۳ تجهیزات
تعداد تجهیزات و ظرفیت هر واحد محاسبه شد.
# ۴ چیدمان
مساحت با روش SLP و From-To و طرح بلوکی چیدمان تعیین شد.
"""
        self.assertEqual(deterministic_content_issues(text, deliverable_contract(order)), [])

    def test_duplicate_integrated_analysis_is_detected(self) -> None:
        text = "# جمع‌بندی\n## تحلیل یکپارچه امکان‌سنجی\nالف\n## تحلیل یکپارچه امکان‌سنجی\nب"
        self.assertIn("تحلیل یکپارچه امکان سنجی", heading_duplicates(text))


if __name__ == "__main__":
    unittest.main()
