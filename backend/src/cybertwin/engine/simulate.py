"""Deterministic simulation: attack graph -> paths, score, chokepoints, recommendations, timeline.

Scoring (see docs/ENGINE.md for worked examples):
    path likelihood = product of edge p
    path risk       = likelihood * impact(goal)
    P_breach        = 1 - prod_goals (1 - max path risk to that goal)
    score           = 100 * (1 - P_breach)
"""

from __future__ import annotations

import math
from itertools import islice, pairwise
from typing import Any

import networkx as nx

from cybertwin.domain.canonical import canonical_json, sha256_hex
from cybertwin.domain.model import AssetType, TwinContent
from cybertwin.engine import constants as K
from cybertwin.engine.findings import SEVERITY_ORDER, Finding, collect_findings
from cybertwin.engine.graph import build_attack_graph, node_asset
from cybertwin.engine.scenarios import Goal, ScenarioSpec, build_scenario
from cybertwin.remediation.actions import Action, ActionError, action_key, apply_action, parse_action

SCHEMA_VERSION = 1
R = K.ROUND


def _r(x: float) -> float:
    return round(x, R)


# ---------------------------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------------------------
def best_likelihoods(g: nx.DiGraph, entry: str) -> dict[str, float]:
    """Max likelihood of every reachable state (Dijkstra on w = -ln p)."""
    if entry not in g:
        return {entry: 1.0}
    dist = nx.single_source_dijkstra_path_length(g, entry, weight="weight")
    return {n: math.exp(-d) for n, d in dist.items()}


def score_from(goals: tuple[Goal, ...], like: dict[str, float]) -> tuple[float, float]:
    survive = 1.0
    for goal in goals:
        survive *= 1.0 - like.get(goal.node, 0.0) * goal.impact
    p_breach = 1.0 - survive
    return _r(100.0 * (1.0 - p_breach)), _r(p_breach)


def quick_score(content: TwinContent, spec: ScenarioSpec) -> float:
    g = build_attack_graph(content)
    return score_from(spec.goals, best_likelihoods(g, spec.entry_node))[0]


# ---------------------------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------------------------
def _step(g: nx.DiGraph, u: str, v: str) -> dict[str, Any]:
    a = g.edges[u, v]
    step: dict[str, Any] = {
        "from": u,
        "to": v,
        "technique": a["technique"],
        "p": a["p"],
        "structural": a["structural"],
        "attack_ids": a["attack_ids"],
        "finding_ids": a["finding_ids"],
        "message": a["message"],
        "asset_id": a.get("asset_id"),
    }
    for key in ("port", "vuln_id", "principal_id", "via", "src_asset", "rule_ids"):
        if a.get(key) is not None:
            step[key] = a[key]
    return step


def _asset_sequence(entry_asset: str, steps: list[dict[str, Any]]) -> list[str]:
    seq = [entry_asset]
    for s in steps:
        nxt = [*s.get("via", []), s["asset_id"]] if s["technique"] == "network_reach" else [s["asset_id"]]
        for a in nxt:
            if a and seq[-1] != a:
                seq.append(a)
    return seq


def enumerate_paths(g: nx.DiGraph, spec: ScenarioSpec) -> list[dict[str, Any]]:
    found: list[dict[str, Any]] = []
    for goal in spec.goals:
        if goal.node not in g or spec.entry_node not in g or not nx.has_path(g, spec.entry_node, goal.node):
            continue
        seen: set[str] = set()
        kept = 0
        gen = nx.shortest_simple_paths(g, spec.entry_node, goal.node, weight="weight")
        for nodes in islice(gen, K.MAX_CANDIDATE_PATHS_PER_GOAL):
            if len(nodes) - 1 > K.MAX_DEPTH:
                continue
            raw = [_step(g, u, v) for u, v in pairwise(nodes)]
            likelihood = math.prod(s["p"] for s in raw)
            steps = [s for s in raw if s["technique"] != "privilege_implied"]
            signature = "|".join(f"{s['from']}>{s['to']}" for s in steps if not s["structural"])
            signature += "#" + "|".join(_asset_sequence(spec.entry_asset, steps))
            if signature in seen:
                continue
            seen.add(signature)
            found.append(
                {
                    "goal": goal.node,
                    "goal_kind": goal.kind,
                    "impact": goal.impact,
                    "likelihood": _r(likelihood),
                    "risk": _r(likelihood * goal.impact),
                    "nodes": list(nodes),
                    "steps": steps,
                    "assets": _asset_sequence(spec.entry_asset, steps),
                }
            )
            kept += 1
            if kept >= K.TOP_K:
                break

    def rank(p: dict[str, Any]) -> tuple[Any, ...]:
        return (-p["risk"], -p["likelihood"], len(p["nodes"]), p["goal"], p["nodes"])

    found.sort(key=rank)
    # Every reachable goal keeps its best path; remaining slots go to the next riskiest paths.
    top: list[dict[str, Any]] = []
    for goal in spec.goals:
        best = next((p for p in found if p["goal"] == goal.node), None)
        if best is not None:
            top.append(best)
    for p in found:
        if len(top) >= K.TOP_K:
            break
        if p not in top:
            top.append(p)
    top.sort(key=rank)
    for i, path in enumerate(top, start=1):
        path["id"] = f"P{i}"
        for j, step in enumerate(path["steps"], start=1):
            step["id"] = f"P{i}.S{j}"
    return top


# ---------------------------------------------------------------------------------------------
# What-if: chokepoints and greedy recommendations
# ---------------------------------------------------------------------------------------------
def _candidates(findings: dict[str, Finding], used: set[str]) -> list[tuple[str, Action, list[str]]]:
    by_key: dict[str, tuple[Action, set[str]]] = {}
    for fid in sorted(used):
        f = findings.get(fid)
        if f is None or f.fix is None:
            continue
        try:
            action = parse_action(f.fix)
        except ActionError:  # pragma: no cover - fixes are generated valid
            continue
        key = action_key(action)
        by_key.setdefault(key, (action, set()))[1].add(fid)
    return [(k, a, sorted(fids)) for k, (a, fids) in sorted(by_key.items())]


def what_if(
    content: TwinContent,
    spec: ScenarioSpec,
    base_score: float,
    findings: dict[str, Finding],
    used: set[str],
    paths: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    cands = _candidates(findings, used)
    chokepoints: list[dict[str, Any]] = []
    single: dict[str, float] = {}
    for key, action, fids in cands:
        try:
            after = quick_score(apply_action(content, action), spec)
        except ActionError:
            continue
        delta = _r(after - base_score)
        single[key] = delta
        if delta <= 0:
            continue
        affected = sorted(
            p["id"] for p in paths if any(set(s["finding_ids"]) & set(fids) for s in p["steps"])
        )
        chokepoints.append(
            {
                "id": key,
                "action": action.model_dump(mode="json"),
                "delta_score": delta,
                "score_after": after,
                "finding_ids": fids,
                "paths_affected": affected,
            }
        )
    chokepoints.sort(key=lambda x: (-x["delta_score"], x["id"]))

    # Greedy plan: each next step is the best *marginal* improvement given the previous ones.
    recs: list[dict[str, Any]] = []
    current, current_score = content, base_score
    remaining = [c for c in cands if c[0] in single]
    while remaining and len(recs) < K.MAX_RECOMMENDATIONS and current_score < 100.0:
        best: tuple[float, str, Action, list[str], TwinContent, float] | None = None
        for key, action, fids in remaining:
            try:
                nxt = apply_action(current, action)
            except ActionError:
                continue
            s = quick_score(nxt, spec)
            gain = _r(s - current_score)
            if best is None or (-gain, key) < (-best[0], best[1]):
                best = (gain, key, action, fids, nxt, s)
        if best is None or best[0] <= 0:
            break
        gain, key, action, fids, current, current_score = best
        recs.append(
            {
                "id": key,
                "action": action.model_dump(mode="json"),
                "kind": "blocking",
                "delta_score": gain,
                "standalone_delta": single[key],
                "score_after": current_score,
                "finding_ids": fids,
            }
        )
        remaining = [c for c in remaining if c[0] != key]
    # Defense in depth: remaining chokepoints, by standalone delta (no further marginal gain).
    taken = {r["id"] for r in recs}
    for cp in chokepoints:
        if cp["id"] in taken or len(recs) >= K.MAX_RECOMMENDATIONS:
            continue
        recs.append(
            {
                "id": cp["id"],
                "action": cp["action"],
                "kind": "hardening",
                "delta_score": 0.0,
                "standalone_delta": cp["delta_score"],
                "score_after": current_score,
                "finding_ids": cp["finding_ids"],
            }
        )
    for i, rec in enumerate(recs, start=1):
        rec["rank"] = i
    return chokepoints, recs


# ---------------------------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------------------------
def simulate(
    content: TwinContent, scenario: str, params: dict[str, Any] | None = None, *, whatif: bool = True
) -> dict[str, Any]:
    content = content.normalized()
    spec = build_scenario(content, scenario, params)
    g = build_attack_graph(content)
    like = best_likelihoods(g, spec.entry_node)
    score, p_breach = score_from(spec.goals, like)
    paths = enumerate_paths(g, spec)
    findings = collect_findings(content)

    # Findings exercised by an edge the attacker can actually take (source state reachable).
    used: set[str] = set()
    for u, _v, attrs in g.edges(data=True):
        if u in like:
            used.update(f for f in attrs["finding_ids"] if f in findings)
    paths_by_finding: dict[str, list[str]] = {}
    for p in paths:
        for fid in sorted({f for s in p["steps"] for f in s["finding_ids"] if f in findings}):
            paths_by_finding.setdefault(fid, []).append(p["id"])

    goals_out = []
    for goal in spec.goals:
        lk = like.get(goal.node, 0.0)
        best_path = next((p["id"] for p in paths if p["goal"] == goal.node), None)
        goals_out.append(
            {
                "id": goal.node,
                "kind": goal.kind,
                "asset_id": goal.asset_id,
                "principal_id": goal.principal_id,
                "impact": goal.impact,
                "likelihood": _r(lk),
                "risk": _r(lk * goal.impact),
                "path_id": best_path,
            }
        )

    hosts = [a for a in content.assets if a.type not in (AssetType.FIREWALL, AssetType.INTERNET_GATEWAY)]
    reachable = sorted({x for n in like if (x := node_asset(n)) is not None} - {spec.entry_asset})
    compromised = sorted({x for n in like if n.startswith("PRIV:") and (x := node_asset(n)) is not None})
    host_ids = {h.id for h in hosts}
    compromised_hosts = [x for x in compromised if x in host_ids]
    asset_risk: dict[str, float] = {}
    for asset in sorted(content.assets, key=lambda a: a.id):
        lk = max(like.get(f"PRIV:{asset.id}:admin", 0.0), like.get(f"PRIV:{asset.id}:user", 0.0))
        asset_risk[asset.id] = _r(100.0 * lk * asset.criticality / 5) if asset.id != spec.entry_asset else 0.0

    chokepoints, recs = what_if(content, spec, score, findings, used, paths) if whatif else ([], [])

    findings_out = []
    for f in sorted(findings.values(), key=lambda f: (SEVERITY_ORDER[f.severity], f.id)):
        item = f.to_json()
        item["used"] = f.id in used
        item["paths"] = paths_by_finding.get(f.id, [])
        findings_out.append(item)
    residual = [f["id"] for f in findings_out if not f["used"]]

    discovery = []
    if spec.entry_node in g:
        dist, pred_paths = nx.single_source_dijkstra(g, spec.entry_node, weight="weight")
        order = sorted(dist, key=lambda n: (dist[n], len(pred_paths[n]), n))
        for i, n in enumerate(order[: K.DISCOVERY_LIMIT]):
            pp = pred_paths[n]
            prev = pp[-2] if len(pp) > 1 else None
            discovery.append(
                {
                    "order": i,
                    "state": n,
                    "asset_id": node_asset(n),
                    "kind": n.split(":")[0].lower(),
                    "from": prev,
                    "technique": g.edges[prev, n]["technique"] if prev else None,
                    "likelihood": _r(math.exp(-dist[n])),
                }
            )

    primary = paths[0]["id"] if paths else None
    no_path = None
    if not paths:
        no_path = {
            "code": "no_path.unreachable",
            "params": {
                "entry": spec.entry_asset,
                "goals": len(spec.goals),
                "reachable_assets": reachable,
                "compromised_assets": compromised_hosts,
            },
        }

    result: dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "scenario": spec.id,
        "params": spec.params,
        "content_hash": content.content_hash(),
        "entry": {"asset_id": spec.entry_asset, "state": spec.entry_node},
        "score": score,
        "p_breach": p_breach,
        "goals": goals_out,
        "paths": paths,
        "primary_path": primary,
        "reachable_assets": reachable,
        "compromised_assets": compromised_hosts,
        "compromised_pct": _r(100.0 * len(compromised_hosts) / len(hosts)) if hosts else 0.0,
        "asset_risk": asset_risk,
        "chokepoints": chokepoints,
        "recommendations": recs,
        "findings": findings_out,
        "residual_exposure": residual,
        "timeline": {
            "primary": [
                {"t": i, "step_id": s["id"], "asset_id": s["asset_id"]}
                for i, s in enumerate(paths[0]["steps"])
            ]
            if paths
            else [],
            "discovery": discovery,
        },
        "no_path": no_path,
        "stats": {"states": g.number_of_nodes(), "edges": g.number_of_edges(), "goals": len(spec.goals)},
    }
    result["result_hash"] = sha256_hex(canonical_json(result))
    return result


def result_without_hash(result: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in result.items() if k != "result_hash"}
