"""Typed remediation actions (discriminated union) and comparison output."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.i18n import Message
from app.schemas.twin import PasswordStrength, Zone


class _Action(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class RestrictPort(_Action):
    type: Literal["restrict_port"] = "restrict_port"
    asset_id: str
    port: int = Field(ge=1, le=65535)
    allow_from_zones: list[Zone] = Field(default_factory=lambda: [Zone.mgmt])

    def key(self) -> str:
        zones = ",".join(sorted(z.value for z in self.allow_from_zones))
        return f"restrict_port:{self.asset_id}:{self.port}:{zones}"


class EnforceMfa(_Action):
    type: Literal["enforce_mfa"] = "enforce_mfa"
    principal_id: str

    def key(self) -> str:
        return f"enforce_mfa:{self.principal_id}"


class SetPasswordPolicy(_Action):
    type: Literal["set_password_policy"] = "set_password_policy"
    principal_id: str
    policy: PasswordStrength = PasswordStrength.strong

    def key(self) -> str:
        return f"set_password_policy:{self.principal_id}:{self.policy.value}"


class ApplyPatch(_Action):
    type: Literal["apply_patch"] = "apply_patch"
    vuln_id: str

    def key(self) -> str:
        return f"apply_patch:{self.vuln_id}"


class ReducePermission(_Action):
    type: Literal["reduce_permission"] = "reduce_permission"
    principal_id: str
    asset_id: str
    level: Literal["none", "read", "write"] = "read"

    def key(self) -> str:
        return f"reduce_permission:{self.principal_id}:{self.asset_id}:{self.level}"


class SegmentZones(_Action):
    type: Literal["segment_zones"] = "segment_zones"
    zone_a: Zone
    zone_b: Zone

    def key(self) -> str:
        a, b = sorted((self.zone_a.value, self.zone_b.value))
        return f"segment_zones:{a}:{b}"


RemediationAction = Annotated[
    RestrictPort | EnforceMfa | SetPasswordPolicy | ApplyPatch | ReducePermission | SegmentZones,
    Field(discriminator="type"),
]


class Recommendation(BaseModel):
    id: str = Field(description="Stable action key, e.g. apply_patch:vuln-ssh-rce")
    action: RemediationAction
    title: Message
    rationale: Message
    fixes_vuln_ids: list[str]
    expected_delta_score: float
    expected_score_after: float
    severity: str


class RecommendationList(BaseModel):
    twin_id: str
    revision: int
    scenario: str
    baseline_score: float
    recommendations: list[Recommendation]


class ApplyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    twin_id: str
    scenario: str
    params: dict[str, str] = Field(default_factory=dict)
    actions: list[RemediationAction] = Field(min_length=1, max_length=20)
    note: str = Field(default="", max_length=300)


class PathRef(BaseModel):
    goal: str
    signature: list[str]
    likelihood_before: float
    likelihood_after: float | None
    risk_before: float
    risk_after: float | None


class AssetDelta(BaseModel):
    asset_id: str
    before: float
    after: float
    delta: float


class Comparison(BaseModel):
    twin_id: str
    scenario: str
    before_revision: int
    after_revision: int
    before_simulation_id: str
    after_simulation_id: str
    before_score: float
    after_score: float
    score_delta: float
    blocked_paths: list[PathRef]
    reduced_paths: list[PathRef]
    new_paths: list[PathRef]
    per_asset_delta: list[AssetDelta]
    applied_actions: list[RemediationAction]
    changes: list[Message]
