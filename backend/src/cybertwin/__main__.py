"""Run the backend: ``python -m cybertwin --port 8765 [--host 127.0.0.1] [--frontend-dist PATH]``.

Used by the desktop launcher (no console-script .exe needed, which Smart App Control blocks).
"""

from __future__ import annotations

import argparse
import os

import uvicorn


def main() -> None:
    parser = argparse.ArgumentParser(prog="cybertwin")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--frontend-dist", default=None)
    parser.add_argument("--database-url", default=None)
    args = parser.parse_args()
    if args.frontend_dist:
        os.environ["CYBERTWIN_FRONTEND_DIST"] = args.frontend_dist
    if args.database_url:
        os.environ["CYBERTWIN_DATABASE_URL"] = args.database_url
    from cybertwin.api.app import create_app

    uvicorn.run(create_app(), host=args.host, port=args.port, log_level="info", access_log=False)


if __name__ == "__main__":
    main()
