"""Predefined attack scenarios: where the attacker starts and which states count as goals."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from cybertwin.domain.model import Asset, AssetType, TwinContent
from cybertwin.engine import constants as K
from cybertwin.engine.graph import DOMAIN_ADMIN, cred, data, priv

SCENARIOS = (
    "sensitive_data_exposure",
    "credential_compromise",
    "lateral_movement",
    "privilege_escalation",
    "outdated_service_exploitation",
)
FOOTHOLD_SCENARIOS = frozenset({"lateral_movement", "privilege_escalation"})


class ScenarioError(ValueError):
    def __init__(self, code: str, **params: Any) -> None:
        super().__init__(f"{code} {params}")
        self.code = code
        self.params = params


@dataclass(frozen=True)
class Goal:
    node: str
    kind: str  # data | credential | privilege | domain
    impact: float
    asset_id: str | None = None
    principal_id: str | None = None


@dataclass(frozen=True)
class ScenarioSpec:
    id: str
    entry_asset: str
    entry_node: str
    goals: tuple[Goal, ...]
    params: dict[str, Any]


def _hosts(c: TwinContent) -> list[Asset]:
    return [a for a in c.assets if a.type not in (AssetType.FIREWALL, AssetType.INTERNET_GATEWAY)]


def _internet(c: TwinContent) -> Asset:
    gw = next((a for a in c.assets if a.type is AssetType.INTERNET_GATEWAY), None)
    if gw is None:
        raise ScenarioError("scenario.no_internet_gateway")
    return gw


def _foothold(c: TwinContent, params: dict[str, Any]) -> Asset:
    fid = params.get("foothold")
    hosts = sorted(_hosts(c), key=lambda a: a.id)
    if fid is None:
        default = next((a for a in hosts if a.type is AssetType.EMPLOYEE_WS), None)
        if default is None:
            raise ScenarioError("scenario.foothold_required")
        return default
    asset = next((a for a in hosts if a.id == fid), None)
    if asset is None:
        raise ScenarioError("scenario.invalid_foothold", foothold=str(fid))
    return asset


def default_params(c: TwinContent, scenario: str) -> dict[str, Any]:
    if scenario in FOOTHOLD_SCENARIOS:
        return {"foothold": _foothold(c, {}).id}
    return {}


def build_scenario(c: TwinContent, scenario: str, params: dict[str, Any] | None = None) -> ScenarioSpec:
    params = dict(params or {})
    if scenario not in SCENARIOS:
        raise ScenarioError("scenario.unknown", scenario=scenario)
    unknown = sorted(set(params) - ({"foothold"} if scenario in FOOTHOLD_SCENARIOS else set()))
    if unknown:
        raise ScenarioError("scenario.unknown_param", param=unknown[0])
    hosts = sorted(_hosts(c), key=lambda a: a.id)
    goals: list[Goal] = []

    if scenario in FOOTHOLD_SCENARIOS:
        entry = _foothold(c, params)
        params = {"foothold": entry.id}
    else:
        entry = _internet(c)

    if scenario == "sensitive_data_exposure":
        goals = [
            Goal(data(a.id), "data", round(a.data_sensitivity / 3, K.ROUND), asset_id=a.id)
            for a in hosts
            if a.data_sensitivity >= 2
        ]
    elif scenario == "credential_compromise":
        goals = [
            Goal(cred(p.id), "credential", K.IMPACT_PRIVILEGE[p.privilege.value], principal_id=p.id)
            for p in sorted(c.principals, key=lambda p: p.id)
        ]
        goals.append(Goal(DOMAIN_ADMIN, "domain", 1.0))
    elif scenario == "lateral_movement":
        goals = [
            Goal(priv(a.id, "admin"), "privilege", round(a.criticality / 5, K.ROUND), asset_id=a.id)
            for a in hosts
            if a.id != entry.id and a.criticality >= 3
        ]
    elif scenario == "privilege_escalation":
        goals = [Goal(priv(entry.id, "admin"), "privilege", 0.6, asset_id=entry.id)]
        goals += [
            Goal(priv(a.id, "admin"), "privilege", 0.9, asset_id=a.id)
            for a in hosts
            if a.id != entry.id and a.type in (AssetType.IDENTITY_SERVER, AssetType.ADMIN_WS)
        ]
        goals.append(Goal(DOMAIN_ADMIN, "domain", 1.0))
    elif scenario == "outdated_service_exploitation":
        goals = [
            Goal(priv(a.id, "user"), "privilege", round(a.criticality / 5, K.ROUND), asset_id=a.id)
            for a in hosts
            if any(s.eol for s in a.software)
        ]

    goals.sort(key=lambda g: g.node)
    return ScenarioSpec(scenario, entry.id, priv(entry.id, "user"), tuple(goals), params)
