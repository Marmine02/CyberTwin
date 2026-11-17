# CyberTwin — Build Plan (Status: Complete - 2026-11-17)

Graph-based cybersecurity digital twin. Pure graph computation on a stored virtual model.
No scanning, no probes, no exploit code, no live monitoring.

## Architecture (summary — details in docs/ARCHITECTURE.md)

```
frontend (React 19 + Vite + RF12)  ──HTTP/SSE──>  FastAPI /api/v1
                                                     │
                     ┌───────────────┬───────────────┼──────────────┐
                  engine/        remediation/        ai/         repositories/
              (NetworkX attack   (typed actions,   (providers +    (SQLAlchemy 2 async;
               state graph,       what-if, compare) fallback,       SQLite now,
               scoring, hash)                      post-check)     Postgres via DATABASE_URL)
```

Key decisions
- **Revisions are immutable snapshots.** `twin_revisions.snapshot` holds the full validated
  `TwinSnapshot` (assets, connections, principals, firewall rules, vulns, segmented zones) as JSON.
  Every edit or remediation = new revision (parent, note, diff). Revert = new revision whose snapshot
  equals the parent of the reverted revision (append-only history).
- **Node positions** live in a separate `layout_positions` table (per twin) so dragging nodes does not
  spam revisions; positions never enter the engine or the result hash.
- **Network states are per port**: `asset#network:22`. This keeps “which port is reachable from where”
  exact, so an exploit on port 22 is only usable when port 22 itself is reachable.
- **Chokepoints = what-if of each vulnerability's canonical fix** (patch, restrict port, MFA, password,
  reduce permission, segment). The same computation feeds recommendations (expected Δscore).
- **AI never computes anything.** It receives the SimulationResult JSON, the post-check flags any
  vuln/asset/step id not in the input as “unverified”. Deterministic template fallback.
- TypeScript pinned to 6.0.x (typescript-eslint peer range is `<6.1`).

## Phases / checklist

- [x] 1. Scaffold + tooling (uv project, Vite app, eslint/ruff/mypy configs, Makefile, compose, .env.example)
- [x] 2. Data model + DB (Pydantic snapshot schemas, SQLAlchemy models, Alembic migration, repositories, seed)
- [x] 3. Simulation engine + tests (graph build, reachability, scenarios, scoring, chokepoints, timeline, hash)
- [x] 4. Remediation engine + tests (typed actions, recommendations, apply + compare, revert)
- [x] 5. API + tests (all routes, error envelope, CORS, reports HTML)
- [x] 6. AI service + fallback (providers, prompt, post-check, SSE, cache, chat, key-leak test)
- [x] 7. Design system (tokens, fonts, panels, neon nodes, particle edges, gauges, motion, i18n EN/TR)
- [x] 8. Pages (Overview, Network Map, Assets, Attack Simulation, Vulnerabilities, AI Assistant, Remediation, Reports)
- [x] 9. E2E (Playwright vs real uvicorn + vite) + visual QA screenshots EN/TR
- [x] 10. Docs (README, ARCHITECTURE, API, ENGINE, KNOWN_GAPS) + final report

## Round 2 (gap closing)

- [x] 1. AI numeric integrity: placeholders filled server-side, structured output (Ollama `format`), number (±0.5 %),
      citation, order, duplicate checks; engine-rendered steps; live evaluation in docs/AI_EVAL.md
- [x] 2. Residual exposure on Remediation and Overview (score formula unchanged)
- [x] 3. Connection edit/delete, vulnerability create/edit form, revision picker on Attack Simulation (+ Playwright)
- [x] 4. Engine i18n as {code, params}; TR "no English" Playwright test with a negative control
- [x] 5. respx contract tests for OpenAI-compatible and Anthropic (+ Ollama wire format)
- [x] 6. axe on 8 pages × EN/TR; contrast fixes; layout at 1024/1280; screenshots refreshed
- [x] 7. Docker compose up + E2E against it; PostgreSQL migrations + API tests; app on PostgreSQL + E2E
- [x] 8. Stop `ollama serve`

## Status (end of build session)

All phases executed. Verification results and every untested or simplified item are in the final report
and in [docs/KNOWN_GAPS.md](docs/KNOWN_GAPS.md) (notably: Docker/Makefile/PostgreSQL never run; only the
Ollama AI adapter was tested on a real provider).
