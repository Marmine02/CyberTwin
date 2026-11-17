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

- Phase 7: frontend foundation: i18n (shared catalogs + `shared/i18n/ui.{en,tr,az}.json`), API client
  (error envelope, POST-SSE), hooks, Zustand stores, neon design system (`styles/index.css`), shell
  (TopBar, IconRail, menus), neon map (`components/map`), Overview page. Checkpoint images in
  `docs/screenshots/checkpoint-*.png` (real backend + Edge).

- Visual checkpoint approved by the owner (2026-11-17).
- Phase 8: all 8 pages (`frontend/src/pages`), guided demo (`components/GuidedTour.tsx`), toasts,
  dialogs, forms with validation, replay (`lib/replay.ts`). First E2E specs (demo flow, no-path)
  green against real backend + vite preview + Edge (`frontend/playwright.config.ts`).

- Phase 9: `CyberTwin.bat` -> `scripts/CyberTwin.ps1`, `scripts/install-shortcut.ps1`,
  `assets/cybertwin.ico` (made by `frontend/scripts/make-icon.mjs`). Verified for real on 2026-11-17:
  shortcut installed, app opened from the Desktop shortcut, demo driven in that window over CDP
  (`frontend/scripts/verify-desktop.mjs`: 25.0 -> 100.0 -> revert), window closed, 0 python/uvicorn
  and 0 Edge processes left. Error paths tested: port in use, missing uv, backend crash.

- Phase 10 (part): full E2E suite in `frontend/e2e` (demo-flow, no-path, crud, guided-tour, buttons,
  quality: TR/AZ English-fragment detector with negative control, clipping, axe 0 serious/critical
  on 8 pages x 3 languages, layouts 1024/1280/1440, label >= 11 px, glyphs, build secrets).
  One full run: 41 passed. Bugs it found and fixed: effect cleanup crash (destroy_ is not a function),
  notifications button accessible name, English diff field names + English suffix written into rule
  descriptions by restrict_port.
- docs/ARCHITECTURE.md written; `frontend/scripts/az-review.mjs` written (not run yet).

## In progress (resume here)
- Commit the uncommitted work (E2E suite + fixes + ARCHITECTURE.md + az-review script), then
  `powershell -ExecutionPolicy Bypass -File scripts\e2e.ps1 -Runs 3` (3 green runs required).
- Then screenshots of all pages EN/TR/AZ to docs/screenshots (`frontend/scripts/pages.mjs`), visual QA,
  push (end of phase 10).

## Next
- Phase 11: run az-review.mjs, finish README (screenshots), ENGINE/API/KNOWN_GAPS review, final report.

## Open questions / blockers
- `docs/design/` reference images are missing. Owner will add them before Phase 7.

## How to verify
- `powershell -ExecutionPolicy Bypass -File scripts\check.ps1` → ALL GREEN.
- Backend tools always via `uv run python -m <tool>` (exe trampolines are blocked by SAC).
