# PROGRESS (Updated: 2026-11-17)

## Done
- UX Phase A (CHECKPOINT A): usability audit through the real launcher (e2e/scripts/ux-audit.ts, CDP on the Edge
  app window, 1440x900, reset demo -> run -> replay -> apply top 3 -> r2 on all 8 pages, TR repro of the user's
  screenshot). 28 screenshots + audit.json in docs/ux/before/, log logs/ux-audit-before.log. docs/UX_AUDIT.md:
  20 findings ranked S1-S4 with screenshot refs and planned fixes, AI-slop tells (10). No app code changed.
- Build items (PLAN.md phases 1-10, round 2 items 1-8) committed in cb33e77. Verified previously: backend 115 tests
  (incl. 1 live Ollama), coverage 96%; E2E vs Docker 55 passed; E2E vs PostgreSQL 6 passed.
- Step 0: PROGRESS.md created; `logs/` added to .gitignore.

- Step 1 (CHECKPOINT 1): E2E stability. webServer = `vite build && vite preview --port 5199 --strictPort`;
  vite.config `preview.proxy` is the same object as `server.proxy`; every spec resets via `resetDemoApi()` in
  beforeAll; opt-in server-exit diagnostic (E2E_DIAG=1, e2e/diag/server-exit.cjs).
  Verified: 3 consecutive full runs 72 passed / 1 skipped each (logs/e2e-run{1,2,3}.log, 10:18-10:28, E2E_DIAG=1).
  Investigation (17 full runs total): 1 failure = Modern Standby (proven via System log); 1 failure = Vite tree died
  silently at 09:12, root cause NOT found (see docs/KNOWN_GAPS.md).
- Step 2 (CHECKPOINT 2): live LLM E2E NOT RUN this session: Ollama not running (curl :11434 refused, no process).
- Step 3 (CHECKPOINT 3): i18n gaps closed. API DomainErrors carry `i18n` {code, params} (EN `message` unchanged),
  shown in TR via errorMessage(); client-side API errors translated; "(s)" plurals -> i18next _one/_other (UI and
  engine catalog; backend render() resolves count forms too). Verified: pytest 117 passed / 1 skipped; ruff, mypy
  clean; vitest 25 passed; tsc, eslint clean; E2E i18n-tr (2 tests incl. new TR error test) + demo-flow (EN
  verbatim error) 5/5 passed (logs/e2e-step3.log).
- Step 4 (CHECKPOINT 4): final full E2E run on final code 73 passed / 1 skipped (logs/e2e-final.log); backend
  coverage 95% (logs/backend-cov.log); KNOWN_GAPS.md (E2E stability section, i18n status) and API.md (error
  envelope `i18n`) updated.
- Verify Step 1 (CHECKPOINT V1): Docker E2E. `docker compose up --build -d` (backend healthy, nginx :8080), then
  E2E_BASE_URL=http://localhost:8080 all specs except screenshots: 56 passed, 1 skipped (ai-live, opt-in).
  logs/e2e-docker.log, 2026-11-16 10:58.
- Verify Step 2 (CHECKPOINT V2): PostgreSQL 17 (compose profile, CT_PG_PORT=5434). Local venv needed the locked
  `postgres` extra (`uv sync --extra postgres --locked`, asyncpg 0.32.0; lockfile unchanged).
  Alembic: `-x url=<pg>` with DATABASE_URL=<decoy sqlite> -> PG got 8 tables (ai_cache, alembic_version, events,
  layout_positions, remediation_records, simulation_runs, twin_revisions, twins), alembic_version=0001, decoy file
  NOT created (so -x wins); DATABASE_URL=<pg> alone -> `alembic current` = 0001 (head).
  tests/api with CT_TEST_DATABASE_URL=<pg>: 48 passed (logs/backend-api-pg.log).
  App on PG (overlay, DATABASE_URL confirmed in container) + E2E demo-flow + ui-gaps: 6 passed
  (logs/e2e-postgres.log); PG then held the app's rows. Teardown: own containers, volume, network removed with
  `down -v`; bravo_postgres untouched. 2026-11-16 10:59.
- Verify Step 3 (CHECKPOINT V3): live LLM (Ollama, qwen2.5:7b). Backend
  tests/api/test_ai.py::test_live_ollama_explain_and_cache: 1 passed (22.9 s, logs/live-ollama-backend.log).
  E2E ai-live: 1 passed (logs/e2e-ai-live.log): 3,568 chars, 0 unverified marks, UI shows 1 violation.
  Integrity (from ai_cache meta): placeholders 0, numeric 0, citations 0, order 0, techniques 0, missing sections 0,
  unverified ids 0; duplicate fixes 1 (vuln-ssh-rce|restrict_port:web-01:22:mgmt); unplaced (correct literal)
  numbers 2 (24.54, 22). ai_eval.py not rerun. 2026-11-16 11:00.
- Verify Step 4 (CHECKPOINT V4): docs/screenshots reverted (17 files changed only by test runs; no UI fix this
  session). Test-results table (one row per suite, date, path) added to docs/KNOWN_GAPS.md and README.md; Docker and
  PostgreSQL rows in KNOWN_GAPS updated; README E2E comment corrected (vite preview build). No bugs found, no code
  changed. 2026-11-16 11:01.
- README showcase (CHECKPOINT S1), docs/visuals only, no app code changed:
  - e2e/scripts/record-demo.ts: real uvicorn :8766 + vite preview :5198 + Chromium, 1440x900 video; run 28.05 s.
  - docs/media/demo.mp4 (1440x900, 2.0 MB) and demo.gif (1200x750, 12 fps, 27.25 s, 5.3 MB). GIF size root cause:
    VP8 codec noise in every frame (23.6 MB raw), fixed with e2e/scripts/stabilize_frames.py (16x16 block temporal
    stabilizer; ghosting checked visually). Reproduction in docs/media/README.md.
  - Screenshots regenerated (screenshots.spec 17 passed); kept only those whose visible text changed by the plural
    fix: 01-overview-en, 07-remediation-en, 10-remediation-after-en; others reverted.
  - README rebuilt: title + one-liner, GIF, 2 screenshots, what it does, how it works (engine/AI/remediation),
    stack badges, quick start, test results (kept), simulation-only note + KNOWN_GAPS link, then the old config,
    walkthrough, test commands and docs sections.
- Last "(s)" plural fixed (CHECKPOINT P1): app/i18n plural_lookup() shared by the engine catalog and the AI fallback
  template; fallback exec_body -> exec_body_one/_other (EN), TR base key. Repo grep: no "(s)" UI/text strings left.
  Test tests/api/test_ai.py::test_fallback_summary_uses_plural_forms (1 vs N paths, EN+TR). pytest 119 passed
  (0 skipped, live Ollama ran; logs/backend-plural.log); ruff + mypy clean.
  Demo re-recorded (27.9 s) and rebuilt per docs/media/README.md: demo.mp4 1440x900 2.1 MB, demo.gif 1200x750
  12 fps 5.5 MB. NOTE: the demo's Overview is shown before any run ("No simulations yet"), so the fallback summary
  never appears in the GIF (the earlier claim that the GIF showed "path(s)" was wrong). Confirmed instead on
  01-overview-en.png, refreshed (screenshots.spec 17 passed, only this file kept): "The engine found 10 attack paths;".
- Desktop-app mode (CHECKPOINT D1), after fad4d8f:
  - Step 1: clean clone: uv sync, npm install, backend, `npm run dev` (renders on localhost:5173), docker build
    --no-cache + up all work. No hard failure reproduced. Reproducible traps fixed in README: :8000 is API only (JSON
    404 at /), vite refuses 127.0.0.1:5173 (binds ::1), a 2nd uvicorn on a taken port binds silently on Windows.
    User's own 12:09 processes: docker stack untouched and up; their uvicorn :8000 (PIDs 33040/41088) was gone by
    ~12:41, cause unknown (not killed by any command of this session as far as checked).
  - Step 2: FRONTEND_DIST app mode in backend (static + SPA fallback, /api unchanged, default off); index.html title
    "CyberTwin"; scripts/CyberTwin.ps1 + CyberTwin.bat + scripts/install-shortcut.ps1 + scripts/assets/cybertwin.ico
    (e2e/scripts/make-icon.ts).
  - Step 3: e2e/scripts/verify-desktop.ts PASSED (real launcher, Edge app window via CDP, demo 25 -> 100, close ->
    no uvicorn). Shortcut created on the Desktop and launched via the .lnk, closed via CloseMainWindow -> clean.
    Failure paths checked. tests/api/test_frontend_mode.py (3) + e2e app-mode.spec.ts (1). pytest 121 passed /
    1 skipped; vitest 25; full E2E 74 passed / 1 skipped (logs/e2e-desktop-3.log). Two earlier full-run aborts
    unexplained (KNOWN_GAPS). Taskbar not visually verified.
  - Step 4: README "Run as a desktop app" + quick-start fixes + FRONTEND_DIST config row + test rows; KNOWN_GAPS:
    no Electron/installer, launcher limits, unexplained aborts.

- UX Phase B (CHECKPOINT B): functions feel real.
  - Revision/state clarity: no-path card (why + "Run on r1 (before fixes)", "Compare r1 vs r2" side-by-side
    strip, "Reset demo" with confirmation); page defaults to the newest run that found paths (with a note + link to
    the newest run); RevisionContext ("r2 · after fixes", "latest is …", "Run on r2") on Simulation, Overview, AI.
  - Run -> replay: a run started in the UI opens itself and auto-plays the real timeline (1.2 s/step at 1x);
    active node + hop highlighted, camera frames each step (fitView on the step's assets), narration card (headline,
    plain sentence, who/how/odds, ATT&CK). Plain sentences = new catalog keys story.* (backend/app/i18n/story.py,
    EN/TR; engine wording unchanged); asset ids -> names in the UI.
  - Event log: story sentences, first sentence per line (never cut mid-word), full text on the current line and
    as title; click = jump + pause.
  - Map: fit on load / filter / zone / snapshot change / container resize (ResizeObserver, after nodes are
    measured: this also fixed the half-empty before/after mini maps); attribution hidden; label plates.
  - Feedback: "Running…" pending state; run toast states score/path change vs the previous run of the scenario
    with an "Open the result" link; Remediation: readable path changes and asset names, note when no fix changes
    the score; Select top 3 disabled then.
  - Guided demo (features/tour/Tour.tsx, stores/tour.ts): 5 anchored, non-modal steps on the real UI, advanced
    by the real events (run, replay end, apply); done/skipped in localStorage; restart from the new help menu; Esc
    skips. E2E runs as a returning user via storageState (tour.spec in ux-flow clears it).
  - Empty space: selected path's steps under the score, biggest single fix (chokepoint Δscore) with a link that
    preselects it in Remediation.
  Verified: vitest 27 passed; tsc + eslint clean; pytest 122 passed / 1 skipped (+ story coverage test); ruff +
  mypy clean; E2E (all specs except screenshots) 63 passed / 1 skipped (logs/e2e-b-full.log), incl. new
  e2e/tests/ux-flow.spec.ts (6 tests: no-path state, autoplay+camera+narration timing, event log, map fit at
  1024/1280/1440 + filter, feedback, guided demo end to end). Error-message specificity is covered by the existing
  ui-gaps/i18n-tr error tests, not by a new one.

- UX Phase C (CHECKPOINT C): visual polish. Tokens: near-neutral base (#080b10/#0d1117/#131922), cyan the one
  accent, violet only identities, violet haze removed; flat secondary panels (no gradient border/glow/blur), map =
  only hero surface (.panel-hero); panel titles body font sentence case (EN titles rewritten); display face only for
  numbers/page title/wordmark; no panel entrance stagger, no pulsing icons/halo, idle edges faint + slow, attack
  path and replay step carry the glow; node pedestal lit only for compromised/on-path/active/selected; scenario
  segmented control + one-line description; asset filter toggle chips; Overview single "Start here" panel instead
  of 5 empty states, "Security score 25 / 100"; severity bar chart (duplicate numbers) removed; chart glows removed;
  Network map details as a side column (map re-fits); compact narration at rest; badge "Simulation only: virtual
  model" (README updated). docs/DESIGN.md (tokens, contrast table, glow/motion rules, type + spacing scale).
  Verified: screenshots.spec + a11y.spec + layout.spec (now 1024/1280/1440) + ux-flow: 87 passed
  (logs/e2e-c-visual.log); axe 0 violations of any impact (e2e/a11y-report.json); text tokens >= 5.1:1 on all
  surfaces. Before/after composites: docs/ux/compare/*.png (e2e/scripts/compare_shots.py, HEAD vs working tree).
- UX Phase D (CHECKPOINT D): Azerbaijani (az). Frontend frontend/src/i18n/az.ts (all keys, typed against EN), init +
  browser-language detection, switcher EN/TR/AZ, Intl locale az-Latn-AZ with a CLDR-az fallback when the runtime
  lacks az data (Chromium/Playwright: "2026 M11 16", "70.9%"; Node and real az ICU: "16 noy 2026", "70,9%").
  Backend: engine catalog + narration backend/app/i18n/az.py (174 keys = EN keys/placeholders), API errors (same
  catalog), AI fallback template + chat answers (fallback.py, decimal comma), structured-output section titles and
  technique words (structured.py), LLM language instruction (prompt.py, EN+AZ so models do not drift into
  Turkish), printable report labels + server-side localized dates (reports.py; report stays script-free), API
  lang Literal en|tr|az. Plurals: AZ base keys (no plural after numerals). Fonts: IBM Plex Sans + JetBrains Mono
  have every AZ glyph; Rajdhani lacks ə/Ə (U+0259/U+018F) -> "CT Display Schwa" @font-face (Plex latin-ext,
  unicode-range U+0259,U+018F) in --font-display; verified by cmap scan (fontTools) and by CDP
  getPlatformFontsForNode (no system font used) + docs/i18n/glyphs-az.png. EN/TR panel titles made sentence case.
  docs/i18n/az_review.md: 593 UI + 174 engine + template/report strings, EN next to AZ, by screen, 26 flagged
  (generator backend/scripts/az_review.py).
  Verified: pytest 123 passed / 1 skipped (catalog parity 3 languages, AZ rendering + "no Turkish word forms",
  AZ plural, AZ API error, AZ explain stream, AZ report HTML + date); ruff + mypy clean; vitest 28 passed (format
  test); tsc + eslint clean; e2e i18n-lang.spec.ts 5 passed (logs/e2e-d-i18n.log): TR no EN; AZ no EN and no TR
  fragments (each with a negative control on the source-language UI); TR and AZ server errors; AZ dates/numbers.
- UX Phase E (CHECKPOINT E): verification + report. Backend 123 passed / 1 skipped (live Ollama, not running),
  coverage 95 % (logs/final-backend.log), ruff + mypy clean; vitest 28 passed, tsc + eslint clean; full E2E 131
  passed / 1 skipped (logs/e2e-final-ux.log, incl. screenshots, axe EN/TR/AZ 0 violations, layout 1024/1280/1440 x
  EN/TR/AZ, ux-flow, i18n-lang); after two late fixes (narration anchor width, launcher) ux-flow + layout + a11y +
  app-mode re-run 103 passed (logs/e2e-final-recheck.log). Real launcher: verify-guided-demo EN/TR/AZ passed
  (logs/guided-demo-final.log, incl. a run that rebuilt the frontend), verify-desktop passed
  (logs/verify-desktop-final.log). Bug found + fixed: CyberTwin.ps1 died on a stale-dist rebuild (vite stderr ->
  NativeCommandError under ErrorActionPreference=Stop); npm now via cmd.exe. Docs: README (features, walkthrough,
  docs list, test table), KNOWN_GAPS (UX-round section + table), UX_AUDIT "after" table, docs/ux/after/,
  docs/ux/compare/. Not re-run this round: Docker, PostgreSQL, live LLM (incl. AZ), demo GIF (shows the old UI).
## In progress
(none)

## Next
- Native-speaker review of docs/i18n/az_review.md (26 flagged strings).
- Optional: re-record docs/media/demo.gif (shows the previous UI); re-run Docker/PostgreSQL/live-LLM (incl. AZ).

## How to verify
- Backend: `cd backend && .venv/Scripts/python -m pytest -q --cov=app` (+ `ruff check app tests`, `mypy app tests`)
- Frontend unit: `cd frontend && npx vitest run && npx tsc --noEmit -p . && npx eslint . --max-warnings 0`
- E2E local: `cd e2e && npx playwright test > ../logs/e2e-run1.log 2>&1` (add `E2E_DIAG=1` to log frontend server exits)
- Launcher (Windows): `cd e2e && node scripts/verify-guided-demo.ts` (EN/TR/AZ guided demo) and `node scripts/verify-desktop.ts`
- AZ review doc: dump frontend resources to logs/ui-strings.json (node), then `cd backend && .venv/Scripts/python scripts/az_review.py ../logs/ui-strings.json ../docs/i18n/az_review.md`

## Suggested commit message for the current checkpoint
Per phase (commit in this order, or squash):

A) docs: first-time-user UX audit of the desktop app
B) feat: make simulation results explain themselves (replay, narration, no-path state, guided demo)
C) style: calmer, state-driven neon visual system
D) feat: Azerbaijani (az) as a third language
E) fix: launcher survives a frontend rebuild; docs and verification for the UX round

- CyberTwin.ps1 runs npm through cmd.exe: vite's stderr warning became a terminating NativeCommandError in
  Windows PowerShell 5.1 and killed the launcher whenever frontend/dist was stale
- e2e/scripts/verify-guided-demo.ts: guided demo in EN, TR and AZ through the real launcher
- layout and axe checks cover AZ; README, KNOWN_GAPS, UX_AUDIT after-table, before/after screenshots
