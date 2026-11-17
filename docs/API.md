# CyberTwin API (v1)

Base path: `/api/v1`. JSON everywhere. Interactive OpenAPI docs: `/api/v1/docs`.
The API only computes on the stored virtual model; nothing is scanned or contacted.

## Error envelope
Every error, including validation errors, unknown routes and unexpected failures:
```json
{"error": {"code": "validation.integrity",
           "message": "The change would make the model inconsistent.",
           "details": {"errors": [{"loc": ["connections"], "msg": "unknown_asset:connection:c-x:ghost"}]},
           "i18n": {"code": "error.validation.integrity", "params": {"errors": [...]}}}}
```
| Status | Codes (examples) |
|---|---|
| 404 | `not_found` (entity + id in params) |
| 409 | `conflict.duplicate_id`, `revision.no_change`, `remediation.already_reverted`, `remediation.revert_not_head` |
| 422 | `validation.request` (field + reason), `validation.integrity`, `validation.id_immutable`, `scenario.*`, `remediation.*`, `compare.same_revision` |
| 500 | `internal` (exception type; details in the backend log) |

CORS: only the configured origins (`CYBERTWIN_CORS_ORIGINS`; default Vite dev/preview on 127.0.0.1).

## System
| Method | Path | Notes |
|---|---|---|
| GET | `/health` | `{status, version, simulation_only: true, twins, ai_provider}` |
| POST | `/demo/reset` | deletes the Northwind twin (runs, remediations, events) and seeds it again |
| GET | `/events?limit=` | real application events (runs, remediations, edits, resets): `{unread, items}` |
| POST | `/events/read` | mark all as read |
| GET | `/vulns/catalog` | vulnerability templates (all `illustrative: true`) |
| GET | `/scenarios` | scenario ids + accepted params |
| GET | `/remediations/actions` | remediation action types |

## Twins and revisions
Revisions are immutable and numbered. Every edit, remediation, revert or restore creates a new one.
| Method | Path | Notes |
|---|---|---|
| GET | `/twins` | list with `head_revision` |
| GET | `/twins/{id}` | |
| GET | `/twins/{id}/revisions` | newest first: `number, parent, kind (seed/edit/remediation/revert), note {code, params}, changes` |
| GET | `/twins/{id}/revisions/{n}` | revision + full diff + model |
| GET | `/twins/{id}/revisions/{n}/diff?against=m` | structural diff (default: against the parent) |
| POST | `/twins/{id}/revisions/{n}/restore` | new revision with the content of r{n} |
| GET | `/twins/{id}/model?revision=n` | assets (+ derived `vulnerability_ids`, `risk_score`), connections, derived permission connections, principals, firewall rules, vulnerabilities, policy, positions |
| PUT | `/twins/{id}/positions` | `{positions: {asset_id: {x, y}}}`; never creates a revision |

## CRUD (always on the head revision; each mutation returns `{revision, item | affected}`)
`assets`, `connections`, `principals`, `firewall-rules`, `vulnerabilities`:
| Method | Path |
|---|---|
| GET | `/twins/{id}/{collection}?revision=n` |
| GET | `/twins/{id}/{collection}/{item_id}` |
| POST | `/twins/{id}/{collection}` (201) |
| PUT | `/twins/{id}/{collection}/{item_id}` (id is immutable) |
| DELETE | `/twins/{id}/{collection}/{item_id}` (deleting an asset cascades; `affected` lists what was removed) |
| GET | `/twins/{id}/assets/{asset_id}/dependents` (what a delete would remove) |

## Simulation
| Method | Path | Notes |
|---|---|---|
| POST | `/twins/{id}/simulations` | `{scenario, revision?, params?: {foothold}}` → run with the full result (201) |
| GET | `/twins/{id}/simulations?limit=` | run history (summaries) |
| GET | `/twins/{id}/simulations/latest?scenario=&revision=` | latest matching run or `null` |
| GET | `/simulations/{run_id}` | full run |
| GET | `/twins/{id}/recommendations?scenario=&revision=&foothold=` | recommendations, chokepoints, findings, residual exposure |
| POST | `/twins/{id}/compare` | `{scenario, revision_a, revision_b, params?}` → before/after comparison + both path lists |

Scenarios: `sensitive_data_exposure`, `credential_compromise`, `lateral_movement`,
`privilege_escalation`, `outdated_service_exploitation`. The result schema is in docs/ENGINE.md §6.

## Remediation
| Method | Path | Notes |
|---|---|---|
| POST | `/twins/{id}/remediations/apply` | `{actions: [...], scenario, params?}` → new revision + `comparison {before, after, score_delta, blocked_paths, reduced_paths, new_paths, per_asset_delta, residual_exposure}` |
| GET | `/twins/{id}/remediations` | history |
| GET | `/remediations/{rid}` | |
| POST | `/remediations/{rid}/revert` | new revision with the pre-remediation content + re-run; only while it is the head |

Action shapes:
```json
{"action": "restrict_port", "asset_id": "web-01", "port": 22}
{"action": "enforce_mfa", "principal_id": "svc-web"}
{"action": "set_password_policy", "principal_id": "svc-web", "strength": "strong"}
{"action": "set_password_policy", "asset_id": "web-01", "strength": "strong"}
{"action": "apply_patch", "vulnerability_id": "v-openssh-web01"}
{"action": "reduce_permission", "principal_id": "svc-web", "asset_id": "customer-db", "level": "user"}
{"action": "segment_zones", "zones": ["internal", "data"]}
```
