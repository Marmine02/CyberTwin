"""Run reports in the UI language: structured JSON and a printable, self-contained HTML page."""

from __future__ import annotations

from html import escape
from typing import Any

from cybertwin.ai.narrative import Lookup, finding_text, route_text
from cybertwin.i18n.catalog import (
    fmt_datetime,
    fmt_pct,
    fmt_prob,
    fmt_score,
    goal_label,
    render_action,
    render_message,
    t,
)


def build_report(
    lang: str, *, twin: dict[str, Any], run: dict[str, Any], model: dict[str, Any]
) -> dict[str, Any]:
    result = run["result"]
    lk = Lookup(model)
    goals = {g["id"]: g for g in result["goals"]}
    findings = {f["id"]: f for f in result["findings"]}
    return {
        "lang": lang,
        "meta": {
            "twin": twin["name"],
            "revision": run["revision"],
            "run_id": run["id"],
            "scenario": t(lang, f"scenario.{result['scenario']}.name"),
            "created_at": fmt_datetime(lang, run["created_at"]),
            "result_hash": run["result_hash"],
            "entry": lk.asset(result["entry"]["asset_id"]),
        },
        "summary": {
            "score": fmt_score(lang, result["score"]),
            "p_breach": fmt_prob(lang, result["p_breach"]),
            "compromised": fmt_pct(lang, result["compromised_pct"]),
        },
        "goals": [
            {
                "label": goal_label(lang, g, lk.names),
                "impact": fmt_prob(lang, g["impact"]),
                "likelihood": fmt_prob(lang, g["likelihood"]),
                "risk": fmt_prob(lang, g["risk"]),
            }
            for g in result["goals"]
        ],
        "paths": [
            {
                "id": p["id"],
                "goal": goal_label(lang, goals[p["goal"]], lk.names),
                "likelihood": fmt_prob(lang, p["likelihood"]),
                "risk": fmt_prob(lang, p["risk"]),
                "route": route_text(p, lk),
                "steps": [
                    {
                        "id": s["id"],
                        "technique": t(lang, f"technique.{s['technique']}"),
                        "text": render_message(lang, s["message"], lk.names),
                        "p": fmt_prob(lang, s["p"]),
                        "attack": ", ".join(s["attack_ids"]),
                    }
                    for s in p["steps"]
                ],
            }
            for p in result["paths"]
        ],
        "findings": [
            {
                "severity": t(lang, f"severity.{f['severity']}"),
                "severity_key": f["severity"],
                "kind": t(lang, f"findingKind.{f['kind']}"),
                "text": finding_text(lang, f, lk),
                "used_by": ", ".join(f["paths"]),
            }
            for f in result["findings"]
        ],
        "recommendations": [
            {
                "rank": r["rank"],
                "kind": r["kind"],
                "action": render_action(lang, r["action"], cves=lk.cves, names=lk.names),
                "delta": ("+" if r["delta_score"] > 0 else "") + fmt_score(lang, r["delta_score"]),
                "after": fmt_score(lang, r["score_after"]),
            }
            for r in result["recommendations"]
        ],
        "residual": [
            finding_text(lang, findings[f], lk) for f in result["residual_exposure"] if f in findings
        ],
        "no_path": None if result["paths"] else t(lang, "report.no_path"),
    }


CSS = """
body{font-family:'IBM Plex Sans',system-ui,sans-serif;color:#0f172a;margin:32px;line-height:1.45}
h1{font-size:22px;margin:0 0 4px} h2{font-size:16px;margin:24px 0 8px;border-bottom:2px solid #0891b2;padding-bottom:4px}
.badge{display:inline-block;border:1px solid #0891b2;color:#0e7490;border-radius:6px;padding:2px 8px;font-size:12px}
table{border-collapse:collapse;width:100%;font-size:12.5px;margin:6px 0 12px}
th,td{border:1px solid #cbd5e1;padding:5px 7px;text-align:left;vertical-align:top} th{background:#f1f5f9}
.kpi{display:flex;gap:24px;margin:12px 0}.kpi div{border:1px solid #cbd5e1;border-radius:8px;padding:8px 14px}
.kpi b{display:block;font-size:20px} .mono{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11.5px}
.sev-critical{color:#be123c;font-weight:600}.sev-high{color:#c2410c;font-weight:600}.sev-medium{color:#a16207}
.meta{color:#475569;font-size:12.5px} @media print{body{margin:12mm}h2{break-after:avoid}tr{break-inside:avoid}}
"""


def render_html(report: dict[str, Any]) -> str:
    lang = report["lang"]
    e = escape
    m = report["meta"]

    def tr(cells: list[str], tag: str = "td") -> str:
        return "<tr>" + "".join(f"<{tag}>{c}</{tag}>" for c in cells) + "</tr>"

    parts = [
        f"<!doctype html><html lang='{e(lang)}'><head><meta charset='utf-8'>",
        f"<title>{e(t(lang, 'report.title'))} - {e(m['twin'])} r{m['revision']}</title><style>{CSS}</style></head><body>",
        f"<h1>{e(t(lang, 'report.title'))}</h1><span class='badge'>{e(t(lang, 'report.badge'))}</span>",
        "<p class='meta'>"
        f"{e(t(lang, 'report.twin'))}: <b>{e(m['twin'])}</b> · {e(t(lang, 'report.revision'))}: <b>r{m['revision']}</b>"
        f" · {e(t(lang, 'report.scenario'))}: <b>{e(m['scenario'])}</b> · {e(t(lang, 'report.run'))} #{m['run_id']}"
        f" · {e(t(lang, 'report.generated'))}: <span class='mono'>{e(m['created_at'])}</span></p>",
        "<div class='kpi'>"
        f"<div>{e(t(lang, 'report.score'))}<b>{e(report['summary']['score'])}</b></div>"
        f"<div>{e(t(lang, 'report.p_breach'))}<b>{e(report['summary']['p_breach'])}</b></div>"
        f"<div>{e(t(lang, 'report.compromised'))}<b>{e(report['summary']['compromised'])}</b></div></div>",
        f"<h2>{e(t(lang, 'report.goals'))}</h2><table>",
        tr([e(t(lang, f"report.{k}")) for k in ("goal", "impact", "likelihood", "risk")], "th"),
        *[tr([e(g["label"]), e(g["impact"]), e(g["likelihood"]), e(g["risk"])]) for g in report["goals"]],
        "</table>",
        f"<h2>{e(t(lang, 'report.paths'))}</h2>",
    ]
    if report["no_path"]:
        parts.append(f"<p>{e(report['no_path'])}</p>")
    for p in report["paths"]:
        parts.append(
            f"<p><b>{e(p['id'])}</b> → {e(p['goal'])} · {e(t(lang, 'report.likelihood'))} {e(p['likelihood'])}"
            f" · {e(t(lang, 'report.risk'))} {e(p['risk'])}<br><span class='meta'>{e(p['route'])}</span></p>"
        )
        parts.append(
            "<table>"
            + tr(
                [e(t(lang, f"report.{k}")) for k in ("step", "technique", "action", "probability", "attack")],
                "th",
            )
        )
        parts += [
            tr(
                [
                    f"<span class='mono'>{e(s['id'])}</span>",
                    e(s["technique"]),
                    e(s["text"]),
                    e(s["p"]),
                    f"<span class='mono'>{e(s['attack'])}</span>",
                ]
            )
            for s in p["steps"]
        ]
        parts.append("</table>")
    parts.append(f"<h2>{e(t(lang, 'report.recommendations'))}</h2>")
    if report["recommendations"]:
        parts.append(
            "<table>" + tr([e(t(lang, f"report.{k}")) for k in ("rank", "action", "delta", "after")], "th")
        )
        parts += [
            tr([str(r["rank"]), e(r["action"]), e(r["delta"]), e(r["after"])])
            for r in report["recommendations"]
        ]
        parts.append("</table>")
    else:
        parts.append(f"<p>{e(t(lang, 'report.none'))}</p>")
    parts.append(
        f"<h2>{e(t(lang, 'report.findings'))}</h2><table>"
        + tr([e(t(lang, f"report.{k}")) for k in ("severity", "finding", "used_by")], "th")
    )
    parts += [
        tr(
            [
                f"<span class='sev-{e(f['severity_key'])}'>{e(f['severity'])}</span>",
                f"{e(f['kind'])}: {e(f['text'])}",
                e(f["used_by"]) or "-",
            ]
        )
        for f in report["findings"]
    ]
    parts.append("</table>")
    parts.append(f"<h2>{e(t(lang, 'report.residual'))}</h2>")
    if report["residual"]:
        parts.append("<ul>" + "".join(f"<li>{e(x)}</li>" for x in report["residual"]) + "</ul>")
    else:
        parts.append(f"<p>{e(t(lang, 'report.none'))}</p>")
    parts.append(
        f"<p class='meta'>{e(t(lang, 'report.illustrative'))} {e(t(lang, 'report.hash'))}: "
        f"<span class='mono'>{e(m['result_hash'])}</span></p></body></html>"
    )
    return "\n".join(parts)
