"""One error envelope for every failure:
``{"error": {"code", "message", "details", "i18n": {"code", "params"}}}``."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from cybertwin.db.repository import NotFoundError
from cybertwin.errors import AppError

log = logging.getLogger("cybertwin.api")


def envelope(
    status: int, code: str, message: str, details: Any = None, params: dict[str, Any] | None = None
) -> JSONResponse:
    params = params or {}
    return JSONResponse(
        status_code=status,
        content={
            "error": {
                "code": code,
                "message": message,
                "details": details,
                "i18n": {"code": f"error.{code}", "params": params},
            }
        },
    )


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError) -> JSONResponse:
        return envelope(exc.status, exc.code, exc.message, exc.params or None, exc.params)

    @app.exception_handler(NotFoundError)
    async def _not_found(_: Request, exc: NotFoundError) -> JSONResponse:
        return envelope(
            404,
            "not_found",
            str(exc),
            {"entity": exc.entity, "id": exc.ref},
            {"entity": exc.entity, "id": exc.ref},
        )

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        errors = [
            {
                "loc": [str(x) for x in e.get("loc", ())],
                "msg": str(e.get("msg", "")).removeprefix("Value error, "),
                "type": e.get("type", ""),
            }
            for e in exc.errors()
        ]
        first = errors[0] if errors else {"loc": [], "msg": ""}
        field = ".".join(x for x in first["loc"] if x not in ("body", "query", "path"))
        return envelope(
            422,
            "validation.request",
            f"Invalid request: {field or 'body'}: {first['msg']}",
            errors,
            {"field": field, "reason": first["msg"]},
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = "not_found" if exc.status_code == 404 else "http_error"
        return envelope(exc.status_code, code, str(exc.detail), None, {"status": exc.status_code})

    @app.exception_handler(Exception)
    async def _unexpected(_: Request, exc: Exception) -> JSONResponse:
        log.exception("unhandled error")
        return envelope(
            500,
            "internal",
            f"Unexpected server error ({type(exc).__name__}); see the backend log.",
            None,
            {"type": type(exc).__name__},
        )
