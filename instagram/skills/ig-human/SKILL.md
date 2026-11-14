---
name: ig-human
description: >-
  Edit Instagram captions, scripts, comments, replies and DM drafts for clear,
  natural language while preserving meaning and brand voice. Use for humanizing
  or removing formulaic wording from Instagram copy. Includes optional English
  style heuristics; these do not determine authorship or originality.
---

# ig-human

Read `instagram/skills/CODEX.md` and `instagram/brand/voice.md` first.

## Persian workflow

Edit by judgment. Keep the actual claim and useful details; remove vague hype,
repeated openings, forced questions and redundant CTAs. Read spoken scripts aloud
mentally for natural phrasing. Preserve Persian ZWNJ (نیم‌فاصله), punctuation,
hashtags, handles and URLs. Do not invent proof to make wording more specific.

Show the revised text and, when useful, a short explanation of material changes.
No numeric detector verdict is needed for Persian. Do not run English lexical
cleanup or chase English PASS thresholds on Persian drafts.

## Optional English helpers

Run from the repository root:

```text
python -X utf8 instagram/skills/ig-human/humanize.py draft.txt -o clean.txt --report
python -X utf8 instagram/skills/ig-human/detect.py draft.txt clean.txt
```

`humanize.py` uses `slop.json` for English phrase substitutions and typography
cleanup. Review its output before replacing a source draft. The local adaptation
preserves U+200C; other format characters may still be removed. Do not use it on
formatted RTL text that deliberately uses directional controls.

`detect.py` reports heuristic style signals based largely on English words and
punctuation. They are neither an authorship test nor a validated originality
measure. Do not promise detector outcomes or call text undetectable. Prefer a
clear, accurate draft to a higher arbitrary score. These local helpers upload
nothing and do not send or publish messages.
