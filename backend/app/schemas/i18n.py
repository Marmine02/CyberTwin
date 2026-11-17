"""Translatable message: the engine emits {code, params}; clients render it in the viewer's language."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

type MsgParam = str | int | float | Message | list[str | Message]


class Message(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: str = Field(description="Catalog key, e.g. edge.reach.via (see GET /api/v1/i18n/engine)")
    params: dict[str, MsgParam] = Field(default_factory=dict)


def msg(code: str, **params: MsgParam) -> Message:
    return Message(code=code, params=params)


Message.model_rebuild()
