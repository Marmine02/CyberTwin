# Simulation engine

`backend/app/engine/` is a pure function of **(twin revision snapshot, scenario, params)**. It never
touches a network, never runs exploit code and uses no randomness. Same inputs ⇒ byte-identical
`SimulationResult` (asserted by `tests/engine/test_demo.py::test_determinism_*`, incl. across
processes with different `PYTHONHASHSEED`).

## 1. Attack state graph

NetworkX `DiGraph`. Nodes and edges are inserted in sorted-id order; ties in path search are broken
by that order and, in the final ranking, by the node-id signature.

| Node | Meaning |
|---|---|
| `ATTACKER@internet` | entry for internet scenarios (traffic originates at the `internet_gateway` asset) |
| `<asset>#network:<port>` | attacker can talk to `<asset>` on `<port>` (per-port, so "port 22 reachable" ≠ "port 443 reachable") |
| `<asset>#user`, `<asset>#admin` | code execution on the asset |
| `CRED:<principal>` | usable credentials of a principal |
| `DATA:<asset>` | sensitive data of an asset (assets with `data_sensitivity ≥ 1`) |
| `DOMAIN_ADMIN` | control of the identity domain |

### Edge generators (`graph.py`)

| Technique | Edge | Probability before clamp |
|---|---|---|
| `reach` | entry / `A#user` / `A#admin` → `B#network:P` if a route exists and allows P (see below) | `1.0 × (0.5 if zones segmented)` |
| `remote_exploit` | `B#network:P` → `B#<grants>` for a `remote_service` / `outdated_software` vuln on P | `cvss/10 × maturity × (0.6 if EDR)` |
| `brute_force` | `B#network:P` → `CRED:p` for auth services (22, 3389, 88, 389, 636, or service name contains login/sso/ssh/rdp/kerberos/ldap) and every principal p with a permission on B | `0.8 × password(p) × (0.15 if MFA)` |
| `local_privesc` | `A#user` → `A#admin` per `local_privesc` vuln | `cvss/10 × maturity × (0.6 if EDR)` |
| `credential_theft` | `A#admin` → `CRED:p` for each principal logged on to A | `0.9 × (0.6 if EDR)` |
| `kerberoast` | `I#user`/`I#admin` (identity server) → `CRED:p` for service accounts | `0.9 × password(p)` |
| `credential_use` | `CRED:p` → `X#user` (read/write) or `X#admin` (admin) per permission | `0.95 × (0.15 if MFA)` |
| `trust_abuse` / `permission_abuse` | `A#admin` → `B#user` over a trust / permission connection A→B, if A can reach B at all | `0.9 × (0.5 if segmented)` |
| `data_access` | `X#admin` → `DATA:X`; `CRED:p` → `DATA:X` if p has any permission on X | `0.99` / `0.95 × (0.15 if MFA)` |
| `domain_takeover` | `I#admin` → `DOMAIN_ADMIN`; `CRED:p` (domain admin) → `DOMAIN_ADMIN` | `0.95` / `0.95 × (0.15 if MFA)` |

Each edge stores `technique, vuln_id, p, w, reason, mitre[], via[]`. When two generators produce the
same (u, v) the higher p wins (ties: lexicographically smaller technique).

### Reachability (`reach.py`)

* Network connections are undirected links; traffic may transit **firewalls only** (≤ 4 hops).
* Every firewall on the route evaluates its rules ordered by `(order, id)`; the **first match** decides;
  **no match = deny**. Rules match on src zone **or** src CIDR, dst asset **or** dst zone, port (or any).
* A link with a `ports` list carries only those ports.
* The destination must listen on the port and, if the port has `exposed_to_zones`, the source zone must be listed.
* **Segmentation** (`segment_zones`): for a segmented zone pair, zone-wide allow rules are ignored and direct
  links do not carry traffic; only asset-specific allow rules can cross, and the hop gets the 0.5 modifier.

## 2. Probability and scoring

Constants live in one table, `engine/constants.py`:

| Modifier | Value |
|---|---|
| MFA | 0.15 |
| password strong / medium / weak | 0.2 / 0.5 / 1.0 |
| EDR | 0.6 |
| segmented zone hop | 0.5 |

* Edge probability `p = clamp(base × Π modifiers, 0.01, 0.99)`; weight `w = −ln p`.
* Most likely path = weighted shortest path (Dijkstra). Path likelihood `L = Π p`.
* `impact(asset) = (criticality/5) × (0.5 + data_sensitivity/6)`; credentials: 1.0 for domain admins, else
  max over permissions of `impact(asset) × {read .5, write .75, admin 1}`; `DOMAIN_ADMIN` = 1.0.
* Path risk `R = L × impact(goal)`.
* Per goal, the risk is the best path's risk. `P_breach = 1 − Π_goals (1 − R_goal)`;
  **score = 100 × (1 − P_breach)** (2 decimals).
* Top-K paths: `nx.shortest_simple_paths(…, weight="w")`, K = 10 per goal node, max depth 12, merged and
  re-ranked by risk (ties: likelihood, then node signature), then cut to 10.
* **Asset risk** (0–100): max over states of the asset of `exp(−(d_entry(s) + d(s → goal))) × impact(goal)`
  (exact most-likely path through the asset), also covering firewalls traversed by enumerated paths.
* **Chokepoints**: for each finding, every canonical fix (`fixed_by_remediation_types`) is applied to a copy
  of the snapshot, the score is recomputed, and `Δscore = score_after − score`. The best fix per finding is
  the chokepoint entry; the same evaluations become `GET /recommendations`.

### Scenarios (`scenarios.py`)

| Scenario | Entry | Goals | Techniques |
|---|---|---|---|
| Credential Compromise | internet | `CRED:*` | reach, brute force, kerberoast, credential theft/use |
| Lateral Movement | foothold (default: first employee workstation, user) | code execution on every other asset (`admin` × impact, `user` × 0.6 impact) | all |
| Privilege Escalation | foothold | `DOMAIN_ADMIN`, admin on identity servers | all |
| Sensitive Data Exposure | internet | `DATA:x` for `data_sensitivity ≥ 2` | all |
| Outdated Service Exploitation | internet | code execution on any asset | reach + remote exploit of `outdated_software`, or `remote_service` on assets with EOL software |

### Result

Engine version **1.1.0**. `SimulationResult` = score, p_breach, reachable / compromised assets, blast radius, per-asset risk, ranked paths
(steps with id `P<i>.S<j>`, from/to, technique, vuln, p, reason, ATT&CK ids, firewalls traversed), primary path,
chokepoints, findings (severity = max(CVSS band, Δscore band)), **residual findings** (see below), replay timeline (Dijkstra discovery order,
phase = recon/exploit/credential/escalate/pivot/exfil, cumulative likelihood) and `result_hash` =
SHA-256 of the canonical JSON (sorted keys, no whitespace, floats rounded to 6 decimals).

### Residual exposure (not part of the score)

A vulnerability or misconfiguration is **residual** when it is still present in the model but **no reachable attack
edge** in this scenario carries it:

* `reason = "unreachable"`: an attack edge uses the finding, but its source state can't be reached from the entry;
* `reason = "not_in_scenario"`: no technique allowed in the scenario uses it at all.

Residual findings never change the score (the formula is unchanged); they make the risk that survived a fix visible.
After the demo's top-3 fixes the residual list is `vuln-svcweb-dbadmin` (svc-web still admin on customer-db),
`vuln-svcweb-weakpw`, `vuln-ws-privesc`, `vuln-admapp-cached`.

### Translatable output

Human-readable engine text is emitted as messages `{code, params}`: step `reason`, timeline `label`, path
`goal_label`, finding and residual `title`, remediation `changes`, recommendation `title`/`rationale`. Params may
nest messages or lists. The catalog (EN + TR) lives in `app/i18n/__init__.py` and is served at
`GET /api/v1/i18n/engine`; tests assert both languages have identical keys and placeholders and that every code the
engine can emit exists in both.

## 3. Worked example: Northwind demo, Sensitive Data Exposure, r1

Primary path **P1** (Internet → fw-edge → web-01 → idp-01 → customer-db):

| Step | Edge | Technique | p | Why |
|---|---|---|---|---|
| P1.S1 | `ATTACKER@internet → web-01#network:22` | reach | 0.99 | fw-edge rule `fe-020` allows 0.0.0.0/0 → web-01:22 (`vuln-ssh-exposed`) |
| P1.S2 | `→ web-01#admin` | remote_exploit | 0.98 × 0.95 = **0.931** | outdated OpenSSH (`vuln-ssh-rce`, CVSS 9.8 illustrative, maturity 0.95, no EDR) |
| P1.S3 | `→ idp-01#user` | trust_abuse | **0.9** | svc-web keytab on web-01 is trusted by idp-01; web-01 reaches idp-01 on 88/636 (`fe-030/031`) |
| P1.S4 | `→ CRED:svc-web` | kerberoast | 0.9 × 1.0 = **0.9** | service account with a weak password (`vuln-svcweb-weakpw`) |
| P1.S5 | `→ DATA:customer-db` | data_access | **0.95** | svc-web has admin on customer-db, no MFA (`vuln-svcweb-dbadmin`) |

`L(P1) = 0.99 × 0.931 × 0.9 × 0.9 × 0.95 = 0.709240`.

Goals (`data_sensitivity ≥ 2`): `DATA:customer-db` (impact (5/5)(0.5+3/6) = 1.0, risk 0.709240) and
`DATA:app-01` (impact (3/5)(0.5+2/6) = 0.5; best L 0.312066 via web-01 → idp-01 → brute force of `adm-app`
over SSH; risk 0.156033).

`P_breach = 1 − (1 − 0.709240)(1 − 0.156033) = 0.754608` ⇒ **score 24.54**.

### Recommendations (what-if Δscore, each fix alone)

| # | Fix | Δscore | Score after |
|---|---|---|---|
| 1 | restrict web-01:22 to mgmt (removes `fe-020`) | +75.46 | 100.00 |
| 2 | patch `vuln-ssh-rce` (OpenSSH → 9.8p1) | +59.63 | 84.17 |
| 3 | enforce MFA for svc-web | +50.88 | 75.42 |
| 4 | strong password for svc-web | +47.89 | 72.43 |
| 5 | segment dmz ↔ internal | +34.96 | 59.50 |
| 6 | enforce MFA for adm-app | +4.08 | 28.62 |
| 7 | patch `vuln-ws-privesc` | 0.00 | 24.54 |
| 8 | reduce svc-web on customer-db to read | 0.00 | 24.54 (read still exposes the data) |

Patching alone leaves 84.17 because SSH stays exposed: brute force against svc-deploy / it-admin remains possible.

### Demo flow numbers (asserted in tests and e2e)

* Before: **24.54** (r1), 10 paths, 6/8 assets compromisable.
* Apply top 3 (restrict port, patch, MFA) → r2: **100.00**, **10/10 paths blocked**, 0 reduced, 0 new.
* Revert r2 → r3 (snapshot of r1): **24.54** again.
* Residual after the fixes: 4 findings (listed above), none exploitable in this scenario.

### All scenarios on the seed (r1)

| Scenario | Score | P_breach | Paths | Compromisable |
|---|---|---|---|---|
| Credential Compromise | 64.59 | 0.3541 | 10 | 6/8 |
| Lateral Movement (ws-emp-01) | 6.63 | 0.9337 | 10 | 6/8 |
| Privilege Escalation (ws-emp-01) | 87.57 | 0.1243 | 10 | 6/8 |
| Sensitive Data Exposure | 24.54 | 0.7546 | 10 | 6/8 |
| Outdated Service Exploitation | 50.84 | 0.4916 | 1 | 1/8 |

"Compromisable" counts assets with any reachable user/admin state regardless of probability: in
Credential Compromise, for example, the low-probability brute force of `it-admin` (strong password + MFA,
p = 0.024) still opens the graph.

## 4. Modelling choices and simplifications

* Credential use (`CRED:p → X`) does not re-check network reachability to X (credentials are assumed usable
  wherever the principal has rights). This over-approximates.
* Kerberoasting is available to any `user` foothold **on** an identity server; in reality any domain user can
  request service tickets from anywhere. This under-approximates.
* A trust connection's token is not modelled as a credential that can be stolen (it is only usable via trust abuse).
* The asset-level `password_policy` is used for the hardening gauge only; brute-force uses the principal's strength.
* Probabilities are relative likelihoods for ranking and comparison, not calibrated real-world probabilities.
