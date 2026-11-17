"""Apply typed remediation actions to a snapshot. Pure: returns a new snapshot + change log."""

from __future__ import annotations

from collections.abc import Sequence

from app.core.errors import DomainError
from app.i18n import vuln_title
from app.schemas.i18n import Message, MsgParam, msg
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
    RuleAction,
    TwinSnapshot,
    VulnKind,
    ZonePair,
)


def _resolve_vulns(snap: TwinSnapshot, ids: set[str], log: list[Message]) -> None:
    if not ids:
        return
    snap.vulnerabilities = [v for v in snap.vulnerabilities if v.id not in ids]
    for a in snap.assets:
        a.vulnerability_ids = [v for v in a.vulnerability_ids if v not in ids]
    for vid in sorted(ids):
        log.append(msg("change.finding_resolved", vuln=vid))


def _restrict_port(snap: TwinSnapshot, act: RestrictPort, log: list[Message]) -> None:
    asset = snap.asset(act.asset_id)
    if asset is None:
        raise DomainError("asset_not_found", msg("err.not_found", kind=msg("entity.asset"), id=act.asset_id))
    port = asset.port(act.port)
    if port is None:
        raise DomainError(
            "port_not_open",
            msg("err.rule_port_closed", asset=act.asset_id, port=act.port),
            {"asset_id": act.asset_id, "port": act.port},
        )
    allowed = sorted(set(act.allow_from_zones), key=lambda z: z.value)
    port.exposed_to_zones = allowed
    common: dict[str, MsgParam] = {"asset": act.asset_id, "port": act.port, "proto": port.proto.value}
    if allowed:
        log.append(msg("change.port_restricted", zones=[msg(f"zone.{z.value}") for z in allowed], **common))
    else:
        log.append(msg("change.port_closed_all", **common))
    kept = []
    for r in snap.firewall_rules:
        offending = (
            r.action == RuleAction.allow
            and r.dst_asset == asset.id
            and r.port == act.port
            and (r.src_zone is None or r.src_zone not in allowed)
        )
        if offending:
            log.append(msg("change.rule_removed", rule=r.id, firewall=r.firewall_id))
        else:
            kept.append(r)
    snap.firewall_rules = kept
    fixed = {
        v.id
        for v in snap.vulnerabilities
        if v.kind == VulnKind.misconfig and v.affected_asset == asset.id and v.affected_port == act.port
    }
    _resolve_vulns(snap, fixed, log)


def _enforce_mfa(snap: TwinSnapshot, act: EnforceMfa, log: list[Message]) -> None:
    p = snap.principal(act.principal_id)
    if p is None:
        raise DomainError(
            "principal_not_found", msg("err.not_found", kind=msg("entity.principal"), id=act.principal_id)
        )
    if p.mfa:
        raise DomainError("no_op", msg("err.mfa_already", id=p.id))
    p.mfa = True
    log.append(msg("change.mfa", principal=p.id))
    fixed = {
        v.id
        for v in snap.vulnerabilities
        if v.kind == VulnKind.misconfig
        and v.affected_principal == p.id
        and RemediationType.enforce_mfa in v.fixed_by_remediation_types
    }
    _resolve_vulns(snap, fixed, log)


def _set_password(snap: TwinSnapshot, act: SetPasswordPolicy, log: list[Message]) -> None:
    p = snap.principal(act.principal_id)
    if p is None:
        raise DomainError(
            "principal_not_found", msg("err.not_found", kind=msg("entity.principal"), id=act.principal_id)
        )
    if p.credential_strength == act.policy:
        raise DomainError("no_op", msg("err.password_already", id=p.id, policy=msg(f"strength.{act.policy.value}")))
    p.credential_strength = act.policy
    log.append(msg("change.password", principal=p.id, policy=msg(f"strength.{act.policy.value}")))
    if act.policy == PasswordStrength.strong:
        fixed = {
            v.id for v in snap.vulnerabilities if v.kind == VulnKind.weak_credential and v.affected_principal == p.id
        }
        _resolve_vulns(snap, fixed, log)


def _apply_patch(snap: TwinSnapshot, act: ApplyPatch, log: list[Message]) -> None:
    v = snap.vuln(act.vuln_id)
    if v is None:
        raise DomainError("vuln_not_found", msg("err.not_found", kind=msg("entity.vuln"), id=act.vuln_id))
    if v.kind not in (VulnKind.remote_service, VulnKind.outdated_software, VulnKind.local_privesc):
        raise DomainError(
            "not_patchable",
            msg("err.not_patchable", id=v.id, kind=msg(f"vulnkind.{v.kind.value}")),
        )
    asset = snap.asset(v.affected_asset) if v.affected_asset else None
    if asset is not None and v.fixed_version and v.affected_port is not None:
        port = asset.port(v.affected_port)
        if port is not None:
            for sw in asset.software:
                if sw.name.lower() in (port.version.lower() + " " + port.service.lower()) or (
                    port.service.lower() in sw.name.lower()
                ):
                    log.append(
                        msg("change.software", asset=asset.id, software=sw.name, old=sw.version, new=v.fixed_version)
                    )
                    sw.version = v.fixed_version
                    sw.eol = False
                    port.version = f"{sw.name}_{v.fixed_version}".replace(" ", "_")[:40]
                    break
    log.append(msg("change.patched", vuln=v.id, title=vuln_title(v)))
    _resolve_vulns(snap, {v.id}, log)


def _reduce_permission(snap: TwinSnapshot, act: ReducePermission, log: list[Message]) -> None:
    p = snap.principal(act.principal_id)
    if p is None:
        raise DomainError(
            "principal_not_found", msg("err.not_found", kind=msg("entity.principal"), id=act.principal_id)
        )
    current = next((perm for perm in p.permissions if perm.asset_id == act.asset_id), None)
    if current is None:
        raise DomainError(
            "permission_not_found",
            msg("err.no_permission", id=p.id, asset=act.asset_id),
        )
    order = {"none": 0, "read": 1, "write": 2, "admin": 3}
    if order[act.level] >= order[current.level.value]:
        raise DomainError(
            "not_a_reduction",
            msg(
                "err.not_reduction",
                id=p.id,
                current=msg(f"level.{current.level.value}"),
                asset=act.asset_id,
                level=msg(f"level.{act.level}"),
            ),
        )
    if act.level == "none":
        p.permissions = [perm for perm in p.permissions if perm.asset_id != act.asset_id]
    else:
        current.level = PermissionLevel(act.level)
    log.append(msg("change.permission", principal=p.id, asset=act.asset_id, level=msg(f"level.{act.level}")))
    fixed = {
        v.id
        for v in snap.vulnerabilities
        if v.kind == VulnKind.excessive_permission and v.affected_principal == p.id and v.affected_asset == act.asset_id
    }
    _resolve_vulns(snap, fixed, log)


def _segment(snap: TwinSnapshot, act: SegmentZones, log: list[Message]) -> None:
    if act.zone_a == act.zone_b:
        raise DomainError("invalid_action", msg("err.segment_self"))
    pair = ZonePair(a=act.zone_a, b=act.zone_b)
    if any(z.key() == pair.key() for z in snap.segmented_zones):
        raise DomainError(
            "no_op", msg("err.already_segmented", a=msg(f"zone.{pair.key()[0]}"), b=msg(f"zone.{pair.key()[1]}"))
        )
    snap.segmented_zones = sorted([*snap.segmented_zones, pair], key=lambda z: z.key())
    log.append(msg("change.segmented", a=msg(f"zone.{pair.key()[0]}"), b=msg(f"zone.{pair.key()[1]}")))


def apply_actions(snap: TwinSnapshot, actions: Sequence[RemediationAction]) -> tuple[TwinSnapshot, list[Message]]:
    """Return (new snapshot, human-readable change log). Raises DomainError with a specific message."""
    new = snap.model_copy(deep=True)
    log: list[Message] = []
    seen: set[str] = set()
    for act in actions:
        if act.key() in seen:
            raise DomainError("duplicate_action", msg("err.duplicate_action", key=act.key()))
        seen.add(act.key())
        if isinstance(act, RestrictPort):
            _restrict_port(new, act, log)
        elif isinstance(act, EnforceMfa):
            _enforce_mfa(new, act, log)
        elif isinstance(act, SetPasswordPolicy):
            _set_password(new, act, log)
        elif isinstance(act, ApplyPatch):
            _apply_patch(new, act, log)
        elif isinstance(act, ReducePermission):
            _reduce_permission(new, act, log)
        else:
            _segment(new, act, log)
    # Re-validate the whole snapshot (referential integrity).
    return TwinSnapshot.model_validate(new.model_dump()), log
