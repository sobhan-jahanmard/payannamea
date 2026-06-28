# External Tool Registry

Use this registry as a starting point before building a custom generator. A tool is acceptable only if the operator can run it within the privacy constraints of the order and the worker's own checks still pass.

## Presentation Orders

- Presenton: self-hosted AI presentation generation with editable PPTX export, API, templates, and MCP support. Source: https://github.com/presenton/presenton
- PPTAgent: agentic PowerPoint generation and presentation-evaluation research baseline. Source: https://github.com/icip-cas/pptagent
- PptxGenJS: deterministic JavaScript PPTX generation. Source: https://github.com/gitbrent/PptxGenJS
- Playwright visual comparisons: screenshot-based regression checks for rendered previews. Source: https://playwright.dev/docs/test-snapshots

## Thesis, Dissertation, Proposal, And Research Orders

- GROBID: scientific PDF metadata and reference extraction. Source: https://grobid.readthedocs.io/en/latest/Introduction/
- PaperQA2: source-grounded question answering over supplied scientific documents. Source: https://github.com/future-house/paper-qa
- STORM: cited long-form research and outline workflow. Source: https://github.com/stanford-oval/storm
- PyMuPDF: PDF image extraction and inspection. Source: https://pymupdf.readthedocs.io/en/latest/recipes-images.html
- Pandoc: document conversion. Source: https://pandoc.org/

## Evaluation Rules

- Prefer local/self-hosted operation for private customer material.
- Record exact version, command/API path, input files, output files, and failure mode.
- Reject any tool that cannot produce editable output for the required deliverable type.
- Reject any tool whose output cannot be independently inspected for sources, placeholders, layout, and visual provenance.
