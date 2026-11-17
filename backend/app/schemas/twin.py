"""Pydantic schemas for the virtual infrastructure model (one immutable revision snapshot)."""

from __future__ import annotations

import ipaddress
import re
from enum import StrEnum
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas.i18n import Message

ID_PATTERN = r"^[a-z0-9][a-z0-9._-]{0,62}$"
VERSION_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._+:~-]{0,39}$")

EntityId = Annotated[str, Field(pattern=ID_PATTERN, description="lowercase id: a-z 0-9 . _ -")]


class Zone(StrEnum):
    internet = "internet"
    dmz = "dmz"
    internal = "internal"
    data = "data"
    mgmt = "mgmt"


class AssetType(StrEnum):
    internet_gateway = "internet_gateway"
    firewall = "firewall"
    web_server = "web_server"
    app_server = "app_server"
    db_server = "db_server"
    identity_server = "identity_server"
    employee_ws = "employee_ws"
    admin_ws = "admin_ws"


class Proto(StrEnum):
    tcp = "tcp"
    udp = "udp"


class PasswordStrength(StrEnum):
    weak = "weak"
    medium = "medium"
    strong = "strong"


class Privilege(StrEnum):
    user = "user"
    admin = "admin"
    domain_admin = "domain_admin"


class PermissionLevel(StrEnum):
    read = "read"
    write = "write"
    admin = "admin"


class ConnectionKind(StrEnum):
    network = "network"
    trust = "trust"
    permission = "permission"


class RuleAction(StrEnum):
    allow = "allow"
    deny = "deny"


class VulnKind(StrEnum):
    remote_service = "remote_service"
    weak_credential = "weak_credential"
    local_privesc = "local_privesc"
    misconfig = "misconfig"
    excessive_permission = "excessive_permission"
    outdated_software = "outdated_software"


class RemediationType(StrEnum):
    restrict_port = "restrict_port"
    enforce_mfa = "enforce_mfa"
    set_password_policy = "set_password_policy"
    apply_patch = "apply_patch"
    reduce_permission = "reduce_permission"
    segment_zones = "segment_zones"


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class OpenPort(_Strict):
    port: int = Field(ge=1, le=65535)
    proto: Proto = Proto.tcp
    service: str = Field(min_length=1, max_length=40)
    version: str = Field(default="", max_length=40)
    exposed_to_zones: list[Zone] = Field(
        default_factory=list, description="Host-level allowlist of source zones. Empty = any zone."
    )

    @field_validator("version")
    @classmethod
    def _version(cls, v: str) -> str:
        if v and not VERSION_PATTERN.match(v):
            raise ValueError(f"invalid version string '{v}' (letters, digits and . _ + : ~ - only)")
        return v


class Software(_Strict):
    name: str = Field(min_length=1, max_length=60)
    version: str = Field(min_length=1, max_length=40)
    eol: bool = False

    @field_validator("version")
    @classmethod
    def _version(cls, v: str) -> str:
        if not VERSION_PATTERN.match(v):
            raise ValueError(f"invalid version string '{v}' (letters, digits and . _ + : ~ - only)")
        return v


class SecurityConfig(_Strict):
    mfa_enabled: bool = False
    password_policy: PasswordStrength = PasswordStrength.medium
    edr: bool = False
    disk_encryption: bool = False
    local_admin_users: list[str] = Field(default_factory=list)


class Position(_Strict):
    x: float = 0.0
    y: float = 0.0


class Asset(_Strict):
    id: EntityId
    name: str = Field(min_length=1, max_length=80)
    ip: str
    asset_type: AssetType
    os: str = Field(default="", max_length=60)
    zone: Zone
    open_ports: list[OpenPort] = Field(default_factory=list)
    software: list[Software] = Field(default_factory=list)
    vulnerability_ids: list[str] = Field(default_factory=list)
    security_config: SecurityConfig = Field(default_factory=SecurityConfig)
    criticality: int = Field(ge=1, le=5)
    data_sensitivity: int = Field(ge=0, le=3)
    risk_score: float | None = Field(
        default=None, description="Computed by the engine. Ignored on input; never user-entered."
    )
    position: Position = Field(default_factory=Position)

    @field_validator("ip")
    @classmethod
    def _ip(cls, v: str) -> str:
        try:
            ipaddress.IPv4Address(v)
        except ValueError as exc:
            raise ValueError(f"'{v}' is not a valid IPv4 address") from exc
        return v

    @model_validator(mode="after")
    def _unique_ports(self) -> Asset:
        seen: set[tuple[int, str]] = set()
        for p in self.open_ports:
            key = (p.port, p.proto.value)
            if key in seen:
                raise ValueError(f"duplicate open port {p.proto.value}/{p.port} on asset '{self.id}'")
            seen.add(key)
        self.risk_score = None
        return self

    def port(self, number: int) -> OpenPort | None:
        for p in self.open_ports:
            if p.port == number:
                return p
        return None


class Connection(_Strict):
    id: EntityId
    source: str
    target: str
    kind: ConnectionKind = ConnectionKind.network
    ports: list[int] = Field(default_factory=list, description="Ports allowed over this link. Empty = any.")
    description: str = Field(default="", max_length=200)
    principal_id: str | None = Field(
        default=None, description="For trust edges: the principal whose token/keytab backs the trust."
    )

    @model_validator(mode="after")
    def _no_self(self) -> Connection:
        if self.source == self.target:
            raise ValueError(f"connection '{self.id}' connects '{self.source}' to itself")
        return self


class Permission(_Strict):
    asset_id: str
    level: PermissionLevel


class Principal(_Strict):
    id: EntityId
    name: str = Field(min_length=1, max_length=80)
    kind: str = Field(default="user", pattern=r"^(user|service)$")
    privilege: Privilege = Privilege.user
    credential_strength: PasswordStrength = PasswordStrength.medium
    mfa: bool = False
    logged_on_assets: list[str] = Field(default_factory=list)
    permissions: list[Permission] = Field(default_factory=list)


class FirewallRule(_Strict):
    id: EntityId
    firewall_id: str
    order: int = Field(ge=0, le=100000)
    src_zone: Zone | None = None
    src_cidr: str | None = None
    dst_asset: str | None = None
    dst_zone: Zone | None = None
    port: int | None = Field(default=None, ge=1, le=65535, description="None = any port")
    action: RuleAction
    description: str = Field(default="", max_length=200)

    @model_validator(mode="after")
    def _shape(self) -> FirewallRule:
        if (self.src_zone is None) == (self.src_cidr is None):
            raise ValueError(f"rule '{self.id}': exactly one of src_zone or src_cidr is required")
        if (self.dst_asset is None) == (self.dst_zone is None):
            raise ValueError(f"rule '{self.id}': exactly one of dst_asset or dst_zone is required")
        if self.src_cidr is not None:
            try:
                ipaddress.IPv4Network(self.src_cidr, strict=False)
            except ValueError as exc:
                raise ValueError(f"rule '{self.id}': '{self.src_cidr}' is not a valid IPv4 CIDR") from exc
        return self


class Vulnerability(_Strict):
    id: EntityId
    title: str = Field(min_length=1, max_length=160)
    title_i18n: Message | None = Field(
        default=None, description="Translatable title (seed/catalog). Dropped by the API when `title` is edited."
    )
    cve: str | None = Field(default=None, pattern=r"^CVE-\d{4}-\d{4,7}$")
    cve_illustrative: bool = Field(default=True, description="Seed CVE ids are illustrative only.")
    cvss: float = Field(ge=0, le=10)
    exploit_maturity: float = Field(ge=0, le=1)
    kind: VulnKind
    affected_asset: str | None = None
    affected_port: int | None = Field(default=None, ge=1, le=65535)
    affected_principal: str | None = None
    grants_privilege: str = Field(default="user", pattern=r"^(user|admin)$")
    fixed_version: str | None = Field(default=None, max_length=40, description="Version applied by patching")
    mitre_techniques: list[str] = Field(default_factory=list)
    fixed_by_remediation_types: list[RemediationType] = Field(default_factory=list)
    description: str = Field(default="", max_length=600)

    @field_validator("mitre_techniques")
    @classmethod
    def _mitre(cls, v: list[str]) -> list[str]:
        for t in v:
            if not re.match(r"^T\d{4}(\.\d{3})?$", t):
                raise ValueError(f"'{t}' is not a MITRE ATT&CK technique id (e.g. T1110 or T1558.003)")
        return v


class ZonePair(_Strict):
    a: Zone
    b: Zone

    def key(self) -> tuple[str, str]:
        x, y = sorted((self.a.value, self.b.value))
        return (x, y)


class TwinSnapshot(_Strict):
    """Everything the engine needs. One immutable revision."""

    organization: str = Field(default="", max_length=120)
    assets: list[Asset] = Field(default_factory=list)
    connections: list[Connection] = Field(default_factory=list)
    principals: list[Principal] = Field(default_factory=list)
    firewall_rules: list[FirewallRule] = Field(default_factory=list)
    vulnerabilities: list[Vulnerability] = Field(default_factory=list)
    segmented_zones: list[ZonePair] = Field(default_factory=list)

    @model_validator(mode="after")
    def _referential_integrity(self) -> TwinSnapshot:
        errors: list[str] = []
        asset_ids = [a.id for a in self.assets]
        aset = set(asset_ids)
        if len(aset) != len(asset_ids):
            errors.append("duplicate asset ids")
        pset = {p.id for p in self.principals}
        if len(pset) != len(self.principals):
            errors.append("duplicate principal ids")
        vset = {v.id for v in self.vulnerabilities}
        if len(vset) != len(self.vulnerabilities):
            errors.append("duplicate vulnerability ids")
        if len({c.id for c in self.connections}) != len(self.connections):
            errors.append("duplicate connection ids")
        if len({r.id for r in self.firewall_rules}) != len(self.firewall_rules):
            errors.append("duplicate firewall rule ids")
        for c in self.connections:
            for end in (c.source, c.target):
                if end not in aset:
                    errors.append(f"connection '{c.id}' references unknown asset '{end}'")
            if c.principal_id is not None and c.principal_id not in pset:
                errors.append(f"connection '{c.id}' references unknown principal '{c.principal_id}'")
        types = {a.id: a.asset_type for a in self.assets}
        for r in self.firewall_rules:
            if r.firewall_id not in aset:
                errors.append(f"firewall rule '{r.id}' references unknown firewall '{r.firewall_id}'")
            elif types[r.firewall_id] != AssetType.firewall:
                errors.append(f"firewall rule '{r.id}': asset '{r.firewall_id}' is not a firewall")
            if r.dst_asset is not None and r.dst_asset not in aset:
                errors.append(f"firewall rule '{r.id}' references unknown asset '{r.dst_asset}'")
        for p in self.principals:
            for a in p.logged_on_assets:
                if a not in aset:
                    errors.append(f"principal '{p.id}' logged on unknown asset '{a}'")
            for perm in p.permissions:
                if perm.asset_id not in aset:
                    errors.append(f"principal '{p.id}' has permission on unknown asset '{perm.asset_id}'")
        for v in self.vulnerabilities:
            if v.affected_asset is not None and v.affected_asset not in aset:
                errors.append(f"vulnerability '{v.id}' references unknown asset '{v.affected_asset}'")
            if v.affected_principal is not None and v.affected_principal not in pset:
                errors.append(f"vulnerability '{v.id}' references unknown principal '{v.affected_principal}'")
        for asset in self.assets:
            for vid in asset.vulnerability_ids:
                if vid not in vset:
                    errors.append(f"asset '{asset.id}' lists unknown vulnerability '{vid}'")
        if errors:
            raise ValueError("; ".join(errors))
        return self

    # convenience lookups -------------------------------------------------
    def asset(self, asset_id: str) -> Asset | None:
        return next((a for a in self.assets if a.id == asset_id), None)

    def principal(self, principal_id: str) -> Principal | None:
        return next((p for p in self.principals if p.id == principal_id), None)

    def vuln(self, vuln_id: str) -> Vulnerability | None:
        return next((v for v in self.vulnerabilities if v.id == vuln_id), None)
