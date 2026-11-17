# PROGRESS

## Done
- Phase 1: repo, `.gitignore`/`.gitattributes`, `CLAUDE.md`, `docs/SPEC.md`, repo-local git identity
  (Marmine02 noreply), private repo github.com/Marmine02/CyberTwin, uv + python.org Python 3.12.10
  (Smart App Control workarounds: see docs/KNOWN_GAPS.md), backend (FastAPI/SQLAlchemy/NetworkX) and
  frontend (Vite 8/React 19/TS 6.0/Tailwind 4) scaffolds, `scripts/check.ps1`.

- Phase 2: domain model (`backend/src/cybertwin/domain`: immutable TwinContent snapshot per revision,
  integrity checks, canonical JSON + hash, diff), SQLAlchemy tables + Alembic `0001_initial`,
  repository layer, Northwind seed (`seed/northwind.py`). 19 tests on real temp SQLite + migrations.

## In progress
- Phase 3: simulation engine (`backend/src/cybertwin/engine`).

## Next
- Phase 4: remediation engine.

## Open questions / blockers
- `docs/design/` reference images are missing. Owner will add them before Phase 7.

## How to verify
- `powershell -ExecutionPolicy Bypass -File scripts\check.ps1` → ALL GREEN.
- Backend tools always via `uv run python -m <tool>` (exe trampolines are blocked by SAC).
