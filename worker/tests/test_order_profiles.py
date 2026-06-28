from __future__ import annotations

import importlib.util
import json
import re
import sys
import tempfile
import unittest
import zipfile
from unittest import mock
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
WORKER_ROOT = ROOT / "worker"
LOCAL_WORKER_PATH = WORKER_ROOT / "scripts" / "local_worker.py"

spec = importlib.util.spec_from_file_location("local_worker", LOCAL_WORKER_PATH)
assert spec and spec.loader
local_worker = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = local_worker
spec.loader.exec_module(local_worker)


def frontend_order_type_labels() -> list[str]:
    source = (ROOT / "frontend" / "src" / "lib" / "order-options.ts").read_text(encoding="utf-8")
    match = re.search(r"export const orderTypeOptions = \[(.*?)\];", source, flags=re.S)
    if not match:
        raise AssertionError("Could not find orderTypeOptions in frontend order options")
    return re.findall(r'"([^"]+)"', match.group(1))


def workflow_agent_refs(workflow_path: Path) -> set[str]:
    text = workflow_path.read_text(encoding="utf-8")
    available_agents = {path.stem for path in (WORKER_ROOT / "codex" / "agents").glob("*.md")}
    return {
        match
        for match in re.findall(r"`?([a-z][a-z0-9_]+)\.md`?", text)
        if match in available_agents
    }


def minimal_order(order_type: str, *, order_id: str = "test-order", **overrides: object) -> dict[str, object]:
    order: dict[str, object] = {
        "id": order_id,
        "order_type": order_type,
        "title": "عنوان آزمایشی",
        "degree": "کارشناسی",
        "university": "دانشگاه تهران",
        "field_of_study": "مهندسی",
        "faculty": "فنی",
        "advisor_name": "استاد راهنما",
        "instructor_name": "استاد درس",
        "course_name": "درس آزمایشی",
        "language": "فارسی",
        "academic_style": "APA",
        "methodology": "مروری",
        "quantity_type": "pages",
        "quantity_value": 5,
        "image_count": 0,
        "customer": {
            "full_name": "سارا احمدی",
            "email": "sara@example.test",
        },
        "files": [],
        "references": [],
    }
    order.update(overrides)
    return order


class OrderProfileTests(unittest.TestCase):
    def test_profiles_cover_frontend_order_types(self) -> None:
        frontend_labels = set(frontend_order_type_labels())
        profiles = local_worker.load_order_profiles()
        profile_labels = {profile["order_type"] for profile in profiles.values()}
        self.assertEqual(profile_labels, frontend_labels)

    def test_all_current_order_types_resolve_to_non_fallback_profiles(self) -> None:
        for label in frontend_order_type_labels():
            with self.subTest(order_type=label):
                profile = local_worker.resolve_order_profile(minimal_order(label))
                self.assertNotEqual(profile["profile_key"], "unclassified")
                self.assertEqual(profile["order_type"], label)
                self.assertTrue(profile.get("workflow"))
                self.assertTrue(profile.get("producer_agents"))
                self.assertTrue(profile.get("checker_agents"))

    def test_profile_agent_lists_cover_selected_workflows(self) -> None:
        profiles = local_worker.load_order_profiles()
        for profile in profiles.values():
            with self.subTest(profile=profile["profile_key"]):
                workflow_path = WORKER_ROOT / "codex" / profile["workflow"].removeprefix("codex/")
                referenced_agents = workflow_agent_refs(workflow_path)
                listed_agents = set(profile["producer_agents"]) | set(profile["checker_agents"])
                self.assertEqual(referenced_agents - listed_agents, set())

    def test_profile_required_outputs_drive_presentation_matrix(self) -> None:
        research = minimal_order("تحقیق دانشگاهی")
        presentation = minimal_order(
            "ارائه و پاورپوینت",
            quantity_type="slides",
            quantity_value=8,
        )

        self.assertNotIn("pptx", local_worker.required_uploads_for_order(research))
        self.assertIn("docx", local_worker.required_uploads_for_order(research))
        self.assertIn("pptx", local_worker.required_uploads_for_order(presentation))
        self.assertTrue(local_worker.profile_requires_output(presentation, "pptx"))

    def test_presentation_profile_requires_sourced_visual_even_when_image_count_is_zero(self) -> None:
        presentation = minimal_order(
            "ارائه و پاورپوینت",
            quantity_type="slides",
            quantity_value=8,
            image_count=0,
        )

        self.assertEqual(local_worker.required_image_source_count(presentation), 1)
        self.assertIn("image_sources", local_worker.required_uploads_for_order(presentation))

    def test_student_name_is_extracted_from_customer_for_worker_context(self) -> None:
        order = minimal_order("ارائه و پاورپوینت")
        context = local_worker.normalized_order_context(order)
        markdown = local_worker.order_context_markdown(order)

        self.assertEqual(local_worker.student_display_name(order), "سارا احمدی")
        self.assertEqual(context["student_name"], "سارا احمدی")
        self.assertIn("نام دانشجو / ارائه‌دهنده", markdown)
        self.assertIn("سارا احمدی", markdown)

    def test_workspace_creation_writes_profile_and_profile_specific_agents(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            workspace_root = Path(tmpdir) / "workspace"
            config = local_worker.Config(
                backend_url="http://localhost:5173",
                worker_api_key="test-key",
                worker_id="test-worker",
                workspace=workspace_root,
            )
            order = minimal_order("ارائه و پاورپوینت", order_id="abc123", quantity_type="slides", quantity_value=6)

            workspace = local_worker.ensure_workspace(config, order)

            profile_path = workspace / "extracted" / "order_profile.json"
            self.assertTrue(profile_path.exists())
            profile = json.loads(profile_path.read_text(encoding="utf-8"))
            self.assertEqual(profile["profile_key"], "presentation")
            self.assertEqual(profile["workflow"], "codex/workflows/presentation_workflow.md")
            self.assertIn("slide_deck_builder", profile["producer_agents"])
            self.assertTrue((workspace / "reports" / "stage_checks").is_dir())
            self.assertIn(
                "codex/workflows/presentation_workflow.md",
                (workspace / "AGENTS.md").read_text(encoding="utf-8"),
            )

    def test_validate_review_package_uses_profile_required_outputs(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            upload_paths = {
                "deliverable_source": None,
                "pptx": None,
                "docx": None,
                "pdf": None,
                "compliance_report": None,
                "reference_usage_report": None,
                "human_review_checklist": None,
                "final_readme": None,
                "image_sources": None,
            }

            with self.assertRaises(SystemExit) as research_error:
                local_worker.validate_review_package(
                    workspace,
                    minimal_order("تحقیق دانشگاهی"),
                    upload_paths,
                )
            self.assertNotIn("editable PowerPoint file", str(research_error.exception))

            with self.assertRaises(SystemExit) as presentation_error:
                local_worker.validate_review_package(
                    workspace,
                    minimal_order("ارائه و پاورپوینت", quantity_type="slides", quantity_value=8),
                    upload_paths,
                )
            self.assertIn("editable PowerPoint file", str(presentation_error.exception))

    def test_image_source_validation_accepts_list_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            image_path = workspace / "final" / "figures" / "figure_1.jpg"
            image_path.parent.mkdir(parents=True)
            image_path.write_bytes(b"fake-image")
            sources_path = image_path.parent / "image_sources.json"
            sources_path.write_text(
                json.dumps(
                    [
                        {
                            "local_path": "final/figures/figure_1.jpg",
                            "url": "https://commons.wikimedia.org/wiki/File:figure_1.jpg",
                            "license": "CC BY 4.0",
                        }
                    ],
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )

            local_worker.validate_image_sources_file(workspace, str(sources_path), 1)

    def test_image_source_validation_accepts_images_object_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            workspace = Path(tmpdir)
            image_path = workspace / "final" / "figures" / "figure_1.jpg"
            image_path.parent.mkdir(parents=True)
            image_path.write_bytes(b"fake-image")
            sources_path = image_path.parent / "image_sources.json"
            sources_path.write_text(
                json.dumps(
                    {
                        "images": [
                            {
                                "local_path": "final/figures/figure_1.jpg",
                                "source_url": "https://commons.wikimedia.org/wiki/File:figure_1.jpg",
                                "license": "CC BY 4.0",
                            }
                        ]
                    },
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )

            local_worker.validate_image_sources_file(workspace, str(sources_path), 1)

    def test_docx_page_count_validation_rejects_short_rendered_output(self) -> None:
        order = minimal_order("تحقیق دانشگاهی", quantity_type="pages", quantity_value=10)
        with mock.patch.object(local_worker, "rendered_docx_page_count", return_value=6):
            with self.assertRaises(SystemExit) as error:
                local_worker.validate_docx_page_count(order, "final/deliverable.docx")

        self.assertIn("Requested: 10 pages", str(error.exception))

    def test_docx_page_count_validation_allows_near_requested_output(self) -> None:
        order = minimal_order("تحقیق دانشگاهی", quantity_type="pages", quantity_value=10)
        with mock.patch.object(local_worker, "rendered_docx_page_count", return_value=9):
            local_worker.validate_docx_page_count(order, "final/deliverable.docx")

    def test_native_docx_writer_marks_persian_paragraphs_rtl_and_right_aligned(self) -> None:
        order = minimal_order("تحقیق دانشگاهی")
        markdown = "# عنوان آزمایشی\n\nاین یک بند فارسی برای بررسی راست‌چین بودن خروجی است.\n\n## منابع\n\n- https://example.test"

        with tempfile.TemporaryDirectory() as tmpdir:
            docx_path = Path(tmpdir) / "deliverable.docx"
            local_worker.write_native_formatted_docx(
                docx_path,
                "عنوان آزمایشی",
                markdown,
                order,
                base_dir=None,
                workspace=None,
            )

            with zipfile.ZipFile(docx_path) as docx:
                document_xml = docx.read("word/document.xml").decode("utf-8")
                settings_xml = docx.read("word/settings.xml").decode("utf-8")
                styles_xml = docx.read("word/styles.xml").decode("utf-8")
            local_worker.validate_docx_rtl_quality(order, str(docx_path))

        self.assertIn("<w:bidi/>", settings_xml)
        self.assertIn("<w:mirrorMargins/>", settings_xml)
        self.assertIn('<w:jc w:val="right"/>', styles_xml)
        self.assertIn('w:jc w:val="left"', document_xml)
        self.assertEqual(local_worker.docx_rtl_paragraph_problems(document_xml), [])


if __name__ == "__main__":
    unittest.main()
