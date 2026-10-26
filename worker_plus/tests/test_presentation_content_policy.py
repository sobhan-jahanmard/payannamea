from copy import deepcopy
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock

from common.helpers import write_json
from presentation import workflow
from presentation.content_policy import bibliography_entries, compact_bibliography_points, policy_violations
from presentation.deck import validate_spec
from test_presentation import fixture


class PresentationContentPolicyTests(unittest.TestCase):
    def setUp(self):
        self.model, self.rules, self.sources = fixture()

    def validate(self):
        validate_spec(self.model, self.rules, self.sources, Path('.'))

    def test_real_original_references_are_accepted(self):
        self.validate()
        self.assertEqual(len(bibliography_entries(self.sources)), 1)

    def test_long_real_reference_is_compacted_without_losing_source_evidence(self):
        entry = '[۱] ' + 'Author and detailed research title, ' * 8 + 'Journal of Testing, 2024.'
        self.sources['sources'][0]['segments'][0]['text'] += '\nمنابع\n' + entry
        slide = self.model['slides'][5]
        slide['points'] = [entry]
        slide['evidence'] = [{'locator': 'S1:table-1', 'quote': entry}]
        original = deepcopy(self.model)
        compacted = compact_bibliography_points(self.model, self.sources)
        self.assertEqual(self.model, original)
        self.assertLessEqual(len(compacted['slides'][5]['points'][0]), 240)
        self.assertTrue(entry.startswith(compacted['slides'][5]['points'][0]))
        self.assertEqual(compacted['slides'][5]['evidence'], slide['evidence'])
        self.assertEqual(compacted['slides'][:5], self.model['slides'][:5])
        self.assertEqual(compacted, compact_bibliography_points(compacted, self.sources))
        validate_spec(compacted, self.rules, self.sources, Path('.'))

    def test_invented_long_reference_is_not_compacted_into_acceptance(self):
        point = '[۱] Invented reference ' + 'without source evidence ' * 15
        self.model['slides'][5]['points'] = [point]
        compacted = compact_bibliography_points(self.model, self.sources)
        self.assertEqual(compacted['slides'][5]['points'], [point])
        with self.assertRaises(ValueError):
            validate_spec(compacted, self.rules, self.sources, Path('.'))

    def test_generation_saves_compact_reference_and_preserves_full_quote(self):
        entry = '[۱] ' + 'Author and detailed research title, ' * 8 + 'Journal of Testing, 2024.'
        self.sources['sources'][0]['segments'][0]['text'] += '\nمنابع\n' + entry
        self.model['slides'][5]['points'] = [entry]
        self.model['slides'][5]['evidence'] = [{'locator': 'S1:table-1', 'quote': entry}]
        self.rules['cover_lines'] = self.model['slides'][0]['points']
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name, data in [('planning/presentation_contract.json', self.rules),
                               ('extracted/presentation_sources.json', self.sources)]:
                write_json(root / name, data)
            services = SimpleNamespace(workspace=root,
                                       run_codex=Mock(side_effect=lambda prompt, target: write_json(target, self.model)))
            workflow.generate({'artifacts': {}}, services)
            saved = json.loads((root / 'final/presentation.json').read_text(encoding='utf-8'))
            self.assertLessEqual(len(saved['slides'][5]['points'][0]), 240)
            self.assertEqual(saved['slides'][5]['evidence'][0]['quote'], entry)
            validate_spec(saved, self.rules, self.sources, root)

    def test_no_original_bibliography_means_no_references_slide(self):
        self.sources['sources'][0]['segments'][0]['text'] = 'زمان اجرای روش الف 10 و روش ب 20 دقیقه است.'
        self.model['slides'][5]['evidence'] = []
        with self.assertRaisesRegex(ValueError, 'No bibliography'):
            self.validate()
        self.model['slides'][5] = deepcopy(self.model['slides'][1])
        self.validate()
        for count in (5, 6, 7, 10, 20):
            outline = workflow.fallback_outline(count, False)
            self.assertEqual(len(outline['slides']), count)
            self.assertFalse(any(s['section'] == 'references' for s in outline['slides']))

    def test_reference_like_prose_and_toc_do_not_create_bibliography(self):
        for text in ('منابع .......... ۲۳\nمتن علمی درباره روش‌ها', 'References are discussed in section 2.', 'منابع داده بازار محدود است.'):
            self.sources['sources'][0]['segments'][0]['text'] = text
            self.assertEqual(bibliography_entries(self.sources), [])

    def test_pdf_entries_keep_wrapped_lines_and_stop_before_appendix(self):
        self.sources['sources'][0]['segments'] = [{'id':'S1:page-4', 'text':'References\n[1] Author, A long paper title\nJournal of Testing, 2024.\n[2] Another author, Second paper, 2023.\nAppendix A\nNot a reference'}]
        entries = bibliography_entries(self.sources)
        self.assertEqual(len(entries), 2)
        self.assertIn('Journal of Testing', entries[0]['text'])
        self.assertEqual(entries[1]['locator'], 'S1:page-4')
        self.assertNotIn('Not a reference', str(entries))

    def test_order_chatter_is_rejected_in_each_rendered_region_and_notes(self):
        for key, value in [('title','طبق سفارش مشتری'), ('description','فایل اطلاعاتی سفارش'), ('caption','نام فایل اصلی: source.docx'), ('points',['هیچ پژوهش جدیدی اضافه نشده']), ('notes','مطابق درخواست مشتری تهیه شده'), ('table',[['فایل بارگذاری شده']]), ('visual',{'nodes':[{'detail':'This uploaded file'}]})]:
            with self.subTest(key=key):
                candidate = deepcopy(self.model)
                candidate['slides'][1][key] = value
                self.assertTrue(policy_violations(candidate, self.sources))

    def test_legitimate_order_management_subject_is_allowed(self):
        self.model['slides'][1]['title'] = 'مدیریت سفارش در زنجیره تأمین'
        self.validate()

    def test_filenames_rejected_on_slides_but_allowed_in_metadata(self):
        self.model['slides'][0]['metadata_evidence'] = [{'locator':'S1:metadata:original_name','quote':'fixture.docx'}]
        self.sources['sources'][0]['original_name'] = 'fixture.docx'
        self.validate()
        self.model['slides'][5]['points'] = ['fixture.docx']
        with self.assertRaisesRegex(ValueError, 'filenames'):
            self.validate()

    def test_fake_references_and_source_use_table_are_rejected(self):
        self.model['slides'][5]['points'] = ['[۱] Invented Author, Invented Journal, 2024.']
        with self.assertRaisesRegex(ValueError, 'exact excerpt'):
            self.validate()
        self.model, _, _ = fixture()
        self.model['slides'][5].update(layout='table', points=[], table=[['Source','Use'],['Author','All slides']])
        with self.assertRaisesRegex(ValueError, 'plain bibliography'):
            self.validate()

    def test_reference_requires_its_own_evidence_and_cannot_be_silently_omitted(self):
        self.model['slides'][5]['evidence'] = []
        with self.assertRaisesRegex(ValueError, 'matching evidence'):
            self.validate()
        self.model['slides'][5] = deepcopy(self.model['slides'][1])
        with self.assertRaisesRegex(ValueError, 'include a references slide'):
            self.validate()

    def test_stage13_repairs_old_approved_production_copy_without_rewriting_healthy_slides(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.model['slides'][5]['description'] = 'فایل اطلاعاتی سفارش و مبنای همه اسلایدها'
            old = deepcopy(self.model)
            for name, data in [('final/presentation.json',self.model), ('planning/presentation_contract.json',self.rules), ('extracted/presentation_sources.json',self.sources)]:
                write_json(root/name, data)
            good_reference = fixture()[0]['slides'][5]
            def respond(prompt, target):
                self.assertIn('Slide 6:', prompt)
                self.assertIn('قاعده سخت', prompt)
                write_json(target, {'patches':[{'slide_number':6, 'slide':good_reference}]})
            services = SimpleNamespace(workspace=root, run_codex=Mock(side_effect=respond))
            context = {'artifacts':{}, 'recovery_history':[{'failed_step':'10c_verify_persian_pagination'}]}
            # The old content had genuine approvals; new policy must still repair it.
            from unittest.mock import patch
            with patch.object(workflow, 'verified_content_checkpoint', return_value=True):
                workflow.generate(context, services)
            current = json.loads((root/'final/presentation.json').read_text(encoding='utf-8'))
            self.assertEqual(current['slides'][:5], old['slides'][:5])
            self.assertEqual(current['slides'][6:], old['slides'][6:])
            self.assertNotIn('description', current['slides'][5])
            services.run_codex.assert_called_once()


if __name__ == '__main__':
    unittest.main()
