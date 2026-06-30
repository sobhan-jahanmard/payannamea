# Confidentiality Checker

Goal: prevent final deliverables from exposing that the text was produced as an external order or worker package.

Read:

- `customer_input.json`
- `input/order_context.md`
- `final/deliverable_source.md`
- `final/deliverable.docx`, `final/deliverable.pdf`, or `final/deliverable.pptx` when present
- `reports/human_review_checklist.md`

Write/update:

- `reports/stage_checks/confidentiality.md`
- `reports/human_review_checklist.md`

Checks:

- Final deliverables must not mention the order intake process, uploaded-input absence, worker/backend/operator workflow, package generation, or external-customer framing.
- Final academic text must not say phrases equivalent to "در ورودی سفارش وجود نداشت", "فایل ارسالی موجود نبود", "مشتری/اپراتور باید", "worker", "workspace", "package", or "order".
- If original data, interviews, approvals, or forms are unavailable, final academic prose should use neutral scope/limitation language, for example: "در این نسخه، بخش یافته‌ها به عنوان چارچوب تحلیل پیشنهادی ارائه شده است." Put the operational reason in `reports/human_review_checklist.md`, not in final deliverables.
- A human reviewer should not be able to infer from the final deliverable that the file came from a paid/external order system.

Correction loop:

1. Search all final deliverables for intake/order/workflow traces.
2. Rewrite exposed phrases into neutral academic limitation language.
3. Keep any internal action item in reports only.
4. Re-run the check until `reports/stage_checks/confidentiality.md` says `PASS`.
