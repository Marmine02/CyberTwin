# CyberTwin

A cybersecurity digital twin: model a small organisation's IT, simulate attacks on the model as graph search, and
measure what each fix changes.

![Demo: reset, run Sensitive Data Exposure, replay the attack path, apply the top 3 fixes (score 25 → 100)](docs/media/demo.gif)

*The GIF shows the interface before the UX round; the screenshots below are current.*

<sub>28 s, recorded from the real stack (FastAPI + SQLite + the production frontend build in Chromium). Full quality: [demo.mp4](docs/media/demo.mp4).</sub>

![Overview: topology with the primary attack path, findings, posture, blast radius](docs/screenshots/01-overview-en.png)

![Attack simulation: map as the main surface, replay with plain-language narration, event log, selected path and biggest fix](docs/screenshots/04-attack-simulation-en.png)

![Remediation after the top 3 fixes: score 25 → 100, 10 attack paths blocked, per-asset risk](docs/screenshots/10-remediation-after-en.png)

## What it does

* You describe assets, open ports, network links, firewall rules, identities, permissions and findings. The demo
  ships with *Northwind Logistics* (8 assets).
* Five attack scenarios run on that model (sensitive data exposure, credential compromise, lateral movement,
  privilege escalation, outdated services) and return ranked attack paths, a 0–100 security score, blast radius and
  chokepoints.
* Each run replays itself on the map, one step at a time: the camera follows the attacker, and a card says in plain
  language who moves where, through which port or flaw, why the model allows it, the odds and the ATT&CK id.
* An AI analyst explains the result. It may only cite what the engine produced.
* The UI, engine messages, API errors, AI template and printable reports are in English, Turkish and Azerbaijani.
* A five-step guided demo starts on first launch (restart it from the help menu).
* Fixes are applied as new revisions of the model, with a before/after comparison and one-click revert.
* Reports: run history, revision diffs, printable HTML.

## How it works

**Engine.** The model is turned into a NetworkX attack-state graph: network states per asset *and port*
(`web-01#network:22`), privilege states, credentials and data. Edges are attack steps (reach, exploit, brute force,
credential theft and use, privilege escalation, trust and permission abuse), each with a reason, a probability weight
and ATT&CK ids. A scenario is a search from an entry point to its goals. The score, paths and blast radius are
deterministic and hashed. A chokepoint is a vulnerability whose canonical fix, re-simulated as a what-if, raises the
score most.

**AI analyst.** The model receives the simulation result as JSON and must answer in a fixed structure. Numbers are
written as placeholders that the server fills from the engine. Path steps are rendered from the engine, not by the
model. A post-check flags unknown ids, wrong numbers (±0.5 %), missing citations, wrong order and duplicate fixes in
the UI. Providers: Ollama, OpenAI-compatible, Anthropic. Without a provider, or on error, a deterministic template
writes the same sections.

**Remediation.** Fixes are typed actions: restrict a port, enforce MFA, require a password policy, patch, reduce a
permission, segment two zones. Recommendations are ranked by their what-if score change. Applying them creates a new
immutable revision and re-runs the scenario. The comparison shows blocked, reduced and new paths, the change in risk
per asset, and the *residual exposure*: weaknesses still in the model that no attack path reaches any more. Revert
is also a new revision, so history stays append-only.

## Stack

![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)
![NetworkX](https://img.shields.io/badge/NetworkX-graph%20engine-2C5BB4)
![SQLAlchemy](https://img.shields.io/badge/SQLAlchemy-2%20async-D71F00?logo=sqlalchemy&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-003B57?logo=sqlite&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169E1?logo=postgresql&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)
![React Flow](https://img.shields.io/badge/React%20Flow-12-FF0072)
![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-4-06B6D4?logo=tailwindcss&logoColor=white)
![Playwright](https://img.shields.io/badge/Playwright-E2E-2EAD33?logo=playwright&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-compose-2496ED?logo=docker&logoColor=white)
![Ollama](https://img.shields.io/badge/Ollama-local%20LLM-000000?logo=ollama&logoColor=white)

## Quick start

Prerequisites: Python 3.12 with [uv](https://docs.astral.sh/uv/), Node 24.

**Windows, simplest:** double-click `CyberTwin.bat` (details in [Run as a desktop app](#run-as-a-desktop-app)).

**Development** (two terminals, both stay open):

```bash
# terminal 1: backend API on :8000 (API only: opening http://localhost:8000 shows a JSON 404; OpenAPI at /docs)
cd backend
uv sync
uv run uvicorn app.main:app --reload --port 8000

# terminal 2: the UI. Open http://localhost:5173 (vite proxies /api to :8000)
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**, not :8000, and use `localhost` (on Windows vite listens on IPv6 `::1`, so
`http://127.0.0.1:5173` is refused). On Windows a second `uvicorn --port 8000` does not fail when an old one is
still running; it binds anyway and the old process keeps answering. Stop old servers first.

The first start runs the Alembic migrations and seeds the **Northwind Logistics** demo twin.

With GNU make (Linux / macOS / WSL): `make install`, then `make dev`.

Docker (verified: build, run, and the E2E suite against it): `docker compose up --build` → http://localhost:8080.
With a local LLM: `docker compose --profile ollama up --build`. On PostgreSQL:
`docker compose -f docker-compose.yml -f docker-compose.postgres.yml --profile postgres up --build`
(host port of the database: `CT_PG_PORT`, default 5433).

## Run as a desktop app

One process (the backend serves the API and the built UI on one port) and a browser app window, no tabs or
address bar. Windows 10/11 with Microsoft Edge (or Google Chrome); uv and Node only for the first start.

* **Start:** double-click `CyberTwin.bat`, or run `powershell -ExecutionPolicy Bypass -File scripts\CyberTwin.ps1`.
  First start: creates `backend\.venv` (uv) and builds `frontend\dist` (npm) if missing; later starts take a few
  seconds. The build is redone when the frontend sources are newer than `dist` (`-Rebuild` forces it).
* **Desktop shortcut** with the CyberTwin icon, no console window:
  `powershell -ExecutionPolicy Bypass -File scripts\install-shortcut.ps1` (`-Remove` deletes it).
  To pin it, pin the **shortcut**, not the running window (the port changes on every start).
* **Stop:** close the CyberTwin window; the launcher stops the backend.
* **Where things are:** database, logs and the window's browser profile in `%LOCALAPPDATA%\CyberTwin`
  (`logsackend.err.log` is the backend log). AI settings are read from `backend\.env`.
* **Errors** are shown as a dialog: port in use (`-Port <n>` names the process holding it; by default a free port
  is chosen), uv or Node missing, backend crash during start (with the log path).
* Without the launcher: build the UI (`cd frontend && npm run build`), then
  `FRONTEND_DIST=../frontend/dist uv run uvicorn app.main:app --port 8000` in `backend` and open http://localhost:8000.
  `FRONTEND_DIST` is empty by default (API only), so the dev and Docker/nginx setups are unchanged.

## Test results

| Suite | Result | Date | Path |
|---|---|---|---|
| Backend, full pytest (engine, remediation, API, i18n incl. AZ, app mode) | 123 passed, 1 skipped (live Ollama test; Ollama not running); coverage 95 % | 2026-11-17 (UX round) | real path (real temp SQLite, real HTTP via TestClient) |
| Backend, live Ollama (`test_live_ollama_explain_and_cache`) | 1 passed (qwen2.5:7b) | 2026-11-17 | real path (local Ollama) |
| Backend `tests/api` on PostgreSQL 17 | 48 passed | 2026-11-17 | real path (PostgreSQL in Docker) |
| Alembic migrations on PostgreSQL 17 | head `0001`, 8 tables; `-x url` takes precedence over `DATABASE_URL` | 2026-11-17 | real path |
| Frontend unit (vitest) + tsc + eslint | 28 passed; tsc, eslint clean | 2026-11-17 (UX round) | real path for what it covers (real i18next; no backend involved) |
| E2E local (uvicorn + `vite preview` + Chromium), all specs | UX round final: 131 passed / 1 skipped (ai-live, opt-in), logs/e2e-final-ux.log; after the last two fixes ux-flow + layout + a11y + app-mode re-run: 103 passed. Earlier rounds: 74 passed / 1 skipped | 2026-11-17 | real path |
| E2E single-process app mode (`app-mode.spec.ts`: one uvicorn serves UI + API, no vite) | 1 passed (alone and in the full run) | 2026-11-17 | real path |
| Desktop launcher (`e2e/scripts/verify-desktop.ts`: real `CyberTwin.ps1`, Edge app window via CDP) | passed: window title "CyberTwin", demo 25 → 100, window closed → backend stopped, no uvicorn left; Desktop shortcut started via the `.lnk` and closed the same way; failure paths (port in use, no npm, no uv, backend crash) checked by hand | 2026-11-17 | real path (Windows 11, Edge 157) |
| Guided demo via the desktop launcher (`e2e/scripts/verify-guided-demo.ts`: real `CyberTwin.ps1`, Edge app window via CDP) | passed in EN, TR and AZ: 5/5 steps with real run, replay and apply, score 25 → 100, "done" remembered, backend stopped on close; also passed on a run that had to rebuild the frontend | 2026-11-17 | real path (Windows 11, Edge) |
| UX flow (`ux-flow.spec.ts`: no-path state, autoplay + camera + narration timing, event log, map fit 1024/1280/1440, feedback, guided demo) | 6 passed | 2026-11-17 | real path |
| i18n (`i18n-lang.spec.ts`: no EN in TR; no EN and no TR in AZ, each with a negative control; TR/AZ server errors; AZ dates/numbers) | 5 passed | 2026-11-17 | real path |
| E2E Docker (`docker compose up --build`, nginx :8080, all specs except screenshots) | 56 passed, 1 skipped (ai-live, opt-in); **not re-run after the UX round** | 2026-11-17 (before the UX round) | real path |
| E2E app on PostgreSQL (compose overlay; demo-flow + ui-gaps) | 6 passed (before the UX round, not re-run) | 2026-11-17 | real path |
| Accessibility (axe, 8 pages × EN/TR/AZ) | 24 passed, 0 violations of any impact (inside the local E2E run; Docker run predates AZ) | 2026-11-17 | real path |
| E2E live LLM (`ai-live`, Ollama qwen2.5:7b) | before the UX round (not re-run, no AZ run): 1 passed; integrity: 0 placeholder / number / citation / order violations, 1 duplicate fix flagged, 0 unverified ids | 2026-11-17 | real path |
| `Makefile` | not run (no `make` on the Windows machine; each wrapped command was run individually) | n/a | not run |

## Simulation only: no real systems are scanned

CyberTwin never touches a network. There is no scanning, no probing, no exploit code and no live monitoring. Every
result is computed from the stored model, and the UI always shows **Simulation only: virtual model** in the top bar. The
probabilities are ranking weights, not calibrated real-world likelihoods.

What is untested, simplified or still open is listed bluntly in [docs/KNOWN_GAPS.md](docs/KNOWN_GAPS.md).

## Configuration (`backend/.env`, see `.env.example`)

| Variable | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | `sqlite+aiosqlite:///./cybertwin.db` | Any SQLAlchemy async URL; PostgreSQL: `postgresql+asyncpg://…` (`uv sync --extra postgres`) |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated allowed origins |
| `SEED_ON_STARTUP` | `true` | Seed the demo twin if missing |
| `FRONTEND_DIST` | (empty) | Path to `frontend/dist`: the backend then also serves the UI (single-process app mode). Empty = API only |
| `AI_PROVIDER` | `none` | `none` · `ollama` · `openai_compatible` · `anthropic` |
| `AI_MODEL`, `AI_BASE_URL`, `AI_API_KEY` | – | Provider settings (server-side only; a build check fails if a key pattern reaches the frontend bundle) |
| `AI_TIMEOUT_SECONDS`, `AI_MAX_RETRIES` | 45, 2 | Timeout and retries with exponential backoff before falling back to the template |

### Enabling an AI provider

* **Ollama (local)**: `ollama pull qwen2.5:7b`, then `AI_PROVIDER=ollama AI_MODEL=qwen2.5:7b AI_BASE_URL=http://localhost:11434`.
* **OpenAI-compatible**: `AI_PROVIDER=openai_compatible AI_BASE_URL=https://<host>/v1 AI_MODEL=<model> AI_API_KEY=<key>`.
* **Anthropic**: `AI_PROVIDER=anthropic AI_MODEL=claude-sonnet-5-5 AI_API_KEY=<key>`.

Without a provider (or on timeout/error) the deterministic template renderer produces the same sections in EN or TR.
The assistant always shows which mode produced the text.

## Demo walkthrough (about 3 minutes)

On first launch the **guided demo** walks through the same steps with short hints on the real UI (help menu **?** →
*Guided demo* to restart it).

1. **Overview**: the twin of Northwind Logistics. On a fresh demo a *Start here* panel explains the three steps.
2. **Attack Simulation**: choose **Sensitive Data Exposure** and press **Run simulation**. The run opens itself and
   replays: each step lights up its asset and hop, the camera follows, and the narration card explains it. Score
   **25** (24.54), primary path Internet → Edge Firewall → Public Web Server → Identity Server → Customer Database.
   Click any line in the event log to jump to that step. Under the score: the selected path's steps and the
   biggest single fix (+75.5).
3. **AI Assistant**: the explanation cites step ids (P1.S1…P1.S5). Ask *"What should I fix first?"*.
4. **Remediation**: fixes are sorted by the engine's what-if Δscore. **Select top 3** → **Apply** → confirm.
   Score **25 → 100**, 10 paths blocked, risk per asset, before/after maps. **Residual exposure** lists what is
   still in the model but no longer exploitable.
5. Back on **Attack Simulation**, a run on r2 finds no path and says why (*the fixes were applied in r2*), with
   **Run on r1 (before fixes)**, **Compare r1 vs r2** and **Reset demo**.
6. **Revert** restores the model (new revision) and re-runs: score back to **25**. **Reports**: run history,
   revision diff, printable report (Print → PDF).

The **↻** button in the top bar resets the demo (with confirmation). **EN / TR / AZ** switches the language.

## Running the tests

```bash
cd backend  && uv run pytest -m "not live" --cov      # engine, remediation, API (real temp SQLite)
cd backend  && uv run pytest -m live                  # real local Ollama (skipped if unreachable)
cd backend  && uv run ruff check . && uv run mypy app tests
cd frontend && npx tsc --noEmit && npm run lint && npm test
cd frontend && npm run build && npm run check:secrets  # no API-key patterns in the bundle
cd e2e      && npm install && npx playwright install chromium
cd e2e      && npx playwright test demo-flow           # real uvicorn + vite preview build, no mocks
cd e2e      && npx playwright test screenshots         # docs/screenshots (EN + TR, 1440×900)
cd e2e      && npx playwright test a11y layout i18n-lang # axe on 8 pages × EN/TR, 1024/1280/1440 layout, no EN in TR/AZ, no TR in AZ
cd e2e      && E2E_BASE_URL=http://localhost:8080 npx playwright test   # against the docker compose stack
cd e2e      && npx playwright test app-mode           # single-process mode: one uvicorn serves UI + API
cd e2e      && node scripts/verify-desktop.ts         # Windows: real launcher + Edge app window, demo flow, clean shutdown

# PostgreSQL: migrations + API tests (schema is reset before every test)
docker compose --profile postgres up -d postgres
cd backend && uv sync --extra postgres
DATABASE_URL=postgresql+asyncpg://cybertwin:cybertwin@localhost:5433/cybertwin uv run alembic upgrade head
CT_TEST_DATABASE_URL=postgresql+asyncpg://cybertwin:cybertwin@localhost:5433/cybertwin uv run pytest tests/api

# live LLM evaluation (Ollama): docs/AI_EVAL.md
PYTHONIOENCODING=utf-8 uv run python scripts/ai_eval.py --models qwen2.5:7b llama3.1
```

## Documentation

* [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): components and data flow (Mermaid)
* [docs/ENGINE.md](docs/ENGINE.md): graph model, formulas, worked demo numbers
* [docs/API.md](docs/API.md): endpoints, error envelope, SSE events
* [docs/AI_EVAL.md](docs/AI_EVAL.md): AI integrity design and live LLM evaluation with failure cases
* [docs/KNOWN_GAPS.md](docs/KNOWN_GAPS.md): what is untested or simplified (read this before trusting any number above)
* [docs/UX_AUDIT.md](docs/UX_AUDIT.md): first-time-user audit (findings, screenshots in `docs/ux/before`, `docs/ux/after`)
* [docs/DESIGN.md](docs/DESIGN.md): design tokens and rules (colour, glow and motion, type, spacing)
* [docs/i18n/az_review.md](docs/i18n/az_review.md): every Azerbaijani string next to its English source, for review
* [PLAN.md](PLAN.md): build plan and checklist
* [docs/media/README.md](docs/media/README.md): how the demo video and GIF are recorded
