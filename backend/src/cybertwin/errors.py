"""Application error carrying an HTTP status and an i18n code + params."""

from __future__ import annotations

from typing import Any


class AppError(Exception):
    def __init__(self, code: str, status: int = 400, message: str = "", **params: Any) -> None:
        super().__init__(message or code)
        self.code = code
        self.status = status
        self.message = message or code
        self.params = params
