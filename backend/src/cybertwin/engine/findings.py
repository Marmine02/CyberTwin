"""Findings: vulnerabilities and misconfigurations present in the model.

Every finding has a stable id, a severity, i18n message params and (when one exists) the typed
remediation action that removes it. Attack-graph edges reference the finding ids they depend on,
which is how chokepoints, "paths using it" and residual exposure are computed.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from cybertwin.domain.model import (
    AccessLevel,
    AssetType,
    ConnectionKind,
    PrincipalKind,
    Privilege,
    RuleAction,
    Strength,
    TwinContent,
)
from cybertwin.engine.constants import AUTH_SERVICES

SEVERITY_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3}


@dataclass(frozen=True)
class Finding:
    id: str
    kind: str
    severity: str
    asset_id: str | None = None
    principal_id: str | None = None
    params: dict[str, Any] = field(default_factory=dict)
    fix: dict[str, Any] | None = None

    def to_json(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "kind": self.kind,
            "severity": self.severity,
            "asset_id": self.asset_id,
            "principal_id": self.principal_id,
            "message": {"code": f"finding.{self.kind}", "params": self.params},
            "fix": self.fix,
        }


def cvss_severity(cvss: float) -> str:
    if cvss >= 9.0:
        return "critical"
    if cvss >= 7.0:
        return "high"
    if cvss >= 4.0:
        return "medium"
    return "low"


def vuln_finding_id(vuln_id: str) -> str:
    return f"vuln:{vuln_id}"


def exposed_finding_id(asset_id: str, port: int) -> str:
    return f"exposed_service:{asset_id}:{port}"


def collect_findings(c: TwinContent) -> dict[str, Finding]:
    out: list[Finding] = []
    assets = {a.id: a for a in c.assets}

    for v in c.vulnerabilities:
        out.append(
            Finding(
                id=vuln_finding_id(v.id),
                kind="vulnerability",
                severity=cvss_severity(v.cvss),
                asset_id=v.asset_id,
                params={
                    "cve": v.cve,
                    "title": v.title,
                    "cvss": v.cvss,
                    "asset": v.asset_id,
                    "port": v.port,
                    "vuln_id": v.id,
                    "illustrative": v.illustrative,
                },
                fix={"action": "apply_patch", "vulnerability_id": v.id},
            )
        )

    # Auth/admin services exposed to the internet by an allow rule.
    for r in c.firewall_rules:
        if r.action is not RuleAction.ALLOW or r.src not in ("any", "zone:internet"):
            continue
        if not r.dst.startswith("asset:") or r.port is None:
            continue
        asset = assets.get(r.dst[6:])
        if asset is None:
            continue
        svc = next((p.service for p in asset.open_ports if p.port == r.port), None)
        if svc in AUTH_SERVICES:
            out.append(
                Finding(
                    id=exposed_finding_id(asset.id, r.port),
                    kind="exposed_service",
                    severity="high",
                    asset_id=asset.id,
                    params={
                        "asset": asset.id,
                        "port": r.port,
                        "service": svc,
                        "rule": r.id,
                        "firewall": r.firewall_id,
                    },
                    fix={"action": "restrict_port", "asset_id": asset.id, "port": r.port},
                )
            )
        # Broad "flat" rules: zone-to-zone with any port.
    for r in c.firewall_rules:
        if (
            r.action is RuleAction.ALLOW
            and r.src.startswith("zone:")
            and r.dst.startswith("zone:")
            and r.port is None
        ):
            out.append(
                Finding(
                    id=f"flat_network:{r.id}",
                    kind="flat_network",
                    severity="medium",
                    params={"rule": r.id, "firewall": r.firewall_id, "src": r.src[5:], "dst": r.dst[5:]},
                    fix=None
                    if r.src == r.dst
                    else {"action": "segment_zones", "zones": sorted([r.src[5:], r.dst[5:]])},
                )
            )

    for p in c.principals:
        has_rights = bool(p.permissions) or p.privilege is not Privilege.USER
        if p.credential_strength is not Strength.STRONG and has_rights:
            out.append(
                Finding(
                    id=f"weak_credential:{p.id}",
                    kind="weak_credential",
                    severity="high" if p.credential_strength is Strength.WEAK else "medium",
                    principal_id=p.id,
                    params={"principal": p.id, "strength": p.credential_strength.value},
                    fix={"action": "set_password_policy", "principal_id": p.id, "strength": "strong"},
                )
            )
        if not p.mfa and (p.privilege is not Privilege.USER or p.kind is PrincipalKind.SERVICE):
            out.append(
                Finding(
                    id=f"no_mfa:{p.id}",
                    kind="no_mfa",
                    severity="high" if p.privilege is Privilege.DOMAIN_ADMIN else "medium",
                    principal_id=p.id,
                    params={"principal": p.id, "privilege": p.privilege.value},
                    fix={"action": "enforce_mfa", "principal_id": p.id},
                )
            )
        if p.kerberoastable:
            out.append(
                Finding(
                    id=f"kerberoastable:{p.id}",
                    kind="kerberoastable",
                    severity="high" if p.credential_strength is Strength.WEAK else "low",
                    principal_id=p.id,
                    params={"principal": p.id, "strength": p.credential_strength.value},
                    fix={"action": "set_password_policy", "principal_id": p.id, "strength": "strong"},
                )
            )
        for perm in p.permissions:
            target = assets.get(perm.asset_id)
            if (
                target is not None
                and p.kind is PrincipalKind.SERVICE
                and perm.level is AccessLevel.ADMIN
                and target.data_sensitivity >= 2
            ):
                out.append(
                    Finding(
                        id=f"excessive_privilege:{p.id}:{target.id}",
                        kind="excessive_privilege",
                        severity="high",
                        asset_id=target.id,
                        principal_id=p.id,
                        params={"principal": p.id, "asset": target.id, "level": perm.level.value},
                        fix={
                            "action": "reduce_permission",
                            "principal_id": p.id,
                            "asset_id": target.id,
                            "level": "user",
                        },
                    )
                )
        if p.privilege is not Privilege.USER:
            for aid in p.logged_on_assets:
                host = assets.get(aid)
                if host is not None and host.type in (AssetType.EMPLOYEE_WS, AssetType.WEB_SERVER):
                    out.append(
                        Finding(
                            id=f"cached_credential:{p.id}:{aid}",
                            kind="cached_credential",
                            severity="high" if p.privilege is Privilege.DOMAIN_ADMIN else "medium",
                            asset_id=aid,
                            principal_id=p.id,
                            params={"principal": p.id, "asset": aid, "privilege": p.privilege.value},
                            fix=None,
                        )
                    )

    for a in c.assets:
        if a.type in (AssetType.INTERNET_GATEWAY,):
            continue
        for sw in a.software:
            if sw.eol:
                out.append(
                    Finding(
                        id=f"eol_software:{a.id}:{sw.name}",
                        kind="eol_software",
                        severity="medium",
                        asset_id=a.id,
                        params={"asset": a.id, "software": sw.name, "version": sw.version},
                        fix=None,
                    )
                )
        interactive = any(p.service in ("ssh", "rdp", "winrm") for p in a.open_ports)
        if interactive and a.security_config.password_policy is not Strength.STRONG:
            out.append(
                Finding(
                    id=f"weak_password_policy:{a.id}",
                    kind="weak_password_policy",
                    severity="high" if a.security_config.password_policy is Strength.WEAK else "medium",
                    asset_id=a.id,
                    params={"asset": a.id, "strength": a.security_config.password_policy.value},
                    fix={"action": "set_password_policy", "asset_id": a.id, "strength": "strong"},
                )
            )
        if not a.security_config.edr and a.criticality >= 4 and a.type is not AssetType.FIREWALL:
            out.append(
                Finding(
                    id=f"no_edr:{a.id}",
                    kind="no_edr",
                    severity="low",
                    asset_id=a.id,
                    params={"asset": a.id, "criticality": a.criticality},
                    fix=None,
                )
            )

    for conn in c.connections:
        if conn.kind is ConnectionKind.TRUST:
            out.append(
                Finding(
                    id=f"trust:{conn.id}",
                    kind="trust_relationship",
                    severity="medium",
                    asset_id=conn.target,
                    params={"source": conn.source, "target": conn.target, "label": conn.label},
                    fix=None,
                )
            )

    result: dict[str, Finding] = {}
    for f in sorted(out, key=lambda f: f.id):
        result.setdefault(f.id, f)
    return result
