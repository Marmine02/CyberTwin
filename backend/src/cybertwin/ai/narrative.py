"""Engine-rendered text: attack steps and the deterministic template explanation (EN/TR/AZ).

Step-by-step attack text is always produced here from engine data, never by a model.
"""

from __future__ import annotations

from typing import Any

from cybertwin.i18n.catalog import (
    fmt_pct,
    fmt_prob,
    fmt_score,
    goal_label,
    render_action,
    render_message,
    t,
)

MAX_RISKS = 3
MAX_RESIDUAL_ITEMS = 4


class Lookup:
    """Display names from the model: asset names and vulnerability -> (CVE, asset name)."""

    def __init__(self, model: dict[str, Any] | None) -> None:
        model = model or {}
        self.names: dict[str, str] = {a["id"]: a["name"] for a in model.get("assets", [])}
        self.cves: dict[str, tuple[str, str]] = {
            v["id"]: (v["cve"], self.names.get(v["asset_id"], v["asset_id"]))
            for v in model.get("vulnerabilities", [])
        }

    def asset(self, asset_id: str | None) -> str:
        return self.names.get(asset_id or "", asset_id or "")


def finding_text(lang: str, finding: dict[str, Any], lk: Lookup) -> str:
    return render_message(lang, finding["message"], lk.names)


def attack_steps(
    lang: str, result: dict[str, Any], lk: Lookup, path_id: str | None = None
) -> list[dict[str, Any]]:
    paths = {p["id"]: p for p in result["paths"]}
    pid = path_id or result["primary_path"]
    if pid is None or pid not in paths:
        return []
    findings = {f["id"]: f for f in result["findings"]}
    out = []
    for s in paths[pid]["steps"]:
        out.append(
            {
                "step_id": s["id"],
                "asset_id": s["asset_id"],
                "technique": s["technique"],
                "technique_label": t(lang, f"technique.{s['technique']}"),
                "text": render_message(lang, s["message"], lk.names),
                "p": s["p"],
                "p_text": fmt_prob(lang, s["p"]),
                "attack_ids": s["attack_ids"],
                "why": [finding_text(lang, findings[f], lk) for f in s["finding_ids"] if f in findings],
            }
        )
    return out


def route_text(path: dict[str, Any], lk: Lookup) -> str:
    return " → ".join(lk.asset(a) for a in path["assets"])


def template_explanation(
    lang: str, result: dict[str, Any], model: dict[str, Any] | None, revision: int
) -> dict[str, Any]:
    lk = Lookup(model)
    scenario = t(lang, f"scenario.{result['scenario']}.name")
    entry = lk.asset(result["entry"]["asset_id"])
    goals = {g["id"]: g for g in result["goals"]}
    findings = {f["id"]: f for f in result["findings"]}

    summary = [
        t(
            lang,
            "ai.summary",
            scenario=scenario,
            revision=revision,
            score=fmt_score(lang, result["score"]),
            p_breach=fmt_prob(lang, result["p_breach"]),
        )
    ]
    if result["paths"]:
        p1 = result["paths"][0]
        summary.append(
            t(
                lang,
                "ai.summary_paths",
                count=len(result["paths"]),
                goal=goal_label(lang, goals[p1["goal"]], lk.names),
                likelihood=fmt_prob(lang, p1["likelihood"]),
            )
        )
        summary.append(
            t(lang, "ai.summary_compromised", pct=fmt_pct(lang, result["compromised_pct"]), entry=entry)
        )
    else:
        summary.append(t(lang, "ai.summary_no_path", entry=entry))

    risks = []
    for p in result["paths"][:MAX_RISKS]:
        fids = sorted({f for s in p["steps"] for f in s["finding_ids"] if f in findings})
        text = t(
            lang,
            "ai.risk_item",
            path=p["id"],
            goal=goal_label(lang, goals[p["goal"]], lk.names),
            likelihood=fmt_prob(lang, p["likelihood"]),
            risk=fmt_prob(lang, p["risk"]),
            route=route_text(p, lk),
        )
        reasons = [finding_text(lang, findings[f], lk) for f in fids]
        if reasons:
            text += " " + t(lang, "ai.risk_because", reasons="; ".join(reasons))
        risks.append(
            {
                "text": text,
                "path_id": p["id"],
                "step_ids": [s["id"] for s in p["steps"]],
                "finding_ids": fids,
                "verified": True,
            }
        )

    plan = []
    for rec in result["recommendations"]:
        action = render_action(lang, rec["action"], cves=lk.cves, names=lk.names)
        if rec["kind"] == "blocking":
            text = t(
                lang,
                "ai.plan_item",
                action=action,
                delta="+" + fmt_score(lang, rec["delta_score"]),
                after=fmt_score(lang, rec["score_after"]),
            )
        else:
            text = t(
                lang,
                "ai.plan_item_hardening",
                action=action,
                standalone="+" + fmt_score(lang, rec["standalone_delta"]),
            )
        plan.append(
            {
                "text": text,
                "recommendation_id": rec["id"],
                "rank": rec["rank"],
                "kind": rec["kind"],
                "verified": True,
            }
        )
    if not plan:
        plan.append(
            {
                "text": t(lang, "ai.plan_empty"),
                "recommendation_id": None,
                "rank": None,
                "kind": "none",
                "verified": True,
            }
        )

    residual_ids = result["residual_exposure"]
    if residual_ids:
        shown = [
            finding_text(lang, findings[f], lk) for f in residual_ids[:MAX_RESIDUAL_ITEMS] if f in findings
        ]
        rest = len(residual_ids) - len(shown)
        items = "; ".join(shown) + (f"; {t(lang, 'ai.residual_more', count=rest)}" if rest > 0 else "")
        residual = [t(lang, "ai.residual", count=len(residual_ids), items=items)]
    else:
        residual = [t(lang, "ai.residual_none")]

    return {
        "summary": summary,
        "key_risks": risks,
        "attack_steps": attack_steps(lang, result, lk),
        "remediation_plan": plan,
        "residual": residual,
    }
