# AI analyst: integrity design and live evaluation

All runs below are **real**: a local Ollama 0.30.7 server, models `qwen2.5:7b` and `llama3.1` (8B), no cache.
Reproduce with:

```bash
cd backend
PYTHONIOENCODING=utf-8 uv run python scripts/ai_eval.py --models qwen2.5:7b llama3.1 \
  --out ../docs/ai_eval_table.md --samples ../docs/ai_eval_samples.md
```

`docs/ai_eval_samples.md` holds every rendered text of the final run.

## How numbers and citations are kept honest

1. **Structured output.** The model must return JSON matching a schema: Ollama `format`, OpenAI-compatible
   `response_format: json_schema` (strict), Anthropic forced tool use. Invalid JSON counts as a provider failure
   (retry with backoff, then the deterministic template).
2. **No numbers from the model.** The prompt lists placeholder *keys only* (`{{score}}`, `{{p_breach}}`,
   `{{path.P1.likelihood}}`, `{{step.P1.S2.p}}`, `{{chokepoint.<vuln>.delta}}`, `{{score.before}}`, …). The backend
   fills them from the engine result. Unknown keys are reported and rendered as `⟨?⟩`.
3. **The narrative is keyed by path.** `attack_narrative` is an object whose required keys are exactly the top
   path ids, with one summary each. **Step-by-step lines are rendered from the engine** (technique label + engine
   reason), never from model text (see "why" below).
4. **Remediation entries are grammar-enforced (finding, action) pairs** (`fix_id` enum), so a fix can't be paired
   with the wrong finding.
5. **Post-checks on everything the model wrote** (shown in the UI as "Integrity checks"):

   | check | rule |
   |---|---|
   | stray numbers | a digit the model wrote anyway (outside ids like `web-01`, `P1.S3`, `CVE-…`, `T1190`) must match an input number within ±0.5 % |
   | unplaced numbers | literally written numbers that *do* match an input number; allowed by the ±0.5 % rule, but which quantity they refer to can't be verified |
   | wrong-path citations | a step id mentioned under path P must belong to P |
   | unknown placeholders | placeholder keys that don't exist |
   | order | a fix may not come before one with a strictly larger engine Δscore (ties may go either way) |
   | duplicates | the same (finding, action) listed twice |
   | unverified ids | any id-like token (asset, vuln, principal, step, CVE, ATT&CK) not in the input |
   | missing sections | an empty required section |
   | technique mismatch | step text whose wording names a different technique than the engine (only applies to model-written step text; none is written anymore) |

## Why steps are no longer written by the model

Three iterations were run against the live models:

* **v1: free-text Markdown.** The model wrote numbers itself. Observed: "likelihood 37.09 %" for a path whose
  engine likelihood is 70.9 %; a step attributed to the wrong path; required sections skipped.
* **v2: JSON with per-step text keyed by step id.** Wrong-path citations dropped to 0 (the grammar prevents
  them), but both models **shifted step descriptions by one position** (e.g. qwen2.5 described P1.S3 *credential
  use* as "Dump cached credentials", which is P1.S4). llama3.1 invented content ("credit card numbers", "a
  backdoor", a non-existent `ldap-01`). The technique check flagged 1 to 5 steps per run, mostly true positives.
* **v3 (current): engine-rendered steps, model-written path summaries.** Misattributed steps are now impossible
  by construction.

Also tried: banning digits at grammar level with a JSON-schema `pattern`. **Ollama 0.30.7 doesn't support it**: a
complex pattern made it silently ignore the schema (plain-text output), and even `^[^0-9]*$` made generation run
until a 120 s timeout. So digits can only be policed by the post-check, not prevented.

## Final live run (v3)

| model | scenario | lang | mode | stray numbers | wrong-path citations | unknown placeholders | order | missing sections / unverified ids | unplaced numbers | technique mismatch | duplicate fixes | time |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| qwen2.5:7b | credential_compromise | en | llm | 29.79%, 9.86% | 0 | 0 | 0 | 0 | 64.59, 1, 14.89%, 4.97% | 0 | vuln-ssh-exposed\|restrict_port:web-01:22:mgmt | 19s |
| qwen2.5:7b | lateral_movement | en | llm | 0 | 0 | 0 | 0 | 0 | 6.63, 10 | 0 | 0 | 21s |
| qwen2.5:7b | privilege_escalation | en | llm | 0 | 0 | 0 | 0 | 0 | 87.57, 100 | 0 | vuln-ws-privesc\|apply_patch:vuln-ws-privesc | 15s |
| qwen2.5:7b | sensitive_data_exposure | en | llm | 0 | 0 | 0 | 0 | 0 | 1, 24.54, 22 | 0 | vuln-ssh-exposed\|restrict_port:web-01:22:mgmt | 19s |
| qwen2.5:7b | sensitive_data_exposure | tr | llm | 0 | 0 | 0 | 0 | 0 | 1, 24.54, 22 | 0 | vuln-ssh-exposed\|restrict_port:web-01:22:mgmt | 19s |
| qwen2.5:7b | outdated_service_exploitation | en | llm | 0 | 0 | 0 | 0 | 0 | 22, 7.2 | 0 | vuln-ssh-exposed\|restrict_port:web-01:22:mgmt, vuln-ssh-rce\|apply_patch:vuln-ssh-rce | 17s |
| llama3.1 | credential_compromise | en | llm | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 17s |
| llama3.1 | lateral_movement | en | llm | 0 | 0 | 0 | 0 | 0 | 22 | 0 | 0 | 16s |
| llama3.1 | privilege_escalation | en | llm | 0 | 0 | 0 | 0 | 0 | 0 | 0 | vuln-admapp-cached\|enforce_mfa:adm-app | 12s |
| llama3.1 | sensitive_data_exposure | en | llm | 0 | 0 | 0 | 0 | 0 / unverified: CVE-2022-0336 | 01, 22 | 0 | 0 | 11s |
| llama3.1 | sensitive_data_exposure | tr | llm | 0 | 0 | 0 | 0 | 0 / unverified: CVE-2022-0336 | 01, 22 | 0 | 0 | 11s |
| llama3.1 | outdated_service_exploitation | en | llm | 0 | 0 | 0 | 0 | 0 | 7.2, 22 | 0 | vuln-ssh-rce\|apply_patch:vuln-ssh-rce, vuln-ssh-exposed\|restrict_port:web-01:22:mgmt | 15s |

### Failure cases still observed (all detected and shown in the UI)

* **Invented numbers**: qwen2.5:7b wrote `29.79%` and `9.86%` (Credential Compromise). Neither exists in the
  input. Reported as stray numbers and highlighted in the text.
* **Invented CVE**: llama3.1 wrote `CVE-2022-0336` (Sensitive Data Exposure, EN and TR). Not in the input,
  flagged as unverified.
* **Literal numbers instead of placeholders**: every qwen2.5 run quoted e.g. `24.54` or `64.59` directly
  (correct values, but the model ignored the placeholder rule). Reported as unplaced numbers.
* **Duplicate fixes** in 7 of 12 runs.
* **Not detectable by any check**: wrong *wording* in free summaries that uses only valid ids and placeholders
  (e.g. calling the overall score "6.63 out of 10" was caught as an unplaced number, but a qualitative misstatement
  without numbers or ids would not be). The engine's own data next to the text (steps, scores) stays authoritative.

Zero across all 12 runs: wrong-path citations, unknown placeholders, order violations, missing sections.
JSON validity: all 12 runs ended in LLM mode with schema-valid JSON (no fallback). Whether any run needed its one
retry was not recorded by the script.
