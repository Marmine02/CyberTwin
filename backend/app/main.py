"""FastAPI application factory."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api import ai, misc, reports, sims, twins
from app.core.config import Settings, get_settings
from app.core.errors import DomainError
from app.core.logging import configure_logging, log
from app.db.session import Database
from app.services.core import Services


def _validation_message(exc: RequestValidationError) -> str:
    parts = []
    for err in exc.errors():
        loc = [str(x) for x in err.get("loc", ()) if x not in ("body", "query", "path")]
        msg = str(err.get("msg", "invalid")).removeprefix("Value error, ")
        parts.append(f"{'.'.join(loc)}: {msg}" if loc else msg)
    return "; ".join(parts) or "Request validation failed"


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        db = Database(settings.database_url)
        await db.migrate()
        app.state.db = db
        app.state.settings = settings
        if settings.seed_on_startup:
            async with db.sessionmaker() as s:
                await Services(s).ensure_demo()
        log.info("startup", db=settings.database_url.split("://")[0], ai_provider=settings.ai_provider)
        yield
        await db.dispose()

    app = FastAPI(
        title="CyberTwin API",
        version="1.0.0",
        description="Graph-based cybersecurity digital twin. Simulation only: no scanning, no probes.",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["Content-Type"],
    )

    @app.exception_handler(DomainError)
    async def domain_error(_: Request, exc: DomainError) -> JSONResponse:
        return JSONResponse(exc.envelope(), status_code=exc.status)

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        details = {"errors": [{"loc": list(e.get("loc", ())), "msg": e.get("msg")} for e in exc.errors()]}
        return JSONResponse(
            {"error": {"code": "validation_error", "message": _validation_message(exc), "details": details}},
            status_code=422,
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_error(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = "not_found" if exc.status_code == 404 else "http_error"
        msg = f"No route for {request.method} {request.url.path}" if exc.status_code == 404 else str(exc.detail)
        return JSONResponse({"error": {"code": code, "message": msg, "details": {}}}, status_code=exc.status_code)

    @app.exception_handler(Exception)
    async def unexpected(request: Request, exc: Exception) -> JSONResponse:
        log.exception("unhandled", path=request.url.path)
        return JSONResponse(
            {
                "error": {
                    "code": "internal_error",
                    "message": f"Unexpected {type(exc).__name__} while handling {request.method} "
                    f"{request.url.path}; see server log",
                    "details": {},
                }
            },
            status_code=500,
        )

    for r in (twins.router, sims.router, ai.router, reports.router, misc.router):
        app.include_router(r, prefix="/api/v1")
    if settings.frontend_dist:
        _serve_frontend(app, Path(settings.frontend_dist))
    return app


def _serve_frontend(app: FastAPI, dist: Path) -> None:
    """Serve the built UI from the same process (registered after the API routes, so /api always wins).

    Real files under dist are returned as is; every other GET path returns index.html so client-side routes
    (/simulate, /remediation?...) survive a reload. Unknown /api/... paths keep the JSON "No route" 404.
    """
    dist = dist.resolve()
    index = dist / "index.html"
    if not index.is_file():
        raise RuntimeError(f"FRONTEND_DIST={dist} has no index.html; build the frontend first (npm run build)")
    if (dist / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    async def spa(path: str) -> FileResponse:
        if path == "api" or path.startswith("api/"):
            raise StarletteHTTPException(status_code=404)
        candidate = (dist / path).resolve()
        if path and candidate.is_file() and candidate.is_relative_to(dist):
            return FileResponse(candidate)
        # index.html must not be cached: it names the hashed asset files of the current build
        return FileResponse(index, headers={"Cache-Control": "no-cache"})


app = create_app()
