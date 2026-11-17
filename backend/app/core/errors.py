"""Domain errors and the single API error envelope: {"error": {"code", "message", "details", "i18n"?}}.

A DomainError built from a catalog message (``msg("err.…", **params)``) carries it as ``i18n`` so clients can
show it in the viewer's language; ``message`` is always the English rendering for API clients and logs.
"""

from __future__ import annotations

from typing import Any

from app.i18n import render
from app.schemas.i18n import Message

STATUS_BY_CODE: dict[str, int] = {
    "not_found": 404,
    "asset_not_found": 404,
    "principal_not_found": 404,
    "vuln_not_found": 404,
    "twin_not_found": 404,
    "revision_not_found": 404,
    "simulation_not_found": 404,
    "connection_not_found": 404,
    "rule_not_found": 404,
    "permission_not_found": 404,
    "conflict": 409,
    "duplicate_id": 409,
    "in_use": 409,
    "no_op": 409,
    "not_a_reduction": 422,
    "duplicate_action": 422,
    "port_not_open": 422,
    "not_patchable": 422,
    "invalid_action": 422,
    "invalid_snapshot": 422,
    "invalid_params": 422,
    "no_parent": 409,
    "ai_unavailable": 503,
}


class DomainError(Exception):
    def __init__(self, code: str, message: str | Message, details: dict[str, Any] | None = None) -> None:
        self.i18n = message if isinstance(message, Message) else None
        self.message = render(message, "en") if isinstance(message, Message) else message
        super().__init__(self.message)
        self.code = code
        self.details = details or {}

    @property
    def status(self) -> int:
        return STATUS_BY_CODE.get(self.code, 400)

    def envelope(self) -> dict[str, Any]:
        body: dict[str, Any] = {"code": self.code, "message": self.message, "details": self.details}
        if self.i18n is not None:
            body["i18n"] = self.i18n.model_dump(mode="json")
        return {"error": body}
