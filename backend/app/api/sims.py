from __future__ import annotations

from fastapi import APIRouter, Query

from app.api.deps import ServicesDep, revision_out
from app.engine.scenarios import SCENARIOS
from app.remediation.recommend import build_recommendations
from app.repositories.repos import iso
from app.schemas.api import ApplyOut, RemediationRecordOut, RevisionOut, ScenarioOut
from app.schemas.remediation import ApplyRequest, RecommendationList
from app.schemas.simulation import ScenarioId, SimulationRequest, SimulationRunOut, SimulationSummary

router = APIRouter(tags=["simulation"])


@router.get("/scenarios", response_model=list[ScenarioOut])
async def list_scenarios() -> list[ScenarioOut]:
    return [
        ScenarioOut(
            id=s.id.value,
            label=s.label,
            entry=s.entry,  # type: ignore[arg-type,unused-ignore]
            techniques=sorted(s.techniques),
            description=s.description,
        )
        for s in SCENARIOS.values()
    ]


@router.post("/simulations", response_model=SimulationRunOut, status_code=201)
async def create_simulation(body: SimulationRequest, svc: ServicesDep) -> SimulationRunOut:
    run = await svc.simulate(body.twin_id, body.scenario, body.revision, body.params)
    return svc.run_out(run)


@router.get("/simulations/{simulation_id}", response_model=SimulationRunOut)
async def get_simulation(simulation_id: str, svc: ServicesDep) -> SimulationRunOut:
    return svc.run_out(await svc.sims.get(simulation_id))


@router.get("/simulations", response_model=list[SimulationSummary])
async def list_simulations(
    svc: ServicesDep,
    twin: str = Query(description="Twin id"),
    scenario: ScenarioId | None = None,
    limit: int = Query(default=100, ge=1, le=500),
) -> list[SimulationSummary]:
    await svc.twins.get(twin)
    runs = await svc.sims.list(twin, limit=limit, scenario=scenario.value if scenario else None)
    return [svc.run_summary(r) for r in runs]


@router.get("/recommendations", response_model=RecommendationList)
async def recommendations(
    svc: ServicesDep,
    twin: str,
    scenario: ScenarioId = ScenarioId.sensitive_data_exposure,
    revision: int | None = None,
    foothold: str | None = None,
) -> RecommendationList:
    t, rev, snap = await svc.snapshot(twin, revision)
    params = {"foothold": foothold} if foothold else {}
    return build_recommendations(snap, t.id, rev.number, scenario, params)


@router.post("/remediations/apply", response_model=ApplyOut, status_code=201)
async def apply_remediation(body: ApplyRequest, svc: ServicesDep) -> ApplyOut:
    cmp, rev, rec_id = await svc.apply_remediation(body)
    return ApplyOut(remediation_id=rec_id, revision=revision_out(rev), comparison=cmp.model_dump(mode="json"))


@router.get("/remediations", response_model=list[RemediationRecordOut])
async def list_remediations(svc: ServicesDep, twin: str) -> list[RemediationRecordOut]:
    await svc.twins.get(twin)
    return [
        RemediationRecordOut(
            id=r.id,
            twin_id=r.twin_id,
            from_revision=r.from_revision,
            to_revision=r.to_revision,
            actions=r.actions,
            comparison=r.comparison,
            created_at=iso(r.created_at),
        )
        for r in await svc.remeds.list(twin)
    ]


@router.post("/revisions/{revision_id}/revert", response_model=RevisionOut, status_code=201)
async def revert(revision_id: int, svc: ServicesDep) -> RevisionOut:
    return revision_out(await svc.revert(revision_id))
