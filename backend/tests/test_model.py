from __future__ import annotations

import pytest
from pydantic import ValidationError

from cybertwin.domain.diff import diff_contents
from cybertwin.domain.model import (
    Asset,
    Connection,
    FirewallRule,
    Policy,
    TwinContent,
    Vulnerability,
    Zone,
)


def test_northwind_is_valid_and_canonical(northwind: TwinContent) -> None:
    again = TwinContent.model_validate(northwind.model_dump(mode="json"))
    assert again.content_hash() == northwind.content_hash()
    assert [a.id for a in northwind.assets] == sorted(a.id for a in northwind.assets)
    assert all(v.illustrative for v in northwind.vulnerabilities)


def test_hash_ignores_input_order(northwind: TwinContent) -> None:
    shuffled = northwind.model_copy(update={"assets": tuple(reversed(northwind.assets))})
    assert shuffled.content_hash() == northwind.content_hash()


@pytest.mark.parametrize("ip", ["10.0.0.300", "abc", "::1", ""])
def test_asset_rejects_bad_ipv4(ip: str) -> None:
    with pytest.raises(ValidationError, match="invalid_ipv4"):
        Asset(id="x", name="X", ip=ip, type="web_server", zone="dmz", criticality=1, data_sensitivity=0)


def test_asset_rejects_bad_ranges() -> None:
    with pytest.raises(ValidationError):
        Asset(
            id="x", name="X", ip="10.0.0.9", type="web_server", zone="dmz", criticality=6, data_sensitivity=0
        )
    with pytest.raises(ValidationError):
        Asset(
            id="X Bad",
            name="X",
            ip="10.0.0.9",
            type="web_server",
            zone="dmz",
            criticality=1,
            data_sensitivity=0,
        )


def test_duplicate_ports_rejected() -> None:
    with pytest.raises(ValidationError, match="duplicate_port"):
        Asset(
            id="x",
            name="X",
            ip="10.0.0.9",
            type="web_server",
            zone="dmz",
            criticality=1,
            data_sensitivity=0,
            open_ports=[{"port": 22, "service": "ssh"}, {"port": 22, "service": "ssh2"}],
        )


def test_connection_self_loop_and_permission_kind_rejected() -> None:
    with pytest.raises(ValidationError, match="self_loop"):
        Connection(id="c", source="a", target="a", kind="network")
    with pytest.raises(ValidationError):
        Connection(id="c", source="a", target="b", kind="permission")


def test_firewall_endpoint_validation() -> None:
    with pytest.raises(ValidationError, match="invalid_endpoint"):
        FirewallRule(id="r", firewall_id="fw", order=1, action="allow", src="10.0.0.0/8")
    with pytest.raises(ValidationError, match="invalid_zone"):
        FirewallRule(id="r", firewall_id="fw", order=1, action="allow", src="zone:moon")


def test_vulnerability_rules() -> None:
    base = {
        "id": "v",
        "cve": "CVE-2020-0001",
        "title": "t",
        "cvss": 5.0,
        "exploit_maturity": "poc",
        "asset_id": "a",
    }
    with pytest.raises(ValidationError, match="remote_exploit_needs_port"):
        Vulnerability(**base, kind="remote_exploit")
    with pytest.raises(ValidationError, match="privesc_grants_admin"):
        Vulnerability(**base, kind="local_privesc", grants="user")
    with pytest.raises(ValidationError):
        Vulnerability(**{**base, "cve": "CVE-20-1"}, kind="local_privesc", grants="admin")


def test_integrity_errors_are_specific(northwind: TwinContent) -> None:
    data = northwind.model_dump(mode="json")
    data["connections"].append({"id": "n-ghost", "source": "web-01", "target": "ghost", "kind": "network"})
    data["vulnerabilities"][0]["port"] = 9999
    data["assets"].append({**data["assets"][0]})
    with pytest.raises(ValidationError) as exc:
        TwinContent.model_validate(data)
    msg = str(exc.value)
    assert "unknown_asset:connection:n-ghost:ghost" in msg
    assert "port_not_open:vulnerability" in msg
    assert "duplicate_id:asset" in msg


def test_policy_pairs_canonical() -> None:
    p = Policy(segmented_zones=[(Zone.INTERNAL, Zone.DATA), (Zone.DATA, Zone.INTERNAL)])
    assert p.segmented_zones == ((Zone.DATA, Zone.INTERNAL),)
    assert p.is_segmented(Zone.INTERNAL, Zone.DATA)
    with pytest.raises(ValidationError, match="segment_same_zone"):
        Policy(segmented_zones=[(Zone.DATA, Zone.DATA)])


def test_diff(northwind: TwinContent) -> None:
    assert diff_contents(northwind, northwind) == {"summary": {"changes": 0}}
    vulns = tuple(v for v in northwind.vulnerabilities if v.id != "v-openssh-web01")
    web = northwind.asset("web-01")
    assert web is not None
    assets = tuple(
        a.model_copy(update={"criticality": 4}) if a.id == "web-01" else a for a in northwind.assets
    )
    after = northwind.model_copy(update={"vulnerabilities": vulns, "assets": assets})
    d = diff_contents(northwind, after)
    assert d["vulnerabilities"]["removed"] == ["v-openssh-web01"]
    assert d["assets"]["changed"]["web-01"] == [{"field": "criticality", "before": 3, "after": 4}]
    assert d["summary"]["changes"] == 2
