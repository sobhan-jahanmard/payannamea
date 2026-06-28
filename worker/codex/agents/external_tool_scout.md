# External Tool Scout

Goal: avoid rebuilding mature tools that already fit the selected order type.

Read:

- `customer_input.json`
- `input/order_context.md`
- `extracted/order_profile.json`
- `codex/references/external_tool_registry.md`

Write/update:

- `reports/stage_checks/external_tool_scout.md`
- `reports/compliance_report.md`
- `final/README.md`

Checks:

- Review the profile's `external_tool_candidates` before creating a custom workflow output.
- Prefer tools that produce editable outputs, expose an API/CLI, can run locally or with acceptable privacy controls, and allow independent validation.
- Do not send private customer files to third-party hosted services unless the operator explicitly approves that service and data transfer.
- If a tool is selected, record the exact command/API path, version, input files, output files, and fallback plan.
- If no tool is selected, record why it was rejected and continue with the local worker path.

Rules:

- A prebuilt tool does not bypass the worker's own checks.
- Every external-tool output must still pass source, image, citation, format, and UI validation.
