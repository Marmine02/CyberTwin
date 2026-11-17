"""Repository layer: the only place that talks SQLAlchemy. Portable ORM queries only."""

from __future__ import annotations

import builtins
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import DomainError
from app.models.tables import (
    AiCacheEntry,
    Event,
    LayoutPosition,
    RemediationRecord,
    SimulationRun,
    Twin,
    TwinRevision,
)
from app.schemas.i18n import msg


def iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC).isoformat().replace("+00:00", "Z")


class TwinRepository:
    def __init__(self, s: AsyncSession) -> None:
        self.s = s

    async def list(self) -> builtins.list[Twin]:
        return list((await self.s.execute(select(Twin).order_by(Twin.id))).scalars())

    async def get(self, twin_id: str) -> Twin:
        twin = await self.s.get(Twin, twin_id)
        if twin is None:
            raise DomainError("twin_not_found", msg("err.not_found", kind=msg("entity.twin"), id=twin_id))
        return twin

    async def exists(self, twin_id: str) -> bool:
        return await self.s.get(Twin, twin_id) is not None

    async def create(self, twin_id: str, name: str) -> Twin:
        if await self.exists(twin_id):
            raise DomainError("duplicate_id", msg("err.duplicate", kind=msg("entity.twin"), id=twin_id))
        twin = Twin(id=twin_id, name=name, head_revision=0)
        self.s.add(twin)
        await self.s.flush()
        return twin

    async def delete(self, twin_id: str) -> None:
        for model in (SimulationRun, RemediationRecord, LayoutPosition, TwinRevision):
            await self.s.execute(delete(model).where(model.twin_id == twin_id))
        await self.s.execute(delete(Event).where(Event.twin_id == twin_id))
        await self.s.execute(delete(Twin).where(Twin.id == twin_id))

    async def revision(self, twin_id: str, number: int) -> TwinRevision:
        rev = (
            await self.s.execute(
                select(TwinRevision).where(TwinRevision.twin_id == twin_id, TwinRevision.number == number)
            )
        ).scalar_one_or_none()
        if rev is None:
            raise DomainError("revision_not_found", msg("err.revision_missing", twin=twin_id, number=number))
        return rev

    async def revisions(self, twin_id: str) -> builtins.list[TwinRevision]:
        q = select(TwinRevision).where(TwinRevision.twin_id == twin_id).order_by(TwinRevision.number.desc())
        return list((await self.s.execute(q)).scalars())

    async def add_revision(
        self,
        twin: Twin,
        snapshot: dict[str, Any],
        *,
        parent: int | None,
        note: str,
        kind: str,
        diff: dict[str, Any],
        author: str = "user",
    ) -> TwinRevision:
        current = (
            await self.s.execute(select(func.max(TwinRevision.number)).where(TwinRevision.twin_id == twin.id))
        ).scalar_one_or_none()
        number = (current or 0) + 1
        rev = TwinRevision(
            twin_id=twin.id,
            number=number,
            parent_number=parent,
            note=note,
            kind=kind,
            snapshot=snapshot,
            diff=diff,
            author=author,
        )
        self.s.add(rev)
        twin.head_revision = number
        await self.s.flush()
        return rev


class LayoutRepository:
    def __init__(self, s: AsyncSession) -> None:
        self.s = s

    async def get(self, twin_id: str) -> dict[str, tuple[float, float]]:
        rows = (await self.s.execute(select(LayoutPosition).where(LayoutPosition.twin_id == twin_id))).scalars()
        return {r.asset_id: (r.x, r.y) for r in rows}

    async def upsert(self, twin_id: str, positions: dict[str, tuple[float, float]]) -> None:
        existing = {
            r.asset_id: r
            for r in (await self.s.execute(select(LayoutPosition).where(LayoutPosition.twin_id == twin_id))).scalars()
        }
        for asset_id, (x, y) in positions.items():
            row = existing.get(asset_id)
            if row is None:
                self.s.add(LayoutPosition(twin_id=twin_id, asset_id=asset_id, x=x, y=y))
            else:
                row.x, row.y = x, y
        await self.s.flush()


class SimulationRepository:
    def __init__(self, s: AsyncSession) -> None:
        self.s = s

    async def add(self, run: SimulationRun) -> SimulationRun:
        self.s.add(run)
        await self.s.flush()
        return run

    async def get(self, run_id: str) -> SimulationRun:
        run = await self.s.get(SimulationRun, run_id)
        if run is None:
            raise DomainError("simulation_not_found", msg("err.not_found", kind=msg("entity.simulation"), id=run_id))
        return run

    async def list(self, twin_id: str, limit: int = 100, scenario: str | None = None) -> builtins.list[SimulationRun]:
        q = select(SimulationRun).where(SimulationRun.twin_id == twin_id)
        if scenario:
            q = q.where(SimulationRun.scenario == scenario)
        q = q.order_by(SimulationRun.created_at.desc(), SimulationRun.id.desc()).limit(limit)
        return list((await self.s.execute(q)).scalars())


class RemediationRepository:
    def __init__(self, s: AsyncSession) -> None:
        self.s = s

    async def add(self, rec: RemediationRecord) -> None:
        self.s.add(rec)
        await self.s.flush()

    async def list(self, twin_id: str) -> builtins.list[RemediationRecord]:
        q = (
            select(RemediationRecord)
            .where(RemediationRecord.twin_id == twin_id)
            .order_by(RemediationRecord.created_at.desc())
        )
        return list((await self.s.execute(q)).scalars())


class AiCacheRepository:
    def __init__(self, s: AsyncSession) -> None:
        self.s = s

    async def get(self, key: str) -> AiCacheEntry | None:
        return await self.s.get(AiCacheEntry, key)

    async def put(self, entry: AiCacheEntry) -> None:
        existing = await self.s.get(AiCacheEntry, entry.key)
        if existing is not None:
            await self.s.delete(existing)
            await self.s.flush()
        self.s.add(entry)
        await self.s.flush()

    async def clear(self) -> None:
        await self.s.execute(delete(AiCacheEntry))


class EventRepository:
    def __init__(self, s: AsyncSession) -> None:
        self.s = s

    async def add(self, twin_id: str, kind: str, title: str, payload: dict[str, Any]) -> Event:
        ev = Event(twin_id=twin_id, kind=kind, title=title, payload=payload)
        self.s.add(ev)
        await self.s.flush()
        return ev

    async def list(self, twin_id: str | None = None, limit: int = 30) -> builtins.list[Event]:
        q = select(Event)
        if twin_id:
            q = q.where(Event.twin_id == twin_id)
        q = q.order_by(Event.created_at.desc(), Event.id.desc()).limit(limit)
        return list((await self.s.execute(q)).scalars())

    async def mark_all_read(self, twin_id: str | None = None) -> None:
        q = update(Event).values(read=True)
        if twin_id:
            q = q.where(Event.twin_id == twin_id)
        await self.s.execute(q)
