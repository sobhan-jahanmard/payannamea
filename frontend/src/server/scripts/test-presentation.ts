import assert from "node:assert/strict";
import { test } from "node:test";
import { isPresentationOrder, PRESENTATION_STYLES, PRESENTATION_FONTS } from "../../lib/presentation";
import { assertPresentationSource, validateInformationSource } from "../presentation";
import { customerOutputFileName, customerVisibleFinalOutputs, createCustomerOrder, orderCreateSchema } from "../orders";
import { requiredFinalOutputTypes } from "../worker";
import type { FinalOutputEntity, UserEntity } from "../db/entities";

const payload = {
  correspondence_email: "fixture@example.com", degree: "کارشناسی", university: "دانشگاه نمونه",
  title: "آزمون ثبت ارائه", student_name: "دانشجوی نمونه", student_number: "12345", course_name: "درس نمونه",
  order_type: "ارائه و پاورپوینت", methodology: "تلخیص منبع", language: "فارسی", quantity_type: "slides", quantity_value: 20
};

test("a presentation cannot be registered or approved without its information source", async () => {
  assert.throws(() => assertPresentationSource({ order_type: payload.order_type, files: [{ file_type: "reference_file", original_name: "thesis.docx", size_bytes: 100 }] }));
  await assert.rejects(createCustomerOrder({} as UserEntity, payload), /منبع اطلاعات/);
  assertPresentationSource({ order_type: payload.order_type, files: [{ file_type: "information_source", original_name: "thesis.docx", size_bytes: 100 }] });
  assertPresentationSource({ order_type: "تحقیق دانشگاهی", files: [] });
});

test("source file extension, signature and text encoding are checked", async () => {
  await validateInformationSource(new File(["متن منبع برای ارائه"], "source.txt"));
  await assert.rejects(validateInformationSource(new File(["pretend pdf"], "source.pdf")));
  await assert.rejects(validateInformationSource(new File([], "source.docx")));
  await assert.rejects(validateInformationSource(new File([new Uint8Array([255, 254])], "source.txt")));
});

test("presentation quantity and output matrix differ from Word orders", () => {
  assert.equal(orderCreateSchema.safeParse({ ...payload, quantity_type: "pages" }).success, false);
  assert.equal(orderCreateSchema.safeParse({ ...payload, quantity_value: 4 }).success, false);
  assert.equal(orderCreateSchema.safeParse(payload).success, true);
  assert.deepEqual(requiredFinalOutputTypes({ order_type: payload.order_type }).sort(), ["pdf", "pptx", "sample", "sample_pdf"]);
  assert.deepEqual(requiredFinalOutputTypes({ order_type: "پایان‌نامه کارشناسی" }), ["docx", "pdf"]);
  assert.equal(isPresentationOrder({ order_type: "تحقیق دانشگاهی" }), false);
});

test("presentation style and font choices use the versioned catalog", () => {
  for (const style of PRESENTATION_STYLES) {
    for (const font of PRESENTATION_FONTS) assert.equal(orderCreateSchema.safeParse({ ...payload, presentation_style: style.id, presentation_font: font.id }).success, true);
  }
  assert.equal(orderCreateSchema.safeParse({ ...payload, presentation_style: "unknown-template" }).success, false);
  assert.equal(orderCreateSchema.safeParse({ ...payload, presentation_font: "unknown-font" }).success, false);
});

test("customer can receive PPTX and its sample retains the right extension", () => {
  const pptx = { output_type: "pptx", original_name: "final.pptx", created_at: new Date() } as FinalOutputEntity;
  assert.equal(customerVisibleFinalOutputs([pptx]).length, 1);
  assert.equal(customerOutputFileName({ output_type: "sample", original_name: "sample.pptx" } as FinalOutputEntity), "sample.pptx");
  assert.equal(customerOutputFileName({ output_type: "sample", original_name: "sample.docx" } as FinalOutputEntity), "sample.docx");
});
