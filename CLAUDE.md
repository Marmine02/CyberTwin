# CyberTwin: working rules (Updated: 2026-11-17)

## Checkpoint protocol (mandatory)
- `PROGRESS.md` is the source of truth for state. Update it:
  - after every finished item or sub-step,
  - BEFORE starting any long step (full test suites, live LLM evals, Docker builds).
- PROGRESS.md format:
  ## Done        (one line each + how it was verified)
  ## In progress (exact sub-step, files being touched)
  ## Next        (ordered list)
  ## How to verify (exact commands)
  ## Suggested commit message for the current checkpoint
- When an item is done: write the suggested commit message in PROGRESS.md and
  tell me "CHECKPOINT N ready". Then keep working. Do NOT run git commit/push;
  I commit myself. Never add AI signatures or Co-Authored-By lines.

## Resuming (new session or after a usage limit)
1. Read PROGRESS.md, then `git status` and `git diff --stat`.
2. Continue from "In progress". Don't redo finished work, don't re-run full
   suites unless the step needs it.

## Token discipline
- Redirect long test/build output to logs/<name>.log and read only the summary
  and failures (tail / grep). Never dump full suite output into context.
- Live LLM evals and full E2E runs are expensive: run them only at the end of
  an item, not after every small edit.

## Rules carried over
- Tests count only on the real path (real backend/DB/browser/LLM). Mock-only = "not tested".
- Unfinished or unverified things go into docs/KNOWN_GAPS.md, stated bluntly.