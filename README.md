# CyberTwin

Graph-based cybersecurity digital twin of a small organization, run as a desktop-style app.
It models the IT infrastructure as a virtual graph, simulates predefined attack scenarios with a
deterministic engine, finds attack paths and chokepoints, explains the results (template or LLM),
applies remediations as new revisions and compares before and after.

**Simulation only.** Nothing real is scanned, probed or attacked; every number is computed from the
stored virtual model. CVE references in the demo data are illustrative.

## Setting up a fresh Windows PC

This PC runs **Windows Smart App Control (SAC)** in enforcement mode. SAC blocks unsigned,
low-reputation executables and DLLs, which affects a normal Python setup in three places. The steps
below work with SAC on; they need no administrator rights.

1. **Git, Node.js (LTS) and GitHub CLI**: install from their official signed installers (or
   `winget install Git.Git OpenJS.NodeJS.LTS GitHub.cli`).
2. **uv** (Python project manager, user-level, no UAC):
   ```powershell
   powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
   ```
   It installs to `%USERPROFILE%\.local\bin`; open a new terminal afterwards.
3. **Python 3.12 from python.org** (signed), per user:
   ```powershell
   winget install --id Python.Python.3.12 --scope user
   ```
   *Why not `uv python install`?* uv's own CPython builds are fine, but the `python.exe` launcher it
   copies into a virtual environment is unsigned and SAC blocks it. The python.org build ships a
   signed launcher. `backend/pyproject.toml` sets `python-preference = "only-system"` so uv always
   picks the python.org interpreter.
4. **Backend dependencies**:
   ```powershell
   cd backend
   uv sync
   ```
   `pyproject.toml` builds **SQLAlchemy and mypy from source as pure Python**
   (`no-binary-package`), because SAC blocks their compiled Cython/mypyc extensions. Everything
   else (pydantic-core, greenlet, uvicorn extras, …) loads normally.
5. **Never run the console-script `.exe` shims** in `backend\.venv\Scripts` (`pytest.exe`,
   `uvicorn.exe`, …): they are unsigned and blocked. Always use `uv run python -m <tool>` (for
   example `uv run python -m pytest`). The app itself starts as `python -m cybertwin`.
6. **Frontend dependencies**:
   ```powershell
   cd frontend
   npm install
   ```
   The bundler's native binaries (rolldown, Tailwind oxide, lightningcss) load fine under SAC.
   Playwright drives the installed, signed **Microsoft Edge** (`channel: 'msedge'`), so no browser
   download is needed.

If SAC blocks something new, Windows shows a notification and Python reports
`An Application Control policy has blocked this file`. The fix is the same pattern: use the signed
interpreter, or build that package from source as pure Python.

## Running

*Desktop app mode, launcher and screenshots are documented at the end of the project (phases 9-11).*

Development:
```powershell
# terminal 1 - backend on 127.0.0.1:8765
cd backend; uv run python -m cybertwin --port 8765
# terminal 2 - frontend with the Vite proxy to the backend
cd frontend; npm run dev
```

## Checks
```powershell
powershell -ExecutionPolicy Bypass -File scripts\check.ps1   # ruff, mypy, pytest, tsc, eslint, vitest
```

## Demo expectations (Northwind Logistics)
- Sensitive Data Exposure on r1: score **25.0**, primary path
  **Internet → fw-edge → web-01 → fw-int → idp-01 → customer-db**.
- Applying the top 3 recommendations creates r2 with score **100**; residual exposure still lists
  svc-web's admin right on customer-db. Reverting creates r3 with the r1 score again.

More: [docs/ENGINE.md](docs/ENGINE.md), [docs/API.md](docs/API.md),
[docs/KNOWN_GAPS.md](docs/KNOWN_GAPS.md).
