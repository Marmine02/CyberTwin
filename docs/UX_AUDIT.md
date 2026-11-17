# UX audit (first-time user, real desktop launcher)

**Method.** `e2e/scripts/ux-audit.ts` starts the real launcher (`scripts/CyberTwin.ps1 -DebugPort 9334`), attaches to
the Edge app window over CDP and goes through all 8 pages the way a first-time user would, with no instructions:
first from a **reset demo** (r1, no runs), then after **applying the top 3 fixes** (r2). It records timings and DOM
facts (button states, truncation, clipping, attribution) in `docs/ux/before/audit.json`. Viewport 1440×900, EN UI;
the user's r2 / Outdated Services case was reproduced in TR. Screenshots are in `docs/ux/before/` (numbers below
refer to those files). Run log: `logs/ux-audit-before.log`. Date: 2026-11-16.

Severity: **S1** = a new user cannot tell what happened or what to do. **S2** = wrong or misleading output, or a
broken control. **S3** = friction or wasted space. **S4** = cosmetic.

## Findings, ranked

| # | Sev | Where | Finding (observed) | Evidence | Planned fix (phase) |
|---|-----|-------|--------------------|----------|---------------------|
| 1 | S1 | Simulation | "Run simulation" answers in **135 ms**, then the page jumps to the **end state** (replay 32/32). Nothing plays and nothing moves. The only feedback is a toast with a second button ("Inspect results") that points to the page the user is already on. | 09, 10, audit.json `sim-run` | B: after a run, auto-play the real replay with camera follow and a narration card; the toast says what changed |
| 2 | S1 | Simulation (r2) | After the fixes, a run shows score 100, 0/8, "Attack paths (0)", timeline 1/1. Nothing says **why** it is empty (the fixes in r2 block every path) or what to do next (run on r1, compare, reset). Reproduces the user's screenshot. | 20 (TR), 24 | B: "no path" state card with "Run on r1", "Compare r1 vs r2", "Reset demo" |
| 3 | S1 | Remediation | The before/after mini maps after "Apply" are **broken**: the nodes sit at the bottom edge, mostly cut off, and "React Flow" shows twice. | 19 | B: fit the map to its container on mount and on resize |
| 4 | S1 | Overview (first launch) | No orientation: eight panels, five of them show the same "No simulations yet. Run your first scenario." The only start action is in the "Critical findings" panel. | 01 | B: guided demo (5 anchored steps); one empty-state call to action instead of five |
| 5 | S2 | Simulation, event log | Raw engine wording, **cut mid-word** with an ellipsis: "internet can reach web-01 tcp/443 (https nginx-1.18.0) via fw-edge", in TR "internet, web-01 tcp/443 (https nginx-1.18.0) hedefine fw-edge üzerin… %99". 4 of the first 6 lines are truncated. | 13, 20, audit.json `eventlog` | B: plain-language sentences from the catalog, wrapped (no truncation), expandable details |
| 6 | S2 | Simulation, map | Fit runs only when the set of visible nodes changes, **not on resize** or container changes. At 1440 the graph uses about 45 % of the panel and labels are about 7 px; in a smaller or resized window the right-hand nodes (customer DB) are cut off (user report). The "React Flow" attribution is visible on every map. | 10, 14, 19, audit.json `map-clip` | B: ResizeObserver plus fit on filter, zone and data changes; tighter padding; `hideAttribution` |
| 7 | S2 | Simulation | With an existing run, the page **defaults to the last run**, which after remediation is the empty r2 run. The revision appears only as "· r2" in small grey text on the map header. | 24 | B: default to the most meaningful run (latest run with paths, else latest); a revision banner wherever a result is shown |
| 8 | S2 | Remediation (r2) | Lists 4 more fixes, all **"0.0 / LOW"**, with "Select top 3" and a disabled "Apply 0 fixes". Nothing says the score is already 100 and these only remove residual findings. | 19 | B: note that "no attack path left in this scenario; these fixes only remove residual exposure" |
| 9 | S2 | Remediation, comparison | "Path changes" shows raw path signatures (`web-01#network:22 → web-01#admin → idp-01#user → CRED:svc-web → DATA:customer-db`). | 19 | B: render as asset names with arrows (path goal label plus hop names) |
| 10 | S2 | Network map | The asset-details panel is a translucent overlay **on top of** the map, and covers the customer DB and admin workstation. | 14 | C: details as a side column; the map re-fits to the remaining width |
| 11 | S2 | Replay | At 1x the full replay of 32 events takes **29 s** (0.9 s/step). The map shows no camera movement and no explanation per step, so most of that time is spent watching small dots. | audit.json `replay-play` | B: 1.2 s/step on the primary path, faster for side events; camera follows; narration card |
| 12 | S3 | Simulation | The left panel under the score is empty (about 250 px). The selected path's steps are in a table below the fold. | 10 | B: the selected path's steps as a compact list under the score, plus the top chokepoint and its Δscore |
| 13 | S3 | Simulation | The five scenario cards take 115 px of height for static descriptions that are identical every time. | 10 | C: segmented selector plus one line for the selected scenario |
| 14 | S3 | Simulation | The asset filter is 8 stacked checkboxes (230 px) for a rarely used control. | 10 | C: compact toggle chips |
| 15 | S3 | Overview | "Overall: **25% secure**" in red reads as a contradiction. Five identical empty panels. | 01, 16 | C: "Security score 25 / 100"; a single empty state |
| 16 | S3 | Every action | Pending states are invisible (runs return in about 0.1–0.3 s). Toasts say what finished but not where the result is when the user is already there. "Apply" toast is good: "Score 25 → 100; 10 paths blocked." | 09, 19 | B: the toast states the change (score, paths) and links to the result; the button shows pending |
| 17 | S3 | Reports | Half of the screen is empty. The revision diff shows raw field names "(open_ports, software, vulnerability_ids)". | 28 | C: two-column layout keeps; translate field names (D: also AZ) |
| 18 | S3 | AI assistant | The template narrative contains engine node ids (`web-01#network:22`, `ATTACKER@internet`). | 17 | Not changed: the integrity checks verify these ids against the engine (API/AI contract). Listed in KNOWN_GAPS. |
| 19 | S4 | Every map | Labels are 13 px at zoom 1, but because of the loose fit they render at about 7–8 px on the simulation page. | 10 | B/C: tighter fit, minimum zoom for labels |
| 20 | S4 | Top bar | The "SIMULATION MODE · Virtual model only" pill glows violet next to the logo glow and the active-nav glow, so three things compete for attention before any content. | all | C |

Things that work and stay: keyboard tab order (skip link, then revision, reset, notifications, language, nav, in
DOM order); reset demo asks for confirmation and shows a toast; the apply flow (select top 3, apply, confirm,
comparison) is clear; the revision diff on Reports; per-fix Δscore on Remediation.

## AI-slop tells (concrete instances)

1. **Every panel is the same panel.** Gradient border, outer glow, UPPERCASE letter-spaced Rajdhani title and a
   chevron, regardless of importance ("% COMPROMISED", "FILTER BY ASSET TYPE" and "DIGITAL TWIN TOPOLOGY" all look
   identical). Nothing is the hero. (01, 10)
2. **Five identical cards** for scenarios: icon, bold title, two lines of grey description. This is the "feature
   grid" pattern. (10)
3. **Glow as decoration.** Glows on the active nav item, every button, every node pedestal (three concentric
   ellipses under *every* node, even unreached ones), the severity badges, the legend dots and the violet pill.
   When everything glows, the attack path does not stand out. (10, 14)
4. **Constant ambient motion.** Particles flow on every network edge forever, and the pedestals and halo pulse.
   This competes with the one thing that should move (the attack path). (10)
5. **Purple haze.** A violet radial gradient in the lower right of every page, plus violet panel tints. (01, 28)
6. **Ring gauges for everything.** Compromised ring, three hardening rings, plus a three-bar "Findings by severity"
   chart that repeats numbers already shown as text next to it. (16)
7. **Copy-pasted empty states.** "No simulations yet. Run your first scenario." five times on one screen. (01)
8. **Display font everywhere.** The condensed Rajdhani is used for panel titles, scenario titles, node labels and
   numbers. It is meant for numbers and one or two titles. (10)
9. **"%" in a heading** ("% COMPROMISED") and other title-case or uppercase labels that read as generated rather
   than written. (10)
10. **Unexplained jargon in the UI.** Raw engine ids and tuples in user-facing text: `web-01#network:22`, `p`,
    "tcp/443 (https nginx-1.18.0) via fw-edge", result hash `f45f3b7923` next to the run time. (10, 19)

## Planned fix order (Phase B → C)

B: 2, 7 (state and revision clarity), then 1, 11 (run, auto replay, narration), 5 (event log), 3, 6 (map fit),
16 (feedback), 4 (guided demo), 12 (fill the empty space), 8, 9. C: 10, 13, 14, 15, 17, 19, 20, and the slop list.

## After the fixes (2026-11-16)

Screenshots: `docs/ux/after/` (same audit script through the launcher), the guided demo per step and language in
`docs/ux/after/guided/{en,tr,az}-step{1..5}.png`, and before/after pairs in `docs/ux/compare/`. The behaviours are
asserted in `e2e/tests/ux-flow.spec.ts`. The audit script's own timing and truncation numbers in
`docs/ux/after/audit.json` no longer apply (see KNOWN_GAPS).

| # | Status | What changed |
|---|--------|--------------|
| 1 | Fixed | A run opens itself and auto-plays the real replay at 1.2 s per step. The camera follows each step, and a narration card explains it. The toast states the result and links to it. |
| 2 | Fixed | The no-path card names the reason ("fixes were applied in r2") and offers Run on r1, Compare r1 vs r2, and Reset demo with confirmation. |
| 3 | Fixed | The map fits only after its nodes are measured, and again on every resize. The mini maps are complete. |
| 4 | Fixed | A guided demo (5 anchored steps) starts on first launch. A fresh Overview shows one "Start here" panel. |
| 5 | Fixed | The event log uses plain sentences (`story.*` catalog keys) with asset names. Each line shows a whole sentence, the current event shows the full text, and a click jumps the replay. |
| 6 | Fixed | The map re-fits on load, filter, zone, data and resize. Attribution is hidden and labels sit on plates. No auto-layout (KNOWN_GAPS). |
| 7 | Fixed | The page defaults to the newest run with paths and says so. Revision context appears on Simulation, Overview and AI. |
| 8 | Fixed | A note explains when no fix changes the score; Select top 3 is then disabled. |
| 9 | Fixed | Path changes read as "Internet → Public Web Server (admin) → …", and asset names replace ids. |
| 10 | Fixed | Asset details open as a column beside the map. |
| 11 | Fixed | See 1. Steps can be scrubbed and clicked at any speed. |
| 12 | Fixed | The selected path's steps and the biggest single fix (Δscore, with a link that preselects it) sit under the score. |
| 13, 14 | Fixed | Segmented scenario selector with a one-line description; toggle chips for asset types. |
| 15 | Fixed | "Security score 25 / 100"; a single empty state. |
| 16 | Fixed | "Running…" pending state, toasts that state the change, and links to the result. |
| 17 | Partly | Layout kept. The diff field names are still raw (`open_ports`). |
| 18 | Not changed | By design (integrity checks), see KNOWN_GAPS. |
| 19 | Fixed | Tighter fit (maxZoom 1.3) and label plates. |
| 20 | Fixed | Neutral badge, no nav glow; see docs/DESIGN.md. |

AI-slop tells 1–10: panels are flat, and the map is the only hero surface. Scenarios use a segmented control. Glow and
motion carry state only, and there is no ambient pulse. The purple haze is removed. The duplicate bar chart is
removed (the hardening rings stay). There is one empty state. The display face is used for numbers only. Titles are
in sentence case. Engine ids are replaced by names in user-facing text, except in the AI template.
