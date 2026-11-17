from __future__ import annotations

import pytest

from app.core.errors import DomainError
from app.engine.simulate import run_simulation
from app.i18n import render
from app.remediation.actions import apply_actions
from app.remediation.recommend import build_recommendations, compare_results
from app.schemas.remediation import (
    ApplyPatch,
    EnforceMfa,
    ReducePermission,
    RestrictPort,
    SegmentZones,
    SetPasswordPolicy,
)
from app.schemas.simulation import ScenarioId
from app.schemas.twin import TwinSnapshot, Zone
from app.seed.northwind import northwind_snapshot
from tests.builders import mini

DATA = ScenarioId.sensitive_data_exposure


def _score(s: TwinSnapshot, scenario: ScenarioId = DATA) -> float:
    return run_simulation(s, "t", 1, scenario, with_chokepoints=False).score


def _primary_lik(s: TwinSnapshot) -> float:
    r = run_simulation(s, "t", 1, DATA, with_chokepoints=False)
    return r.primary_path.likelihood if r.primary_path else 0.0


def test_apply_patch_blocks_exploit_path() -> None:
    new, log = apply_actions(mini(), [ApplyPatch(vuln_id="v-ssh")])
    assert new.vuln("v-ssh") is None
    assert "v-ssh" not in new.asset("web").vulnerability_ids  # type: ignore[union-attr]
    assert any("Patched" in render(line, "en") for line in log)
    assert run_simulation(new, "t", 2, DATA).paths == []


def test_restrict_port_blocks_and_removes_rule() -> None:
    new, log = apply_actions(mini(), [RestrictPort(asset_id="web", port=22, allow_from_zones=[Zone.mgmt])])
    assert new.firewall_rules == []
    assert new.asset("web").port(22).exposed_to_zones == [Zone.mgmt]  # type: ignore[union-attr]
    assert any("Removed firewall rule 'r1'" in render(line, "en") for line in log)
    assert run_simulation(new, "t", 2, DATA).paths == []


def test_restrict_port_specific_error() -> None:
    with pytest.raises(DomainError) as ei:
        apply_actions(mini(), [RestrictPort(asset_id="web", port=3389)])
    assert ei.value.message == "Asset 'web' has no port 3389 open; cannot create rule"
    assert ei.value.status == 422


def test_enforce_mfa_reduces_path() -> None:
    before = _primary_lik(mini())
    new, _ = apply_actions(mini(), [EnforceMfa(principal_id="svc")])
    assert new.principal("svc").mfa  # type: ignore[union-attr]
    assert 0 < _primary_lik(new) < before


def test_enforce_mfa_twice_is_rejected() -> None:
    with pytest.raises(DomainError, match="already has MFA"):
        apply_actions(mini(svc_mfa=True), [EnforceMfa(principal_id="svc")])


def test_set_password_policy_reduces_brute_force() -> None:
    snap = northwind_snapshot()
    new, _ = apply_actions(snap, [SetPasswordPolicy(principal_id="svc-web")])
    assert new.vuln("vuln-svcweb-weakpw") is None
    assert _score(new) > _score(snap)
    r = run_simulation(new, "t", 2, DATA, with_chokepoints=False)
    kerb = [s for p in r.paths for s in p.steps if s.technique == "kerberoast" and s.to == "CRED:svc-web"]
    assert kerb and all(s.p == pytest.approx(0.9 * 0.2) for s in kerb)


def test_reduce_permission_removes_admin_path() -> None:
    snap = northwind_snapshot()
    new, _ = apply_actions(snap, [ReducePermission(principal_id="svc-web", asset_id="customer-db", level="none")])
    assert all(p.asset_id != "customer-db" for p in new.principal("svc-web").permissions)  # type: ignore[union-attr]
    assert _score(new) > _score(snap)


def test_reduce_permission_must_reduce() -> None:
    with pytest.raises(DomainError, match="not a reduction"):
        once, _ = apply_actions(mini(), [ReducePermission(principal_id="svc", asset_id="db", level="write")])
        apply_actions(once, [ReducePermission(principal_id="svc", asset_id="db", level="write")])
    with pytest.raises(DomainError, match="no permission"):
        apply_actions(mini(), [ReducePermission(principal_id="svc", asset_id="web", level="read")])


def test_segment_zones_reduces_cross_zone_path() -> None:
    snap = northwind_snapshot()
    new, _ = apply_actions(snap, [SegmentZones(zone_a=Zone.dmz, zone_b=Zone.internal)])
    assert _score(new) > _score(snap)
    with pytest.raises(DomainError, match="already segmented"):
        apply_actions(new, [SegmentZones(zone_a=Zone.internal, zone_b=Zone.dmz)])


def test_unknown_targets_have_specific_errors() -> None:
    with pytest.raises(DomainError, match="Vulnerability 'nope' does not exist"):
        apply_actions(mini(), [ApplyPatch(vuln_id="nope")])
    with pytest.raises(DomainError, match="Principal 'nope' does not exist"):
        apply_actions(mini(), [EnforceMfa(principal_id="nope")])
    with pytest.raises(DomainError, match="cannot be fixed by a patch"):
        apply_actions(northwind_snapshot(), [ApplyPatch(vuln_id="vuln-ssh-exposed")])
    with pytest.raises(DomainError, match="given twice"):
        apply_actions(mini(), [ApplyPatch(vuln_id="v-ssh"), ApplyPatch(vuln_id="v-ssh")])


def test_apply_does_not_mutate_input() -> None:
    snap = mini()
    before = snap.model_dump_json()
    apply_actions(snap, [ApplyPatch(vuln_id="v-ssh")])
    assert snap.model_dump_json() == before


def test_patch_updates_software_version() -> None:
    new, _ = apply_actions(northwind_snapshot(), [ApplyPatch(vuln_id="vuln-ssh-rce")])
    ssh = next(s for s in new.asset("web-01").software if s.name == "OpenSSH")  # type: ignore[union-attr]
    assert ssh.version == "9.8p1" and ssh.eol is False


def test_recommendations_sorted_by_delta_and_deterministic() -> None:
    a = build_recommendations(northwind_snapshot(), "northwind", 1, DATA, {})
    b = build_recommendations(northwind_snapshot(), "northwind", 1, DATA, {})
    assert a.model_dump_json() == b.model_dump_json()
    deltas = [r.expected_delta_score for r in a.recommendations]
    assert deltas == sorted(deltas, reverse=True)
    top3 = [r.id for r in a.recommendations[:3]]
    assert top3 == ["restrict_port:web-01:22:mgmt", "apply_patch:vuln-ssh-rce", "enforce_mfa:svc-web"]


def test_demo_flow_top3_blocks_primary_and_reaches_80() -> None:
    snap = northwind_snapshot()
    recs = build_recommendations(snap, "northwind", 1, DATA, {})
    actions = [r.action for r in recs.recommendations[:3]]
    before = run_simulation(snap, "northwind", 1, DATA)
    new, changes = apply_actions(snap, actions)
    after = run_simulation(new, "northwind", 2, DATA)
    cmp = compare_results(
        snap,
        before,
        new,
        after,
        before_simulation_id="a",
        after_simulation_id="b",
        actions=actions,
        changes=changes,
    )
    assert after.score >= 80
    assert cmp.score_delta == pytest.approx(after.score - before.score, abs=0.01)
    blocked_goals = {b.goal for b in cmp.blocked_paths}
    assert "DATA:customer-db" in blocked_goals
    assert before.primary_path is not None
    from app.engine.simulate import path_signature

    assert path_signature(before.primary_path) in [b.signature for b in cmp.blocked_paths]
    assert cmp.new_paths == []
    web = next(d for d in cmp.per_asset_delta if d.asset_id == "web-01")
    assert web.delta < 0


def test_compare_reports_reduced_paths() -> None:
    snap = northwind_snapshot()
    new, changes = apply_actions(snap, [EnforceMfa(principal_id="svc-web")])
    before = run_simulation(snap, "n", 1, DATA, with_chokepoints=False)
    after = run_simulation(new, "n", 2, DATA, with_chokepoints=False)
    cmp = compare_results(
        snap,
        before,
        new,
        after,
        before_simulation_id="a",
        after_simulation_id="b",
        actions=[EnforceMfa(principal_id="svc-web")],
        changes=changes,
    )
    assert cmp.reduced_paths
    assert all(r.likelihood_after is not None and r.likelihood_after < r.likelihood_before for r in cmp.reduced_paths)


def test_residual_exposure_after_top3_fixes() -> None:
    snap = northwind_snapshot()
    before = run_simulation(snap, "northwind", 1, DATA)
    assert all(r.vuln_id != "vuln-ssh-rce" for r in before.residual_findings)
    recs = build_recommendations(snap, "northwind", 1, DATA, {})
    new, _ = apply_actions(snap, [r.action for r in recs.recommendations[:3]])
    after = run_simulation(new, "northwind", 2, DATA)
    assert after.score == 100.0  # score formula unchanged
    residual = {r.vuln_id: r for r in after.residual_findings}
    # svc-web still has admin on customer-db, still has a weak password; ws/adm-app issues remain too
    assert set(residual) == {"vuln-svcweb-dbadmin", "vuln-svcweb-weakpw", "vuln-ws-privesc", "vuln-admapp-cached"}
    assert residual["vuln-svcweb-dbadmin"].reason == "unreachable"
    assert {f.vuln_id for f in after.critical_findings}.isdisjoint(residual)
