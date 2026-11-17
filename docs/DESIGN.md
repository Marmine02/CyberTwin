# Design rules

CyberTwin is a security tool that someone uses to understand an attack and to decide what to fix. The neon look stays, but it now carries meaning: something glows or moves only because of its state.

Tokens live in `frontend/src/design/theme.css` (`@theme` block). Do not hard-code new colors in components; add a token.

## Hierarchy

1. **The map is the hero surface.** It is the only surface with an accent border (`.panel-hero`: cyan hairline at 28 %, soft drop shadow) and the only place where the page title uses the display face.
2. **Secondary panels are quiet.** `.panel` is a flat `bg-1` fill with a 1 px `line` border: no gradient border, no outer glow, no backdrop blur. A panel title is the body face, 14 px, semibold, in sentence case. There is no icon, no uppercase and no letter-spacing. A chevron after a title means the title links to the full page.
3. **One level of emphasis per area.** If a number is the point (a score, a count), make it big. Everything around it stays at body size.

## Color

| Token | Value | Use |
|---|---|---|
| `bg-0` | `#080b10` | page |
| `bg-1` | `#0d1117` | panels |
| `bg-2` | `#131922` | inputs, raised rows |
| `line` | slate 400 at 13 % | hairlines, borders |
| `ink` / `ink-dim` / `ink-faint` | `#e6ebf2` / `#a3afbf` / `#808b9c` | text: primary, secondary, tertiary (all ≥ 4.5:1 on `bg-1`) |
| `primary` | `#22d3ee` | the one accent: primary actions, selection, focus, links, network links |
| `violet` | `#b69cff` | identities only: accounts, trust links, ATT&CK chips |
| `critical` / `critical-ink` | `#f43f5e` / `#fd8a9b` | compromised, attack path, critical; `-ink` for small text on tinted fills |
| `warning` / `medium` / `secure` | `#fb923c` / `#facc15` / `#34d399` | high / medium / low and secure, score bands |

The page background is a near-neutral dark with one faint cyan wash at the top left. There is no violet haze. Severity colors are only for severity and state, never for decoration.

## Glow and motion carry state

| Thing | Rest | Meaning-bearing state |
|---|---|---|
| Network link | 1 px, 32 % opacity, one faint particle every ≥ 5 s | – |
| Trust / permission link | dashed, violet, no particles | – |
| Attack path | 2.4 px red, soft glow, 2 particles | on the selected path |
| Replay step (active hop) | – | 3.2 px rose, strongest glow, 3 fast particles |
| Node pedestal | single faint ring | lit (glow + filled ring) when compromised, on the path, active or selected |
| Active node | – | rose ring and a repeating ping while the step is shown |
| Blast-radius halo | static red radial | only after a simulation |

There is no entrance animation on panels, no pulsing badge or icon, and no hover lift on cards. Motion answers an action: the replay, the camera following a step (650 ms), toasts, dialogs. With `prefers-reduced-motion: reduce`, particles are hidden, the camera jumps without animation, and CSS animations and transitions are reduced to almost zero (`theme.css`).

## Typography

| Role | Face | Size / weight |
|---|---|---|
| Body, labels, panel titles, node labels | IBM Plex Sans | 12–14 px, 400–600 |
| Numbers (scores, counts, percentages) and the hero page title | Rajdhani (`.display-num`, `.page-title`) | 18–40 px, 700 |
| Ids, IPs, ports, hashes | JetBrains Mono (`.mono`) | 0.92 em |
| Brand wordmark | Rajdhani | 21 px |

Type scale (px): 11.5 (captions), 12.5 (secondary), 13.5 (body), 14 (titles), 15 (narration headline), 18 (page title), 26–40 (numbers). Use sentence case everywhere. Uppercase is only used for the language codes in the switcher.

## Spacing

Spacing follows a 4/8 px grid: gaps of 4, 8 and 12, panel padding of 16, page gutter of 12–16, and control heights of 28 / 32 / 36. Radii are 12 for panels, 8 for controls and rows, and fully round (999) for chips.

## Components

- **Segmented control** (`.segmented`): a choice of one among few (scenario). The selected item is filled cyan with dark text. The selected scenario's one-line description appears under the control.
- **Toggle chips** (`.chip-toggle`, `aria-pressed`): multi-select filters (asset types).
- **Narration card** (`.narration`): floats over the bottom-left of the map. The camera frames the step in the free area above and to the right of it.
- **Guided demo** (`.tour-hint`, `.tour-ring`): anchored, non-modal hints with a cyan ring around the target. Esc skips.
- **Menu** (`.menu`, `.menu-item`): dropdowns in the top bar.
- **Toasts**: a title that names what happened, a body that states the change (numbers), and one link to the result.

## Copy

Name things by what the user sees, not by the engine: "Public Web Server, port 22", not `web-01#network:22`. Engine ids appear only as secondary mono text next to a name. An empty state says what to do next. An error says what failed and how to fix it.
