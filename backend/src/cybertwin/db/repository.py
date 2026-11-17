"""Repository layer: the only module that talks to the database.

Uses SQLAlchemy Core/ORM constructs that compile to portable SQL, so switching to PostgreSQL is a
``DATABASE_URL`` change (not tested on this PC; see docs/KNOWN_GAPS.md).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from cybertwin.db.tables import (
    AICacheRow,
    EventRow,
    NodePositionRow,
    RemediationRow,
    RevisionRow,
    SimulationRunRow,
    TwinRow,
)
from cybertwin.domain.diff import diff_contents
from cybertwin.domain.model import TwinContent


class NotFoundError(LookupError):
    def __init__(self, entity: str, ref: str) -> None:
        super().__init__(f"{entity} {ref} not found")
        self.entity = entity
        self.ref = ref


@dataclass(frozen=True)
class Revision:
    row: RevisionRow
    content: TwinContent


class Repository:
    def __init__(self, session: AsyncSession) -> None:
        self.s = session

    # ---- twins ---------------------------------------------------------------------------
    async def list_twins(self) -> list[TwinRow]:
        return list((await self.s.scalars(select(TwinRow).order_by(TwinRow.id))).all())

    async def get_twin(self, twin_id: int) -> TwinRow:
        row = await self.s.get(TwinRow, twin_id)
        if row is None:
            raise NotFoundError("twin", str(twin_id))
        return row

    async def get_twin_by_slug(self, slug: str) -> TwinRow | None:
        return (await self.s.scalars(select(TwinRow).where(TwinRow.slug == slug))).first()

    async def create_twin(
        self, *, slug: str, name: str, description: str, content: TwinContent, note_i18n: dict[str, Any]
    ) -> tuple[TwinRow, RevisionRow]:
        twin = TwinRow(slug=slug, name=name, description=description)
        self.s.add(twin)
        await self.s.flush()
        rev = await self._insert_revision(
            twin.id, 1, None, "seed", content, note_i18n, {"summary": {"changes": 0}}
        )
        return twin, rev

    async def delete_twin(self, twin_id: int) -> None:
        # Explicit child deletes keep this portable even where FK cascades are not enforced.
        for table in (RevisionRow, NodePositionRow, SimulationRunRow, RemediationRow, EventRow):
            await self.s.execute(delete(table).where(table.twin_id == twin_id))
        await self.s.execute(delete(TwinRow).where(TwinRow.id == twin_id))

    # ---- revisions -----------------------------------------------------------------------
    async def head_number(self, twin_id: int) -> int:
        n = await self.s.scalar(select(func.max(RevisionRow.number)).where(RevisionRow.twin_id == twin_id))
        if n is None:
            raise NotFoundError("twin", str(twin_id))
        return int(n)

    async def list_revisions(self, twin_id: int) -> list[RevisionRow]:
        q = select(RevisionRow).where(RevisionRow.twin_id == twin_id).order_by(RevisionRow.number)
        return list((await self.s.scalars(q)).all())

    async def get_revision(self, twin_id: int, number: int | None = None) -> Revision:
        if number is None:
            number = await self.head_number(twin_id)
        q = select(RevisionRow).where(RevisionRow.twin_id == twin_id, RevisionRow.number == number)
        row = (await self.s.scalars(q)).first()
        if row is None:
            raise NotFoundError("revision", f"{twin_id}/r{number}")
        return Revision(row, TwinContent.model_validate(row.content))

    async def add_revision(
        self, twin_id: int, content: TwinContent, *, kind: str, note_i18n: dict[str, Any]
    ) -> RevisionRow:
        """Append a new revision on top of head. Revisions are never updated afterwards."""
        head = await self.get_revision(twin_id)
        diff = diff_contents(head.content, content)
        return await self._insert_revision(
            twin_id, head.row.number + 1, head.row.number, kind, content, note_i18n, diff
        )

    async def _insert_revision(
        self,
        twin_id: int,
        number: int,
        parent: int | None,
        kind: str,
        content: TwinContent,
        note_i18n: dict[str, Any],
        diff: dict[str, Any],
    ) -> RevisionRow:
        norm = content.normalized()
        row = RevisionRow(
            twin_id=twin_id,
            number=number,
            parent_number=parent,
            kind=kind,
            note=str(note_i18n.get("params", {}).get("text", "")),
            note_i18n=note_i18n,
            diff=diff,
            content=norm.model_dump(mode="json"),
            content_hash=norm.content_hash(),
        )
        self.s.add(row)
        await self.s.flush()
        return row

    # ---- node positions ------------------------------------------------------------------
    async def get_positions(self, twin_id: int) -> dict[str, tuple[float, float]]:
        rows = await self.s.scalars(select(NodePositionRow).where(NodePositionRow.twin_id == twin_id))
        return {r.asset_id: (r.x, r.y) for r in rows}

    async def set_positions(self, twin_id: int, positions: dict[str, tuple[float, float]]) -> None:
        for asset_id, (x, y) in sorted(positions.items()):
            row = await self.s.get(NodePositionRow, (twin_id, asset_id))
            if row is None:
                self.s.add(NodePositionRow(twin_id=twin_id, asset_id=asset_id, x=x, y=y))
            else:
                row.x, row.y = x, y
        await self.s.flush()

    # ---- simulation runs -----------------------------------------------------------------
    async def add_run(
        self, twin_id: int, revision: int, scenario: str, params: dict[str, Any], result: dict[str, Any]
    ) -> SimulationRunRow:
        row = SimulationRunRow(
            twin_id=twin_id,
            revision_number=revision,
            scenario=scenario,
            params=params,
            result=result,
            result_hash=str(result["result_hash"]),
        )
        self.s.add(row)
        await self.s.flush()
        return row

    async def get_run(self, run_id: int) -> SimulationRunRow:
        row = await self.s.get(SimulationRunRow, run_id)
        if row is None:
            raise NotFoundError("run", str(run_id))
        return row

    async def list_runs(self, twin_id: int, limit: int = 100) -> list[SimulationRunRow]:
        q = (
            select(SimulationRunRow)
            .where(SimulationRunRow.twin_id == twin_id)
            .order_by(SimulationRunRow.id.desc())
            .limit(limit)
        )
        return list((await self.s.scalars(q)).all())

    async def latest_run(
        self, twin_id: int, *, scenario: str | None = None, revision: int | None = None
    ) -> SimulationRunRow | None:
        q = select(SimulationRunRow).where(SimulationRunRow.twin_id == twin_id)
        if scenario is not None:
            q = q.where(SimulationRunRow.scenario == scenario)
        if revision is not None:
            q = q.where(SimulationRunRow.revision_number == revision)
        return (await self.s.scalars(q.order_by(SimulationRunRow.id.desc()).limit(1))).first()

    # ---- remediations --------------------------------------------------------------------
    async def add_remediation(self, **fields: Any) -> RemediationRow:
        row = RemediationRow(**fields)
        self.s.add(row)
        await self.s.flush()
        return row

    async def get_remediation(self, rem_id: int) -> RemediationRow:
        row = await self.s.get(RemediationRow, rem_id)
        if row is None:
            raise NotFoundError("remediation", str(rem_id))
        return row

    async def list_remediations(self, twin_id: int) -> list[RemediationRow]:
        q = select(RemediationRow).where(RemediationRow.twin_id == twin_id).order_by(RemediationRow.id.desc())
        return list((await self.s.scalars(q)).all())

    # ---- events --------------------------------------------------------------------------
    async def add_event(self, twin_id: int | None, code: str, params: dict[str, Any]) -> EventRow:
        row = EventRow(twin_id=twin_id, code=code, params=params, read=False)
        self.s.add(row)
        await self.s.flush()
        return row

    async def list_events(self, limit: int = 50) -> list[EventRow]:
        q = select(EventRow).order_by(EventRow.id.desc()).limit(limit)
        return list((await self.s.scalars(q)).all())

    async def mark_events_read(self) -> int:
        res = await self.s.execute(update(EventRow).where(EventRow.read.is_(False)).values(read=True))
        return int(getattr(res, "rowcount", 0) or 0)

    async def clear_events(self) -> None:
        await self.s.execute(delete(EventRow))

    # ---- AI cache ------------------------------------------------------------------------
    async def cache_get(self, key: str) -> dict[str, Any] | None:
        row = await self.s.get(AICacheRow, key)
        return None if row is None else row.payload

    async def cache_put(self, key: str, payload: dict[str, Any]) -> None:
        row = await self.s.get(AICacheRow, key)
        if row is None:
            self.s.add(AICacheRow(key=key, payload=payload))
        else:
            row.payload = payload
        await self.s.flush()
