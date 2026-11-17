"""Reports: JSON (engine messages as {code, params}) or printable HTML in the requested language."""

from __future__ import annotations

import html
import re
from datetime import UTC, datetime
from typing import Any, Literal

from fastapi import APIRouter
from fastapi.responses import HTMLResponse, JSONResponse

from app.ai.fallback import render as render_fallback
from app.api.deps import AiDep, ServicesDep
from app.i18n import localize, render
from app.repositories.repos import iso
from app.schemas.i18n import msg
from app.schemas.simulation import SimulationResult

router = APIRouter(tags=["reports"])

LABELS: dict[str, dict[str, str]] = {
    "en": {
        "print": "Print / Save as PDF",
        "title": "CyberTwin security report",
        "revision": "Revision",
        "simulation": "simulation",
        "badge": "SIMULATION MODE · Virtual model only.",
        "disclaimer": "Simulation on a virtual model. No real systems were scanned or tested. CVE identifiers are illustrative.",
        "score": "Security score",
        "blast": "Blast radius",
        "paths": "Attack paths",
        "scenario": "Scenario",
        "entry": "entry",
        "goal": "Goal",
        "likelihood": "Likelihood",
        "risk": "Risk",
        "steps": "Steps",
        "no_paths": "No attack path reaches a goal.",
        "findings": "Findings",
        "severity": "Severity",
        "finding_title": "Title",
        "delta": "Δscore if fixed",
        "no_findings": "No findings on any path.",
        "illustrative": "illustrative",
        "residual": "Residual exposure",
        "residual_none": "None: every finding is fixed or on a reachable path.",
        "residual_note": "Present in the model but not exploitable in this scenario; not counted in the score.",
        "applied": "Applied fixes",
        "none": "None",
        "summary": "Analyst summary",
        "sev.critical": "critical",
        "sev.high": "high",
        "sev.medium": "medium",
        "sev.low": "low",
    },
    "tr": {
        "print": "Yazdır / PDF olarak kaydet",
        "title": "CyberTwin güvenlik raporu",
        "revision": "Revizyon",
        "simulation": "simülasyon",
        "badge": "SİMÜLASYON MODU · Yalnızca sanal model.",
        "disclaimer": "Sanal model üzerinde simülasyon. Hiçbir gerçek sistem taranmadı veya test edilmedi. CVE kimlikleri örnek amaçlıdır.",
        "score": "Güvenlik skoru",
        "blast": "Etki alanı",
        "paths": "Saldırı yolları",
        "scenario": "Senaryo",
        "entry": "giriş",
        "goal": "Hedef",
        "likelihood": "Olasılık",
        "risk": "Risk",
        "steps": "Adımlar",
        "no_paths": "Hiçbir saldırı yolu hedefe ulaşmıyor.",
        "findings": "Bulgular",
        "severity": "Önem",
        "finding_title": "Başlık",
        "delta": "Düzeltilirse Δskor",
        "no_findings": "Hiçbir yolda bulgu yok.",
        "illustrative": "örnek amaçlı",
        "residual": "Kalan maruziyet",
        "residual_none": "Yok: her bulgu ya düzeltildi ya da erişilebilir bir yolda.",
        "residual_note": "Modelde var ama bu senaryoda istismar edilemiyor; skora dahil değil.",
        "applied": "Uygulanan düzeltmeler",
        "none": "Yok",
        "summary": "Analist özeti",
        "sev.critical": "kritik",
        "sev.high": "yüksek",
        "sev.medium": "orta",
        "sev.low": "düşük",
    },
    "az": {
        "print": "Çap et / PDF kimi saxla",
        "title": "CyberTwin təhlükəsizlik hesabatı",
        "revision": "Versiya",
        "simulation": "simulyasiya",
        "badge": "SİMULYASİYA REJİMİ · Yalnız virtual model.",
        "disclaimer": "Virtual model üzərində simulyasiya. Heç bir real sistem skan edilməyib və ya sınaqdan keçirilməyib. CVE identifikatorları nümunəvidir.",
        "score": "Təhlükəsizlik balı",
        "blast": "Təsir radiusu",
        "paths": "Hücum yolları",
        "scenario": "Ssenari",
        "entry": "giriş nöqtəsi",
        "goal": "Hədəf",
        "likelihood": "Ehtimal",
        "risk": "Risk",
        "steps": "Addımlar",
        "no_paths": "Heç bir hücum yolu hədəfə çatmır.",
        "findings": "Zəifliklər",
        "severity": "Ciddilik",
        "finding_title": "Başlıq",
        "delta": "Düzəldilsə Δbal",
        "no_findings": "Heç bir yolda zəiflik yoxdur.",
        "illustrative": "nümunəvi",
        "residual": "Qalıq risk",
        "residual_none": "Yoxdur: hər zəiflik ya düzəldilib, ya da əlçatan yoldadır.",
        "residual_note": "Modeldə var, lakin bu ssenaridə istismar edilə bilmir; bala daxil edilmir.",
        "applied": "Tətbiq edilmiş düzəlişlər",
        "none": "Yoxdur",
        "summary": "Analitik xülasəsi",
        "sev.critical": "kritik",
        "sev.high": "yüksək",
        "sev.medium": "orta",
        "sev.low": "aşağı",
    },
}


MONTHS = {
    "en": "January February March April May June July August September October November December",
    "tr": "Ocak Şubat Mart Nisan Mayıs Haziran Temmuz Ağustos Eylül Ekim Kasım Aralık",
    "az": "yanvar fevral mart aprel may iyun iyul avqust sentyabr oktyabr noyabr dekabr",
}


def report_date(iso_value: str, lang: str) -> str:
    """Date in the report language, e.g. "16 noyabr 2026, 14:42 UTC" (the report is static HTML: no script)."""
    try:
        d = datetime.fromisoformat(iso_value.replace("Z", "+00:00")).astimezone(UTC)
    except ValueError:
        return iso_value
    month = MONTHS.get(lang, MONTHS["en"]).split()[d.month - 1]
    return f"{d.day} {month} {d.year}, {d:%H:%M} UTC"


async def build_report(simulation_id: str, svc: ServicesDep, ai: AiDep, lang: str) -> dict[str, Any]:
    run = await svc.sims.get(simulation_id)
    twin = await svc.twins.get(run.twin_id)
    rev = await svc.twins.revision(run.twin_id, run.revision)
    result = SimulationResult.model_validate(run.result_json)
    applied = [
        {
            "id": r.id,
            "from_revision": r.from_revision,
            "to_revision": r.to_revision,
            "actions": r.actions,
            "score_before": r.comparison["before_score"],
            "score_after": r.comparison["after_score"],
            "created_at": iso(r.created_at),
        }
        for r in await svc.remeds.list(run.twin_id)
        if r.to_revision <= run.revision
    ]
    status = ai.status()
    key = f"explain:v2:{result.result_hash}:-:{lang}:{status['provider']}:{status['model']}"
    cached = await ai.cache.get(key) if status["mode"] == "llm" else None
    summary = cached.content if cached else render_fallback(result, None, lang)
    return {
        "lang": lang,
        "generated_for": {
            "twin_id": twin.id,
            "twin_name": twin.name,
            "revision": run.revision,
            "revision_note": rev.note,
            "simulation_id": run.id,
            "created_at": iso(run.created_at),
        },
        "disclaimer": LABELS.get(lang, LABELS["en"])["disclaimer"],
        "result": result.model_dump(mode="json", by_alias=True),
        "revision_diff": rev.diff,
        "applied_remediations": applied,
        "ai_summary": {"mode": cached.mode if cached else "fallback", "text": summary},
    }


def _md_to_html(md: str) -> str:
    out: list[str] = []
    in_list = False
    for raw in md.splitlines():
        line = html.escape(raw)
        line = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", line)
        line = re.sub(r"`(.+?)`", r"<code>\1</code>", line)
        line = re.sub(r"(?<!\w)_(.+?)_(?!\w)", r"<em>\1</em>", line)
        is_item = raw.startswith("- ") or re.match(r"^\d+\. ", raw)
        if is_item and not in_list:
            out.append("<ul>")
            in_list = True
        if not is_item and in_list:
            out.append("</ul>")
            in_list = False
        if raw.startswith("## "):
            out.append(f"<h3>{line[3:]}</h3>")
        elif is_item:
            out.append(f"<li>{re.sub(r'^(- |\\d+\\. )', '', line)}</li>")
        elif line.strip():
            out.append(f"<p>{line}</p>")
    if in_list:
        out.append("</ul>")
    return "\n".join(out)


def render_html(rep: dict[str, Any]) -> str:
    lang = rep.get("lang", "en")
    L = LABELS.get(lang, LABELS["en"])
    r = localize(rep["result"], lang)
    g = rep["generated_for"]
    e = html.escape
    scenario = render(msg(f"scenario.{r['scenario']}"), lang)
    rows = []
    for p in r["paths"]:
        steps = "<br>".join(
            f"<code>{e(s['id'])}</code> {e(s['reason'])} "
            f"<span class=muted>(p={s['p']:.2f}{', ' + e(s['vuln_id']) if s['vuln_id'] else ''})</span>"
            for s in p["steps"]
        )
        rows.append(
            f"<tr><td><b>{e(p['id'])}</b></td><td>{e(p['goal_label'])}</td><td>{p['likelihood']:.3f}</td>"
            f"<td>{p['risk']:.3f}</td><td>{steps}</td></tr>"
        )
    findings = "".join(
        f"<tr><td><span class='sev {e(f['severity'])}'>{e(L['sev.' + f['severity']])}</span></td>"
        f"<td><code>{e(f['vuln_id'])}</code></td>"
        f"<td>{e(f['title'])}{' <i>(' + e(f['cve']) + ', ' + L['illustrative'] + ')</i>' if f['cve'] else ''}</td>"
        f"<td>{f['cvss']}</td><td>{f['path_count']}</td><td>{f['delta_score']:+.1f}</td></tr>"
        for f in r["critical_findings"]
    )
    residual = (
        "".join(
            f"<li><code>{e(x['vuln_id'])}</code> {e(x['title'])} <span class=muted>"
            f"({e(' / '.join(v for v in (x['asset_id'], x['principal_id']) if v))})</span></li>"
            for x in r.get("residual_findings", [])
        )
        or f"<li>{e(L['residual_none'])}</li>"
    )
    applied = (
        "".join(
            f"<li>r{a['from_revision']} → r{a['to_revision']}: "
            + ", ".join(e(x["type"]) for x in a["actions"])
            + f" ({L['score'].lower()} {a['score_before']:.0f} → {a['score_after']:.0f})</li>"
            for a in rep["applied_remediations"]
        )
        or f"<li>{e(L['none'])}</li>"
    )
    return f"""<!doctype html><html lang="{lang}"><head><meta charset="utf-8">
<title>{e(L["title"])} · {e(g["twin_name"])} r{g["revision"]}</title>
<style>
body{{font-family:'IBM Plex Sans',Inter,Arial,sans-serif;color:#0f172a;margin:32px auto;max-width:960px;padding:0 16px;line-height:1.45}}
h1{{font-size:24px;margin:0}} h2{{font-size:16px;text-transform:uppercase;letter-spacing:.08em;border-bottom:2px solid #22d3ee;padding-bottom:4px;margin-top:28px}}
h3{{font-size:14px;margin:14px 0 4px}} code{{font-family:'JetBrains Mono',Consolas,monospace;font-size:12px;background:#f1f5f9;padding:1px 4px;border-radius:3px}}
table{{border-collapse:collapse;width:100%;font-size:12.5px}} td,th{{border:1px solid #cbd5e1;padding:6px;vertical-align:top;text-align:left}}
.muted{{color:#475569}} .banner{{background:#ecfeff;border:1px solid #67e8f9;padding:8px 12px;border-radius:8px;font-size:13px}}
.kpis{{display:flex;gap:16px;margin:16px 0}} .kpi{{border:1px solid #cbd5e1;border-radius:8px;padding:10px 14px;flex:1}}
.kpi b{{display:block;font-size:26px}} .sev{{padding:1px 6px;border-radius:4px;font-size:11px;text-transform:uppercase;color:#fff}}
.critical{{background:#be123c}} .high{{background:#c2410c}} .medium{{background:#854d0e}} .low{{background:#047857}}
@media print{{body{{margin:0}} .noprint{{display:none}}}}
</style></head><body>
<p class="noprint"><button onclick="window.print()">{e(L["print"])}</button></p>
<h1>{e(L["title"])}: {e(g["twin_name"])}</h1>
<p class="muted">{e(L["revision"])} r{g["revision"]} ({e(g["revision_note"])}) · {e(L["simulation"])} <code>{e(g["simulation_id"])}</code> · <time datetime="{e(g["created_at"])}">{e(report_date(g["created_at"], lang))}</time></p>
<p class="banner"><b>{e(L["badge"])}</b> {e(rep["disclaimer"])}</p>
<div class="kpis"><div class="kpi">{e(L["score"])}<b>{r["score"]:.0f}/100</b></div>
<div class="kpi">P(breach)<b>{r["p_breach"]:.0%}</b></div>
<div class="kpi">{e(L["blast"])}<b>{len(r["compromised_assets"])}/{r["total_assets"]}</b></div>
<div class="kpi">{e(L["paths"])}<b>{len(r["paths"])}</b></div></div>
<h2>{e(L["scenario"])}</h2><p>{e(scenario)} · {e(L["entry"])} <code>{e(r["entry"])}</code></p>
<h2>{e(L["paths"])}</h2><table><tr><th>ID</th><th>{e(L["goal"])}</th><th>{e(L["likelihood"])}</th><th>{e(L["risk"])}</th><th>{e(L["steps"])}</th></tr>{"".join(rows) or f"<tr><td colspan=5>{e(L['no_paths'])}</td></tr>"}</table>
<h2>{e(L["findings"])}</h2><table><tr><th>{e(L["severity"])}</th><th>ID</th><th>{e(L["finding_title"])}</th><th>CVSS</th><th>{e(L["paths"])}</th><th>{e(L["delta"])}</th></tr>{findings or f"<tr><td colspan=6>{e(L['no_findings'])}</td></tr>"}</table>
<h2>{e(L["residual"])}</h2><p class="muted">{e(L["residual_note"])}</p><ul>{residual}</ul>
<h2>{e(L["applied"])}</h2><ul>{applied}</ul>
<h2>{e(L["summary"])} <span class="muted">({e(rep["ai_summary"]["mode"])})</span></h2>{_md_to_html(rep["ai_summary"]["text"])}
</body></html>"""


@router.get("/reports/{simulation_id}", response_model=None)
async def report(
    simulation_id: str,
    svc: ServicesDep,
    ai: AiDep,
    format: Literal["json", "html"] = "json",
    lang: Literal["en", "tr", "az"] = "en",
) -> JSONResponse | HTMLResponse:
    rep = await build_report(simulation_id, svc, ai, lang)
    if format == "html":
        return HTMLResponse(render_html(rep))
    return JSONResponse(rep)
