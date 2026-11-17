"""Run a scenario on a snapshot. Deterministic: same snapshot + scenario + params => same bytes."""

from __future__ import annotations

import hashlib
import json
import math
from dataclasses import dataclass
from itertools import islice, pairwise
from typing import Any

import networkx as nx

from app.engine.constants import ENGINE_VERSION, MAX_DEPTH, MAX_TIMELINE_EVENTS, PHASE, TOP_K
from app.engine.graph import ENTRY_INTERNET, AttackGraph, build_graph, node_asset
from app.engine.scenarios import SCENARIOS, Goal, ResolvedEntry, ScenarioSpec, resolve_entry
from app.i18n import vuln_title
from app.remediation.actions import apply_actions
from app.remediation.candidates import Candidate, generate_candidates
from app.schemas.simulation import (
    AssetRisk,
    AttackPath,
    Chokepoint,
    Finding,
    PathStep,
    ResidualFinding,
    ScenarioId,
    SimulationResult,
    TimelineEvent,
)
from app.schemas.twin import AssetType, TwinSnapshot

R6 = 6


def r6(x: float) -> float:
    return round(x, R6)


@dataclass
class Analysis:
    spec: ScenarioSpec
    entry: ResolvedEntry
    ag: AttackGraph
    goals: list[Goal]
    dist: dict[str, float]
    pred_paths: dict[str, list[str]]
    goal_best: dict[str, tuple[str, float, float] | None]  # goal id -> (node, likelihood, risk)
    p_breach: float
    score: float


def analyze(snap: TwinSnapshot, scenario: ScenarioId, params: dict[str, str]) -> Analysis:
    spec = SCENARIOS[scenario]
    entry = resolve_entry(spec, snap, params)
    extra = () if entry.node == ENTRY_INTERNET else (entry.node,)
    ag = build_graph(snap, spec.techniques, spec.vuln_filter, extra)
    if entry.node == ENTRY_INTERNET and entry.asset_id is None:
        dist: dict[str, float] = {ENTRY_INTERNET: 0.0}
        paths: dict[str, list[str]] = {ENTRY_INTERNET: [ENTRY_INTERNET]}
    else:
        dist, paths = nx.single_source_dijkstra(ag.g, entry.node, weight="w")
    goals = spec.goals(snap, entry.asset_id if spec.entry == "foothold" else None)
    goal_best: dict[str, tuple[str, float, float] | None] = {}
    survive = 1.0
    for goal in goals:
        best: tuple[str, float, float] | None = None
        for node, imp in goal.nodes:
            if node not in dist or node == entry.node:
                continue
            lik = math.exp(-dist[node])
            risk = lik * imp
            if best is None or (risk, best[0]) > (best[2], node):
                best = (node, lik, risk)
        goal_best[goal.id] = best
        if best is not None:
            survive *= 1.0 - best[2]
    p_breach = r6(1.0 - survive)
    score = round(100.0 * (1.0 - p_breach), 2)
    return Analysis(spec, entry, ag, goals, dist, paths, goal_best, p_breach, score)


def score_only(snap: TwinSnapshot, scenario: ScenarioId, params: dict[str, str]) -> float:
    return analyze(snap, scenario, params).score


# ---------------------------------------------------------------------------------------------
def _step(an: Analysis, u: str, v: str, idx: int, path_id: str) -> PathStep:
    e = an.ag.edge(u, v)
    from_asset = node_asset(u) if u != ENTRY_INTERNET else an.ag.entry_asset.get(ENTRY_INTERNET)
    return PathStep.model_validate(
        {
            "id": f"{path_id}.S{idx}",
            "from": u,
            "to": v,
            "from_asset": from_asset,
            "to_asset": node_asset(v),
            "via": list(e["via"]),
            "technique": e["technique"],
            "vuln_id": e["vuln_id"],
            "p": e["p"],
            "reason": e["reason"],
            "mitre": list(e["mitre"]),
        }
    )


def _path_assets(an: Analysis, nodes: list[str]) -> list[str]:
    out: list[str] = []
    start = an.entry.asset_id if an.entry.node != ENTRY_INTERNET else an.ag.entry_asset.get(ENTRY_INTERNET)
    if start:
        out.append(start)
    for u, v in pairwise(nodes):
        for fw in an.ag.edge(u, v)["via"]:
            if not out or out[-1] != fw:
                out.append(fw)
        a = node_asset(v)
        if a and (not out or out[-1] != a):
            out.append(a)
    return out


def enumerate_paths(an: Analysis, k: int = TOP_K) -> list[tuple[list[str], float, float, Goal, float]]:
    """Return [(nodes, likelihood, risk, goal, impact)] sorted by risk desc, signature asc."""
    found: dict[tuple[str, ...], tuple[list[str], float, float, Goal, float]] = {}
    g = an.ag.g
    for goal in an.goals:
        for node, imp in goal.nodes:
            if node not in an.dist or node == an.entry.node or imp <= 0:
                continue
            gen = nx.shortest_simple_paths(g, an.entry.node, node, weight="w")
            taken = 0
            for nodes in islice(gen, k * 4):
                if len(nodes) - 1 > MAX_DEPTH:
                    continue
                lik = 1.0
                for u, v in pairwise(nodes):
                    lik *= g.edges[u, v]["p"]
                lik = r6(lik)
                risk = r6(lik * imp)
                sig = tuple(nodes)
                if sig not in found or found[sig][2] < risk:
                    found[sig] = (list(nodes), lik, risk, goal, imp)
                taken += 1
                if taken >= k:
                    break
    ordered = sorted(found.values(), key=lambda t: (-t[2], -t[1], tuple(t[0])))
    return ordered[:k]


def _severity(cvss: float, delta: float) -> str:
    rank = ["low", "medium", "high", "critical"]
    a = 3 if cvss >= 9 else 2 if cvss >= 7 else 1 if cvss >= 4 else 0
    b = 3 if delta >= 40 else 2 if delta >= 20 else 1 if delta >= 5 else 0
    return rank[max(a, b)]


@dataclass
class CandidateEval:
    candidate: Candidate
    score_after: float
    delta: float


def evaluate_candidates(
    snap: TwinSnapshot,
    scenario: ScenarioId,
    params: dict[str, str],
    base_score: float,
    cross_zone_pairs: list[tuple[str, str]],
) -> list[CandidateEval]:
    evals: list[CandidateEval] = []
    for cand in generate_candidates(snap, cross_zone_pairs):
        new_snap, _ = apply_actions(snap, [cand.action])
        after = score_only(new_snap, scenario, params)
        evals.append(CandidateEval(cand, after, round(after - base_score, 2)))
    evals.sort(key=lambda e: (-e.delta, e.candidate.key))
    return evals


def cross_zone_pairs(snap: TwinSnapshot, paths: list[AttackPath]) -> list[tuple[str, str]]:
    zone = {a.id: a.zone.value for a in snap.assets}
    pairs: set[tuple[str, str]] = set()
    for p in paths:
        for s in p.steps:
            if s.from_asset and s.to_asset and s.from_asset in zone and s.to_asset in zone:
                za, zb = zone[s.from_asset], zone[s.to_asset]
                if za != zb:
                    x, y = sorted((za, zb))
                    pairs.add((x, y))
    return sorted(pairs)


def canonical_json(data: Any) -> str:
    return json.dumps(data, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def result_hash(result: SimulationResult) -> str:
    data = result.model_dump(mode="json", by_alias=True)
    data.pop("result_hash", None)
    return hashlib.sha256(canonical_json(data).encode("utf-8")).hexdigest()


def run_simulation(
    snap: TwinSnapshot,
    twin_id: str,
    revision: int,
    scenario: ScenarioId,
    params: dict[str, str] | None = None,
    with_chokepoints: bool = True,
) -> SimulationResult:
    params = dict(sorted((params or {}).items()))
    an = analyze(snap, scenario, params)
    g = an.ag.g

    # ---- paths
    raw = enumerate_paths(an)
    paths: list[AttackPath] = []
    for i, (nodes, lik, risk, goal, imp) in enumerate(raw, start=1):
        pid = f"P{i}"
        steps = [_step(an, u, v, j, pid) for j, (u, v) in enumerate(pairwise(nodes), 1)]
        paths.append(
            AttackPath(
                id=pid,
                goal=goal.id,
                goal_label=goal.label,
                steps=steps,
                likelihood=lik,
                impact=r6(imp),
                risk=risk,
                assets=_path_assets(an, nodes),
            )
        )
    primary = paths[0] if paths else None

    # ---- reachable / compromised assets
    targets = sorted(a.id for a in snap.assets if a.asset_type != AssetType.internet_gateway)
    best_priv: dict[str, str] = {}
    rank = {"network": 0, "user": 1, "admin": 2}
    for n in an.dist:
        a = node_asset(n)
        priv = g.nodes[n].get("privilege") if n in g.nodes else None
        if a is None or priv is None:
            continue
        if a not in best_priv or rank[priv] > rank[best_priv[a]]:
            best_priv[a] = priv
    if an.entry.asset_id and an.entry.node != ENTRY_INTERNET:
        best_priv.setdefault(an.entry.asset_id, an.entry.params.get("foothold_privilege", "user"))
    for p in paths:  # firewalls traversed on a path are "reachable"
        for s in p.steps:
            for fw in s.via:
                best_priv.setdefault(fw, "network")
    reachable = sorted(a for a in best_priv if a in targets)
    compromised = sorted(a for a, pv in best_priv.items() if pv in ("user", "admin") and a in targets)
    blast = r6(len(compromised) / len(targets)) if targets else 0.0

    # ---- asset risk: most likely path through any state of the asset to any goal
    risk_by_asset: dict[str, float] = dict.fromkeys(targets, 0.0)
    rev = g.reverse(copy=False)
    for goal in an.goals:
        for gnode, imp in goal.nodes:
            if gnode not in an.dist:
                continue
            to_goal = nx.single_source_dijkstra_path_length(rev, gnode, weight="w")
            for n, d_back in to_goal.items():
                a = node_asset(n)
                if a is None or a not in risk_by_asset or n not in an.dist:
                    continue
                val = math.exp(-(an.dist[n] + d_back)) * imp
                risk_by_asset[a] = max(risk_by_asset[a], val)
    for p in paths:
        for a in p.assets:
            if a in risk_by_asset:
                risk_by_asset[a] = max(risk_by_asset[a], p.risk)
    asset_risks = [
        AssetRisk(
            asset_id=a,
            risk_score=round(min(1.0, risk_by_asset[a]) * 100, 2),
            state="compromised" if a in compromised else "reachable" if a in reachable else "unreached",
            best_privilege=best_priv.get(a),
        )
        for a in targets
    ]

    # ---- chokepoints (what-if per candidate fix)
    chokepoints: list[Chokepoint] = []
    vuln_delta: dict[str, float] = {}
    if with_chokepoints:
        evals = evaluate_candidates(snap, scenario, params, an.score, cross_zone_pairs(snap, paths))
        best_for_vuln: dict[str, CandidateEval] = {}
        for ev in evals:
            for vid in ev.candidate.vuln_ids:
                cur = best_for_vuln.get(vid)
                if cur is None or (ev.delta, cur.candidate.key) > (cur.delta, ev.candidate.key):
                    best_for_vuln[vid] = ev
        for vid, ev in best_for_vuln.items():
            vuln_delta[vid] = ev.delta
            chokepoints.append(
                Chokepoint(vuln_id=vid, action_id=ev.candidate.key, delta_score=ev.delta, score_after=ev.score_after)
            )
        chokepoints.sort(key=lambda c: (-c.delta_score, c.vuln_id))

    # ---- findings
    usage: dict[str, int] = {}
    for p in paths:
        for vid in sorted({s.vuln_id for s in p.steps if s.vuln_id}):
            usage[vid] = usage.get(vid, 0) + 1
    findings: list[Finding] = []
    for v in sorted(snap.vulnerabilities, key=lambda v: v.id):
        cnt = usage.get(v.id, 0)
        delta = vuln_delta.get(v.id, 0.0)
        if cnt == 0 and delta <= 0:
            continue
        findings.append(
            Finding(
                id=f"F-{v.id}",
                vuln_id=v.id,
                title=vuln_title(v),
                kind=v.kind.value,
                severity=_severity(v.cvss, delta),
                asset_id=v.affected_asset,
                principal_id=v.affected_principal,
                cvss=v.cvss,
                cve=v.cve,
                cve_illustrative=v.cve_illustrative,
                path_count=cnt,
                delta_score=delta,
                mitre=list(v.mitre_techniques),
            )
        )
    sev_rank = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    findings.sort(key=lambda f: (sev_rank[f.severity], -f.delta_score, -f.cvss, f.vuln_id))

    # ---- residual exposure: findings present in the model but on no reachable attack edge
    carried: dict[str, bool] = {}  # vuln id -> reachable from the entry?
    for u, _v, data in g.edges(data=True):
        vid = data.get("vuln_id")
        if vid:
            carried[vid] = carried.get(vid, False) or u in an.dist
    listed = {f.vuln_id for f in findings}
    residual = [
        ResidualFinding(
            vuln_id=v.id,
            title=vuln_title(v),
            kind=v.kind.value,
            severity=_severity(v.cvss, 0.0),
            asset_id=v.affected_asset,
            principal_id=v.affected_principal,
            cvss=v.cvss,
            reason="unreachable" if v.id in carried else "not_in_scenario",
        )
        for v in sorted(snap.vulnerabilities, key=lambda v: v.id)
        if v.id not in listed and not carried.get(v.id, False)
    ]
    residual.sort(key=lambda r: (sev_rank[r.severity], -r.cvss, r.vuln_id))

    # ---- replay timeline: discovery order of the most-likely-path tree
    primary_nodes = set()
    if primary is not None:
        primary_nodes = {s.to for s in primary.steps}
    order = sorted((n for n in an.dist if n != an.entry.node), key=lambda n: (an.dist[n], n))
    keep = order[:MAX_TIMELINE_EVENTS]
    keep_set = set(keep) | (primary_nodes & set(order))
    events: list[TimelineEvent] = []
    for n in order:
        if n not in keep_set:
            continue
        chain = an.pred_paths[n]
        u = chain[-2]
        e = g.edges[u, n]
        events.append(
            TimelineEvent(
                index=len(events),
                phase=PHASE.get(e["technique"], "pivot"),
                node=n,
                asset_id=node_asset(n),
                from_asset=node_asset(u) if u != ENTRY_INTERNET else an.ag.entry_asset.get(ENTRY_INTERNET),
                technique=e["technique"],
                vuln_id=e["vuln_id"],
                p=e["p"],
                cumulative_likelihood=r6(math.exp(-an.dist[n])),
                on_primary_path=n in primary_nodes,
                label=e["reason"],
            )
        )

    result = SimulationResult(
        engine_version=ENGINE_VERSION,
        scenario=scenario,
        scenario_label=an.spec.label,
        twin_id=twin_id,
        revision=revision,
        params=an.entry.params,
        entry=an.entry.node,
        goals=[gl.id for gl in an.goals],
        score=an.score,
        p_breach=an.p_breach,
        total_assets=len(targets),
        reachable_assets=reachable,
        compromised_assets=compromised,
        blast_radius=blast,
        asset_risks=asset_risks,
        paths=paths,
        primary_path=primary,
        chokepoints=chokepoints,
        critical_findings=findings,
        residual_findings=residual,
        replay_timeline=events,
        graph_stats={
            "nodes": g.number_of_nodes(),
            "edges": g.number_of_edges(),
            "reachable_states": len(an.dist),
        },
    )
    result.result_hash = result_hash(result)
    return result


def path_signature(path: AttackPath) -> list[str]:
    return [f"{s.source}>{s.to}:{s.technique}" for s in path.steps]


def signature_likelihood(an: Analysis, signature: list[str]) -> float | None:
    """Likelihood of an exact step sequence in another analysis' graph, or None if it no longer exists."""
    g = an.ag.g
    lik = 1.0
    for item in signature:
        edge, technique = item.rsplit(":", 1)
        u, v = edge.split(">", 1)
        if not g.has_edge(u, v) or g.edges[u, v]["technique"] != technique:
            return None
        if u != an.entry.node and u not in an.dist:
            return None
        lik *= g.edges[u, v]["p"]
    return r6(lik)
