"""Domain model of a twin revision.

A revision's content is one immutable, validated :class:`TwinContent` snapshot. Every edit or
remediation produces a new snapshot (and a new revision); nothing is mutated in place.

Truth lives in exactly one place:
- vulnerabilities reference their asset (``Vulnerability.asset_id``); ``Asset.vulnerability_ids``
  is derived for the API;
- principal permissions live on the principal; "permission" connections are derived views.
"""

from __future__ import annotations

import ipaddress
import re
from enum import StrEnum
from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from cybertwin.domain.canonical import canonical_json, sha256_hex

ID_PATTERN = r"^[a-z0-9][a-z0-9._-]{0,63}$"
EntityId = Annotated[str, Field(pattern=ID_PATTERN)]


class Frozen(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


class AssetType(StrEnum):
    INTERNET_GATEWAY = "internet_gateway"
    FIREWALL = "firewall"
    WEB_SERVER = "web_server"
    APP_SERVER = "app_server"
    DB_SERVER = "db_server"
    IDENTITY_SERVER = "identity_server"
    EMPLOYEE_WS = "employee_ws"
    ADMIN_WS = "admin_ws"


class Zone(StrEnum):
    INTERNET = "internet"
    DMZ = "dmz"
    INTERNAL = "internal"
    DATA = "data"
    MGMT = "mgmt"


class Strength(StrEnum):
    WEAK = "weak"
    MEDIUM = "medium"
    STRONG = "strong"


class Privilege(StrEnum):
    USER = "user"
    ADMIN = "admin"
    DOMAIN_ADMIN = "domain_admin"


class AccessLevel(StrEnum):
    USER = "user"
    ADMIN = "admin"


class PrincipalKind(StrEnum):
    USER = "user"
    SERVICE = "service"


class ConnectionKind(StrEnum):
    NETWORK = "network"
    TRUST = "trust"
    PERMISSION = "permission"  # derived from principal permissions; never stored


class Proto(StrEnum):
    TCP = "tcp"
    UDP = "udp"


class RuleAction(StrEnum):
    ALLOW = "allow"
    DENY = "deny"


class VulnKind(StrEnum):
    REMOTE_EXPLOIT = "remote_exploit"
    LOCAL_PRIVESC = "local_privesc"


class ExploitMaturity(StrEnum):
    UNPROVEN = "unproven"
    POC = "poc"
    FUNCTIONAL = "functional"
    HIGH = "high"


class OpenPort(Frozen):
    port: int = Field(ge=1, le=65535)
    proto: Proto = Proto.TCP
    service: str = Field(min_length=1, max_length=64)
    version: str = Field(default="", max_length=64)


class Software(Frozen):
    name: str = Field(min_length=1, max_length=64)
    version: str = Field(min_length=1, max_length=64)
    eol: bool = False


class SecurityConfig(Frozen):
    mfa: bool = False
    password_policy: Strength = Strength.MEDIUM
    edr: bool = False
    local_admins: tuple[EntityId, ...] = ()


class Asset(Frozen):
    id: EntityId
    name: str = Field(min_length=1, max_length=80)
    ip: str
    type: AssetType
    os: str = Field(default="", max_length=80)
    zone: Zone
    open_ports: tuple[OpenPort, ...] = ()
    software: tuple[Software, ...] = ()
    security_config: SecurityConfig = SecurityConfig()
    criticality: int = Field(ge=1, le=5)
    data_sensitivity: int = Field(ge=0, le=3)

    @field_validator("ip")
    @classmethod
    def _ipv4(cls, v: str) -> str:
        try:
            ipaddress.IPv4Address(v)
        except ValueError as exc:
            raise ValueError("invalid_ipv4") from exc
        return v

    @model_validator(mode="after")
    def _unique_ports(self) -> Self:
        keys = [(p.port, p.proto) for p in self.open_ports]
        if len(keys) != len(set(keys)):
            raise ValueError("duplicate_port")
        return self


class Connection(Frozen):
    """A stored edge between two assets.

    ``network``: an undirected link used for routing (traffic crosses firewalls on the route).
    ``trust``: directed, ``target`` trusts ``source`` (e.g. delegation); enables trust abuse.
    """

    id: EntityId
    source: EntityId
    target: EntityId
    kind: Literal[ConnectionKind.NETWORK, ConnectionKind.TRUST]
    label: str = Field(default="", max_length=80)

    @model_validator(mode="after")
    def _no_self_loop(self) -> Self:
        if self.source == self.target:
            raise ValueError("self_loop")
        return self


class Permission(Frozen):
    asset_id: EntityId
    level: AccessLevel


class Principal(Frozen):
    id: EntityId
    name: str = Field(min_length=1, max_length=80)
    kind: PrincipalKind
    privilege: Privilege
    credential_strength: Strength
    mfa: bool = False
    kerberoastable: bool = False
    logged_on_assets: tuple[EntityId, ...] = ()
    permissions: tuple[Permission, ...] = ()


_ENDPOINT = re.compile(r"^(any|zone:[a-z]+|asset:[a-z0-9][a-z0-9._-]{0,63})$")


class FirewallRule(Frozen):
    """Ordered rule on one firewall. First match wins; no match means deny."""

    id: EntityId
    firewall_id: EntityId
    order: int = Field(ge=0, le=100_000)
    action: RuleAction
    src: str = "any"
    dst: str = "any"
    port: int | None = Field(default=None, ge=1, le=65535)
    proto: Proto | None = None
    description: str = Field(default="", max_length=120)

    @field_validator("src", "dst")
    @classmethod
    def _endpoint(cls, v: str) -> str:
        if not _ENDPOINT.match(v):
            raise ValueError("invalid_endpoint")
        if v.startswith("zone:") and v[5:] not in {z.value for z in Zone}:
            raise ValueError("invalid_zone")
        return v


class FixRef(Frozen):
    """How this vulnerability is fixed: the remediation action that removes it."""

    action: Literal["apply_patch"] = "apply_patch"
    software: str = Field(default="", max_length=64)
    version: str = Field(default="", max_length=64)


class Vulnerability(Frozen):
    id: EntityId
    cve: str = Field(pattern=r"^CVE-\d{4}-\d{4,7}$")
    title: str = Field(min_length=1, max_length=120)
    cvss: float = Field(ge=0.0, le=10.0)
    exploit_maturity: ExploitMaturity
    kind: VulnKind
    asset_id: EntityId
    port: int | None = Field(default=None, ge=1, le=65535)
    grants: AccessLevel = AccessLevel.USER
    attack_ids: tuple[str, ...] = ()
    fixed_by: FixRef = FixRef()
    illustrative: bool = True

    @model_validator(mode="after")
    def _port_rules(self) -> Self:
        if self.kind is VulnKind.REMOTE_EXPLOIT and self.port is None:
            raise ValueError("remote_exploit_needs_port")
        if self.kind is VulnKind.LOCAL_PRIVESC and self.grants is not AccessLevel.ADMIN:
            raise ValueError("privesc_grants_admin")
        return self


class Policy(Frozen):
    """Twin-wide policy. ``segmented_zones`` holds sorted zone pairs that are segmented."""

    segmented_zones: tuple[tuple[Zone, Zone], ...] = ()

    @field_validator("segmented_zones")
    @classmethod
    def _canonical_pairs(cls, v: tuple[tuple[Zone, Zone], ...]) -> tuple[tuple[Zone, Zone], ...]:
        pairs: set[tuple[Zone, Zone]] = set()
        for a, b in v:
            if a == b:
                raise ValueError("segment_same_zone")
            pairs.add((a, b) if a.value < b.value else (b, a))
        return tuple(sorted(pairs))

    def is_segmented(self, a: Zone, b: Zone) -> bool:
        pair = (a, b) if a.value < b.value else (b, a)
        return pair in self.segmented_zones


class TwinContent(Frozen):
    """The full, validated content of one revision."""

    assets: tuple[Asset, ...] = ()
    connections: tuple[Connection, ...] = ()
    principals: tuple[Principal, ...] = ()
    firewall_rules: tuple[FirewallRule, ...] = ()
    vulnerabilities: tuple[Vulnerability, ...] = ()
    policy: Policy = Policy()

    @model_validator(mode="after")
    def _integrity(self) -> Self:
        errors = integrity_errors(self)
        if errors:
            raise ValueError("; ".join(errors))
        return self

    def normalized(self) -> TwinContent:
        """Same content with every collection sorted by id: the canonical stored form."""
        return TwinContent(
            assets=tuple(sorted(self.assets, key=lambda a: a.id)),
            connections=tuple(sorted(self.connections, key=lambda c: c.id)),
            principals=tuple(sorted(self.principals, key=lambda p: p.id)),
            firewall_rules=tuple(sorted(self.firewall_rules, key=lambda r: (r.firewall_id, r.order, r.id))),
            vulnerabilities=tuple(sorted(self.vulnerabilities, key=lambda v: v.id)),
            policy=self.policy,
        )

    def principal(self, principal_id: str) -> Principal | None:
        return next((p for p in self.principals if p.id == principal_id), None)

    def canonical_json(self) -> str:
        return canonical_json(self.normalized().model_dump(mode="json"))

    def content_hash(self) -> str:
        return sha256_hex(self.canonical_json())

    def asset(self, asset_id: str) -> Asset | None:
        return next((a for a in self.assets if a.id == asset_id), None)


def _dupes(ids: list[str]) -> list[str]:
    seen: set[str] = set()
    out: set[str] = set()
    for i in ids:
        if i in seen:
            out.add(i)
        seen.add(i)
    return sorted(out)


def integrity_errors(c: TwinContent) -> list[str]:
    """Referential integrity checks. Each error is a stable ``code:detail`` string."""
    errs: list[str] = []
    asset_ids = {a.id for a in c.assets}
    principal_ids = {p.id for p in c.principals}
    for kind, ids in (
        ("asset", [a.id for a in c.assets]),
        ("connection", [x.id for x in c.connections]),
        ("principal", [p.id for p in c.principals]),
        ("firewall_rule", [r.id for r in c.firewall_rules]),
        ("vulnerability", [v.id for v in c.vulnerabilities]),
    ):
        errs.extend(f"duplicate_id:{kind}:{d}" for d in _dupes(ids))
    ips = [a.ip for a in c.assets if a.type is not AssetType.INTERNET_GATEWAY]
    errs.extend(f"duplicate_ip:{d}" for d in _dupes(ips))
    for x in c.connections:
        for end in (x.source, x.target):
            if end not in asset_ids:
                errs.append(f"unknown_asset:connection:{x.id}:{end}")
    keys: list[str] = []
    for x in c.connections:
        ends = sorted((x.source, x.target)) if x.kind is ConnectionKind.NETWORK else [x.source, x.target]
        keys.append("|".join([x.kind.value, *ends]))
    errs.extend(f"duplicate_connection:{d}" for d in _dupes(keys))
    for p in c.principals:
        for on in p.logged_on_assets:
            if on not in asset_ids:
                errs.append(f"unknown_asset:principal:{p.id}:{on}")
        for perm in p.permissions:
            if perm.asset_id not in asset_ids:
                errs.append(f"unknown_asset:principal:{p.id}:{perm.asset_id}")
    for asset in c.assets:
        for adm in asset.security_config.local_admins:
            if adm not in principal_ids:
                errs.append(f"unknown_principal:asset:{asset.id}:{adm}")
    firewalls = {a.id for a in c.assets if a.type is AssetType.FIREWALL}
    for r in c.firewall_rules:
        if r.firewall_id not in firewalls:
            errs.append(f"unknown_firewall:rule:{r.id}:{r.firewall_id}")
        for end in (r.src, r.dst):
            if end.startswith("asset:") and end[6:] not in asset_ids:
                errs.append(f"unknown_asset:rule:{r.id}:{end[6:]}")
    orders = [f"{r.firewall_id}#{r.order}" for r in c.firewall_rules]
    errs.extend(f"duplicate_rule_order:{d}" for d in _dupes(orders))
    for v in c.vulnerabilities:
        target = c.asset(v.asset_id)
        if target is None:
            errs.append(f"unknown_asset:vulnerability:{v.id}:{v.asset_id}")
        elif v.port is not None and v.port not in {p.port for p in target.open_ports}:
            errs.append(f"port_not_open:vulnerability:{v.id}:{v.port}")
    gateways = [a.id for a in c.assets if a.type is AssetType.INTERNET_GATEWAY]
    if len(gateways) > 1:
        errs.append("multiple_internet_gateways")
    return errs
