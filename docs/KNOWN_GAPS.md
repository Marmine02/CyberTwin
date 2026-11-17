# Known gaps

Stated bluntly. Updated as work progresses.

## Environment constraints (this PC)
- **Windows Smart App Control is enforced.** It blocks unsigned, low-reputation binaries. Consequences:
  - The uv-managed CPython's venv launcher is blocked. The backend uses the signed python.org
    Python 3.12 (installed per-user via winget); uv still manages the project and lockfile
    (`python-preference = "only-system"`).
  - SQLAlchemy's Cython extensions and mypy's mypyc build are blocked, so both are built from sdist
    as pure Python (`no-binary-package`). Slower mypy; no functional difference.
  - Console-script `.exe` trampolines in the venv (pytest.exe, uvicorn.exe, …) are blocked. Every
    tool runs as `python -m <tool>`.
- **TypeScript 6.0.x, not 7.x.** TypeScript 7 (native) is `latest` on npm, but typescript-eslint
  8.73 supports only `<6.1.0`. We use the newest 6.0 release to keep type-aware linting.
- **Playwright uses the installed Microsoft Edge** (`channel: 'msedge'`) instead of a downloaded
  Chromium, so it runs a real, signed browser.
- **PostgreSQL is not tested.** The code uses portable SQL and a repository layer so it should be
  a `DATABASE_URL` change, but only SQLite runs on this PC.
- **No LLM provider is available here** (no Ollama, no API keys). Provider adapters are
  contract-tested at the HTTP level only (respx for ollama/openai_compatible, an `httpx2`
  MockTransport for the Anthropic SDK). **None of them is tested on a real provider.**

## AI analyst
- **Anthropic: structured outputs instead of forced tool use. Documented, NOT verified live.** The
  spec asks for forced tool use. Source: Anthropic docs,
  https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools, section
  "Controlling Claude's output › Forcing tool use": *"Not every model and setting supports forced
  tool use. Where it isn't supported, `tool_choice: {"type": "any"}` and `tool_choice: {"type":
  "tool", ...}` fail"*; the table row for "Claude Opus 5.5" (among others) says *"`any` and `tool`
  return a 400 error"*. The same is stated in the `claude-api` reference bundled with Claude Code.
  This behaviour was **not** checked against the live API (no API key here). Based on that
  documentation the adapter uses the official SDK with
  `output_config.format` (JSON schema) instead, which constrains output the same way. If the
  assumption is wrong, switching back is a small change in `ai/providers.py`. The request also sets
  the beta header `server-side-fallback-2026-07-01` and `fallbacks: "default"`, taken from the same
  documentation and equally unverified. The SDK version used (2.9.0) sends the key as
  `Authorization: Bearer`; this was observed in the HTTP contract test, not against the real API.
- **Streaming is per section, not per token.** The LLM answer must be complete before placeholders
  can be checked and filled, so `/ai/explain` streams `meta` immediately, then the validated
  sections one by one. Chat streams the answer sentence by sentence after validation.
- Template chat understands a fixed set of intents (score, primary path/steps, fix, residual, asset
  ids/names) in EN/TR/AZ keywords; anything else gets a help message.
