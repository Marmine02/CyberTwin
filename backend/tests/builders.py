"""Small hand-built twins for focused engine tests."""

from __future__ import annotations

from typing import Any

from app.schemas.twin import TwinSnapshot


def mini(
    *,
    rules: list[dict[str, Any]] | None = None,
    web_edr: bool = False,
    svc_mfa: bool = False,
    svc_strength: str = "weak",
    vulns: bool = True,
    extra: dict[str, Any] | None = None,
) -> TwinSnapshot:
    """gw -- fw -- web(22 vuln) ; web logged-on svc with admin on db (sensitivity 3)."""
    data: dict[str, Any] = {
        "assets": [
            {
                "id": "gw",
                "name": "Internet",
                "ip": "198.51.100.1",
                "asset_type": "internet_gateway",
                "zone": "internet",
                "criticality": 1,
                "data_sensitivity": 0,
            },
            {
                "id": "fw",
                "name": "FW",
                "ip": "10.9.0.1",
                "asset_type": "firewall",
                "zone": "dmz",
                "criticality": 3,
                "data_sensitivity": 0,
            },
            {
                "id": "web",
                "name": "Web",
                "ip": "10.9.1.10",
                "asset_type": "web_server",
                "zone": "dmz",
                "criticality": 3,
                "data_sensitivity": 0,
                "open_ports": [
                    {"port": 22, "service": "ssh", "version": "OpenSSH_7.2"},
                    {"port": 443, "service": "https"},
                ],
                "vulnerability_ids": ["v-ssh"] if vulns else [],
                "security_config": {"edr": web_edr},
            },
            {
                "id": "db",
                "name": "DB",
                "ip": "10.9.3.10",
                "asset_type": "db_server",
                "zone": "data",
                "criticality": 5,
                "data_sensitivity": 3,
                "open_ports": [{"port": 5432, "service": "postgresql"}],
            },
        ],
        "connections": [
            {"id": "c1", "source": "gw", "target": "fw"},
            {"id": "c2", "source": "fw", "target": "web"},
        ],
        "principals": [
            {
                "id": "svc",
                "name": "svc",
                "kind": "service",
                "credential_strength": svc_strength,
                "mfa": svc_mfa,
                "logged_on_assets": ["web"],
                "permissions": [{"asset_id": "db", "level": "admin"}],
            },
        ],
        "firewall_rules": rules
        if rules is not None
        else [
            {
                "id": "r1",
                "firewall_id": "fw",
                "order": 10,
                "src_cidr": "0.0.0.0/0",
                "dst_asset": "web",
                "port": 22,
                "action": "allow",
            },
        ],
        "vulnerabilities": [
            {
                "id": "v-ssh",
                "title": "ssh rce",
                "cvss": 9.0,
                "exploit_maturity": 1.0,
                "kind": "remote_service",
                "affected_asset": "web",
                "affected_port": 22,
                "grants_privilege": "admin",
                "fixed_by_remediation_types": ["apply_patch", "restrict_port"],
            },
        ]
        if vulns
        else [],
    }
    if extra:
        for k, v in extra.items():
            if isinstance(v, list):
                data[k] = data.get(k, []) + v
            else:
                data[k] = v
    return TwinSnapshot.model_validate(data)
