"""Recommendations (from chokepoint what-if analysis) and before/after comparison."""

from __future__ import annotations

from app.engine.simulate import (
    analyze,
    cross_zone_pairs,
    evaluate_candidates,
    path_signature,
    run_simulation,
    signature_likelihood,
)
from app.schemas.i18n import Message, msg
from app.schemas.remediation import (
    ApplyPatch,
    AssetDelta,
    Comparison,
    EnforceMfa,
    PathRef,
    Recommendation,
    RecommendationList,
    ReducePermission,
    RemediationAction,
    RestrictPort,
    SetPasswordPolicy,
)
from app.schemas.simulation import ScenarioId, SimulationResult
from app.schemas.twin import TwinSnapshot


def action_title(snap: TwinSnapshot, action: RemediationAction) -> Message:
    if isinstance(action, RestrictPort):
        return msg(
            "action.restrict_port",
            asset=action.asset_id,
            port=action.port,
            zones=[msg(f"zone.{z.value}") for z in action.allow_from_zones],
        )
    if isinstance(action, EnforceMfa):
        return msg("action.enforce_mfa", principal=action.principal_id)
    if isinstance(action, SetPasswordPolicy):
        return msg(
            "action.set_password_policy", principal=action.principal_id, policy=msg(f"strength.{action.policy.value}")
        )
    if isinstance(action, ApplyPatch):
        return msg("action.apply_patch", vuln=action.vuln_id)
    if isinstance(action, ReducePermission):
        return msg(
            "action.reduce_permission",
            principal=action.principal_id,
            asset=action.asset_id,
            level=msg(f"level.{action.level}"),
        )
    return msg("action.segment_zones", a=msg(f"zone.{action.zone_a.value}"), b=msg(f"zone.{action.zone_b.value}"))


def _severity(delta: float) -> str:
    return "critical" if delta >= 40 else "high" if delta >= 20 else "medium" if delta >= 5 else "low"


def build_recommendations(
    snap: TwinSnapshot, twin_id: str, revision: int, scenario: ScenarioId, params: dict[str, str]
) -> RecommendationList:
    base = run_simulation(snap, twin_id, revision, scenario, params, with_chokepoints=False)
    evals = evaluate_candidates(snap, scenario, base.params, base.score, cross_zone_pairs(snap, base.paths))
    recs: list[Recommendation] = []
    for ev in evals:
        vulns = ev.candidate.vuln_ids
        if vulns:
            rationale = msg("rec.addresses", ids=", ".join(vulns), before=base.score, after=ev.score_after)
        else:
            rationale = msg("rec.boundary", before=base.score, after=ev.score_after)
        recs.append(
            Recommendation(
                id=ev.candidate.key,
                action=ev.candidate.action,
                title=action_title(snap, ev.candidate.action),
                rationale=rationale,
                fixes_vuln_ids=vulns,
                expected_delta_score=ev.delta,
                expected_score_after=ev.score_after,
                severity=_severity(ev.delta),
            )
        )
    return RecommendationList(
        twin_id=twin_id,
        revision=revision,
        scenario=scenario.value,
        baseline_score=base.score,
        recommendations=recs,
    )


def compare_results(
    before_snap: TwinSnapshot,
    before: SimulationResult,
    after_snap: TwinSnapshot,
    after: SimulationResult,
    *,
    before_simulation_id: str,
    after_simulation_id: str,
    actions: list[RemediationAction],
    changes: list[Message],
) -> Comparison:
    an_after = analyze(after_snap, after.scenario, after.params)
    an_before = analyze(before_snap, before.scenario, before.params)
    blocked: list[PathRef] = []
    reduced: list[PathRef] = []
    before_sigs: set[tuple[str, ...]] = set()
    for p in before.paths:
        sig = path_signature(p)
        before_sigs.add(tuple(sig))
        goal_alive = an_after.goal_best.get(p.goal) is not None
        lik_after = signature_likelihood(an_after, sig) if goal_alive else None
        if lik_after is None:
            blocked.append(
                PathRef(
                    goal=p.goal,
                    signature=sig,
                    likelihood_before=p.likelihood,
                    likelihood_after=None,
                    risk_before=p.risk,
                    risk_after=None,
                )
            )
        elif lik_after < p.likelihood - 1e-9:
            reduced.append(
                PathRef(
                    goal=p.goal,
                    signature=sig,
                    likelihood_before=p.likelihood,
                    likelihood_after=lik_after,
                    risk_before=p.risk,
                    risk_after=round(lik_after * p.impact, 6),
                )
            )
    new: list[PathRef] = []
    for p in after.paths:
        sig = path_signature(p)
        if tuple(sig) in before_sigs or signature_likelihood(an_before, sig) is not None:
            continue
        new.append(
            PathRef(
                goal=p.goal,
                signature=sig,
                likelihood_before=0.0,
                likelihood_after=p.likelihood,
                risk_before=0.0,
                risk_after=p.risk,
            )
        )
    b_risk = {a.asset_id: a.risk_score for a in before.asset_risks}
    a_risk = {a.asset_id: a.risk_score for a in after.asset_risks}
    per_asset = [
        AssetDelta(
            asset_id=k,
            before=b_risk.get(k, 0.0),
            after=a_risk.get(k, 0.0),
            delta=round(a_risk.get(k, 0.0) - b_risk.get(k, 0.0), 2),
        )
        for k in sorted(set(b_risk) | set(a_risk))
    ]
    return Comparison(
        twin_id=after.twin_id,
        scenario=after.scenario.value,
        before_revision=before.revision,
        after_revision=after.revision,
        before_simulation_id=before_simulation_id,
        after_simulation_id=after_simulation_id,
        before_score=before.score,
        after_score=after.score,
        score_delta=round(after.score - before.score, 2),
        blocked_paths=blocked,
        reduced_paths=reduced,
        new_paths=new,
        per_asset_delta=per_asset,
        applied_actions=actions,
        changes=changes,
    )
