"""Typed remediation actions and their pure application to a TwinContent snapshot.

``apply_action(content, action)`` never mutates its input; it returns a new validated snapshot or
raises :class:`ActionError` with a specific i18n code.
"""

from __future__ import annotations

from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, ValidationError, model_validator

from cybertwin.domain.model import (
    ID_PATTERN,
    AccessLevel,
    FirewallRule,
    OpenPort,
    Permission,
    Policy,
    RuleAction,
    Software,
    Strength,
    TwinContent,
    Zone,
)

Id = Annotated[str, Field(pattern=ID_PATTERN)]


class ActionError(ValueError):
    def __init__(self, code: str, **params: Any) -> None:
        super().__init__(f"{code} {params}")
        self.code = code
        self.params = params


class _Action(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


class RestrictPort(_Action):
    """Limit internet/any-source allow rules to ``asset_id:port`` to the management zone."""

    action: Literal["restrict_port"] = "restrict_port"
    asset_id: Id
    port: int = Field(ge=1, le=65535)


class EnforceMfa(_Action):
    action: Literal["enforce_mfa"] = "enforce_mfa"
    principal_id: Id


class SetPasswordPolicy(_Action):
    """Set a principal's credential strength, or an asset's local password policy."""

    action: Literal["set_password_policy"] = "set_password_policy"
    principal_id: Id | None = None
    asset_id: Id | None = None
    strength: Strength = Strength.STRONG

    @model_validator(mode="after")
    def _one_target(self) -> SetPasswordPolicy:
        if (self.principal_id is None) == (self.asset_id is None):
            raise ValueError("exactly_one_target")
        return self


class ApplyPatch(_Action):
    action: Literal["apply_patch"] = "apply_patch"
    vulnerability_id: Id


class ReducePermission(_Action):
    action: Literal["reduce_permission"] = "reduce_permission"
    principal_id: Id
    asset_id: Id
    level: Literal["user", "none"] = "user"


class SegmentZones(_Action):
    action: Literal["segment_zones"] = "segment_zones"
    zones: tuple[Zone, Zone]

    @model_validator(mode="after")
    def _distinct(self) -> SegmentZones:
        if self.zones[0] == self.zones[1]:
            raise ValueError("segment_same_zone")
        return self


Action = Annotated[
    RestrictPort | EnforceMfa | SetPasswordPolicy | ApplyPatch | ReducePermission | SegmentZones,
    Field(discriminator="action"),
]
ACTION_ADAPTER: TypeAdapter[Action] = TypeAdapter(Action)
ACTION_TYPES = (
    "restrict_port",
    "enforce_mfa",
    "set_password_policy",
    "apply_patch",
    "reduce_permission",
    "segment_zones",
)


def parse_action(data: dict[str, Any]) -> Action:
    try:
        return ACTION_ADAPTER.validate_python(data)
    except ValidationError as exc:
        raise ActionError(
            "remediation.invalid_action", detail=exc.errors(include_url=False)[0]["msg"]
        ) from exc


def action_key(action: Action) -> str:
    """Stable id of an action (used as recommendation / chokepoint id)."""
    match action:
        case RestrictPort():
            return f"restrict_port:{action.asset_id}:{action.port}"
        case EnforceMfa():
            return f"enforce_mfa:{action.principal_id}"
        case SetPasswordPolicy():
            target = f"principal:{action.principal_id}" if action.principal_id else f"asset:{action.asset_id}"
            return f"set_password_policy:{target}:{action.strength.value}"
        case ApplyPatch():
            return f"apply_patch:{action.vulnerability_id}"
        case ReducePermission():
            return f"reduce_permission:{action.principal_id}:{action.asset_id}:{action.level}"
        case SegmentZones():
            a, b = sorted(z.value for z in action.zones)
            return f"segment_zones:{a}:{b}"
    raise AssertionError("unreachable")  # pragma: no cover


def _replace(items: tuple[Any, ...], new: Any) -> tuple[Any, ...]:
    return tuple(new if x.id == new.id else x for x in items)


def apply_action(c: TwinContent, action: Action) -> TwinContent:
    return _revalidate(_apply(c, action))


def apply_actions(c: TwinContent, actions: list[Action]) -> TwinContent:
    for a in actions:
        c = apply_action(c, a)
    return c


def _apply(c: TwinContent, action: Action) -> TwinContent:
    match action:
        case RestrictPort():
            return _restrict_port(c, action)
        case EnforceMfa():
            p = c.principal(action.principal_id)
            if p is None:
                raise ActionError("remediation.unknown_principal", principal=action.principal_id)
            if p.mfa:
                raise ActionError("remediation.already_applied", action=action.action, target=p.id)
            return c.model_copy(
                update={"principals": _replace(c.principals, p.model_copy(update={"mfa": True}))}
            )
        case SetPasswordPolicy():
            return _set_password(c, action)
        case ApplyPatch():
            return _apply_patch(c, action)
        case ReducePermission():
            return _reduce_permission(c, action)
        case SegmentZones():
            pair = tuple(sorted(action.zones, key=lambda z: z.value))
            if pair in c.policy.segmented_zones:
                raise ActionError("remediation.already_applied", action=action.action, target=":".join(pair))
            policy = Policy(segmented_zones=(*c.policy.segmented_zones, (pair[0], pair[1])))
            return TwinContent.model_validate(
                {**c.model_dump(mode="json"), "policy": policy.model_dump(mode="json")}
            )
    raise AssertionError("unreachable")  # pragma: no cover


def _revalidate(c: TwinContent) -> TwinContent:
    return TwinContent.model_validate(c.model_dump(mode="json")).normalized()


def _restrict_port(c: TwinContent, a: RestrictPort) -> TwinContent:
    asset = c.asset(a.asset_id)
    if asset is None:
        raise ActionError("remediation.unknown_asset", asset=a.asset_id)
    if a.port not in {p.port for p in asset.open_ports}:
        raise ActionError("remediation.port_not_open", asset=a.asset_id, port=a.port)
    rules = list(c.firewall_rules)
    changed = False
    new_rules: list[FirewallRule] = []
    for r in rules:
        exact = r.dst == f"asset:{asset.id}" and r.port == a.port
        open_src = r.src in ("any", "zone:internet")
        if r.action is RuleAction.ALLOW and exact and open_src:
            new_rules.append(
                r.model_copy(
                    update={
                        "src": "zone:mgmt",
                        "description": (r.description + " (restricted to mgmt)")[:120],
                    }
                )
            )
            changed = True
        else:
            new_rules.append(r)
    if not changed:
        raise ActionError("remediation.nothing_to_restrict", asset=a.asset_id, port=a.port)
    return _revalidate(c.model_copy(update={"firewall_rules": tuple(new_rules)}))


def _set_password(c: TwinContent, a: SetPasswordPolicy) -> TwinContent:
    if a.principal_id is not None:
        p = c.principal(a.principal_id)
        if p is None:
            raise ActionError("remediation.unknown_principal", principal=a.principal_id)
        if p.credential_strength is a.strength:
            raise ActionError("remediation.already_applied", action=a.action, target=p.id)
        return c.model_copy(
            update={
                "principals": _replace(c.principals, p.model_copy(update={"credential_strength": a.strength}))
            }
        )
    asset = c.asset(a.asset_id or "")
    if asset is None:
        raise ActionError("remediation.unknown_asset", asset=a.asset_id)
    if asset.security_config.password_policy is a.strength:
        raise ActionError("remediation.already_applied", action=a.action, target=asset.id)
    sc = asset.security_config.model_copy(update={"password_policy": a.strength})
    return c.model_copy(
        update={"assets": _replace(c.assets, asset.model_copy(update={"security_config": sc}))}
    )


def _apply_patch(c: TwinContent, a: ApplyPatch) -> TwinContent:
    vuln = next((v for v in c.vulnerabilities if v.id == a.vulnerability_id), None)
    if vuln is None:
        raise ActionError("remediation.unknown_vulnerability", vulnerability=a.vulnerability_id)
    vulns = tuple(v for v in c.vulnerabilities if v.id != vuln.id)
    asset = c.asset(vuln.asset_id)
    assert asset is not None
    sw_name, sw_ver = vuln.fixed_by.software, vuln.fixed_by.version
    if sw_name and sw_ver:
        software = tuple(
            Software(name=s.name, version=sw_ver, eol=False) if s.name == sw_name else s
            for s in asset.software
        )
        ports = tuple(
            OpenPort(port=p.port, proto=p.proto, service=p.service, version=f"{sw_name} {sw_ver}")
            if p.version.lower().startswith(sw_name.lower())
            else p
            for p in asset.open_ports
        )
        asset = asset.model_copy(update={"software": software, "open_ports": ports})
    return _revalidate(c.model_copy(update={"vulnerabilities": vulns, "assets": _replace(c.assets, asset)}))


def _reduce_permission(c: TwinContent, a: ReducePermission) -> TwinContent:
    p = c.principal(a.principal_id)
    if p is None:
        raise ActionError("remediation.unknown_principal", principal=a.principal_id)
    perm = next((x for x in p.permissions if x.asset_id == a.asset_id), None)
    if perm is None:
        raise ActionError("remediation.no_such_permission", principal=a.principal_id, asset=a.asset_id)
    if a.level == "user" and perm.level is AccessLevel.USER:
        raise ActionError("remediation.already_applied", action=a.action, target=f"{p.id}:{a.asset_id}")
    perms = tuple(x for x in p.permissions if x.asset_id != a.asset_id)
    if a.level == "user":
        perms = (*perms, Permission(asset_id=a.asset_id, level=AccessLevel.USER))
    perms = tuple(sorted(perms, key=lambda x: x.asset_id))
    assets = c.assets
    # Admin rights on the asset also mean local-admin membership: dropping admin drops that too.
    asset = c.asset(a.asset_id)
    if asset is not None and p.id in asset.security_config.local_admins:
        sc = asset.security_config.model_copy(
            update={"local_admins": tuple(x for x in asset.security_config.local_admins if x != p.id)}
        )
        assets = _replace(assets, asset.model_copy(update={"security_config": sc}))
    return c.model_copy(
        update={
            "principals": _replace(c.principals, p.model_copy(update={"permissions": perms})),
            "assets": assets,
        }
    )
