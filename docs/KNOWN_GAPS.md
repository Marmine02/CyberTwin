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
  contract-tested with respx only, so they are **not tested on a real provider**.
