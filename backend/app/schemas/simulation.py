"""Simulation result schemas. Everything here is computed by the deterministic engine."""

from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.i18n import Message


class ScenarioId(StrEnum):
    credential_compromise = "credential_compromise"
    lateral_movement = "lateral_movement"
    privilege_escalation = "privilege_escalation"
    sensitive_data_exposure = "sensitive_data_exposure"
    outdated_service_exploitation = "outdated_service_exploitation"


class PathStep(BaseModel):
    id: str = Field(description="Stable step id, e.g. P1.S2")
    source: str = Field(serialization_alias="from", validation_alias="from")
    to: str
    from_asset: str | None
    to_asset: str | None
    via: list[str] = Field(default_factory=list, description="Firewalls traversed (reachability steps)")
    technique: str
    vuln_id: str | None
    p: float
    reason: Message
    mitre: list[str]

    model_config = ConfigDict(populate_by_name=True, extra="forbid")


class AttackPath(BaseModel):
    id: str
    goal: str
    goal_label: Message
    steps: list[PathStep]
    likelihood: float
    impact: float
    risk: float
    assets: list[str] = Field(description="Ordered asset ids the path touches (incl. firewalls traversed)")


class Chokepoint(BaseModel):
    vuln_id: str
    action_id: str
    delta_score: float
    score_after: float


class Finding(BaseModel):
    id: str
    vuln_id: str
    title: Message
    kind: str
    severity: str
    asset_id: str | None
    principal_id: str | None
    cvss: float
    cve: str | None
    cve_illustrative: bool
    path_count: int
    delta_score: float
    mitre: list[str]


class ResidualFinding(BaseModel):
    """A finding still present in the model that no reachable attack edge uses in this scenario.

    It does not change the score (by design), but it is residual risk: a later change elsewhere can make it
    exploitable again. reason = "unreachable" (an attack edge carries it but the attacker cannot get there)
    or "not_in_scenario" (no technique of this scenario uses it).
    """

    vuln_id: str
    title: Message
    kind: str
    severity: str
    asset_id: str | None
    principal_id: str | None
    cvss: float
    reason: str


class TimelineEvent(BaseModel):
    index: int
    phase: str = Field(description="recon | exploit | credential | escalate | pivot | exfil")
    node: str
    asset_id: str | None
    from_asset: str | None
    technique: str
    vuln_id: str | None
    p: float
    cumulative_likelihood: float
    on_primary_path: bool
    label: Message


class AssetRisk(BaseModel):
    asset_id: str
    risk_score: float
    state: str = Field(description="compromised | reachable | unreached")
    best_privilege: str | None


class SimulationResult(BaseModel):
    engine_version: str
    scenario: ScenarioId
    scenario_label: str
    twin_id: str
    revision: int
    params: dict[str, str]
    entry: str
    goals: list[str]
    score: float
    p_breach: float
    total_assets: int
    reachable_assets: list[str]
    compromised_assets: list[str]
    blast_radius: float
    asset_risks: list[AssetRisk]
    paths: list[AttackPath]
    primary_path: AttackPath | None
    chokepoints: list[Chokepoint]
    critical_findings: list[Finding]
    residual_findings: list[ResidualFinding] = Field(default_factory=list)
    replay_timeline: list[TimelineEvent]
    graph_stats: dict[str, int]
    result_hash: str = ""


class SimulationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    twin_id: str
    scenario: ScenarioId
    revision: int | None = Field(default=None, description="Defaults to the twin's head revision")
    params: dict[str, str] = Field(default_factory=dict)


class SimulationRunOut(BaseModel):
    id: str
    twin_id: str
    revision: int
    scenario: ScenarioId
    params: dict[str, str]
    created_at: str
    result_hash: str
    score: float
    result: SimulationResult


class SimulationSummary(BaseModel):
    id: str
    twin_id: str
    revision: int
    scenario: ScenarioId
    created_at: str
    score: float
    p_breach: float
    path_count: int
    blast_radius: float
    result_hash: str
