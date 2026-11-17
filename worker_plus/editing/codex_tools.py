from tempfile import TemporaryDirectory
from pathlib import Path

from codex_document_tools import DocumentTools
from codex_order_tools import hashes, read
from common.helpers import write_json
from common.input_files import target_name
from editing import profile, workflow


class EditingTools(DocumentTools):
    publication_note = "Copyedited source Word document and reviewed PDF/Word samples."
    steps = ["دریافت سفارش", "کنترل فایل اصلی", "استخراج متن", "بررسی خواسته‌ها",
             "ویراستاری", "ساخت فایل Word", "مقایسه با متن اصلی", "ساخت PDF و نمونه",
             "بازبینی صفحات", "کنترل نهایی و تحویل"]

    def prepare(self):
        self.verify_inputs()
        order = self.context()["order"]
        profile.validate_order(order)
        source = (Path("input/files") / target_name(profile.source_file(order))).as_posix()
        contract_path = "planning/editing_contract.json"
        contract = {"source": source, "notes": order.get("notes"), "outputs": self.outputs}
        write_json(self.workspace / contract_path, contract)
        self.record("intake", [*self.state()["input_hashes"], contract_path])
        return contract

    def source(self):
        return self.workspace / read(self.workspace / "planning/editing_contract.json")["source"]

    def extract(self):
        self.verify_inputs()
        self.require("intake")
        count = workflow.extract(self.source(), self.workspace / workflow.BLOCKS)
        self.record("sources", [*self.state()["input_hashes"], "planning/editing_contract.json", workflow.BLOCKS])
        return {"blocks": count, "path": workflow.BLOCKS}

    def content_paths(self):
        return [*self.state()["input_hashes"], "planning/editing_contract.json", workflow.BLOCKS, workflow.EDITS]

    def validate(self, kind, candidate=None):
        self.verify_inputs()
        self.require("sources")
        if kind != "copyedits":
            raise ValueError("Editing orders support validate copyedits")
        plan = read(candidate or self.workspace / workflow.EDITS)
        with TemporaryDirectory(dir=self.workspace / "drafts") as temporary:
            count = workflow.apply(self.source(), Path(temporary) / "candidate.docx", plan)
        write_json(self.workspace / workflow.EDITS, plan)
        self.record("document", self.content_paths())
        return {"edits": count}

    def build(self):
        self.verify_inputs()
        self.require("document")
        if not self.current("build"):
            workflow.apply(self.source(), self.workspace / self.outputs[0], read(self.workspace / workflow.EDITS))
            self.record("build", [*self.content_paths(), self.outputs[0]])
        return {"docx": self.outputs[0]}

    def render(self):
        self.verify_inputs()
        self.require("build")
        if self.current("render"):
            return read(self.workspace / workflow.RENDER)
        report = workflow.render(self.services())
        self.record("render", [*self.content_paths(), *self.outputs, workflow.RENDER, *report["images"]])
        return report

    def review_inputs(self, kind):
        self.verify_inputs()
        self.require("build")
        paths = [*self.content_paths(), self.outputs[0]]
        if kind == "visual":
            self.require("render")
            paths += [*self.outputs, workflow.RENDER, *read(self.workspace / workflow.RENDER)["images"]]
        return {"kind": kind, "inputs": hashes(self.workspace, paths)}

    def review_coverage(self, kind):
        if kind == "visual":
            return "reviewed_images", set(read(self.workspace / workflow.RENDER)["images"])
        return "reviewed_sections", {block["id"] for block in read(self.workspace / workflow.BLOCKS)["blocks"]}

    def finalize(self):
        self.verify_inputs()
        for key in ("intake", "sources", "document", "build", "render", "review_content", "review_sources", "review_visual"):
            self.require(key)
        report = {"passed": True, "order_id": self.state()["order_id"],
                  "source_policy": self.state()["source_policy"],
                  "pages": read(self.workspace / workflow.RENDER)["counts"],
                  "outputs": hashes(self.workspace, self.outputs)}
        write_json(self.workspace / "reports/codex_delivery.json", report)
        self.record("delivery", [*self.content_paths(), *self.outputs, "reports/codex_delivery.json"])
        return report
