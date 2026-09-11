# OpenAI text-token pricing snapshot

Snapshot date: 2026-09-11. Currency: USD per 1M tokens. These are standard text-token rates; tool-call, cache-write, Batch/Flex/Fast and long-context surcharges are not included.

| Model | Input | Cached input | Output | Official source |
| --- | ---: | ---: | ---: | --- |
| gpt-6-astra | $10.00 | $1.00 | $50.00 | https://developers.openai.com/api/docs/models/gpt-6-astra |
| gpt-5.6-sol | $4.00 | $0.40 | $20.00 | https://developers.openai.com/api/docs/models/gpt-5.6-sol |
| gpt-5.6-terra | $2.00 | $0.20 | $12.00 | https://developers.openai.com/api/docs/models/gpt-5.6-terra |
| gpt-5.6-luna | $0.20 | $0.02 | $1.20 | https://developers.openai.com/api/docs/models/gpt-5.6-luna |

Cost formula: `(input - cached input) × input rate + cached input × cached rate + output × output rate`, divided by 1,000,000. Reasoning tokens are part of output usage and are shown separately only for reporting, not charged twice.
