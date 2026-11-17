# API (v1)

Base path `/api/v1`. Interactive OpenAPI docs: `http://localhost:8000/docs`.

## Errors

Every error uses one envelope:

```json
{ "error": { "code": "port_not_open", "message": "Asset 'web-01' has no port 3389 open; cannot create rule",
             "details": {"asset_id": "web-01", "port": 3389},
             "i18n": {"code": "err.rule_port_closed", "params": {"asset": "web-01", "port": 3389}} } }
```

`message` is always English. `i18n` (present on domain errors) is the same text as a catalog message: render it with
`GET /api/v1/i18n/engine`, the same way as engine output. Count-dependent texts use i18next plural keys
(`code_one` / `code_other`). Pydantic validation errors (`validation_error`) have no `i18n` and stay English.

| Status | Codes |
|---|---|
| 404 | `twin_not_found`, `revision_not_found`, `asset_not_found`, `principal_not_found`, `vuln_not_found`, `connection_not_found`, `rule_not_found`, `simulation_not_found`, `permission_not_found`, `not_found` |
| 409 | `duplicate_id`, `conflict` (incl. optimistic-concurrency mismatch), `in_use`, `no_op`, `no_parent` |
| 422 | `validation_error` (Pydantic; message lists `field: reason`), `invalid_snapshot`, `invalid_params`, `port_not_open`, `not_patchable`, `not_a_reduction`, `duplicate_action`, `invalid_action` |
| 500 | `internal_error` (exception type + path; details in the server log) |

CORS allows only `CORS_ORIGINS` (default `http://localhost:5173`).

## Translatable messages

Engine and system text is returned as `{"code": "...", "params": {...}}` (params may be strings, numbers, nested
messages or lists). Fields: `PathStep.reason`, `TimelineEvent.label`, `AttackPath.goal_label`, `Finding.title`,
`ResidualFinding.title`, `Comparison.changes[]`, `Recommendation.title` / `rationale`, `RevisionOut.note_msg`,
`Event.payload.message`, `Vulnerability.title_i18n` (seed/catalog titles; dropped when the user edits `title`).

| Method | Path | Notes |
|---|---|---|
| GET | `/i18n/engine` | `{"en": {code: template}, "tr": {...}}`, i18next `{{param}}` syntax |

## Twins & revisions

| Method | Path | Notes |
|---|---|---|
| GET | `/twins` | list |
| POST | `/twins` | `{id, name, clone_from?}` → creates r1 |
| GET | `/twins/{id}?revision=n` | `{twin, revision, snapshot, latest_simulation_id}`; positions merged; `risk_score` filled from the latest run on that revision |
| DELETE | `/twins/{id}` | |
| GET | `/twins/{id}/revisions` | newest first |
| GET | `/twins/{id}/revisions/{n}` | snapshot + stored diff vs parent |
| GET | `/twins/{id}/diff?base=a&target=b` | structural diff (added/removed/changed per collection + segmented zones) |
| POST | `/revisions/{revision_id}/revert` | new revision restoring the parent of `revision_id` |
| PUT | `/twins/{id}/layout` | `{positions: {asset_id: {x, y}}}`, not revisioned |

## Entity CRUD (each write creates a revision; optional `?expected_revision=n`)

`/twins/{id}/assets`, `/assets/{asset_id}` (GET/POST/PUT/DELETE), `/assets/{asset_id}/impact` (what a delete removes),
`/twins/{id}/connections[/{cid}]`, `/twins/{id}/principals[/{pid}]`, `/twins/{id}/firewall-rules[/{rid}]`,
`/twins/{id}/vulnerabilities[/{vid}]`, `GET /vulnerabilities/catalog` (templates; CVE ids are illustrative `CVE-2099-*`).

Write responses: `{revision, entity}`. Validation examples: IPv4, unique port/proto per asset, version string pattern,
firewall rule shape (exactly one src and one dst), "rule allows a port the destination does not listen on",
vulnerability port must be open, duplicate connections, unknown references.

## Simulation

| Method | Path | Body / query |
|---|---|---|
| GET | `/scenarios` | labels, entry kind, techniques |
| POST | `/simulations` | `{twin_id, scenario, revision?, params?}`; `params.foothold`, `params.foothold_privilege` for lateral/privesc |
| GET | `/simulations/{id}` | full run incl. `result` (also `residual_findings`: present but not exploitable in this scenario) |
| GET | `/simulations?twin=&scenario=&limit=` | history summaries |

Example:

```bash
curl -s -XPOST localhost:8000/api/v1/simulations -H 'content-type: application/json' \
  -d '{"twin_id":"northwind","scenario":"sensitive_data_exposure"}' | jq '.result.score'
# 24.54
```

## Remediation

| Method | Path | Body / query |
|---|---|---|
| GET | `/recommendations?twin=&scenario=&revision=&foothold=` | what-if Δscore per candidate action, sorted |
| POST | `/remediations/apply` | `{twin_id, scenario, params?, actions[], note?}` → `{remediation_id, revision, comparison}` |
| GET | `/remediations?twin=` | applied fixes with stored comparisons |

Action union (`type` discriminator): `restrict_port {asset_id, port, allow_from_zones[]}`,
`enforce_mfa {principal_id}`, `set_password_policy {principal_id, policy}`, `apply_patch {vuln_id}`,
`reduce_permission {principal_id, asset_id, level: none|read|write}`, `segment_zones {zone_a, zone_b}`.

Comparison: `before_score, after_score, score_delta, blocked_paths[], reduced_paths[], new_paths[], per_asset_delta[], changes[]`.
A path is *blocked* if its goal became unreachable or its exact step sequence (edges + techniques) no longer exists.

## AI (Server-Sent Events over POST)

| Method | Path | Body |
|---|---|---|
| GET | `/ai/status` | `{provider, model, mode: llm|fallback, config_error}` |
| POST | `/ai/explain` | `{simulation_id, remediation_id?, lang: en|tr}` |
| POST | `/ai/chat` | `{twin_id, simulation_id?, messages: [{role, content}], lang}` |

Events (`event: <type>\ndata: <json>`): `meta {mode, provider, model, cached, reason?}`, `progress {chars}` (model is
writing structured JSON), `delta {text}`, `reset {reason}` (LLM failed or returned invalid JSON; template follows),
`done {mode, unverified[], missing_sections[], numeric_violations[], unplaced_numbers[], citation_violations[],
unknown_placeholders[], order_violations[], technique_violations[], duplicate_fixes[]}`.

The model returns schema-constrained JSON (Ollama `format`, OpenAI `response_format: json_schema`, Anthropic forced
tool use) with `{{placeholder}}` keys instead of numbers; the server fills them in, renders the attack steps from the
engine and runs the checks above. See docs/AI_EVAL.md.

## Reports, events, demo

| Method | Path | Notes |
|---|---|---|
| GET | `/reports/{simulation_id}?format=json|html&lang=` | score, paths, findings, applied fixes, revision diff, analyst summary; HTML is printable (Print → PDF) |
| GET | `/events?twin=` / POST `/events/read` | notification feed: simulation finished, remediation applied, revert, demo reset |
| POST | `/demo/reset` | deletes and re-seeds the Northwind twin |
| GET | `/health` | |
