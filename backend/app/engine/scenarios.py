"""Scenario definitions: entry state + goal set + allowed technique set."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from app.core.errors import DomainError
from app.engine.constants import ALL_TECHNIQUES, LEVEL_FACTOR
from app.engine.graph import (
    DOMAIN_ADMIN,
    ENTRY_INTERNET,
    VulnFilter,
    cred_node,
    data_node,
    state_node,
)
from app.schemas.i18n import Message, msg
from app.schemas.simulation import ScenarioId
from app.schemas.twin import Asset, AssetType, Privilege, TwinSnapshot, Vulnerability, VulnKind


@dataclass(frozen=True)
class Goal:
    id: str
    label: Message
    nodes: tuple[tuple[str, float], ...]  # (graph node, impact)


@dataclass(frozen=True)
class ScenarioSpec:
    id: ScenarioId
    label: str
    entry: str  # "internet" | "foothold"
    techniques: frozenset[str]
    goals: Callable[[TwinSnapshot, str | None], list[Goal]]
    vuln_filter: VulnFilter | None = None
    description: str = ""


def impact(asset: Asset) -> float:
    """(criticality/5) * (0.5 + data_sensitivity/6). In [0.1, 1.0]."""
    return round((asset.criticality / 5) * (0.5 + asset.data_sensitivity / 6), 6)


def cred_impact(snap: TwinSnapshot, principal_id: str) -> float:
    p = snap.principal(principal_id)
    if p is None:
        return 0.0
    if p.privilege == Privilege.domain_admin:
        return 1.0
    best = 0.1
    for perm in p.permissions:
        a = snap.asset(perm.asset_id)
        if a is not None:
            best = max(best, impact(a) * LEVEL_FACTOR[perm.level.value])
    return round(best, 6)


def _targets(snap: TwinSnapshot) -> list[Asset]:
    return sorted((a for a in snap.assets if a.asset_type != AssetType.internet_gateway), key=lambda a: a.id)


def goals_data(snap: TwinSnapshot, _foothold: str | None) -> list[Goal]:
    return [
        Goal(data_node(a.id), msg("goal.data", asset=a.name), ((data_node(a.id), impact(a)),))
        for a in _targets(snap)
        if a.data_sensitivity >= 2
    ]


def goals_cred(snap: TwinSnapshot, _foothold: str | None) -> list[Goal]:
    return [
        Goal(cred_node(p.id), msg("goal.cred", principal=p.name), ((cred_node(p.id), cred_impact(snap, p.id)),))
        for p in sorted(snap.principals, key=lambda p: p.id)
    ]


def goals_privesc(snap: TwinSnapshot, _foothold: str | None) -> list[Goal]:
    goals = [Goal(DOMAIN_ADMIN, msg("goal.domain_admin"), ((DOMAIN_ADMIN, 1.0),))]
    for a in _targets(snap):
        if a.asset_type == AssetType.identity_server:
            goals.append(
                Goal(
                    state_node(a.id, "admin"),
                    msg("goal.idp_admin", asset=a.name),
                    ((state_node(a.id, "admin"), impact(a)),),
                )
            )
    return goals


def goals_compromise(snap: TwinSnapshot, foothold: str | None) -> list[Goal]:
    out = []
    for a in _targets(snap):
        if a.id == foothold:
            continue
        imp = impact(a)
        out.append(
            Goal(
                f"PWN:{a.id}",
                msg("goal.pwn", asset=a.name),
                ((state_node(a.id, "admin"), imp), (state_node(a.id, "user"), round(imp * 0.6, 6))),
            )
        )
    return out


def outdated_only(v: Vulnerability, asset: Asset) -> bool:
    if v.kind == VulnKind.outdated_software:
        return True
    return v.kind == VulnKind.remote_service and any(s.eol for s in asset.software)


SCENARIOS: dict[ScenarioId, ScenarioSpec] = {
    ScenarioId.credential_compromise: ScenarioSpec(
        ScenarioId.credential_compromise,
        "Credential Compromise",
        "internet",
        frozenset({"brute_force", "credential_theft", "kerberoast", "credential_use"}),
        goals_cred,
        description="From the internet, obtain usable credentials of any principal.",
    ),
    ScenarioId.lateral_movement: ScenarioSpec(
        ScenarioId.lateral_movement,
        "Lateral Movement",
        "foothold",
        ALL_TECHNIQUES,
        goals_compromise,
        description="From a compromised foothold, how far can an attacker spread?",
    ),
    ScenarioId.privilege_escalation: ScenarioSpec(
        ScenarioId.privilege_escalation,
        "Privilege Escalation",
        "foothold",
        ALL_TECHNIQUES,
        goals_privesc,
        description="From a foothold, reach domain admin or admin on an identity server.",
    ),
    ScenarioId.sensitive_data_exposure: ScenarioSpec(
        ScenarioId.sensitive_data_exposure,
        "Sensitive Data Exposure",
        "internet",
        ALL_TECHNIQUES,
        goals_data,
        description="From the internet, read data on assets with sensitivity >= 2.",
    ),
    ScenarioId.outdated_service_exploitation: ScenarioSpec(
        ScenarioId.outdated_service_exploitation,
        "Outdated Service Exploitation",
        "internet",
        frozenset({"remote_exploit"}),
        goals_compromise,
        vuln_filter=outdated_only,
        description="From the internet, exploit only outdated / end-of-life services.",
    ),
}


@dataclass(frozen=True)
class ResolvedEntry:
    node: str
    asset_id: str | None
    params: dict[str, str]


def resolve_entry(spec: ScenarioSpec, snap: TwinSnapshot, params: dict[str, str]) -> ResolvedEntry:
    allowed = {"foothold", "foothold_privilege"} if spec.entry == "foothold" else set()
    unknown = sorted(set(params) - allowed)
    if unknown:
        raise DomainError(
            "invalid_params",
            msg("err.scenario_params", scenario=spec.id.value, names=", ".join(unknown), count=len(unknown)),
            {"allowed": sorted(allowed)},
        )
    if spec.entry == "internet":
        gw = next(
            (a for a in sorted(snap.assets, key=lambda a: a.id) if a.asset_type == AssetType.internet_gateway),
            None,
        )
        return ResolvedEntry(ENTRY_INTERNET, gw.id if gw else None, {})
    foothold = params.get("foothold")
    if not foothold:
        ws = sorted(a.id for a in snap.assets if a.asset_type == AssetType.employee_ws)
        if not ws:
            ws = sorted(a.id for a in _targets(snap))
        if not ws:
            raise DomainError("invalid_params", msg("err.no_foothold"))
        foothold = ws[0]
    asset = snap.asset(foothold)
    if asset is None:
        raise DomainError("invalid_params", msg("err.foothold_missing", id=foothold))
    if asset.asset_type == AssetType.internet_gateway:
        raise DomainError("invalid_params", msg("err.foothold_internet"))
    priv = params.get("foothold_privilege", "user")
    if priv not in ("user", "admin"):
        raise DomainError("invalid_params", msg("err.foothold_privilege", value=priv))
    return ResolvedEntry(state_node(foothold, priv), foothold, {"foothold": foothold, "foothold_privilege": priv})
