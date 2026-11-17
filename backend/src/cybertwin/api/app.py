"""FastAPI application factory."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

from cybertwin import __version__
from cybertwin.api.errors import envelope, install_error_handlers
from cybertwin.api.routes import simulation, system, twins
from cybertwin.config import Settings, get_settings
from cybertwin.db.repository import Repository
from cybertwin.db.session import make_engine, make_sessionmaker, run_migrations
from cybertwin.services.core import ensure_demo

API_PREFIX = "/api/v1"


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        await asyncio.to_thread(run_migrations, settings.database_url)
        engine = make_engine(settings.database_url)
        app.state.engine = engine
        app.state.sessionmaker = make_sessionmaker(engine)
        async with app.state.sessionmaker() as session, session.begin():
            await ensure_demo(Repository(session))
        yield
        await engine.dispose()

    app = FastAPI(
        title="CyberTwin API",
        version=__version__,
        lifespan=lifespan,
        docs_url=f"{API_PREFIX}/docs",
        openapi_url=f"{API_PREFIX}/openapi.json",
        redoc_url=None,
    )
    app.state.settings = settings
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["Content-Type", "Accept-Language"],
        allow_credentials=False,
    )
    install_error_handlers(app)
    for module in (system, twins, simulation):
        app.include_router(module.router, prefix=API_PREFIX)
    _register_optional_routers(app)

    @app.api_route(
        f"{API_PREFIX}/{{path:path}}", methods=["GET", "POST", "PUT", "DELETE"], include_in_schema=False
    )
    async def api_not_found(path: str) -> Response:
        return envelope(404, "not_found", f"No API route /{path}", None, {"entity": "route", "id": path})

    if settings.frontend_dist is not None:
        _mount_frontend(app, Path(settings.frontend_dist))
    return app


def _register_optional_routers(app: FastAPI) -> None:
    """Routers added by later modules (AI, reports, i18n) register here when present."""
    from cybertwin.api.routes import extra

    for router in extra.routers():
        app.include_router(router, prefix=API_PREFIX)


def _mount_frontend(app: FastAPI, dist: Path) -> None:
    index = dist / "index.html"
    if not index.is_file():
        raise RuntimeError(f"FRONTEND_DIST has no index.html: {dist}")
    if (dist / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str, request: Request) -> Response:  # sync: runs in the threadpool (file I/O)
        candidate = (dist / path).resolve()
        if path and candidate.is_file() and dist.resolve() in candidate.parents:
            return FileResponse(candidate)
        return FileResponse(index, headers={"Cache-Control": "no-cache"})
