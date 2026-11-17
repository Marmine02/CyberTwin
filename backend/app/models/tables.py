"""SQLAlchemy 2.0 models. Portable types only (no SQLite-specific SQL): works on SQLite and PostgreSQL."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def utcnow() -> datetime:
    return datetime.now(UTC)


class Base(DeclarativeBase):
    pass


class Twin(Base):
    __tablename__ = "twins"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    head_revision: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class TwinRevision(Base):
    __tablename__ = "twin_revisions"
    __table_args__ = (UniqueConstraint("twin_id", "number", name="uq_revision_number"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    twin_id: Mapped[str] = mapped_column(ForeignKey("twins.id", ondelete="CASCADE"), index=True)
    number: Mapped[int] = mapped_column(Integer)
    parent_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    note: Mapped[str] = mapped_column(String(300), default="")
    author: Mapped[str] = mapped_column(String(80), default="user")
    kind: Mapped[str] = mapped_column(String(20), default="edit")  # seed | edit | remediation | revert
    snapshot: Mapped[dict[str, Any]] = mapped_column(JSON)
    diff: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class LayoutPosition(Base):
    __tablename__ = "layout_positions"
    twin_id: Mapped[str] = mapped_column(ForeignKey("twins.id", ondelete="CASCADE"), primary_key=True)
    asset_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    x: Mapped[float] = mapped_column(Float)
    y: Mapped[float] = mapped_column(Float)


class SimulationRun(Base):
    __tablename__ = "simulation_runs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    twin_id: Mapped[str] = mapped_column(ForeignKey("twins.id", ondelete="CASCADE"), index=True)
    revision: Mapped[int] = mapped_column(Integer)
    scenario: Mapped[str] = mapped_column(String(40))
    params: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    score: Mapped[float] = mapped_column(Float)
    result_json: Mapped[dict[str, Any]] = mapped_column(JSON)
    result_hash: Mapped[str] = mapped_column(String(64), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class RemediationRecord(Base):
    __tablename__ = "remediation_records"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    twin_id: Mapped[str] = mapped_column(ForeignKey("twins.id", ondelete="CASCADE"), index=True)
    from_revision: Mapped[int] = mapped_column(Integer)
    to_revision: Mapped[int] = mapped_column(Integer)
    actions: Mapped[list[Any]] = mapped_column(JSON)
    comparison: Mapped[dict[str, Any]] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AiCacheEntry(Base):
    __tablename__ = "ai_cache"
    key: Mapped[str] = mapped_column(String(200), primary_key=True)
    mode: Mapped[str] = mapped_column(String(20))
    provider: Mapped[str] = mapped_column(String(40))
    model: Mapped[str] = mapped_column(String(120), default="")
    content: Mapped[str] = mapped_column(Text)
    meta: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Event(Base):
    __tablename__ = "events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    twin_id: Mapped[str] = mapped_column(String(64), index=True)
    kind: Mapped[str] = mapped_column(String(40))
    title: Mapped[str] = mapped_column(String(200))
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
