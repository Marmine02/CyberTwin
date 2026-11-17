"""Application services: revisions, simulations, remediation, demo reset. Routes stay thin."""

from __future__ import annotations

import uuid
from collections.abc import Callable
from typing import Any

from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import DomainError
from app.core.logging import log
from app.engine.simulate import run_simulation
from app.i18n import render
from app.models.tables import RemediationRecord, SimulationRun, Twin, TwinRevision
from app.remediation.actions import apply_actions
from app.remediation.recommend import compare_results
from app.repositories.repos import (
    EventRepository,
    LayoutRepository,
    RemediationRepository,
    SimulationRepository,
    TwinRepository,
    iso,
)
from app.schemas.i18n import Message, msg
from app.schemas.remediation import ApplyRequest, Comparison
from app.schemas.simulation import ScenarioId, SimulationResult, SimulationRunOut, SimulationSummary
from app.schemas.twin import TwinSnapshot
from app.seed.northwind import DEMO_TWIN_ID, DEMO_TWIN_NAME, northwind_snapshot
from app.services.diff import diff_snapshots


def validation_message(exc: ValidationError) -> str:
    parts = []
    for err in exc.errors():
        loc = ".".join(str(x) for x in err.get("loc", ()) if x != "__root__")
        msg = str(err.get("msg", "invalid value")).removeprefix("Value error, ")
        parts.append(f"{loc}: {msg}" if loc else msg)
    return "; ".join(parts)


class Services:
    def __init__(self, s: AsyncSession) -> None:
        self.s = s
        self.twins = TwinRepository(s)
        self.layout = LayoutRepository(s)
        self.sims = SimulationRepository(s)
        self.remeds = RemediationRepository(s)
        self.events = EventRepository(s)

    # ---- snapshots ------------------------------------------------------------------------
    async def snapshot(self, twin_id: str, revision: int | None = None) -> tuple[Twin, TwinRevision, TwinSnapshot]:
        twin = await self.twins.get(twin_id)
        rev = await self.twins.revision(twin_id, revision if revision is not None else twin.head_revision)
        return twin, rev, TwinSnapshot.model_validate(rev.snapshot)

    async def snapshot_with_layout(self, twin_id: str, revision: int | None = None) -> TwinSnapshot:
        _, _, snap = await self.snapshot(twin_id, revision)
        positions = await self.layout.get(twin_id)
        for a in snap.assets:
            if a.id in positions:
                a.position.x, a.position.y = positions[a.id]
        return snap

    async def mutate(
        self,
        twin_id: str,
        fn: Callable[[dict[str, Any]], Message],
        *,
        expected_revision: int | None = None,
        kind: str = "edit",
    ) -> TwinRevision:
        """Load head, let fn edit a plain dict copy and return a note, validate, store a new revision."""
        twin, head, snap = await self.snapshot(twin_id)
        if expected_revision is not None and expected_revision != head.number:
            raise DomainError(
                "conflict",
                msg("err.stale_revision", twin=twin_id, head=head.number, expected=expected_revision),
                {"head_revision": head.number},
            )
        data = snap.model_dump(mode="json")
        note_msg = fn(data)
        note = render(note_msg, "en")
        try:
            new = TwinSnapshot.model_validate(data)
        except ValidationError as exc:
            raise DomainError("invalid_snapshot", validation_message(exc)) from exc
        rev = await self.twins.add_revision(
            twin,
            new.model_dump(mode="json"),
            parent=head.number,
            note=note,
            kind=kind,
            diff={**diff_snapshots(snap, new), "note_msg": note_msg.model_dump(mode="json")},
        )
        await self.s.commit()
        log.info("revision.created", twin=twin_id, revision=rev.number, note=note)
        return rev

    # ---- simulations ------------------------------------------------------------------------
    async def simulate(
        self,
        twin_id: str,
        scenario: ScenarioId,
        revision: int | None,
        params: dict[str, str],
        *,
        emit: bool = True,
    ) -> SimulationRun:
        twin, rev, snap = await self.snapshot(twin_id, revision)
        result = run_simulation(snap, twin.id, rev.number, scenario, params)
        run = SimulationRun(
            id=str(uuid.uuid4()),
            twin_id=twin.id,
            revision=rev.number,
            scenario=scenario.value,
            params=result.params,
            score=result.score,
            result_json=result.model_dump(mode="json", by_alias=True),
            result_hash=result.result_hash,
        )
        await self.sims.add(run)
        if emit:
            m = msg(
                "event.simulation",
                scenario=msg(f"scenario.{scenario.value}"),
                rev=rev.number,
                score=round(result.score),
            )
            await self.events.add(
                twin.id,
                "simulation_complete",
                render(m, "en"),
                {
                    "message": m.model_dump(mode="json"),
                    "simulation_id": run.id,
                    "score": result.score,
                    "scenario": scenario.value,
                    "paths": len(result.paths),
                },
            )
        await self.s.commit()
        log.info(
            "simulation.done",
            twin=twin.id,
            revision=rev.number,
            scenario=scenario.value,
            score=result.score,
            hash=result.result_hash[:12],
        )
        return run

    @staticmethod
    def run_out(run: SimulationRun) -> SimulationRunOut:
        return SimulationRunOut(
            id=run.id,
            twin_id=run.twin_id,
            revision=run.revision,
            scenario=ScenarioId(run.scenario),
            params=run.params,
            created_at=iso(run.created_at),
            result_hash=run.result_hash,
            score=run.score,
            result=SimulationResult.model_validate(run.result_json),
        )

    @staticmethod
    def run_summary(run: SimulationRun) -> SimulationSummary:
        r = run.result_json
        return SimulationSummary(
            id=run.id,
            twin_id=run.twin_id,
            revision=run.revision,
            scenario=ScenarioId(run.scenario),
            created_at=iso(run.created_at),
            score=run.score,
            p_breach=r["p_breach"],
            path_count=len(r["paths"]),
            blast_radius=r["blast_radius"],
            result_hash=run.result_hash,
        )

    # ---- remediation ----------------------------------------------------------------------
    async def apply_remediation(self, req: ApplyRequest) -> tuple[Comparison, TwinRevision, str]:
        twin, head, snap = await self.snapshot(req.twin_id)
        new_snap, changes = apply_actions(snap, req.actions)
        before_run = await self.simulate(twin.id, ScenarioId(req.scenario), head.number, req.params, emit=False)
        note_msg = msg("rev.remediation", actions=", ".join(a.key() for a in req.actions))
        note = req.note or render(note_msg, "en")
        rev = await self.twins.add_revision(
            twin,
            new_snap.model_dump(mode="json"),
            parent=head.number,
            note=note[:300],
            kind="remediation",
            diff={
                **diff_snapshots(snap, new_snap),
                **({} if req.note else {"note_msg": note_msg.model_dump(mode="json")}),
            },
        )
        await self.s.commit()
        after_run = await self.simulate(twin.id, ScenarioId(req.scenario), rev.number, req.params, emit=False)
        before = SimulationResult.model_validate(before_run.result_json)
        after = SimulationResult.model_validate(after_run.result_json)
        cmp = compare_results(
            snap,
            before,
            new_snap,
            after,
            before_simulation_id=before_run.id,
            after_simulation_id=after_run.id,
            actions=list(req.actions),
            changes=changes,
        )
        rec_id = str(uuid.uuid4())
        await self.remeds.add(
            RemediationRecord(
                id=rec_id,
                twin_id=twin.id,
                from_revision=head.number,
                to_revision=rev.number,
                actions=[a.model_dump(mode="json") for a in req.actions],
                comparison=cmp.model_dump(mode="json"),
            )
        )
        applied_msg = msg(
            "event.remediation",
            count=len(req.actions),
            rev=rev.number,
            before=round(before.score),
            after=round(after.score),
        )
        await self.events.add(
            twin.id,
            "remediation_applied",
            render(applied_msg, "en"),
            {
                "message": applied_msg.model_dump(mode="json"),
                "revision": rev.number,
                "score_before": before.score,
                "score_after": after.score,
                "after_simulation_id": after_run.id,
                "blocked": len(cmp.blocked_paths),
            },
        )
        await self.s.commit()
        return cmp, rev, rec_id

    async def revert(self, revision_id: int) -> TwinRevision:
        rev = await self.s.get(TwinRevision, revision_id)
        if rev is None:
            raise DomainError("revision_not_found", msg("err.revision_id_missing", id=revision_id))
        if rev.parent_number is None:
            raise DomainError("no_parent", msg("err.no_parent", rev=rev.number))
        twin = await self.twins.get(rev.twin_id)
        parent = await self.twins.revision(rev.twin_id, rev.parent_number)
        head = await self.twins.revision(rev.twin_id, twin.head_revision)
        target = TwinSnapshot.model_validate(parent.snapshot)
        revert_note = msg("rev.revert", rev=rev.number, parent=parent.number)
        new = await self.twins.add_revision(
            twin,
            parent.snapshot,
            parent=head.number,
            kind="revert",
            note=render(revert_note, "en"),
            diff={
                **diff_snapshots(TwinSnapshot.model_validate(head.snapshot), target),
                "note_msg": revert_note.model_dump(mode="json"),
            },
        )
        revert_msg = msg("event.revert", reverted=rev.number, rev=new.number)
        await self.events.add(
            twin.id,
            "revision_reverted",
            render(revert_msg, "en"),
            {"revision": new.number, "reverted": rev.number, "message": revert_msg.model_dump(mode="json")},
        )
        await self.s.commit()
        return new

    # ---- demo --------------------------------------------------------------------------------
    async def reset_demo(self) -> Twin:
        if await self.twins.exists(DEMO_TWIN_ID):
            await self.twins.delete(DEMO_TWIN_ID)
            await self.s.flush()
        twin = await self.twins.create(DEMO_TWIN_ID, DEMO_TWIN_NAME)
        snap = northwind_snapshot()
        await self.twins.add_revision(
            twin,
            snap.model_dump(mode="json"),
            parent=None,
            note=render(msg("rev.seed_demo"), "en"),
            kind="seed",
            diff={**diff_snapshots(None, snap), "note_msg": msg("rev.seed_demo").model_dump(mode="json")},
            author="system",
        )
        m = msg("event.demo_reset")
        await self.events.add(twin.id, "demo_reset", render(m, "en"), {"message": m.model_dump(mode="json")})
        await self.s.commit()
        return twin

    async def ensure_demo(self) -> None:
        if not await self.twins.exists(DEMO_TWIN_ID):
            await self.reset_demo()
