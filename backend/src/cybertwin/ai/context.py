"""Grounding context for the AI analyst: placeholder values, known ids and the compact LLM input.

The model never writes numbers. It writes placeholders such as ``{{path.P1.likelihood}}`` that the
backend fills from the engine result, so every number shown comes from the engine.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

Kind = Literal["prob", "score", "delta", "count", "number", "pct"]


@dataclass
class Grounding:
    values: dict[str, tuple[float, Kind]] = field(default_factory=dict)
    path_steps: dict[str, set[str]] = field(default_factory=dict)  # path id -> its step ids
    ids: set[str] = field(default_factory=set)
    rec_rank: dict[str, int] = field(default_factory=dict)
    extra_numbers: set[float] = field(default_factory=set)  # ports, CVSS, revision, ...


def build_grounding(result: dict[str, Any], model: dict[str, Any] | None, revision: int) -> Grounding:
    g = Grounding()
    v = g.values
    v["score"] = (result["score"], "score")
    v["p_breach"] = (result["p_breach"], "prob")
    v["compromised_pct"] = (result["compromised_pct"], "pct")
    v["count.paths"] = (len(result["paths"]), "count")
    v["count.findings"] = (len(result["findings"]), "count")
    v["count.residual"] = (len(result["residual_exposure"]), "count")
    v["revision"] = (revision, "count")
    for p in result["paths"]:
        v[f"path.{p['id']}.likelihood"] = (p["likelihood"], "prob")
        v[f"path.{p['id']}.risk"] = (p["risk"], "prob")
        v[f"path.{p['id']}.steps"] = (len(p["steps"]), "count")
        g.path_steps[p["id"]] = {s["id"] for s in p["steps"]}
        g.ids.add(p["id"])
        for s in p["steps"]:
            v[f"step.{s['id']}.p"] = (s["p"], "prob")
            g.ids.add(s["id"])
            if s.get("port"):
                g.extra_numbers.add(float(s["port"]))
            g.ids.update(s.get("attack_ids", []))
    for goal in result["goals"]:
        v[f"goal.{goal['id']}.likelihood"] = (goal["likelihood"], "prob")
        v[f"goal.{goal['id']}.risk"] = (goal["risk"], "prob")
        g.ids.add(goal["id"])
    for rec in result["recommendations"]:
        v[f"rec.{rec['rank']}.delta"] = (rec["delta_score"], "delta")
        v[f"rec.{rec['rank']}.score_after"] = (rec["score_after"], "score")
        v[f"rec.{rec['rank']}.standalone"] = (rec["standalone_delta"], "delta")
        g.rec_rank[rec["id"]] = rec["rank"]
        g.ids.add(rec["id"])
    for f in result["findings"]:
        g.ids.add(f["id"])
        params = f["message"]["params"]
        for key in ("cvss", "port", "criticality"):
            if isinstance(params.get(key), (int, float)):
                g.extra_numbers.add(float(params[key]))
        if params.get("cve"):
            g.ids.add(str(params["cve"]))
    for aid in result["asset_risk"]:
        g.ids.add(aid)
    if model:
        for a in model.get("assets", []):
            g.ids.add(a["id"])
            for port in a.get("open_ports", []):
                g.extra_numbers.add(float(port["port"]))
        for pr in model.get("principals", []):
            g.ids.add(pr["id"])
        for vuln in model.get("vulnerabilities", []):
            g.ids.update({vuln["id"], vuln["cve"]})
    g.extra_numbers.update({float(revision), 100.0})
    return g


def llm_input(result: dict[str, Any], grounding: Grounding, names: dict[str, str]) -> dict[str, Any]:
    """Compact, number-free view of the result plus the placeholder catalogue."""
    return {
        "scenario": result["scenario"],
        "entry": result["entry"]["asset_id"],
        "assets": names,
        "goals": [{"id": g["id"], "kind": g["kind"], "path_id": g["path_id"]} for g in result["goals"]],
        "paths": [
            {
                "id": p["id"],
                "goal": p["goal"],
                "assets": p["assets"],
                "steps": [
                    {
                        "id": s["id"],
                        "technique": s["technique"],
                        "asset": s["asset_id"],
                        "vuln_id": s.get("vuln_id"),
                        "principal_id": s.get("principal_id"),
                        "finding_ids": s["finding_ids"],
                        "attack_ids": s["attack_ids"],
                    }
                    for s in p["steps"]
                ],
            }
            for p in result["paths"]
        ],
        "recommendations": [
            {
                "rank": r["rank"],
                "id": r["id"],
                "kind": r["kind"],
                "action": r["action"],
                "finding_ids": r["finding_ids"],
            }
            for r in result["recommendations"]
        ],
        "findings": [
            {"id": f["id"], "kind": f["kind"], "severity": f["severity"], "used": f["used"]}
            for f in result["findings"]
        ],
        "residual_exposure": result["residual_exposure"],
        "placeholders": sorted(grounding.values),
    }
