from __future__ import annotations

import math
from typing import Any

import pytest

from cybertwin.domain.canonical import canonical_json
from cybertwin.domain.model import Asset, Connection, FirewallRule, Policy, Proto, TwinContent, Zone
from cybertwin.engine import constants as K
from cybertwin.engine.graph import build_attack_graph, clamp
from cybertwin.engine.network import Network
from cybertwin.engine.scenarios import SCENARIOS, ScenarioError, build_scenario
from cybertwin.engine.simulate import quick_score, simulate
from cybertwin.remediation.actions import apply_actions, parse_action

SDE = "sensitive_data_exposure"
PRIMARY_PATH = ["inet", "fw-edge", "web-01", "fw-int", "idp-01", "customer-db"]


def _is_subsequence(needle: list[str], hay: list[str]) -> bool:
    it = iter(hay)
    return all(x in it for x in needle)


# ---- network --------------------------------------------------------------------------------
def test_firewall_first_match_and_default_deny(northwind: TwinContent) -> None:
    n = Network(northwind)
    ssh = n.reach("inet", "web-01", 22)
    assert ssh.allowed
    assert ssh.via == ("fw-edge",)
    assert ssh.rule_ids == ("edge-20",)
    rdp = n.reach("inet", "idp-01", 3389)
    assert not rdp.allowed  # fw-edge has no matching rule -> default deny
    dmz_other = n.reach("web-01", "ws-01", 445)
    assert not dmz_other.allowed
    assert dmz_other.rule_ids == ("int-90",)  # explicit deny matched before anything else


def test_hosts_never_route(northwind: TwinContent) -> None:
    n = Network(northwind)
    route = n.route("inet", "idp-01")
    assert route is not None
    assert "web-01" not in route


def test_rule_order_matters(northwind: TwinContent) -> None:
    rules = [
        *list(northwind.firewall_rules),
        FirewallRule(
            id="edge-05", firewall_id="fw-edge", order=5, action="deny", src="any", dst="asset:web-01"
        ),
    ]
    c = TwinContent.model_validate(
        {**northwind.model_dump(mode="json"), "firewall_rules": [r.model_dump(mode="json") for r in rules]}
    )
    assert not Network(c).reach("inet", "web-01", 443).allowed


def test_direct_link_without_firewall_is_open() -> None:
    c = TwinContent(
        assets=(
            Asset(
                id="a",
                name="A",
                ip="10.0.0.1",
                type="app_server",
                zone="internal",
                criticality=1,
                data_sensitivity=0,
            ),
            Asset(
                id="b",
                name="B",
                ip="10.0.0.2",
                type="db_server",
                zone="data",
                criticality=1,
                data_sensitivity=0,
                open_ports=[{"port": 1433, "service": "mssql"}],
            ),
        ),
        connections=(Connection(id="l", source="a", target="b", kind="network"),),
    )
    r = Network(c).reach("a", "b", 1433, Proto.TCP)
    assert r.allowed
    assert r.via == ()
    assert Network(c).route("b", "a") == ["b", "a"]


# ---- probabilities --------------------------------------------------------------------------
def test_edge_probabilities_follow_formula(northwind: TwinContent) -> None:
    g = build_attack_graph(northwind)
    exploit = g.edges["NET:web-01:22", "PRIV:web-01:user"]
    assert exploit["technique"] == "remote_exploit"
    assert exploit["p"] == pytest.approx(9.8 / 10 * 0.9)
    assert exploit["weight"] == pytest.approx(-math.log(0.882))
    tomcat = g.edges["NET:app-01:8080", "PRIV:app-01:user"]
    assert tomcat["p"] == pytest.approx(7.5 / 10 * 0.9 * K.MOD_EDR)  # app-01 has EDR
    roast = g.edges["NET:idp-01:88", "CRED:svc-web"]
    assert roast["p"] == pytest.approx(0.95 * K.MOD_PASSWORD["weak"])
    roast_strong = g.edges["NET:idp-01:88", "CRED:svc-app"]
    assert roast_strong["p"] == pytest.approx(0.95 * K.MOD_PASSWORD["strong"])
    reach = g.edges["PRIV:inet:user", "NET:web-01:22"]
    assert reach["structural"] is True
    assert reach["p"] == 1.0
    assert reach["weight"] == 0.0
    assert reach["message"]["code"] == "step.network_reach"
    for _u, _v, a in g.edges(data=True):
        assert set(a["message"]) == {"code", "params"}
        if not a["structural"]:
            assert K.P_MIN <= a["p"] <= K.P_MAX


def test_clamp() -> None:
    assert clamp(5.0) == K.P_MAX
    assert clamp(0.0) == K.P_MIN
    assert clamp(0.5) == 0.5


def test_mfa_and_segmentation_modifiers(northwind: TwinContent) -> None:
    mfa = apply_actions(northwind, [parse_action({"action": "enforce_mfa", "principal_id": "svc-web"})])
    g = build_attack_graph(mfa)
    assert g.edges["CRED:svc-web", "PRIV:customer-db:admin"]["p"] == pytest.approx(0.9 * K.MOD_MFA)
    seg = apply_actions(northwind, [parse_action({"action": "segment_zones", "zones": ["internal", "data"]})])
    edge = build_attack_graph(seg).edges["PRIV:ws-01:user", "NET:customer-db:1433"]
    assert edge["p"] == K.MOD_SEGMENTED_HOP
    assert edge["structural"] is False


# ---- the demo story -------------------------------------------------------------------------
def test_sensitive_data_exposure_demo(northwind: TwinContent) -> None:
    r = simulate(northwind, SDE)
    assert 22.0 <= r["score"] <= 28.0
    p1 = r["paths"][0]
    assert r["primary_path"] == "P1"
    assert p1["goal"] == "DATA:customer-db"
    # Exact primary path (fw-int is crossed by the web-01 -> idp-01:88 hop).
    assert p1["assets"] == PRIMARY_PATH
    assert _is_subsequence(["inet", "fw-edge", "web-01", "idp-01", "customer-db"], p1["assets"])
    assert [s["technique"] for s in p1["steps"]] == [
        "network_reach",
        "remote_exploit",
        "network_reach",
        "kerberoasting",
        "credential_use",
        "data_access",
    ]
    assert p1["steps"][1]["vuln_id"] == "v-openssh-web01"

    top3 = [parse_action(x["action"]) for x in r["recommendations"][:3]]
    fixed = apply_actions(northwind, top3)
    after = simulate(fixed, SDE)
    assert after["score"] == 100.0
    assert after["paths"] == []
    assert after["no_path"]["code"] == "no_path.unreachable"
    assert "excessive_privilege:svc-web:customer-db" in after["residual_exposure"]

    # "Revert" = the original content again -> identical result.
    assert simulate(TwinContent.model_validate(northwind.model_dump(mode="json")), SDE) == r


def test_recommendations_are_consistent_with_scores(northwind: TwinContent) -> None:
    r = simulate(northwind, SDE)
    spec = build_scenario(northwind, SDE)
    applied = []
    prev = r["score"]
    for rec in r["recommendations"]:
        applied.append(parse_action(rec["action"]))
        s = quick_score(apply_actions(northwind, applied), spec)
        assert s == pytest.approx(rec["score_after"])
        assert s - prev == pytest.approx(rec["delta_score"], abs=1e-5)
        prev = s
    blocking = [x for x in r["recommendations"] if x["kind"] == "blocking"]
    assert [x["rank"] for x in r["recommendations"]] == list(range(1, len(r["recommendations"]) + 1))
    assert blocking == r["recommendations"][: len(blocking)]
    for cp in r["chokepoints"]:
        s = quick_score(apply_actions(northwind, [parse_action(cp["action"])]), spec)
        assert s - r["score"] == pytest.approx(cp["delta_score"], abs=1e-5)
    deltas = [cp["delta_score"] for cp in r["chokepoints"]]
    assert deltas == sorted(deltas, reverse=True)


# ---- determinism ----------------------------------------------------------------------------
@pytest.mark.parametrize("scenario", SCENARIOS)
def test_determinism_byte_identical(northwind: TwinContent, scenario: str) -> None:
    a = simulate(northwind, scenario)
    shuffled = TwinContent.model_validate(
        {
            **northwind.model_dump(mode="json"),
            "assets": [x.model_dump(mode="json") for x in reversed(northwind.assets)],
            "principals": [x.model_dump(mode="json") for x in reversed(northwind.principals)],
            "firewall_rules": [x.model_dump(mode="json") for x in reversed(northwind.firewall_rules)],
        }
    )
    b = simulate(shuffled, scenario)
    assert canonical_json(a) == canonical_json(b)
    assert a["result_hash"] == b["result_hash"]


# ---- invariants for every scenario ----------------------------------------------------------
@pytest.mark.parametrize("scenario", SCENARIOS)
def test_scenario_invariants(northwind: TwinContent, scenario: str) -> None:
    r = simulate(northwind, scenario)
    assert 0.0 <= r["score"] <= 100.0
    assert r["score"] == pytest.approx(100 * (1 - r["p_breach"]), abs=1e-4)
    survive = math.prod(1 - g["risk"] for g in r["goals"])
    assert r["p_breach"] == pytest.approx(1 - survive, abs=1e-5)
    assert len(r["paths"]) <= max(K.TOP_K, len(r["goals"]))
    assert r["paths"], "every Northwind scenario has at least one path"
    risks = [p["risk"] for p in r["paths"]]
    assert risks == sorted(risks, reverse=True)
    goal_ids = {g["id"] for g in r["goals"]}
    for i, p in enumerate(r["paths"], start=1):
        assert p["id"] == f"P{i}"
        assert p["goal"] in goal_ids
        assert len(p["nodes"]) - 1 <= K.MAX_DEPTH
        assert p["likelihood"] == pytest.approx(math.prod(s["p"] for s in p["steps"]), rel=1e-4)
        assert p["risk"] == pytest.approx(p["likelihood"] * p["impact"], rel=1e-4)
        assert [s["id"] for s in p["steps"]] == [f"P{i}.S{j}" for j in range(1, len(p["steps"]) + 1)]
    for g in r["goals"]:
        if g["likelihood"] > 0:
            assert g["path_id"] is not None
            best = next(p for p in r["paths"] if p["id"] == g["path_id"])
            assert best["likelihood"] == pytest.approx(g["likelihood"], rel=1e-4)
    used = {f["id"] for f in r["findings"] if f["used"]}
    assert set(r["residual_exposure"]).isdisjoint(used)
    assert {s["step_id"] for s in r["timeline"]["primary"]} == {s["id"] for s in r["paths"][0]["steps"]}
    assert r["timeline"]["discovery"][0]["state"] == r["entry"]["state"]


def test_lateral_movement_foothold(northwind: TwinContent) -> None:
    r = simulate(northwind, "lateral_movement", {"foothold": "app-01"})
    assert r["entry"]["asset_id"] == "app-01"
    assert r["params"] == {"foothold": "app-01"}
    assert all(g["asset_id"] != "app-01" for g in r["goals"])
    default = simulate(northwind, "lateral_movement")
    assert default["params"] == {"foothold": "ws-01"}


def test_privilege_escalation_uses_side_path(northwind: TwinContent) -> None:
    r = simulate(northwind, "privilege_escalation")
    techniques = {s["technique"] for p in r["paths"] for s in p["steps"]}
    assert {"local_privesc", "credential_theft"} <= techniques
    da = next(g for g in r["goals"] if g["id"] == "DOMAIN_ADMIN")
    assert da["likelihood"] > 0


@pytest.mark.parametrize(
    ("scenario", "params", "code"),
    [
        ("nope", {}, "scenario.unknown"),
        ("lateral_movement", {"foothold": "fw-edge"}, "scenario.invalid_foothold"),
        ("lateral_movement", {"foothold": "ghost"}, "scenario.invalid_foothold"),
        ("sensitive_data_exposure", {"foothold": "ws-01"}, "scenario.unknown_param"),
    ],
)
def test_scenario_errors(northwind: TwinContent, scenario: str, params: dict[str, Any], code: str) -> None:
    with pytest.raises(ScenarioError) as exc:
        simulate(northwind, scenario, params)
    assert exc.value.code == code


# ---- edge cases -----------------------------------------------------------------------------
def test_internet_only_twin_scores_100() -> None:
    c = TwinContent(
        assets=(
            Asset(
                id="inet",
                name="Internet",
                ip="203.0.113.1",
                type="internet_gateway",
                zone="internet",
                criticality=1,
                data_sensitivity=0,
            ),
        )
    )
    r = simulate(c, SDE)
    assert r["score"] == 100.0
    assert r["paths"] == []
    assert r["goals"] == []
    assert r["recommendations"] == []


def test_missing_gateway_is_specific_error() -> None:
    with pytest.raises(ScenarioError) as exc:
        simulate(TwinContent(), SDE)
    assert exc.value.code == "scenario.no_internet_gateway"


def test_closed_edge_gives_no_path(northwind: TwinContent) -> None:
    rules = [r for r in northwind.firewall_rules if r.firewall_id != "fw-edge"]
    c = TwinContent.model_validate(
        {**northwind.model_dump(mode="json"), "firewall_rules": [r.model_dump(mode="json") for r in rules]}
    )
    r = simulate(c, SDE)
    assert r["score"] == 100.0
    assert r["primary_path"] is None
    assert r["no_path"]["params"]["reachable_assets"] == []
    assert r["timeline"]["primary"] == []


def test_whatif_can_be_skipped(northwind: TwinContent) -> None:
    r = simulate(northwind, SDE, whatif=False)
    assert r["chokepoints"] == []
    assert r["recommendations"] == []


def test_policy_segmentation_reduces_risk(northwind: TwinContent) -> None:
    seg = northwind.model_copy(update={"policy": Policy(segmented_zones=((Zone.DMZ, Zone.INTERNAL),))})
    assert simulate(seg, SDE)["score"] > simulate(northwind, SDE)["score"]
