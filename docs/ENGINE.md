# Simulation engine

The engine (`backend/src/cybertwin/engine`) is pure computation on the stored model. It never
scans, probes or contacts anything. Same revision + scenario + params → byte-identical result
(`result_hash` = SHA-256 of the canonical JSON; asserted in `tests/test_engine.py`).

## 1. Network model (`network.py`)
- `network` connections form an undirected topology. Traffic between two hosts follows the
  shortest route whose **intermediate hops are firewalls only** (hosts never route for others).
- Each firewall on the route evaluates its rules by `order`; **first match wins; no match = deny**.
  All firewalls on the route must allow. Hosts linked directly reach each other freely.
- Rule endpoints: `any`, `zone:<zone>`, `asset:<id>`; optional `port` and `proto`.

## 2. Attack state graph (`graph.py`)
Nodes are attacker states:

| Node | Meaning |
|---|---|
| `PRIV:<asset>:user\|admin` | attacker runs code on the asset at that privilege |
| `NET:<asset>:<port>` | attacker can send traffic to that port |
| `CRED:<principal>` | attacker holds the principal's credentials |
| `DATA:<asset>` | attacker reads the asset's sensitive data |
| `DOMAIN_ADMIN` | attacker controls the identity domain |

Edge generators (each edge stores `technique`, `p`, `weight = -ln p`, ATT&CK ids, the finding ids
it depends on and a message `{code, params}`; never an English sentence):

| Technique | From → To | p |
|---|---|---|
| `network_reach` | `PRIV:a:user` → `NET:b:port` | 1 (structural); 0.5 if the zone pair is segmented |
| `remote_exploit` | `NET:a:port` → `PRIV:a:grants` | cvss/10 × maturity × (EDR 0.6) |
| `brute_force` | `NET:a:auth-port` → `PRIV:a:level` | 0.6 × password × (MFA 0.15) — principals with rights on `a`, plus local accounts on ssh/rdp/winrm (asset password policy) |
| `local_privesc` | `PRIV:a:user` → `PRIV:a:admin` | cvss/10 × maturity × (EDR 0.6) |
| `credential_theft` | `PRIV:a:admin` → `CRED:x` (x logged on to a) | 0.85 × (EDR 0.6) |
| `kerberoasting` | `NET:idp:88` → `CRED:x` (x Kerberoastable) | 0.95 × password |
| `credential_use` | `CRED:x` → `PRIV:a:level` / `DOMAIN_ADMIN` | 0.9 × (MFA 0.15) |
| `trust_abuse` | `PRIV:src:admin` → `PRIV:target:user` (target trusts src) | 0.7 |
| `data_access` | `PRIV:a:admin\|user` → `DATA:a` | 0.95 / 0.5 |
| `domain_takeover` | `PRIV:idp:admin` → `DOMAIN_ADMIN` | 0.95 |
| `privilege_implied` | `PRIV:a:admin` → `PRIV:a:user` | 1 (structural, hidden in steps) |

All constants live in one table: `engine/constants.py`.

```
p = clamp(base × Π modifiers, 0.01, 0.99)      (structural edges: p = 1, not clamped)
modifiers: MFA 0.15 · password strong 0.2 / medium 0.5 / weak 1.0 · EDR 0.6 · segmented hop 0.5
exploit maturity: unproven 0.3 · poc 0.6 · functional 0.9 · high 1.0
```

If several candidate edges connect the same two states, the one with the highest p is kept
(ties: technique name, then finding ids), so the graph is identical for identical input.

**Approximation (stated plainly):** `credential_use` toward an asset exists when some other host can
reach one of its auth ports. A credential node does not remember where it was obtained.

## 3. Scenarios (`scenarios.py`)

| Scenario | Entry | Goals (impact) |
|---|---|---|
| Sensitive Data Exposure | Internet | `DATA:a` for data_sensitivity ≥ 2 (sensitivity / 3) |
| Credential Compromise | Internet | every `CRED:x` (domain_admin 1.0, admin 0.8, user 0.4) + `DOMAIN_ADMIN` (1.0) |
| Lateral Movement | foothold (user-chosen; default first employee WS) | `PRIV:a:admin` for other assets with criticality ≥ 3 (criticality / 5) |
| Privilege Escalation | foothold | own admin (0.6), identity/admin WS admin (0.9), `DOMAIN_ADMIN` (1.0) |
| Outdated Service Exploitation | Internet | `PRIV:a:user` on assets running EOL software (criticality / 5) |

## 4. Scoring

```
path likelihood = Π p(edge)
path risk       = likelihood × impact(goal)
P_breach        = 1 − Π_goals (1 − max path risk to that goal)
score           = 100 × (1 − P_breach)
```
The most likely path to each goal is the shortest path under `w = −ln p` (Dijkstra). Top-K paths
use `nx.shortest_simple_paths` (Yen), K = 10, max depth 12; every reachable goal keeps its best
path in the list even if it would fall outside the top 10.

### Worked example: Northwind, Sensitive Data Exposure (r1)

Primary path P1 (Internet → fw-edge → web-01 → fw-int → idp-01 → customer-db):

| Step | Technique | p |
|---|---|---|
| S1 | reach web-01:22 through fw-edge (rule edge-20 allows any→web-01:22) | 1.0 |
| S2 | exploit OpenSSH (illustrative CVE-2023-38408, CVSS 9.8, functional, no EDR): 0.98 × 0.9 | 0.882 |
| S3 | reach idp-01:88 through fw-int (rule int-10) | 1.0 |
| S4 | Kerberoast svc-web (weak password): 0.95 × 1.0 | 0.95 |
| S5 | use svc-web credentials on customer-db (admin, no MFA): 0.9 | 0.9 |
| S6 | read customer data as admin | 0.95 |

Likelihood = 0.882 × 0.95 × 0.9 × 0.95 = **0.716404**; impact(customer-db, sensitivity 3) = 1.0 →
risk 0.716404.

Second goal `DATA:app-01` (sensitivity 2, impact 0.667): best path exploits Tomcat on app-01
(0.75 × 0.9 × EDR 0.6 = 0.405) and reads data as user (0.5): 0.882 × 0.405 × 0.5 = 0.178605 →
risk 0.119070.

P_breach = 1 − (1 − 0.716404)(1 − 0.119070) = **0.750172** → **score 24.98**.

## 5. Chokepoints, recommendations, residual exposure
- **Findings** (`findings.py`): vulnerabilities and misconfigurations with stable ids
  (`vuln:<id>`, `exposed_service:<asset>:<port>`, `weak_credential:<p>`, `no_mfa:<p>`,
  `kerberoastable:<p>`, `excessive_privilege:<p>:<asset>`, `cached_credential:<p>:<asset>`,
  `eol_software:…`, `weak_password_policy:<asset>`, `flat_network:<rule>`, `no_edr:<asset>`,
  `trust:<connection>`) and, where one exists, the typed fix action.
- **Chokepoints (what-if):** for every fix of a finding the attacker can actually exercise, apply it
  to a copy, re-score, `delta = score_after − score`. Ranked by delta (ties by id).
- **Recommendations:** a greedy plan on the same numbers: each next item is the fix with the best
  *marginal* gain given the items before it (`kind: blocking`), until the score is 100 or nothing
  helps. Remaining chokepoints follow as `kind: hardening` with marginal gain 0 and their standalone
  delta shown. `score_after` is the cumulative score.
- **Residual exposure:** findings still in the model that no edge reachable from the entry uses.
  Shown, not scored.

Northwind r1, Sensitive Data Exposure:

| Rank | Fix | Marginal Δ | Score after |
|---|---|---|---|
| 1 | enforce_mfa svc-web | +53.64 | 78.63 |
| 2 | restrict_port web-01:22 | +9.86 | 88.49 |
| 3 | apply_patch nginx (illustrative CVE-2021-23017) | +11.51 | 100.00 |

After these three the score is 100, no path reaches a goal, and residual exposure still lists
`excessive_privilege:svc-web:customer-db` (svc-web's admin right) among others.

## 6. Output
`score, p_breach, goals, paths (steps with ids P<n>.S<m>), primary_path, reachable_assets,
compromised_assets, compromised_pct, asset_risk, chokepoints, recommendations, findings,
residual_exposure, timeline {primary, discovery}, no_path, stats, result_hash`.
