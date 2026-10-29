"""Temporary fixture tests of snapshot isolation, freshness and report checks; no AI calls."""
import tempfile
import unittest
import zipfile
from pathlib import Path

import review_tools as review


class ReviewToolsTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.workspace = Path(self.temp.name)
        source = self.workspace / 'input/files/information_source__source.txt'
        source.parent.mkdir(parents=True)
        source.write_text('original academic evidence', encoding='utf-8')
        self.source = source
        self.order = {'id': 'test-order', 'order_type': review.TYPE, 'title': 'Test only',
                      'quantity_type': 'slides', 'quantity_value': 2,
                      'correspondence_email': 'private@example.test', 'customer': {'phone': 'private'},
                      'status_logs': [{'notes': 'old review praise must not reach reviewer'}],
                      'files': [{'id': 'file1', 'file_type': 'information_source', 'original_name': 'source.txt',
                                 'size_bytes': source.stat().st_size}]}
        review.write(self.workspace / 'customer_input.json', self.order)
        final = self.workspace / 'final/final.pptx'
        final.parent.mkdir()
        with zipfile.ZipFile(final, 'w') as package:
            package.writestr('ppt/presentation.xml', '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst><p:sldId id="1"/><p:sldId id="2"/></p:sldIdLst></p:presentation>')
        self.bundle = Path(review.prepare('https://daneshyar.vercel.app/admin/orders/test-order', self.workspace)['bundle'])
        self.manifest = review.read(self.bundle / 'manifest.json')

    def report(self):
        for i in (1, 2):
            # Existence fixtures only; this is not a real visual or academic review.
            (self.bundle / f'reviewer/{i}.png').write_bytes(b'fixture image')
        return {'version': 1, 'order_id': 'test-order', 'run_id': self.manifest['run_id'],
                'status': 'complete', 'score': 20,
                'rubric': [{'id': k, 'score': v, 'reason': 'Fixture arithmetic only'} for k, v in review.RUBRIC.items()],
                'actual_slide_count': 2, 'reviewed_slides': [1, 2],
                'inspected_files': {f['path']: f['sha256'] for f in self.manifest['files']},
                'visual_inspection': [{'slide': i, 'image': f'reviewer/{i}.png'} for i in (1, 2)],
                'summary': 'Fixture report, no academic assessment', 'strengths': [], 'issues': [],
                'blockers': [], 'repair_request': 'Fixture repair request'}

    def collect(self, report):
        review.write(self.bundle / 'reviewer/report.json', report)
        return review.collect(self.bundle)

    def test_round_trip_isolated_and_sanitized(self):
        before = review.sha(self.source)
        result = self.collect(self.report())
        self.assertTrue(result['current'])
        self.assertTrue(Path(result['report']).is_file())
        self.assertEqual(review.sha(self.source), before)
        details = review.read(self.bundle / 'inputs/order_details.json')
        self.assertNotIn('correspondence_email', details)
        self.assertNotIn('customer', details)
        self.assertNotIn('status_logs', details)
        self.assertEqual(self.manifest['submitted_slide_count'], 2)

    def test_original_update_marks_review_stale(self):
        report = self.report()
        self.source.write_text('new source version', encoding='utf-8')
        result = self.collect(report)
        self.assertFalse(result['current'])
        self.assertIn(str(self.source), result['changed_files'])

    def test_snapshot_tampering_is_rejected(self):
        report = self.report()
        frozen = self.bundle / next(f['path'] for f in self.manifest['files'] if f['role'] == 'information_source')
        frozen.write_text('altered frozen evidence', encoding='utf-8')
        with self.assertRaisesRegex(ValueError, 'Frozen review input changed'):
            self.collect(report)

    def test_wrong_score_arithmetic_is_rejected(self):
        report = self.report()
        report['score'] = 19
        with self.assertRaisesRegex(ValueError, 'rubric sum'):
            self.collect(report)

    def test_incomplete_visual_coverage_is_rejected(self):
        report = self.report()
        report['visual_inspection'].pop()
        with self.assertRaisesRegex(ValueError, 'every slide'):
            self.collect(report)

    def test_false_native_slide_count_is_rejected(self):
        report = self.report()
        report['actual_slide_count'] = 1
        report['reviewed_slides'] = [1]
        report['visual_inspection'] = report['visual_inspection'][:1]
        with self.assertRaisesRegex(ValueError, 'native submitted PPTX'):
            self.collect(report)

    def test_incomplete_is_not_fabricated_zero(self):
        report = self.report()
        report.update(status='incomplete', score=None, rubric=[], blockers=['Cannot open the submitted file'])
        result = self.collect(report)
        self.assertIsNone(result['score'])
        report['score'] = 0
        with self.assertRaisesRegex(ValueError, 'score null'):
            self.collect(report)

    def test_identity_and_image_path_escape_rejected(self):
        with self.assertRaisesRegex(ValueError, 'different order'):
            review.prepare('wrong-order', self.workspace)
        report = self.report()
        report['visual_inspection'][0]['image'] = 'reviewer/../../outside.png'
        with self.assertRaisesRegex(ValueError, 'escapes'):
            self.collect(report)

    def test_new_output_marks_old_snapshot_stale(self):
        report = self.report()
        (self.workspace / 'final/final.pdf').write_bytes(b'new companion output')
        self.assertFalse(self.collect(report)['current'])

    def test_each_prepare_creates_new_run(self):
        other = review.prepare('test-order', self.workspace)
        self.assertNotEqual(other['run_id'], self.manifest['run_id'])
        self.assertNotEqual(Path(other['bundle']), self.bundle)


class DocumentReviewToolsTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def prepare(self, kind):
        import fitz
        from docx import Document
        root = self.root / str(review.DOCUMENT_TYPES.index(kind))
        (root / 'final').mkdir(parents=True)
        order = {'id': 'document-review-test', 'order_type': kind, 'title': 'Fixture document',
                 'quantity_type': 'pages', 'quantity_value': 2, 'files': []}
        review.write(root / 'customer_input.json', order)
        Document().save(root / 'final/final.docx')
        Document().save(root / 'final/sample.docx')
        for name, count in (('final', 2), ('sample', 1)):
            with fitz.open() as pdf:
                for _ in range(count):
                    page = pdf.new_page()
                    page.insert_text((40, 40), 'Fixture only')
                pdf.save(root / f'final/{name}.pdf')
        review.write(root / 'research/evidence.json', {'deliverables': []})
        bundle = Path(review.prepare('document-review-test', root)['bundle'])
        manifest = review.read(bundle / 'manifest.json')
        images = []
        for n, (name, count) in enumerate(manifest['submitted_page_counts'].items()):
            for page in range(1, count + 1):
                image = f'reviewer/{n}-{page}.png'
                (bundle / image).write_bytes(b'Existence fixture; not a real visual review')
                images.append({'document': name, 'page': page, 'image': image})
        report = {'version': 1, 'order_id': order['id'], 'run_id': manifest['run_id'],
                  'status': 'complete', 'score': 20,
                  'rubric': [{'id': key, 'score': value, 'reason': 'Fixture only'} for key, value in review.RUBRIC.items()],
                  'actual_page_count': 2, 'reviewed_pages': [1, 2],
                  'visual_inspection': images,
                  'inspected_files': {f['path']: f['sha256'] for f in manifest['files']},
                  'summary': 'Schema test only, no academic grade', 'strengths': [], 'issues': [],
                  'blockers': [], 'repair_request': 'Fixture request'}
        return root, bundle, manifest, report

    def test_all_document_types_freeze_research_and_collect_page_based_reviews(self):
        for kind in review.DOCUMENT_TYPES:
            with self.subTest(kind=kind):
                root, bundle, manifest, report = self.prepare(kind)
                self.assertTrue(manifest['document'])
                self.assertEqual(manifest['order_type'], kind)
                self.assertTrue(any(f['role'] == 'research_evidence' for f in manifest['files']))
                review.write(bundle / 'reviewer/report.json', report)
                result = review.collect(bundle)
                self.assertTrue(result['current'])
                (root / 'final/sample.docx').write_bytes(b'Changed current version')
                self.assertFalse(review.collect(bundle)['current'])

    def test_missing_sample_page_inspection_is_rejected(self):
        _, bundle, manifest, report = self.prepare(review.DOCUMENT_TYPES[0])
        report['visual_inspection'] = [row for row in report['visual_inspection'] if not row['document'].endswith('sample.pdf')]
        with self.assertRaisesRegex(ValueError, 'every page'):
            review.validate_report(bundle, manifest, report)

    def test_false_full_pdf_page_count_is_rejected(self):
        _, bundle, manifest, report = self.prepare(review.DOCUMENT_TYPES[0])
        report.update(actual_page_count=1, reviewed_pages=[1])
        with self.assertRaisesRegex(ValueError, 'actual_page_count'):
            review.validate_report(bundle, manifest, report)

    def test_no_complete_grade_without_readable_full_pdf(self):
        _, bundle, manifest, report = self.prepare(review.DOCUMENT_TYPES[0])
        manifest['submitted_page_counts'].pop('inputs/final/final.pdf')
        with self.assertRaisesRegex(ValueError, 'readable full PDF'):
            review.validate_report(bundle, manifest, report)


if __name__ == '__main__':
    unittest.main()
