# PROGRESS

## Done
- Phase 1: repo, `.gitignore`/`.gitattributes`, `CLAUDE.md`, `docs/SPEC.md`, repo-local git identity
  (Marmine02 noreply), private repo github.com/Marmine02/CyberTwin, uv + python.org Python 3.12.10
  (Smart App Control workarounds: see docs/KNOWN_GAPS.md), backend (FastAPI/SQLAlchemy/NetworkX) and
  frontend (Vite 8/React 19/TS 6.0/Tailwind 4) scaffolds, `scripts/check.ps1`.

- Phase 2: domain model (`backend/src/cybertwin/domain`: immutable TwinContent snapshot per revision,
  integrity checks, canonical JSON + hash, diff), SQLAlchemy tables + Alembic `0001_initial`,
  repository layer, Northwind seed (`seed/northwind.py`). 19 tests on real temp SQLite + migrations.

- Phase 3: engine (`engine/`: network, findings, graph, scenarios, simulate) + typed actions
  (`remediation/actions.py`). Northwind SDE score 24.98, P1 via idp-01, top-3 recs -> 100,
  residual keeps svc-web admin right. 61 tests, 96% coverage on engine/remediation. docs/ENGINE.md.

- Phase 4: `remediation/compare.py` (blocked/reduced/new paths, per-asset delta), `services/core.py`
  (demo reset, edits as revisions, run, apply, revert, restore), `services/edits.py` (CRUD with
  cascade + dependents). 65 backend tests, 94% total coverage.

- Phase 5: FastAPI app (`api/app.py`, routes twins/simulation/system), error envelope, CORS lock,
  SPA serving via FRONTEND_DIST, `python -m cybertwin` entry point. 77 backend tests. docs/API.md.

- Phase 6: shared catalogs `shared/i18n/{en,tr,az}.json` (backend part) + `i18n/catalog.py`;
  `ai/` (context/placeholders, checks, narrative + template fallback, providers, service) with SSE
  routes `/ai/explain`, `/ai/chat`; reports JSON + printable HTML; `/i18n/{lang}`. 106 tests.

## In progress
- Phase 7: frontend i18n foundation + neon design system -> VISUAL CHECKPOINT (wait for owner).

## Next
- Phase 8: pages (after owner approves the visual checkpoint).

## Open questions / blockers
- `docs/design/` reference images are missing. Owner will add them before Phase 7.

## How to verify
- `powershell -ExecutionPolicy Bypass -File scripts\check.ps1` → ALL GREEN.
- Backend tools always via `uv run python -m <tool>` (exe trampolines are blocked by SAC).
