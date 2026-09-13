# Worker Plus

The shared workflow lives in `common/`: order claim, workspace preparation, source handling, content review, DOCX packaging, publishing, and failure handling are implemented once.

Each supported order type has its own folder containing only its profile and any genuinely type-specific utilities:

- `bachelor_thesis/`
- `master_thesis/`
- `thesis_proposal/`
- `university_research/`
- `presentation/`

Run the single worker with `python run.py`. After it claims or resumes an order, it selects the matching profile from that order’s `order_type`. Only the profiles listed above are supported.

To generate a local package from a real order without changing its backend status, lock, run history, or outputs, use `python run.py --offline --order-id <order-id>`. This performs only GET requests for the order and its input files.
