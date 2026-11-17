"""Scenarios, simulation runs, recommendations, remediation apply/revert and revision comparison."""

from __future__ import annotations

import asyncio
from typing import Any, Literal

from fastapi import APIRouter, Query
from pydantic import BaseModel, ConfigDict, Field

from cybertwin.api.deps import Repo
from cybertwin.api.serializers import remediation_json, revision_json, run_json, run_summary
from cybertwin.engine.graph import build_attack_graph
from cybertwin.engine.scenarios import FOOTHOLD_SCENARIOS, SCENARIOS
from cybertwin.errors import AppError
from cybertwin.remediation.actions import ACTION_TYPES
from cybertwin.remediation.compare import compare_results
from cybertwin.services import core

router = APIRouter(tags=["simulation"])

ScenarioId = Literal[
    "sensitive_data_exposure",
    "credential_compromise",
    "lateral_movement",
    "privilege_escalation",
    "outdated_service_exploitation",
]


class ScenarioParams(BaseModel):
    model_config = ConfigDict(extra="forbid")
    foothold: str | None = Field(default=None, pattern=r"^[a-z0-9][a-z0-9._-]{0,63}$")

    def as_dict(self) -> dict[str, Any]:
        return {k: v for k, v in self.model_dump().items() if v is not None}


class RunBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    scenario: ScenarioId
    revision: int | None = Field(default=None, ge=1)
    params: ScenarioParams = ScenarioParams()


class ApplyBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    actions: list[dict[str, Any]] = Field(min_length=1, max_length=20)
    scenario: ScenarioId
    params: ScenarioParams = ScenarioParams()


class CompareBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    scenario: ScenarioId
    params: ScenarioParams = ScenarioParams()
    revision_a: int = Field(ge=1)
    revision_b: int = Field(ge=1)


@router.get("/scenarios")
async def scenarios() -> list[dict[str, Any]]:
    return [{"id": s, "params": ["foothold"] if s in FOOTHOLD_SCENARIOS else []} for s in SCENARIOS]


@router.get("/remediations/actions")
async def action_types() -> list[str]:
    return list(ACTION_TYPES)


@router.post("/twins/{twin_id}/simulations", status_code=201)
async def run(twin_id: int, body: RunBody, repo: Repo) -> dict[str, Any]:
    await repo.get_twin(twin_id)
    row = await core.run_simulation(repo, twin_id, body.revision, body.scenario, body.params.as_dict())
    return run_json(row)


@router.get("/twins/{twin_id}/simulations")
async def list_runs(
    twin_id: int, repo: Repo, limit: int = Query(default=50, ge=1, le=500)
) -> list[dict[str, Any]]:
    await repo.get_twin(twin_id)
    return [run_summary(r) for r in await repo.list_runs(twin_id, limit)]


@router.get("/twins/{twin_id}/simulations/latest")
async def latest_run(
    twin_id: int,
    repo: Repo,
    scenario: ScenarioId | None = None,
    revision: int | None = Query(default=None, ge=1),
) -> dict[str, Any] | None:
    await repo.get_twin(twin_id)
    row = await repo.latest_run(twin_id, scenario=scenario, revision=revision)
    return None if row is None else run_json(row)


@router.get("/simulations/{run_id}")
async def get_run(run_id: int, repo: Repo) -> dict[str, Any]:
    return run_json(await repo.get_run(run_id))


@router.get("/twins/{twin_id}/recommendations")
async def recommendations(
    twin_id: int,
    repo: Repo,
    scenario: ScenarioId = "sensitive_data_exposure",
    revision: int | None = Query(default=None, ge=1),
    foothold: str | None = None,
) -> dict[str, Any]:
    """Recommendations for a revision (head by default), computed by the engine (deterministic)."""
    rev = await repo.get_revision(twin_id, revision)
    params = {"foothold": foothold} if foothold else {}
    result = await core.compute(rev.content, scenario, params)
    return {
        "revision": rev.row.number,
        "scenario": scenario,
        "params": result["params"],
        "score": result["score"],
        "recommendations": result["recommendations"],
        "chokepoints": result["chokepoints"],
        "residual_exposure": result["residual_exposure"],
        "findings": result["findings"],
        "result_hash": result["result_hash"],
    }


@router.post("/twins/{twin_id}/remediations/apply", status_code=201)
async def apply(twin_id: int, body: ApplyBody, repo: Repo) -> dict[str, Any]:
    await repo.get_twin(twin_id)
    row = await core.apply_remediation(repo, twin_id, body.actions, body.scenario, body.params.as_dict())
    return remediation_json(row)


@router.get("/twins/{twin_id}/remediations")
async def list_remediations(twin_id: int, repo: Repo) -> list[dict[str, Any]]:
    await repo.get_twin(twin_id)
    return [remediation_json(r) for r in await repo.list_remediations(twin_id)]


@router.get("/remediations/{rem_id}")
async def get_remediation(rem_id: int, repo: Repo) -> dict[str, Any]:
    return remediation_json(await repo.get_remediation(rem_id))


@router.post("/remediations/{rem_id}/revert", status_code=201)
async def revert(rem_id: int, repo: Repo) -> dict[str, Any]:
    rem, rev, run_row = await core.revert_remediation(repo, rem_id)
    return {"remediation": remediation_json(rem), "revision": revision_json(rev), "run": run_summary(run_row)}


@router.post("/twins/{twin_id}/compare")
async def compare(twin_id: int, body: CompareBody, repo: Repo) -> dict[str, Any]:
    if body.revision_a == body.revision_b:
        raise AppError(
            "compare.same_revision", 422, "Pick two different revisions to compare.", revision=body.revision_a
        )
    a = await repo.get_revision(twin_id, body.revision_a)
    b = await repo.get_revision(twin_id, body.revision_b)
    params = body.params.as_dict()
    ra = await core.compute(a.content, body.scenario, params)
    rb = await core.compute(b.content, body.scenario, params)
    graph = await asyncio.to_thread(build_attack_graph, b.content.normalized())
    return {
        "revision_a": a.row.number,
        "revision_b": b.row.number,
        "scenario": body.scenario,
        "comparison": compare_results(ra, rb, graph),
        "paths_a": ra["paths"],
        "paths_b": rb["paths"],
    }
