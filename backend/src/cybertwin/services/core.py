"""Use-case services: demo reset, edits as revisions, simulation runs, remediation apply/revert."""

from __future__ import annotations

import asyncio
from typing import Any

from cybertwin.db.repository import Repository
from cybertwin.db.tables import RemediationRow, RevisionRow, SimulationRunRow, TwinRow
from cybertwin.domain.model import TwinContent
from cybertwin.engine.graph import build_attack_graph
from cybertwin.engine.scenarios import ScenarioError, build_scenario
from cybertwin.engine.simulate import simulate
from cybertwin.errors import AppError
from cybertwin.remediation.actions import ActionError, action_key, apply_actions, parse_action
from cybertwin.remediation.compare import compare_results
from cybertwin.seed import northwind


def _scenario_error(exc: ScenarioError) -> AppError:
    return AppError(exc.code, 422, f"Invalid scenario request: {exc.code}", **exc.params)


def _action_error(exc: ActionError) -> AppError:
    return AppError(exc.code, 422, f"Remediation cannot be applied: {exc.code}", **exc.params)


# ---- demo -----------------------------------------------------------------------------------
async def reset_demo(repo: Repository) -> TwinRow:
    """Delete the Northwind twin (and its runs/remediations/events) and seed it again."""
    existing = await repo.get_twin_by_slug(northwind.SLUG)
    if existing is not None:
        await repo.delete_twin(existing.id)
    await repo.clear_events()
    twin, _ = await repo.create_twin(
        slug=northwind.SLUG,
        name=northwind.NAME,
        description=northwind.DESCRIPTION,
        content=northwind.northwind_content(),
        note_i18n={"code": "revision.seed", "params": {}},
    )
    await repo.set_positions(twin.id, northwind.POSITIONS)
    await repo.add_event(twin.id, "event.demo_reset", {"twin": twin.name})
    return twin


async def ensure_demo(repo: Repository) -> None:
    if not await repo.list_twins():
        await reset_demo(repo)


# ---- edits ----------------------------------------------------------------------------------
async def commit_content(
    repo: Repository, twin_id: int, content: TwinContent, *, kind: str, note_i18n: dict[str, Any]
) -> RevisionRow:
    head = await repo.get_revision(twin_id)
    if head.content.content_hash() == content.normalized().content_hash():
        raise AppError("revision.no_change", 409, "The change does not modify the model.")
    row = await repo.add_revision(twin_id, content, kind=kind, note_i18n=note_i18n)
    await repo.add_event(
        twin_id, f"event.revision_{kind}", {"revision": row.number, **note_i18n.get("params", {})}
    )
    return row


async def restore_revision(repo: Repository, twin_id: int, number: int) -> RevisionRow:
    target = await repo.get_revision(twin_id, number)
    return await commit_content(
        repo,
        twin_id,
        target.content,
        kind="revert",
        note_i18n={"code": "revision.restore", "params": {"from": number}},
    )


# ---- simulation -----------------------------------------------------------------------------
async def compute(content: TwinContent, scenario: str, params: dict[str, Any]) -> dict[str, Any]:
    try:
        return await asyncio.to_thread(simulate, content, scenario, params)
    except ScenarioError as exc:
        raise _scenario_error(exc) from exc


async def run_simulation(
    repo: Repository, twin_id: int, revision: int | None, scenario: str, params: dict[str, Any]
) -> SimulationRunRow:
    rev = await repo.get_revision(twin_id, revision)
    result = await compute(rev.content, scenario, params)
    row = await repo.add_run(twin_id, rev.row.number, scenario, result["params"], result)
    await repo.add_event(
        twin_id,
        "event.run_completed",
        {
            "run_id": row.id,
            "scenario": scenario,
            "revision": rev.row.number,
            "score": result["score"],
            "paths": len(result["paths"]),
        },
    )
    return row


# ---- remediation ----------------------------------------------------------------------------
async def apply_remediation(
    repo: Repository, twin_id: int, actions: list[dict[str, Any]], scenario: str, params: dict[str, Any]
) -> RemediationRow:
    if not actions:
        raise AppError("remediation.empty", 422, "Select at least one remediation.")
    head = await repo.get_revision(twin_id)
    try:
        parsed = [parse_action(a) for a in actions]
        after_content = apply_actions(head.content, parsed)
        build_scenario(head.content, scenario, params)
    except ActionError as exc:
        raise _action_error(exc) from exc
    except ScenarioError as exc:
        raise _scenario_error(exc) from exc

    before = await compute(head.content, scenario, params)
    before_run = await repo.add_run(twin_id, head.row.number, scenario, before["params"], before)
    keys = [action_key(a) for a in parsed]
    new_rev = await repo.add_revision(
        twin_id,
        after_content,
        kind="remediation",
        note_i18n={"code": "revision.remediation", "params": {"actions": keys, "count": len(keys)}},
    )
    after = await compute(after_content, scenario, params)
    after_run = await repo.add_run(twin_id, new_rev.number, scenario, after["params"], after)
    graph = await asyncio.to_thread(build_attack_graph, after_content.normalized())
    comparison = compare_results(before, after, graph)
    comparison["before"]["run_id"] = before_run.id
    comparison["after"]["run_id"] = after_run.id
    row = await repo.add_remediation(
        twin_id=twin_id,
        from_revision=head.row.number,
        to_revision=new_rev.number,
        scenario=scenario,
        params=before["params"],
        actions=[a.model_dump(mode="json") for a in parsed],
        comparison=comparison,
    )
    await repo.add_event(
        twin_id,
        "event.remediation_applied",
        {
            "remediation_id": row.id,
            "revision": new_rev.number,
            "count": len(keys),
            "score_before": before["score"],
            "score_after": after["score"],
        },
    )
    return row


async def revert_remediation(
    repo: Repository, rem_id: int
) -> tuple[RemediationRow, RevisionRow, SimulationRunRow]:
    rem = await repo.get_remediation(rem_id)
    if rem.reverted_by_revision is not None:
        raise AppError(
            "remediation.already_reverted",
            409,
            "This remediation was already reverted.",
            revision=rem.reverted_by_revision,
        )
    head_number = await repo.head_number(rem.twin_id)
    if head_number != rem.to_revision:
        raise AppError(
            "remediation.revert_not_head",
            409,
            "Newer revisions exist; restore an earlier revision instead.",
            head=head_number,
            remediation_revision=rem.to_revision,
        )
    original = await repo.get_revision(rem.twin_id, rem.from_revision)
    rev = await repo.add_revision(
        rem.twin_id,
        original.content,
        kind="revert",
        note_i18n={
            "code": "revision.revert",
            "params": {"remediation_id": rem.id, "from": rem.from_revision},
        },
    )
    rem.reverted_by_revision = rev.number
    result = await compute(original.content, rem.scenario, rem.params)
    run = await repo.add_run(rem.twin_id, rev.number, rem.scenario, result["params"], result)
    await repo.add_event(
        rem.twin_id,
        "event.remediation_reverted",
        {
            "remediation_id": rem.id,
            "revision": rev.number,
            "score": result["score"],
        },
    )
    return rem, rev, run
