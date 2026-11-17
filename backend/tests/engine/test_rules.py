from __future__ import annotations

import pytest

from app.engine.graph import build_graph
from app.engine.reach import Reachability
from app.engine.simulate import analyze, run_simulation
from app.schemas.simulation import ScenarioId
from app.schemas.twin import Zone, ZonePair
from tests.builders import mini

DATA = ScenarioId.sensitive_data_exposure


def _allow(order: int, port: int | None = 22, rid: str = "ra") -> dict[str, object]:
    return {
        "id": rid,
        "firewall_id": "fw",
        "order": order,
        "src_cidr": "0.0.0.0/0",
        "dst_asset": "web",
        "port": port,
        "action": "allow",
    }


def _deny(order: int, port: int | None = 22, rid: str = "rd") -> dict[str, object]:
    return {
        "id": rid,
        "firewall_id": "fw",
        "order": order,
        "src_zone": "internet",
        "dst_zone": "dmz",
        "port": port,
        "action": "deny",
    }


def test_baseline_mini_path_exists() -> None:
    r = run_simulation(mini(), "t", 1, DATA)
    assert r.primary_path is not None
    assert [s.technique for s in r.primary_path.steps] == [
        "reach",
        "remote_exploit",
        "credential_theft",
        "data_access",
    ]


def test_firewall_deny_before_allow_blocks() -> None:
    snap = mini(rules=[_deny(5), _allow(10)])
    assert Reachability(snap).reachable_ports("gw", "web") == []
    assert run_simulation(snap, "t", 1, DATA).paths == []


def test_firewall_allow_before_deny_permits() -> None:
    snap = mini(rules=[_allow(5), _deny(10)])
    assert [p.port for p in Reachability(snap).reachable_ports("gw", "web")] == [22]
    assert run_simulation(snap, "t", 1, DATA).paths


def test_rule_order_not_list_order() -> None:
    # list order says allow first, but `order` says deny first -> blocked
    snap = mini(rules=[_allow(20), _deny(10)])
    assert Reachability(snap).reachable_ports("gw", "web") == []


def test_no_matching_rule_is_default_deny() -> None:
    snap = mini(rules=[_allow(10, port=443)])
    ports = [p.port for p in Reachability(snap).reachable_ports("gw", "web")]
    assert ports == [443]
    assert run_simulation(snap, "t", 1, DATA).paths == []


def test_any_port_rule() -> None:
    snap = mini(rules=[_allow(10, port=None)])
    assert [p.port for p in Reachability(snap).reachable_ports("gw", "web")] == [22, 443]


def test_exposed_to_zones_is_enforced() -> None:
    snap = mini()
    snap.assets[2].open_ports[0].exposed_to_zones = ["mgmt"]  # type: ignore[list-item]
    assert Reachability(snap).reachable_ports("gw", "web") == []


def test_link_port_restriction() -> None:
    snap = mini(rules=[_allow(10, port=None)])
    snap.connections[1].ports = [443]
    assert [p.port for p in Reachability(snap).reachable_ports("gw", "web")] == [443]


def test_mfa_lowers_likelihood() -> None:
    base = run_simulation(mini(), "t", 1, DATA)
    mfa = run_simulation(mini(svc_mfa=True), "t", 1, DATA)
    assert base.primary_path and mfa.primary_path
    assert mfa.primary_path.likelihood < base.primary_path.likelihood
    assert mfa.primary_path.likelihood == pytest.approx(base.primary_path.likelihood * 0.15, rel=1e-3)
    assert mfa.score > base.score


def test_edr_lowers_likelihood() -> None:
    base = run_simulation(mini(), "t", 1, DATA)
    edr = run_simulation(mini(web_edr=True), "t", 1, DATA)
    assert edr.primary_path and base.primary_path
    # exploit * 0.6 and credential theft * 0.6
    assert edr.primary_path.likelihood == pytest.approx(base.primary_path.likelihood * 0.36, rel=1e-3)


def test_password_strength_modifier_on_brute_force() -> None:
    weak = build_graph(mini(svc_strength="weak", extra={"principals": []}), frozenset({"brute_force"}))
    # svc has no permission on web -> no brute-force edge at all
    assert not any(d["technique"] == "brute_force" for *_, d in weak.g.edges(data=True))
    extra = {
        "principals": [
            {
                "id": "ops",
                "name": "ops",
                "credential_strength": "medium",
                "permissions": [{"asset_id": "web", "level": "write"}],
            }
        ]
    }
    g = build_graph(mini(extra=extra), frozenset({"brute_force"})).g
    assert g.edges["web#network:22", "CRED:ops"]["p"] == pytest.approx(0.8 * 0.5)


def test_segmentation_blocks_zone_rule_and_halves_asset_rule() -> None:
    zone_rule = {
        "id": "rz",
        "firewall_id": "fw",
        "order": 10,
        "src_zone": "internet",
        "dst_zone": "dmz",
        "port": 22,
        "action": "allow",
    }
    snap = mini(rules=[zone_rule])
    assert Reachability(snap).reachable_ports("gw", "web")
    snap.segmented_zones = [ZonePair(a=Zone.internet, b=Zone.dmz)]
    assert Reachability(snap).reachable_ports("gw", "web") == []
    snap2 = mini()
    snap2.segmented_zones = [ZonePair(a=Zone.dmz, b=Zone.internet)]
    g = build_graph(snap2, frozenset()).g
    assert g.edges["ATTACKER@internet", "web#network:22"]["p"] == pytest.approx(0.5)


def test_probability_clamped() -> None:
    g = build_graph(mini(), frozenset({"remote_exploit"})).g
    for *_, d in g.edges(data=True):
        assert 0.01 <= d["p"] <= 0.99


def test_score_formula_matches_definition() -> None:
    an = analyze(mini(), DATA, {})
    best = an.goal_best["DATA:db"]
    assert best is not None
    assert an.p_breach == pytest.approx(best[2], abs=1e-6)
    assert an.score == pytest.approx(100 * (1 - an.p_breach), abs=0.01)
