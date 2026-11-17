"""Candidate fixes derived from findings. Each candidate is a typed action + the findings it addresses."""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field

from app.schemas.remediation import (
    ApplyPatch,
    EnforceMfa,
    ReducePermission,
    RemediationAction,
    RestrictPort,
    SegmentZones,
    SetPasswordPolicy,
)
from app.schemas.twin import (
    PasswordStrength,
    PermissionLevel,
    RemediationType,
    TwinSnapshot,
    VulnKind,
    Zone,
)

PATCHABLE = (VulnKind.remote_service, VulnKind.outdated_software, VulnKind.local_privesc)


@dataclass
class Candidate:
    action: RemediationAction
    vuln_ids: list[str] = field(default_factory=list)

    @property
    def key(self) -> str:
        return self.action.key()


def generate_candidates(snap: TwinSnapshot, cross_zone_pairs: Iterable[tuple[str, str]] = ()) -> list[Candidate]:
    out: dict[str, Candidate] = {}

    def add(action: RemediationAction, vuln_id: str | None) -> None:
        c = out.setdefault(action.key(), Candidate(action))
        if vuln_id and vuln_id not in c.vuln_ids:
            c.vuln_ids.append(vuln_id)
            c.vuln_ids.sort()

    for v in sorted(snap.vulnerabilities, key=lambda v: v.id):
        principal = snap.principal(v.affected_principal) if v.affected_principal else None
        asset = snap.asset(v.affected_asset) if v.affected_asset else None
        for rtype in sorted(set(v.fixed_by_remediation_types), key=lambda r: r.value):
            if rtype == RemediationType.apply_patch and v.kind in PATCHABLE:
                add(ApplyPatch(vuln_id=v.id), v.id)
            elif (
                rtype == RemediationType.restrict_port
                and asset is not None
                and v.affected_port is not None
                and asset.port(v.affected_port) is not None
            ):
                current = asset.port(v.affected_port)
                if current is not None and current.exposed_to_zones == [Zone.mgmt]:
                    continue
                add(RestrictPort(asset_id=asset.id, port=v.affected_port, allow_from_zones=[Zone.mgmt]), v.id)
            elif rtype == RemediationType.enforce_mfa and principal is not None and not principal.mfa:
                add(EnforceMfa(principal_id=principal.id), v.id)
            elif (
                rtype == RemediationType.set_password_policy
                and principal is not None
                and principal.credential_strength != PasswordStrength.strong
            ):
                add(SetPasswordPolicy(principal_id=principal.id, policy=PasswordStrength.strong), v.id)
            elif rtype == RemediationType.reduce_permission and principal is not None and asset is not None:
                perm = next((p for p in principal.permissions if p.asset_id == asset.id), None)
                if perm is not None and perm.level in (PermissionLevel.admin, PermissionLevel.write):
                    add(ReducePermission(principal_id=principal.id, asset_id=asset.id, level="read"), v.id)

    segmented = {z.key() for z in snap.segmented_zones}
    for a, b in sorted(set(cross_zone_pairs)):
        if a == b or Zone.internet.value in (a, b):
            continue
        x, y = sorted((a, b))
        if (x, y) in segmented:
            continue
        add(SegmentZones(zone_a=Zone(x), zone_b=Zone(y)), None)

    return [out[k] for k in sorted(out)]
