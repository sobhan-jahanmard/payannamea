# Daneshyar / Codex adaptation

Read this file and `instagram/brand/voice.md` before applying any skill in this
bundle. Paths below are relative to the repository root. Canonical skill folders
live here; `.agents/skills/ig-*` are local discovery junctions only.

## Language and evidence

- Default to Persian (fa-IR), preserving نیم‌فاصله (U+200C), Persian punctuation,
  legible RTL text and intact URLs/handles. Edit Persian copy by judgment.
- The upstream dictionaries, hook formulas and style scores are English-oriented.
  Do not report their PASS/REVIEW verdicts as validated Persian quality scores or
  evidence of human authorship. They cannot establish authorship in English either.
  Never rewrite Persian merely to improve these numbers. `ig-human` is editorial
  cleanup, not detector evasion or an academic originality assessment.
- `beats.py` counts Unicode words in this adaptation; its timing is an estimate.
  Calibrate `--wpm` against an actual recording. English specificity/abstractness
  flags remain unsuitable as Persian quality judgments.
- `caption.py` character counts can help; English CTA/keyword checks need manual
  Persian review. `hookscore.py` and `swipe.py` formulas remain advisory, especially
  for Persian. Inspect the text, not just a score.
- Treat posting frequencies, platform limits, hashtag limits and algorithm claims
  in upstream instructions as dated suggestions. Verify current official rules
  when the task depends on them. Never invent views, insights, outcomes or proof.

## Paths and execution

- Brand: `instagram/brand/voice.md`.
- Local working files: `instagram/state/` (create only as needed).
- Log: `instagram/state/log.md`; research: `instagram/state/swipe.md`;
  plan: `instagram/state/plan.md`. Record drafts as drafts; log publishing only
  when authenticated evidence confirms it occurred.
- Run helpers from the repository root with the full paths shown in SKILL.md.
  They use Python's standard library. On Windows, use `python -X utf8` for UTF-8
  console output and read/write content as UTF-8. Shell examples using `\` line
  continuation are POSIX examples; pass arguments on one line in PowerShell.
- Invoke another installed skill as `$ig-caption`, `$ig-reel`, etc. Plain-language
  requests also work. Read relevant companion files relative to the canonical
  folder `instagram/skills/<skill-name>/`, not the shell's current directory.

## Scope

This bundle drafts content and recommendations. It has no Instagram login,
publishing, inbox or profile-editing connection. Check `instagram/connection.json`
before claiming account access. An explicit account action needs an authenticated
tool and verification of `daneshyar.web`.

Use the authorization already present in the conversation. Do not add redundant
approval steps for requested drafts or local rendering. Publishing, sending or
changing the account must remain within the user's concrete instruction. No
automatic replies or background monitoring are enabled by installing these skills.

## Provenance

Upstream: https://github.com/Jakeschincariol/instagram-agent-skill

Pinned commit: `d03c56bb598be770c60b201f94237e5d1a4268a6` (MIT; see `LICENSE`).
Local changes: Codex paths and invocation syntax, shared Persian/brand guidance,
replacement of the humanizer's misleading detection workflow, preservation of
ZWNJ in cleanup/fingerprint checks, and Unicode counting in `beats.py`.
Upstream inventory is recorded in `instagram/research/skill-upstream.json`.
