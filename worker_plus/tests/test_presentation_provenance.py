from copy import deepcopy
from pathlib import Path
import unittest

from presentation.deck import validate_spec
from presentation.provenance import normalize_metadata_evidence
from test_presentation import fixture


class PresentationProvenanceTests(unittest.TestCase):
    def setUp(self):
        self.model, self.rules, self.sources = fixture()
        self.sources["sources"][0]["original_name"] = "customer-original.docx"

    def test_file_identity_moves_out_of_factual_evidence_without_changing_other_slides(self):
        original = deepcopy(self.model)
        self.model["slides"][0]["evidence"] = [{"locator": "S1.original_name", "quote": "customer-original.docx"}]
        repaired = normalize_metadata_evidence(self.model, self.sources)
        self.assertEqual([], repaired["slides"][0]["evidence"])
        self.assertEqual([{"locator": "S1:metadata:original_name", "quote": "customer-original.docx"}], repaired["slides"][0]["metadata_evidence"])
        self.assertEqual(original["slides"][1:], repaired["slides"][1:])
        validate_spec(repaired, self.rules, self.sources, Path("."))
        self.assertEqual(repaired, normalize_metadata_evidence(repaired, self.sources))

    def test_filename_cannot_support_a_scientific_claim(self):
        self.model["slides"][1]["evidence"] = [{"locator": "S1.original_name", "quote": "customer-original.docx"}]
        with self.assertRaisesRegex(ValueError, "source evidence required"):
            validate_spec(normalize_metadata_evidence(self.model, self.sources), self.rules, self.sources, Path("."))

    def test_wrong_filename_unknown_source_and_fabricated_metadata_are_rejected(self):
        for reference in [
            {"locator": "S1.original_name", "quote": "wrong.docx"},
            {"locator": "S2.original_name", "quote": "customer-original.docx"},
            {"locator": "S1:metadata:original_name", "quote": "wrong.docx"},
        ]:
            model = deepcopy(self.model)
            model["slides"][5]["evidence"] = [reference]
            with self.assertRaises(ValueError):
                validate_spec(normalize_metadata_evidence(model, self.sources), self.rules, self.sources, Path("."))
        self.model["slides"][5]["metadata_evidence"] = [{"locator": "S1:metadata:invented", "quote": "fake"}]
        with self.assertRaises(ValueError):
            validate_spec(self.model, self.rules, self.sources, Path("."))

    def test_content_quotes_still_require_the_exact_real_passage(self):
        self.model["slides"][5]["evidence"] = [{"locator": "S1:table-1", "quote": "Fabricated source passage"}]
        with self.assertRaisesRegex(ValueError, "source quote/locator mismatch"):
            validate_spec(normalize_metadata_evidence(self.model, self.sources), self.rules, self.sources, Path("."))


if __name__ == "__main__":
    unittest.main()
