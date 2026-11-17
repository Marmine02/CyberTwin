"""Request/response models for the HTTP API."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.i18n import Message
from app.schemas.twin import ID_PATTERN, TwinSnapshot


class ErrorBody(BaseModel):
    code: str
    message: str
    details: dict[str, Any] = Field(default_factory=dict)
    i18n: Message | None = Field(
        default=None, description="Translatable form of `message` (engine catalog key + params), when available"
    )


class ErrorEnvelope(BaseModel):
    error: ErrorBody


class TwinCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(pattern=ID_PATTERN)
    name: str = Field(min_length=1, max_length=120)
    clone_from: str | None = Field(default=None, description="Copy the head snapshot of another twin")


class TwinOut(BaseModel):
    id: str
    name: str
    head_revision: int
    created_at: str


class RevisionOut(BaseModel):
    id: int
    twin_id: str
    number: int
    parent_number: int | None
    kind: str
    note: str
    author: str
    created_at: str
    total_changes: int
    note_msg: Message | None = None


class RevisionDetail(RevisionOut):
    snapshot: TwinSnapshot
    diff: dict[str, Any]


class TwinState(BaseModel):
    twin: TwinOut
    revision: RevisionOut
    snapshot: TwinSnapshot
    latest_simulation_id: str | None


class LayoutPoint(BaseModel):
    x: float = Field(ge=-100000, le=100000)
    y: float = Field(ge=-100000, le=100000)


class LayoutUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    positions: dict[str, LayoutPoint] = Field(min_length=1, max_length=500)


class AssetImpact(BaseModel):
    asset_id: str
    connections: list[str]
    firewall_rules: list[str]
    principals: list[str]
    vulnerabilities: list[str]


class MutationOut(BaseModel):
    revision: RevisionOut
    entity: dict[str, Any] | None = None


class ScenarioOut(BaseModel):
    id: str
    label: str
    entry: Literal["internet", "foothold"]
    techniques: list[str]
    description: str


class EventOut(BaseModel):
    id: int
    twin_id: str
    kind: str
    title: str
    payload: dict[str, Any]
    read: bool
    created_at: str


class ExplainRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    simulation_id: str
    remediation_id: str | None = None
    lang: Literal["en", "tr", "az"] = "en"


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    twin_id: str
    simulation_id: str | None = None
    messages: list[ChatMessage] = Field(min_length=1, max_length=20)
    lang: Literal["en", "tr", "az"] = "en"


class RemediationRecordOut(BaseModel):
    id: str
    twin_id: str
    from_revision: int
    to_revision: int
    actions: list[dict[str, Any]]
    comparison: dict[str, Any]
    created_at: str


class ApplyOut(BaseModel):
    remediation_id: str
    revision: RevisionOut
    comparison: dict[str, Any]
