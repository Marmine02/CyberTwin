# PROGRESS

## Done
- Phase 1: repo, `.gitignore`/`.gitattributes`, `CLAUDE.md`, `docs/SPEC.md`, repo-local git identity
  (Marmine02 noreply), private repo github.com/Marmine02/CyberTwin, uv + python.org Python 3.12.10
  (Smart App Control workarounds: see docs/KNOWN_GAPS.md), backend (FastAPI/SQLAlchemy/NetworkX) and
  frontend (Vite 8/React 19/TS 6.0/Tailwind 4) scaffolds, `scripts/check.ps1`.

## In progress
- (none)

## Next
- Phase 2: data model + DB + migrations.

## Open questions / blockers
- `docs/design/` reference images are missing. Owner will add them before Phase 7.

## How to verify
- `powershell -ExecutionPolicy Bypass -File scripts\check.ps1` → ALL GREEN.
- Backend tools always via `uv run python -m <tool>` (exe trampolines are blocked by SAC).
