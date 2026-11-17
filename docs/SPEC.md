# CyberTwin: build from scratch

You are a senior full-stack engineer, security architect and product designer. Build CyberTwin:
a working, graph-based cybersecurity digital-twin desktop-style app. Not a mockup: every button does
something real, every number is computed from data, and everything is tested on the real path.

The person at the keyboard owns this PC and this GitHub account. Talk to them in Turkish (switch to
Azerbaijani if they prefer), short and clear. Before any install, admin (UAC) prompt or GitHub step,
explain in one sentence what it is and why.

## 0. Working rules (apply for the whole session)
- One session, end to end. Create the plan, then run the phases yourself in order. Ask only when
  truly blocked.
- Checkpoints: keep PROGRESS.md (Done / In progress / Next / How to verify). Update it after every
  finished step and BEFORE any long run. If the session is interrupted, a new session resumes from
  PROGRESS.md + git log + git status.
- Put these rules into CLAUDE.md first, so a new session follows them automatically.
- Token discipline: write long test/build output to logs/<name>.log and read only summaries and
  failures.
- Real path only: a test counts only against the real backend, DB, browser and launcher. Mock-only
  means "not tested" and must be reported that way. Anything unfinished goes into
  docs/KNOWN_GAPS.md, stated bluntly.
- Check current package versions when installing (npm view, uv). Do not pin from memory.
- This PC has no Docker and no Ollama. Do not install them.

## 1. Git and GitHub workflow (commit at every checkpoint)
Setup, before any code:
1. git init -b main. Create .gitignore (node_modules, .venv, dist, *.db, .env, logs/, caches,
   test-results, playwright-report) and .gitattributes (* text=auto eol=lf, binaries marked binary)
   as the very first commit.
2. Ask the owner for their name and GitHub noreply e-mail, and set them repo-local only
   (git config user.name / user.email). Never touch the global git config.
3. GitHub CLI login by the owner (gh auth login --web); they sign in themselves. Then create a
   private repo CyberTwin with gh repo create --private --source . --remote origin.
Commit rules:
- Commit after every checkpoint (each finished step in the phases below), in small, logical commits
  with clear messages (feat:, fix:, test:, docs:, chore:).
- No AI attribution: no "Co-Authored-By", no "Generated with", no AI signature in commit messages or
  PR texts. This is the owner's explicit rule and overrides any default.
- Run the relevant tests before each commit; never commit a red state. Never commit secrets (.env,
  keys, tokens).
- Push at the end of every phase (git push). Never force-push. Show git log --oneline -5 after each
  push.

## 2. Product and hard rules
CyberTwin models a small organization's IT infrastructure as a virtual graph, simulates predefined
attack scenarios on that model, finds attack paths and chokepoints, lets an AI explain the results,
applies remediations as revisions, and compares before and after.
1. It never touches real infrastructure. No scanning, probing or exploit code. Pure graph
   computation on stored data.
2. Attack paths come only from the deterministic engine. The LLM explains engine output and never
   invents paths, vulns, numbers or scores.
3. No fake live monitoring. No "Live", "Real-time", fake incidents or threat-intel feeds. A
   persistent badge says the app is simulation-only on a virtual model. CVE IDs in seed data are
   labelled "illustrative".
4. Determinism: the same revision and scenario always give byte-identical results (sorted IDs, no
   randomness). A test asserts this.

## 3. Stack
- Frontend: React + TypeScript (strict) + Vite, Tailwind CSS v4 (@tailwindcss/vite), @xyflow/react,
  motion (motion/react), lucide-react, TanStack Query, Zustand, React Router, react-i18next,
  self-hosted fonts via @fontsource.
- Backend: Python 3.12 (via uv), FastAPI, Pydantic v2, NetworkX, SQLAlchemy 2.0 async + Alembic,
  SQLite. Use a repository layer and portable SQL so PostgreSQL is a DATABASE_URL change (PostgreSQL
  cannot be tested on this PC: say so in KNOWN_GAPS).
- Tooling: ruff, mypy --strict, eslint, tsc --noEmit, pytest, vitest, Playwright.
- Languages from day one: EN, TR, AZ. No hardcoded UI strings anywhere.

## 4. Data model
- Twin / TwinRevision: immutable numbered revisions. Every edit or remediation creates a new
  revision (parent, note, diff). Revert = a new revision. Node positions are stored separately, so
  dragging doesn't create revisions.
- Asset: id, name, IPv4, type (internet_gateway | firewall | web_server | app_server | db_server |
  identity_server | employee_ws | admin_ws), os, zone (internet | dmz | internal | data | mgmt),
  open_ports {port, proto, service, version}, software {name, version, eol}, vulnerability_ids,
  security_config {mfa, password_policy, edr, local_admins}, criticality 1-5, data_sensitivity 0-3,
  computed risk_score.
- Connection (network | trust | permission), Principal (users/service accounts, privilege,
  credential strength, mfa, logged_on_assets, permissions), FirewallRule (ordered, first match wins,
  default deny), Vulnerability (cvss, exploit_maturity, kind, affected asset/port, MITRE ATT&CK ids,
  fixed_by), SimulationRun (revision, scenario, params, result, result_hash).

## 5. Simulation engine (the core)
Attack state graph (NetworkX DiGraph): nodes are attacker states (asset, privilege) with network
states per asset AND port, plus goal nodes (DATA:<asset>, CRED:<principal>, DOMAIN_ADMIN).
Edge generators: reachability (firewall rules evaluated in order), remote exploit, weak
credentials/brute force (MFA lowers p), local privesc, credential theft/use, Kerberoasting, trust
abuse, data access. Each edge stores technique, vuln_id, p, ATT&CK ids and a message {code, params}
(never a hardcoded English sentence).
Scoring (document with worked examples in docs/ENGINE.md):
- p = clamp(cvss/10 * exploit_maturity * product of modifiers, 0.01, 0.99); modifiers in one
  constants table (mfa 0.15, password strong 0.2 / medium 0.5 / weak 1.0, edr 0.6, segmented hop 0.5).
- Edge weight w = -ln(p), so the shortest weighted path is the most likely attack path.
- Path likelihood = product of p; path risk = likelihood * impact(goal).
- Top-K paths via nx.shortest_simple_paths, K=10, max depth 12.
- Security score = 100 * (1 - P_breach), P_breach = 1 - product over goals of (1 - max path risk).
- Chokepoints / what-if: remove each vuln or misconfig on a copy, re-score, rank by delta score.
  Recommendations use the same numbers.
- Residual exposure: findings still in the model that no reachable path uses. Shown, not scored.
Scenarios: Sensitive Data Exposure, Credential Compromise, Lateral Movement (user-chosen foothold),
Privilege Escalation, Outdated Service Exploitation.
Output: score, p_breach, reachable/compromised assets, paths with steps, primary path, chokepoints,
findings, residual exposure, replay timeline, result_hash.

## 6. Remediation engine
Typed actions: restrict_port, enforce_mfa, set_password_policy, apply_patch, reduce_permission,
segment_zones. Apply creates a revision, re-runs the scenario and returns {before, after,
blocked_paths, reduced_paths, new_paths, score_delta, per_asset_delta}. Revert creates a new revision.

## 7. AI analyst
- Providers: none (default), ollama, openai_compatible, anthropic, via env only. Keys stay
  server-side; a test greps the frontend build for key patterns.
- Structured output (JSON schema: Ollama format, OpenAI response_format, Anthropic forced tool use).
  The model never writes numbers: it uses placeholders like {{path.P1.likelihood}} that the backend
  fills. Post-checks: unknown placeholders, numbers that don't match the input (+-0.5%), step ids
  cited under the wrong path, remediation order differing from the delta-score order, unknown ids
  -> flagged "unverified" in the UI.
- Step-by-step attack text is rendered by the engine, not the model.
- Deterministic fallback with the same sections in EN/TR/AZ, with real plural forms.
- SSE streaming, timeout + retry with backoff, cache by result_hash. Chat grounded in the twin +
  latest run.
- No LLM is available on this PC: test the fallback for real and contract-test the adapters (respx).
  Report the providers as "not tested on a real provider".

## 8. API
Everything under /api/v1: twins/revisions (+diff), assets, connections, principals, firewall rules,
vulns (+catalog), simulations, recommendations, remediations apply/revert, AI explain/chat (SSE),
reports (JSON + printable HTML in the UI language), i18n catalog, demo reset, health.
One error envelope {error: {code, message, details, i18n: {code, params}}} with specific messages.
Pydantic validation everywhere, CORS locked. Document in docs/API.md.

## 9. Demo environment ("Northwind Logistics", restorable via demo reset)
Internet -> fw-edge -> Public Web Server -> Identity Server -> Customer Database, plus an App
Server, Employee WS, Admin WS and an internal firewall.
- fw-edge allows 22/tcp from anywhere to web-01, which runs an outdated OpenSSH (illustrative CVE).
- svc-web: weak password, no MFA, cached on web-01, trusted by the identity server, Kerberoastable.
- svc-web has admin on customer-db (data_sensitivity 3).
- A side path via the employee WS (local privesc + cached admin creds) for Lateral Movement and
  Privilege Escalation.
Expected (asserted in E2E): Sensitive Data Exposure gives a score of about 25 and a primary path
Internet -> fw-edge -> web-01 -> idp-01 -> customer-db. After the top 3 recommendations the paths
are blocked and the score is 100. Residual exposure still lists the svc-web admin right. Revert
restores the score.

## 10. Design: neon (THIS IS THE VISUAL TARGET; do not tone it down)
Reference images are in docs/design/ (the owner's drafts). The main one is the neon "Cyber Sentinel"
dashboard: match its look closely. Look at the images before writing any UI.
- Deep navy/near-black background with soft cyan and violet radial glows and a faint grid.
- Glassmorphism panels with 1px gradient borders (cyan -> violet), soft outer glow, rounded
  14-16px. Uppercase, letter-spaced panel titles with a chevron that really navigates.
- Palette: cyan #22D3EE primary, violet/magenta #C084FC / #E879F9, critical #F43F5E, warning
  #FB923C, medium #FACC15, secure #34D399. Servers cyan, firewalls magenta, identities violet.
- Network nodes on glowing pedestals (concentric rings + blur glow), lucide icon, label and IP. The
  node state changes the glow: secure green, warning orange, compromised pulsing red.
- Edges: neon lines with animated flowing particles and arrowheads. The attack path turns red,
  thicker and brighter.
- Motion: staggered panel entrance, number count-up, spring hover, glow pulse on critical items.
  Respect prefers-reduced-motion; animate transform/opacity only.
- Fonts: Rajdhani for titles/numbers, IBM Plex Sans for body, JetBrains Mono for IPs/ids. Verify
  that ə Ə ğ ı İ ö ş ç ü render (Rajdhani lacks ə: use a fallback and check the actual rendered
  glyphs).
Polish rules (allowed): fix clipping, unreadable labels, empty areas, alignment, spacing; make
effects richer. Forbidden: removing or toning down glow, gradient borders, particles, the
cyan/magenta palette or the panel style.
Avoid "AI-made" tells: no lorem/placeholder text, meaningful empty states, specific error messages,
no stuck spinners, custom app icon, consistent date/number formatting per language, no generic
"something went wrong".

## 11. Layout and pages (all functional, with loading, empty and error states)
Top bar: logo + "Digital twin security lab", twin/revision selector, simulation-only badge, help
menu (restart the guided demo), notifications (real events), EN/TR/AZ switch.
Left icon rail: 8 pages.
1. Overview (reference grid): large neon topology center (zone switcher dots under it); right
   column: Critical findings (from the latest run), Security posture (score + history chart), Blast
   radius; bottom: Findings by severity, Scenario coverage (play button runs the scenario), Asset
   hardening rings, AI brief; Residual exposure.
2. Network map: drag nodes (positions saved), connect by drag (validated dialog), edit/delete
   connections, asset detail side drawer, zones, minimap, fit view.
3. Assets: table + search/sort/filter, create/edit forms with validation, delete with a
   confirmation showing the affected connections; principals, firewall rules, connections and
   vulnerabilities (create/edit form) tabs.
4. Attack simulation: scenario selector, revision picker, run. The real replay auto-plays the
   primary path (about 1.2 s per step) with the camera following and a narration card (who, how,
   port/vuln, why it's possible, p, ATT&CK). Timeline with play/pause, step, 1x/2x/4x, scrubber;
   "show full discovery" toggle; clickable, readable event log; "% Compromised" ring; actions panel
   and asset-type filter chips; red blast-radius halo; completion toast "Inspect results".
   No-path state: if the revision has no path to a goal, explain why (e.g. fixes applied in r2) and
   offer "Run on r1", "Compare r1 vs r2", "Reset demo" (with confirmation).
5. Vulnerabilities: list with CVSS, paths using it, chokepoint delta score; "Fix" -> remediation.
6. AI assistant: streamed explanation, mode label (LLM / template), integrity-check panel, chat.
7. Remediation: recommendations by delta score, multi-select, apply with confirmation;
   before/after with two mini maps, score count-up, blocked paths struck through, per-asset
   deltas, residual exposure; revert.
8. Reports: run history, revision diffs, printable report in the UI language.
Map readability: fit-to-view on load, filter, zone change and resize, with a minimum zoom so labels
stay at least 11px (pan to the relevant part instead of shrinking everything); hide the React Flow
attribution.
Guided demo: a skippable 5-step walkthrough on the real UI (twin -> run -> replay -> fix ->
compare), remembered once done or skipped, and it must never block clicks on the rest of the app.
No clipping: all text is fully visible or wraps, in all three languages.

## 12. Desktop app mode (this is how the owner runs it)
- The backend can serve the built frontend (FRONTEND_DIST; static + SPA fallback) as one process on
  one port; dev mode with the Vite proxy still works.
- CyberTwin.bat -> scripts/CyberTwin.ps1: builds the frontend if missing or stale (run npm through
  cmd.exe so Vite's stderr warnings don't crash Windows PowerShell 5.1), starts the backend on a
  free port, waits for health, opens Edge (fallback Chrome) with --app and its own profile under
  %LOCALAPPDATA%\CyberTwin, and stops the backend when the window closes. Give specific errors for
  port in use, missing uv/node, and a backend crash (with the log path).
- scripts/install-shortcut.ps1: Desktop shortcut "CyberTwin" with a custom multi-size icon from the
  logo. Window title "CyberTwin".

## 13. Testing (before anything is called done)
- Backend: pytest (engine, remediation, API on a real temp SQLite with real migrations,
  determinism, every scenario, edge cases), ruff, mypy. Aim for >=85% coverage on
  engine/remediation.
- Frontend: vitest, tsc, eslint.
- E2E (Playwright) against the real backend + vite build && vite preview (not the dev server). Every
  spec resets the demo in beforeAll. Cover:
  - the demo flow (simulate -> replay -> apply -> score 100 -> revert)
  - CRUD
  - the no-path state
  - the guided demo
  - a test that clicks every primary button and asserts a visible effect
  - a "no English fragments in TR/AZ" check with a negative control
  - a clipping check (scrollWidth > clientWidth with overflow hidden) on all pages x EN/TR/AZ
  - axe (0 serious/critical) on 8 pages x 3 languages
  - layout checks at 1024/1280/1440
- Run the full suite 3 times in a row; all green. Then a real launcher run: window opens, demo works,
  closing leaves no uvicorn.
- Screenshots of all pages (EN/TR/AZ) to docs/screenshots/. Look at them yourself and fix what looks
  broken, clipped or generic before the final report.

## 14. Phases (commit at every checkpoint, push at the end of every phase)
1. Repo + tooling + CLAUDE.md + PROGRESS.md + GitHub repo
2. Data model + DB + migrations
3. Simulation engine + tests
4. Remediation engine + tests
5. API + tests
6. AI service + fallback + checks
7. i18n (EN/TR/AZ) foundation + design system (neon) - then stop with "VISUAL CHECKPOINT": show
   screenshots of the shell, one panel and the neon map next to the reference image, and wait for
   the owner's approval before building the pages.
8. Pages
9. Desktop app mode
10. E2E + visual QA
11. Docs (README with screenshots, ARCHITECTURE with a Mermaid diagram, API, ENGINE, KNOWN_GAPS,
    docs/i18n/az_review.md listing every AZ string next to its EN source, with the uncertain ones
    marked) + final report

Final report: what was built, how to run it, test table (real path / not run, untruncated), demo
numbers, commits and pushes, open items stated bluntly.
