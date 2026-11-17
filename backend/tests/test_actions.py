from __future__ import annotations

from typing import Any

import pytest

from cybertwin.domain.model import AccessLevel, Strength, TwinContent, Zone
from cybertwin.remediation.actions import ActionError, action_key, apply_action, parse_action


def act(c: TwinContent, data: dict[str, Any]) -> TwinContent:
    return apply_action(c, parse_action(data))


def test_restrict_port_rewrites_internet_rule(northwind: TwinContent) -> None:
    after = act(northwind, {"action": "restrict_port", "asset_id": "web-01", "port": 22})
    rule = next(r for r in after.firewall_rules if r.id == "edge-20")
    assert rule.src == "zone:mgmt"
    assert next(r for r in after.firewall_rules if r.id == "edge-10").src == "any"
    with pytest.raises(ActionError) as exc:
        act(after, {"action": "restrict_port", "asset_id": "web-01", "port": 22})
    assert exc.value.code == "remediation.nothing_to_restrict"
    with pytest.raises(ActionError) as exc:
        act(northwind, {"action": "restrict_port", "asset_id": "web-01", "port": 8443})
    assert exc.value.code == "remediation.port_not_open"


def test_apply_patch_removes_vuln_and_updates_software(northwind: TwinContent) -> None:
    after = act(northwind, {"action": "apply_patch", "vulnerability_id": "v-openssh-web01"})
    assert all(v.id != "v-openssh-web01" for v in after.vulnerabilities)
    web = after.asset("web-01")
    assert web is not None
    ssh = next(s for s in web.software if s.name == "OpenSSH")
    assert ssh.version == "9.8p1"
    assert not ssh.eol
    assert next(p for p in web.open_ports if p.port == 22).version == "OpenSSH 9.8p1"
    with pytest.raises(ActionError) as exc:
        act(after, {"action": "apply_patch", "vulnerability_id": "v-openssh-web01"})
    assert exc.value.code == "remediation.unknown_vulnerability"


def test_mfa_password_permission(northwind: TwinContent) -> None:
    after = act(northwind, {"action": "enforce_mfa", "principal_id": "svc-web"})
    svc = after.principal("svc-web")
    assert svc is not None
    assert svc.mfa
    with pytest.raises(ActionError, match="already_applied"):
        act(after, {"action": "enforce_mfa", "principal_id": "svc-web"})

    after = act(northwind, {"action": "set_password_policy", "principal_id": "svc-web", "strength": "strong"})
    svc = after.principal("svc-web")
    assert svc is not None
    assert svc.credential_strength is Strength.STRONG
    after = act(northwind, {"action": "set_password_policy", "asset_id": "web-01", "strength": "strong"})
    web = after.asset("web-01")
    assert web is not None
    assert web.security_config.password_policy is Strength.STRONG

    after = act(
        northwind, {"action": "reduce_permission", "principal_id": "svc-web", "asset_id": "customer-db"}
    )
    svc = after.principal("svc-web")
    db = after.asset("customer-db")
    assert svc is not None
    assert db is not None
    assert next(p for p in svc.permissions if p.asset_id == "customer-db").level is AccessLevel.USER
    assert "svc-web" not in db.security_config.local_admins
    after = act(
        northwind,
        {
            "action": "reduce_permission",
            "principal_id": "svc-web",
            "asset_id": "customer-db",
            "level": "none",
        },
    )
    svc = after.principal("svc-web")
    assert svc is not None
    assert all(p.asset_id != "customer-db" for p in svc.permissions)


def test_segment_zones(northwind: TwinContent) -> None:
    after = act(northwind, {"action": "segment_zones", "zones": ["internal", "data"]})
    assert after.policy.is_segmented(Zone.DATA, Zone.INTERNAL)
    with pytest.raises(ActionError, match="already_applied"):
        act(after, {"action": "segment_zones", "zones": ["data", "internal"]})


@pytest.mark.parametrize(
    ("data", "code"),
    [
        ({"action": "explode"}, "remediation.invalid_action"),
        ({"action": "segment_zones", "zones": ["dmz", "dmz"]}, "remediation.invalid_action"),
        ({"action": "set_password_policy", "strength": "strong"}, "remediation.invalid_action"),
        ({"action": "enforce_mfa", "principal_id": "ghost"}, "remediation.unknown_principal"),
        ({"action": "restrict_port", "asset_id": "ghost", "port": 22}, "remediation.unknown_asset"),
        (
            {"action": "reduce_permission", "principal_id": "jdoe", "asset_id": "customer-db"},
            "remediation.no_such_permission",
        ),
    ],
)
def test_action_errors(northwind: TwinContent, data: dict[str, Any], code: str) -> None:
    with pytest.raises(ActionError) as exc:
        act(northwind, data)
    assert exc.value.code == code


def test_actions_do_not_mutate_input(northwind: TwinContent) -> None:
    before = northwind.content_hash()
    act(northwind, {"action": "apply_patch", "vulnerability_id": "v-openssh-web01"})
    assert northwind.content_hash() == before


def test_action_keys_are_stable() -> None:
    assert (
        action_key(parse_action({"action": "segment_zones", "zones": ["internal", "data"]}))
        == "segment_zones:data:internal"
    )
    assert (
        action_key(parse_action({"action": "set_password_policy", "asset_id": "web-01"}))
        == "set_password_policy:asset:web-01:strong"
    )
