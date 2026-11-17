"""Before/after comparison of two simulation results (pure, deterministic).

A path is identified by its steps: (from, to, technique, vuln, principal), stable across revisions.
- blocked: a before-path with a step that no longer exists in the after graph;
- reduced: a before-path whose steps all still exist but whose likelihood went down;
- new:     an after-path that did not appear among the before-paths.
"""

from __future__ import annotations

import math
from itertools import pairwise
from typing import Any

import networkx as nx

from cybertwin.engine.constants import ROUND


def _likelihood_in(g: nx.DiGraph, nodes: list[str]) -> float | None:
    p = 1.0
    for u, v in pairwise(nodes):
        if not g.has_edge(u, v):
            return None
        p *= g.edges[u, v]["p"]
    return p


def _signature(path: dict[str, Any]) -> tuple[Any, ...]:
    """Identity of an attack path: states plus how each step is done (technique/vuln/principal)."""
    return tuple(
        (s["from"], s["to"], s["technique"], s.get("vuln_id"), s.get("principal_id")) for s in path["steps"]
    )


def _likelihood_same_techniques(g: nx.DiGraph, path: dict[str, Any]) -> float | None:
    """Likelihood of the same attack path in another graph, or None if any step no longer exists."""
    if _likelihood_in(g, path["nodes"]) is None:
        return None
    p = 1.0
    for s in path["steps"]:
        e = g.edges[s["from"], s["to"]]
        if (e["technique"], e.get("vuln_id"), e.get("principal_id")) != (
            s["technique"],
            s.get("vuln_id"),
            s.get("principal_id"),
        ):
            return None
        p *= e["p"]
    return p


def _brief(path: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": path["id"],
        "goal": path["goal"],
        "assets": path["assets"],
        "likelihood": path["likelihood"],
        "risk": path["risk"],
    }


def compare_results(before: dict[str, Any], after: dict[str, Any], after_graph: nx.DiGraph) -> dict[str, Any]:
    blocked: list[dict[str, Any]] = []
    reduced: list[dict[str, Any]] = []
    unchanged: list[str] = []
    for path in before["paths"]:
        lk = _likelihood_same_techniques(after_graph, path)
        if lk is None:
            blocked.append(_brief(path))
        elif round(lk, ROUND) < path["likelihood"] - 1e-9:
            reduced.append(
                {
                    **_brief(path),
                    "likelihood_after": round(lk, ROUND),
                    "risk_after": round(lk * path["impact"], ROUND),
                }
            )
        else:
            unchanged.append(path["id"])
    before_sigs = {_signature(p) for p in before["paths"]}
    new_paths = [_brief(p) for p in after["paths"] if _signature(p) not in before_sigs]

    per_asset = []
    for asset_id in sorted(set(before["asset_risk"]) | set(after["asset_risk"])):
        b = before["asset_risk"].get(asset_id, 0.0)
        a = after["asset_risk"].get(asset_id, 0.0)
        if not math.isclose(a, b, abs_tol=1e-9):
            per_asset.append({"asset_id": asset_id, "before": b, "after": a, "delta": round(a - b, ROUND)})

    return {
        "before": {
            "score": before["score"],
            "p_breach": before["p_breach"],
            "paths": len(before["paths"]),
            "result_hash": before["result_hash"],
        },
        "after": {
            "score": after["score"],
            "p_breach": after["p_breach"],
            "paths": len(after["paths"]),
            "result_hash": after["result_hash"],
        },
        "score_delta": round(after["score"] - before["score"], ROUND),
        "blocked_paths": blocked,
        "reduced_paths": reduced,
        "unchanged_paths": unchanged,
        "new_paths": new_paths,
        "per_asset_delta": per_asset,
        "residual_exposure": after["residual_exposure"],
    }
