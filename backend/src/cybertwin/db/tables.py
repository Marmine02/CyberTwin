"""SQLAlchemy 2.0 tables. Portable types only (no SQLite- or PostgreSQL-specific SQL)."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, ClassVar

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def utcnow() -> datetime:
    return datetime.now(UTC)


class Base(DeclarativeBase):
    type_annotation_map: ClassVar[dict[Any, Any]] = {dict[str, Any]: JSON, list[Any]: JSON}


class TwinRow(Base):
    __tablename__ = "twins"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(64), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class RevisionRow(Base):
    """Immutable revision. ``content`` is the canonical TwinContent JSON."""

    __tablename__ = "twin_revisions"
    __table_args__ = (UniqueConstraint("twin_id", "number", name="uq_revision_number"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    twin_id: Mapped[int] = mapped_column(ForeignKey("twins.id", ondelete="CASCADE"), index=True)
    number: Mapped[int] = mapped_column(Integer)
    parent_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    kind: Mapped[str] = mapped_column(String(24))  # seed | edit | remediation | revert
    note: Mapped[str] = mapped_column(Text, default="")
    note_i18n: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)  # {code, params}
    diff: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    content: Mapped[dict[str, Any]] = mapped_column(JSON)
    content_hash: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class NodePositionRow(Base):
    """Map layout, kept outside revisions so dragging never creates a revision."""

    __tablename__ = "node_positions"
    twin_id: Mapped[int] = mapped_column(ForeignKey("twins.id", ondelete="CASCADE"), primary_key=True)
    asset_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    x: Mapped[float] = mapped_column(Float)
    y: Mapped[float] = mapped_column(Float)


class SimulationRunRow(Base):
    __tablename__ = "simulation_runs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    twin_id: Mapped[int] = mapped_column(ForeignKey("twins.id", ondelete="CASCADE"), index=True)
    revision_number: Mapped[int] = mapped_column(Integer)
    scenario: Mapped[str] = mapped_column(String(48))
    params: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    result: Mapped[dict[str, Any]] = mapped_column(JSON)
    result_hash: Mapped[str] = mapped_column(String(64), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class RemediationRow(Base):
    __tablename__ = "remediations"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    twin_id: Mapped[int] = mapped_column(ForeignKey("twins.id", ondelete="CASCADE"), index=True)
    from_revision: Mapped[int] = mapped_column(Integer)
    to_revision: Mapped[int] = mapped_column(Integer)
    scenario: Mapped[str] = mapped_column(String(48))
    params: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    actions: Mapped[list[Any]] = mapped_column(JSON)
    comparison: Mapped[dict[str, Any]] = mapped_column(JSON)
    reverted_by_revision: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class EventRow(Base):
    """Real application events shown as notifications (never synthetic incidents)."""

    __tablename__ = "events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    twin_id: Mapped[int | None] = mapped_column(ForeignKey("twins.id", ondelete="CASCADE"), nullable=True)
    code: Mapped[str] = mapped_column(String(64))
    params: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AICacheRow(Base):
    __tablename__ = "ai_cache"
    key: Mapped[str] = mapped_column(String(160), primary_key=True)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
