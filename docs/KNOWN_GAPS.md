# Known gaps

Blunt list of what is incomplete, untested or simplified. "Tested" means exercised against the real component
(real DB, real HTTP server, real browser, real container, or real LLM). Tests against mocks are labelled as such.

## Test results

| Suite | Result | Date | Path |
|---|---|---|---|
| Backend, full pytest (engine, remediation, API, i18n incl. AZ, app mode) | 123 passed, 1 skipped (live Ollama test; Ollama not running); coverage 95 % | 2026-11-16 (UX round) | real path (real temp SQLite, real HTTP via TestClient) |
| Backend, live Ollama (`test_live_ollama_explain_and_cache`) | 1 passed (qwen2.5:7b) | 2026-11-16 | real path (local Ollama) |
| Backend `tests/api` on PostgreSQL 17 | 48 passed | 2026-11-16 | real path (PostgreSQL in Docker) |
| Alembic migrations on PostgreSQL 17 | head `0001`, 8 tables; `-x url` takes precedence over `DATABASE_URL` | 2026-11-16 | real path |
| Frontend unit (vitest) + tsc + eslint | 28 passed; tsc, eslint clean | 2026-11-16 (UX round) | real path for what it covers (real i18next; no backend involved) |
| E2E local (uvicorn + `vite preview` + Chromium), all specs | UX round final: 131 passed / 1 skipped (ai-live, opt-in), logs/e2e-final-ux.log; after the last two fixes ux-flow + layout + a11y + app-mode re-run: 103 passed. Earlier rounds: 74 passed / 1 skipped | 2026-11-16 | real path |
| E2E single-process app mode (`app-mode.spec.ts`: one uvicorn serves UI + API, no vite) | 1 passed (alone and in the full run) | 2026-11-16 | real path |
| Desktop launcher (`e2e/scripts/verify-desktop.ts`: real `CyberTwin.ps1`, Edge app window via CDP) | passed: window title "CyberTwin", demo 25 → 100, window closed → backend stopped, no uvicorn left; Desktop shortcut started via the `.lnk` and closed the same way; failure paths (port in use, no npm, no uv, backend crash) checked by hand | 2026-11-16 | real path (Windows 11, Edge 157) |
| Guided demo via the desktop launcher (`e2e/scripts/verify-guided-demo.ts`: real `CyberTwin.ps1`, Edge app window via CDP) | passed in EN, TR and AZ: 5/5 steps with real run, replay and apply, score 25 → 100, "done" remembered, backend stopped on close; also passed on a run that had to rebuild the frontend | 2026-11-16 | real path (Windows 11, Edge) |
| UX flow (`ux-flow.spec.ts`: no-path state, autoplay + camera + narration timing, event log, map fit 1024/1280/1440, feedback, guided demo) | 6 passed | 2026-11-16 | real path |
| i18n (`i18n-lang.spec.ts`: no EN in TR; no EN and no TR in AZ, each with a negative control; TR/AZ server errors; AZ dates/numbers) | 5 passed | 2026-11-16 | real path |
| E2E Docker (`docker compose up --build`, nginx :8080, all specs except screenshots) | 56 passed, 1 skipped (ai-live, opt-in); **not re-run after the UX round** | 2026-11-16 (before the UX round) | real path |
| E2E app on PostgreSQL (compose overlay; demo-flow + ui-gaps) | 6 passed (before the UX round, not re-run) | 2026-11-16 | real path |
| Accessibility (axe, 8 pages × EN/TR/AZ) | 24 passed, 0 violations of any impact (inside the local E2E run; Docker run predates AZ) | 2026-11-16 | real path |
| E2E live LLM (`ai-live`, Ollama qwen2.5:7b) | before the UX round (not re-run, no AZ run): 1 passed; integrity: 0 placeholder / number / citation / order violations, 1 duplicate fix flagged, 0 unverified ids | 2026-11-16 | real path |
| `Makefile` | not run (no `make` on the Windows machine; each wrapped command was run individually) | n/a | not run |

## Status by area

| Area | Status |
|---|---|
| Docker (`docker compose up --build`) | **Tested** (2026-11-16). Images built; the stack ran; 56 E2E tests passed against it (nginx :8080 → backend; all specs except `screenshots`), 1 opt-in live-LLM test skipped. |
| PostgreSQL | **Tested** (2026-11-16). Alembic migrations on PostgreSQL 17 (compose `postgres` profile, host port via `CT_PG_PORT`); the URL order was checked (`-x url` wins over `DATABASE_URL`, and `DATABASE_URL` alone reaches PostgreSQL). `tests/api` ran with `CT_TEST_DATABASE_URL` (48 passed; only the tests that use the DB fixture actually touch PostgreSQL). The containerised app ran on PostgreSQL and 6 E2E tests (demo flow, CRUD, item-3 UI) passed against it. Local runs need the `postgres` extra: `uv sync --extra postgres`. |
| `Makefile` | **Not executed** (no `make` on the Windows build machine). Every command it wraps was run individually. |
| Ollama adapter | **Tested on a real provider** (local Ollama 0.30.7, `qwen2.5:7b` and `llama3.1`); see AI_EVAL.md. |
| OpenAI-compatible adapter | **Contract-tested (respx), not tested on a real provider.** The contract tests pin the request shape and the parsing/error handling. Risk: the schema uses `minItems`/`maxItems` and `enum`; OpenAI's strict `json_schema` mode has historically rejected some keywords, so a real server may refuse the request (it would then fall back to the template). |
| Anthropic adapter | **Contract-tested (respx), not tested on a real provider.** Uses forced tool use (`tool_choice: {type: "tool"}`) for structured output. |
| Accessibility | axe-core (WCAG 2.1 A/AA) on all 8 pages × EN/TR/AZ: **0 violations of any impact.** Caveats: axe left **1,720 colour-contrast checks "incomplete"** (it can't evaluate text over gradients/backdrop-filter). Contrast was instead verified by computing WCAG ratios for every text/background token pair (≥ 4.5:1 for small text after adding `--color-critical-ink`; see below). 4 `aria-prohibited-attr` incompletes remain inside React Flow's own zoom controls (library markup). No screen-reader session was done. |
| Layout | Checked at **1024×768, 1280×800 and 1440×900** (all pages, EN + TR + AZ): no horizontal scroll and no panel overflow (asserted in `e2e/tests/layout.spec.ts`). Below 1280 the Overview grid stacks the right column under the map (intended degradation). The shell has `min-width: 1024px`; narrower viewports scroll horizontally. |

## UX round: replay, guided demo, visual system, Azerbaijani (2026-11-16)

- **Guided demo memory is per browser profile, not per user.** The app has no user accounts; "done / skipped" is
  stored in `localStorage` (`cybertwin.tour`). The desktop launcher uses its own Edge profile, so it is remembered
  across launches there. Another browser or a cleared profile shows the tour again.
- **Azerbaijani was written by the assistant and has not been reviewed by a native speaker.** All strings are listed
  next to the English source in `docs/i18n/az_review.md`; 26 are flagged as the least certain (terminology such as
  “Brandmauer”, “Versiya”, “Yamaq”, the scenario names).
- **Azerbaijani with a real LLM is not tested.** The AZ output-language instruction (`app/ai/prompt.py`) is in place,
  but only the deterministic template was run in AZ. A live Ollama run in AZ was not done, so a small model may still
  drift into Turkish.
- **Chromium has no Azerbaijani locale data.** `Intl` with `az-Latn-AZ` resolves but formats with root data
  (“2026 M11 16”, “70.9%”). The UI therefore checks for real data and otherwise formats by CLDR az rules
  (“16 noy 2026, 14:42”, “70,9%”). Node and full-ICU runtimes use `Intl` directly (unit-tested). Whether the Edge
  build used by the launcher ships az data was not checked; either way the output follows the same rules.
- **Some numbers still use a decimal point in TR and AZ.** Step probabilities (`p 0.93`), path risk (`0.709`) and
  Δscore (`+75.5`) are formatted with `toFixed`, as before this round, not with the locale. Percentages, dates
  and counts are localized.
- **The display face has no ə/Ə.** Rajdhani lacks U+0259/U+018F; those two glyphs come from IBM Plex Sans through a
  `unicode-range` fallback. They are slightly wider than Rajdhani's letters (see `docs/i18n/glyphs-az.png`).
- **Map layout is the stored seed layout.** Labels now sit on plates so edges do not run through them, and the map
  re-fits on load, filter, zone, data and resize. There is no automatic graph-layout algorithm; edges can still
  cross each other on dense models.
- **Plain-language sentences are used in the replay narration and the event log only.** The path table, the printed
  report and the AI template keep the engine's technical step reasons, and the AI template keeps engine node ids
  (`web-01#network:22`), because the integrity checks verify those ids.
- **"Compare r1 vs r2" on the simulation page creates an r1 run** of the same scenario when none exists yet. That run
  is stored and appears in the history like any other run.
- **Fixed: the launcher died when it had to rebuild the frontend.** When `frontend/dist` is older than the sources,
  `CyberTwin.ps1` runs `npm run build`. Vite writes a chunk-size warning to stderr, and Windows PowerShell 5.1 under
  `$ErrorActionPreference = "Stop"` turns native stderr into a terminating `NativeCommandError`. The script aborted
  mid-build (with an error dialog when dialogs are enabled). This caused the first guided-demo run's 300 s timeout.
  npm now runs through `cmd.exe` with the redirection done there. Verified: a run that had to rebuild passed (build
  log written, window up, EN/TR/AZ guided demo passed). The bundle is still over Vite's 500 kB warning size
  (950 kB, 295 kB gzip).
- **The audit script's old measurements do not apply to the new UI.** `e2e/scripts/ux-audit.ts` counts replay time
  after clicking Play, which now pauses the replay that is already running, and it reads a `span.truncate` that
  no longer exists. Its "after" numbers in `docs/ux/after/audit.json` are therefore not comparable with "before".
  The behaviours themselves are asserted in `e2e/tests/ux-flow.spec.ts`.
- **Error-message specificity has no new test.** The existing ui-gaps and i18n tests cover translated server errors
  in EN, TR and AZ.

## AI analyst limits (see AI_EVAL.md for the evidence)

* The model can't be **prevented** from writing digits: Ollama 0.30.7 doesn't support JSON-schema `pattern`
  (complex patterns make it ignore the schema; simple ones made generation run until a 120 s timeout). Digits are
  **detected** (±0.5 % rule) and literal-but-correct numbers are reported as "unplaced".
* Free-text summaries can still contain qualitative misstatements that use only valid ids and no numbers; no check
  catches those. Step-by-step text is therefore rendered from the engine, not the model.
* Duplicate fixes and invented CVE ids were observed live; both are detected and shown, not prevented.
* The technique-mismatch check is keyword-based (EN/TR word lists) and only applies to model-written step text,
  which the current schema no longer requests.
* The chat endpoint uses the same placeholder/number checks but has no step/path structure; its answers are free paragraphs.
* `ai_eval.py` doesn't record whether a run needed a retry.

## i18n

* Engine output (step reasons, replay labels, goal labels, finding and residual titles, remediation change logs,
  recommendation texts, notification texts, generated revision notes) is emitted as `{code, params}` and
  translated in the UI. `e2e/tests/i18n-lang.spec.ts` asserts that no English fragment from the frontend resources or
  the engine catalog (whose Turkish differs) appears on any of the 8 pages in Turkish, with a negative control in English.
* **User/seed data is not translated**: asset names ("Public Web Server"), OS strings, firewall-rule and connection
  descriptions, principal names and vulnerability *descriptions* are shown as entered (the demo seed is English data).
  Vulnerability *titles* of the seed and catalog templates do carry translation codes; a title edited by the user
  drops its code and is shown as written.
* **API errors**: every hand-written `DomainError` (45 call sites) carries `i18n: {code, params}` next to the English
  `message`; the UI renders it in the viewer's language (`e2e/tests/i18n-lang.spec.ts` asserts the Turkish text for a
  real 422 from the API). Client-side API errors (network, timeout, bad HTTP, assistant idle) are translated too.
  **Still English in both languages:** Pydantic validation texts (`validation_error` and `invalid_snapshot` built from
  Pydantic's own messages, e.g. "port: Input should be less than 65536"), `internal_error`, and the "No route" 404.
  These are generated by the library / framework and have no `{code, params}` form.
* Plurals use i18next `_one`/`_other` forms (UI, engine catalog and the AI fallback template; the backend resolves
  them the same way via `app.i18n.plural_lookup` for reports, the English `message` and the template summary). Turkish has identical forms because the noun stays singular after a number.

## Simplifications in the engine (by design, see ENGINE.md)

* Credential use does not re-check network reachability (over-approximation).
* Kerberoasting requires a foothold on the identity server (under-approximation).
* Trust-edge tokens are not stealable credentials.
* Asset `password_policy` only feeds the hardening gauge.
* Probabilities are ranking weights, not calibrated real-world likelihoods.
* What-if analysis re-runs the scenario once per candidate fix; not tested on twins with hundreds of assets.
* Residual exposure is per scenario: a finding listed as residual in one scenario can be on a path in another.

## Product gaps

* **No authentication / multi-user.** Revision `author` is always `user`. Optimistic concurrency exists via `?expected_revision=`.
* Reports are printable HTML (browser Print → PDF); no server-side PDF.
* **Desktop app = launcher script + browser app window. No Electron, no Tauri, no installer (MSI/MSIX), no auto-update,
  no code signing.** Windows only (`scripts/CyberTwin.ps1`); Linux/macOS have no launcher. It needs Edge or Chrome
  (otherwise it falls back to the default browser with a normal tab) and, on first start, uv and Node.
* Desktop launcher, not verified: the **taskbar button was not checked visually** (the screen was in use during the
  run). Verified instead: OS window title "CyberTwin" and the window's own AppUserModelID
  (`MSEdge.127.0.0.1_/.browserprole.Default`, so Windows groups it apart from Edge). The Desktop shortcut was
  created and started through the `.lnk` (shell execute, as a double-click), and closed with the window's close
  command; how Explorer renders the icon on the Desktop was not looked at.
* If the launcher is killed hard (Task Manager, closing its console window), the backend keeps running until the next
  start, which stops it via `%LOCALAPPDATA%\CyberTwinackend.json`. No Windows job object ties the two together.
* The app window's AppUserModelID has no port, but the port changes per start: pinning the *running window* to the
  taskbar would reopen a stale URL. Pin the Desktop shortcut instead.
* Notifications are polled every 15 s, not pushed.
* Single JS bundle (~890 kB, ~278 kB gzip); no code splitting.

## E2E stability (local suite)

* The local suite now runs against a production build served by `vite preview` (not the dev server), and every spec
  file resets the demo through `POST /demo/reset` in `beforeAll`. No retries or timeouts were raised.
* Result: **3 consecutive full runs green** (72 passed, 1 skipped each), plus a 4th full run on the final code.
* Over 17 full runs during the investigation there were **2 failures**:
  1. **Explained, environmental:** the laptop entered Modern Standby during a run (Windows System log, Kernel-Power
     506/507/172 at 09:50:39–10:06:13). All processes were suspended for 15 min, so a page could not be created and
     the 90 s test timer could not fire. Not a code problem; keep the machine awake during E2E runs.
  2. **Unexplained:** in one run the frontend server process tree (`vite preview`) died silently mid-run; uvicorn
     kept serving. No Windows crash report, power, network or Defender event, and no output from Vite. Vite exits
     silently when its stdin ends (unless `CI=true`), but Playwright reads the child's stdout/stderr and never closes
     its stdin, so that lead has no evidence behind it. It was **not reproduced** in 13 further full runs, 12 of them
     with the diagnostic below. The same symptom was seen with the dev server in the previous session, so it is not
     specific to `vite preview`. **Root cause unknown.**
* Diagnostic for the next occurrence: `E2E_DIAG=1 npx playwright test` preloads `e2e/diag/server-exit.cjs` into the
  frontend server and writes `logs/frontend-diag.log` (start/exit lines, signals, uncaught errors, stdin end, and a
  30 s heartbeat): an `exit` line = Vite exited by itself; heartbeat just stops = killed externally or native crash;
  heartbeat gap = machine suspended.
* `screenshots.spec.ts` and `layout.spec.ts` rewrite the PNGs under `docs/screenshots/` on every full run, so a run
  leaves those tracked files modified.

* **2026-11-16, desktop-app session, 2 more unexplained aborts** (not reproduced; the next full run was green):
  (1) a Playwright worker exited with code 0xC0000409 at the start of `app-mode.spec.ts` (0 ms, after `a11y`); the
  same three spec files then passed together and the spec passed alone; (2) a full run started as a background task
  ended with exit 127 right after uvicorn started, before any test, leaving the E2E uvicorn orphaned (it locked
  `e2e/.e2e.db` for the next run until stopped). No Windows crash report, no resource-exhaustion event, 13 GB RAM
  free. Root cause unknown; together with the earlier silent `vite` drop these are three silent Node deaths on the
  build machine.

## Tooling notes

* TypeScript is pinned to 6.0.3 (typescript-eslint supports `<6.1`).
* `npm audit` (frontend): one moderate advisory in `minimatch` via `typescript-eslint` (dev-only lint tooling).
* Starlette emits a deprecation warning for its httpx-based `TestClient` (tests only).
* Windows note: Playwright's webServer starts uvicorn directly with the venv's python (not `uv run`). Otherwise
  a grandchild process survives teardown and keeps the SQLite file locked for the next run.
