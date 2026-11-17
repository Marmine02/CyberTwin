# CyberTwin — rules for every session

Full product spec: `docs/SPEC.md` (source of truth). Resume state: `PROGRESS.md` + `git log` + `git status`.

## Communication
- Talk to the owner in Turkish (Azerbaijani if they ask), short and clear.
- Before any install, admin (UAC) prompt or GitHub step: one sentence on what and why.
- Ask only when truly blocked.

## Working rules
- Update `PROGRESS.md` (Done / In progress / Next / How to verify) after every finished step and BEFORE any long run.
- Token discipline: long test/build output goes to `logs/<name>.log`; read only summaries/failures.
- Real path only: tests count only against the real backend, DB, browser, launcher. Mock-only = "not tested", report it so.
- Unfinished items go to `docs/KNOWN_GAPS.md`, stated bluntly.
- Check current package versions when installing (`npm view`, `uv`); never pin from memory.
- No Docker, no Ollama on this PC. Do not install them.

## Git
- Repo-local `user.name` / `user.email` only; never touch global git config.
- Commit after every checkpoint, small logical commits: `feat:`, `fix:`, `test:`, `docs:`, `chore:`.
- NO AI attribution anywhere: no `Co-Authored-By`, no "Generated with", no AI signature in commits or PRs.
- Run relevant tests before each commit; never commit red. Never commit secrets.
- Push at the end of every phase. Never force-push. Show `git log --oneline -5` after each push.

## Hard product rules
1. Never touch real infrastructure: no scanning/probing/exploit code. Pure graph computation on stored data.
2. Attack paths come only from the deterministic engine. The LLM only explains; never invents paths, vulns, numbers, scores.
3. No fake live monitoring ("Live", "Real-time", fake incidents/feeds). Persistent "simulation-only" badge. Seed CVEs labelled "illustrative".
4. Determinism: same revision + scenario → byte-identical result (sorted IDs, no randomness). Tested.
5. No hardcoded UI strings: EN/TR/AZ via i18n from day one.
6. Neon design (spec §10) is the visual target; never tone down glow, gradient borders, particles, palette.

## Windows notes
- Shell is Windows PowerShell 5.1: no `&&`; run npm via `cmd /c` when stderr warnings matter.
- Python 3.12 via `uv` only.
