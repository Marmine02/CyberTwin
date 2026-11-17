from __future__ import annotations

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from cybertwin.db.repository import Repository
from cybertwin.domain.model import TwinContent
from cybertwin.engine.graph import build_attack_graph
from cybertwin.engine.simulate import simulate
from cybertwin.errors import AppError
from cybertwin.remediation.actions import apply_actions, parse_action
from cybertwin.remediation.compare import compare_results
from cybertwin.services import core
from cybertwin.services.edits import asset_dependents, create_item, delete_item, update_item

SM = async_sessionmaker[AsyncSession]
SDE = "sensitive_data_exposure"


def test_compare_blocked_reduced_new(northwind: TwinContent) -> None:
    before = simulate(northwind, SDE)
    # Patching OpenSSH blocks every path that uses the exploit edge; others remain.
    fixed = apply_actions(
        northwind, [parse_action({"action": "apply_patch", "vulnerability_id": "v-openssh-web01"})]
    )
    after = simulate(fixed, SDE)
    cmp = compare_results(before, after, build_attack_graph(fixed))
    blocked_ids = {p["id"] for p in cmp["blocked_paths"]}
    exploit_paths = {
        p["id"] for p in before["paths"] if any(s.get("vuln_id") == "v-openssh-web01" for s in p["steps"])
    }
    assert blocked_ids == exploit_paths
    assert cmp["score_delta"] == pytest.approx(after["score"] - before["score"])
    assert cmp["score_delta"] > 0
    assert all(d["after"] != d["before"] for d in cmp["per_asset_delta"])

    mfa = apply_actions(northwind, [parse_action({"action": "enforce_mfa", "principal_id": "svc-web"})])
    cmp2 = compare_results(before, simulate(mfa, SDE), build_attack_graph(mfa))
    assert cmp2["reduced_paths"], "MFA lowers p on credential-use edges without removing them"
    for p in cmp2["reduced_paths"]:
        assert p["likelihood_after"] < p["likelihood"]

    same = compare_results(before, before, build_attack_graph(northwind))
    assert same["blocked_paths"] == []
    assert same["reduced_paths"] == []
    assert same["new_paths"] == []
    assert same["score_delta"] == 0


async def test_apply_and_revert_round_trip(sessionmaker: SM) -> None:
    async with sessionmaker() as s, s.begin():
        repo = Repository(s)
        twin = await core.reset_demo(repo)
        run = await core.run_simulation(repo, twin.id, None, SDE, {})
        recs = run.result["recommendations"][:3]
        rem = await core.apply_remediation(repo, twin.id, [r["action"] for r in recs], SDE, {})
        twin_id, rem_id, base_score = twin.id, rem.id, run.result["score"]
        assert rem.from_revision == 1
        assert rem.to_revision == 2
        assert rem.comparison["after"]["score"] == 100.0
        assert rem.comparison["before"]["score"] == base_score
        assert len(rem.comparison["blocked_paths"]) == len(run.result["paths"])
        assert "excessive_privilege:svc-web:customer-db" in rem.comparison["residual_exposure"]
    async with sessionmaker() as s, s.begin():
        repo = Repository(s)
        rem, rev, after_revert = await core.revert_remediation(repo, rem_id)
        assert rev.number == 3
        assert rev.kind == "revert"
        assert after_revert.result["score"] == base_score
        r1 = await repo.get_revision(twin_id, 1)
        assert rev.content_hash == r1.row.content_hash
        assert after_revert.result_hash == run.result_hash
        with pytest.raises(AppError) as exc:
            await core.revert_remediation(repo, rem_id)
        assert exc.value.code == "remediation.already_reverted"
        codes = [e.code for e in await repo.list_events()]
        assert codes[:3] == ["event.remediation_reverted", "event.remediation_applied", "event.run_completed"]


async def test_remediation_errors(sessionmaker: SM) -> None:
    async with sessionmaker() as s, s.begin():
        repo = Repository(s)
        twin = await core.reset_demo(repo)
        with pytest.raises(AppError) as exc:
            await core.apply_remediation(repo, twin.id, [], SDE, {})
        assert exc.value.code == "remediation.empty"
        with pytest.raises(AppError) as exc:
            await core.apply_remediation(
                repo, twin.id, [{"action": "enforce_mfa", "principal_id": "ghost"}], SDE, {}
            )
        assert exc.value.code == "remediation.unknown_principal"
        with pytest.raises(AppError) as exc:
            await core.apply_remediation(
                repo, twin.id, [{"action": "enforce_mfa", "principal_id": "svc-web"}], "nope", {}
            )
        assert exc.value.code == "scenario.unknown"
        assert await repo.head_number(twin.id) == 1, "failed applies must not create revisions"
        rem = await core.apply_remediation(
            repo, twin.id, [{"action": "enforce_mfa", "principal_id": "svc-web"}], SDE, {}
        )
        await core.restore_revision(repo, twin.id, 1)
        with pytest.raises(AppError) as exc:
            await core.revert_remediation(repo, rem.id)
        assert exc.value.code == "remediation.revert_not_head"
        with pytest.raises(AppError) as exc:
            await core.restore_revision(repo, twin.id, 3)
        assert exc.value.code == "revision.no_change"


def test_edits_cascade_and_validate(northwind: TwinContent) -> None:
    deps = asset_dependents(northwind, "web-01")
    assert "n-fw-edge--web-01" in deps["connections"]
    assert "edge-20" in deps["firewall_rules"]
    assert deps["vulnerabilities"] == ["v-nginx-web01", "v-openssh-web01"]
    assert "svc-web" in deps["principals"]
    after, affected = delete_item(northwind, "assets", "web-01")
    assert affected == deps
    assert after.asset("web-01") is None
    assert all("web-01" not in (c.source, c.target) for c in after.connections)

    with pytest.raises(AppError) as exc:
        create_item(northwind, "assets", {**northwind.assets[0].model_dump(mode="json")})
    assert exc.value.code == "conflict.duplicate_id"
    with pytest.raises(AppError) as exc:
        create_item(
            northwind, "connections", {"id": "x", "source": "web-01", "target": "ghost", "kind": "network"}
        )
    assert exc.value.code == "validation.integrity"
    assert "unknown_asset:connection:x:ghost" in str(exc.value.params["errors"])
    with pytest.raises(AppError) as exc:
        update_item(northwind, "assets", "web-01", {"id": "web-02"})
    assert exc.value.code == "validation.id_immutable"
    with pytest.raises(AppError) as exc:
        delete_item(northwind, "assets", "ghost")
    assert exc.value.status == 404

    after, affected = delete_item(northwind, "principals", "svc-web")
    assert affected == {"assets": ["customer-db", "web-01"]}
