"""Fixed system prompt + compact structured input. The model only ever sees engine output."""

from __future__ import annotations

import json
from typing import Any

from app.i18n import localize
from app.schemas.remediation import Comparison
from app.schemas.simulation import SimulationResult

SYSTEM_PROMPT = """You are the CyberTwin Security Analyst.
Hard rules:
1. The input is the output of a deterministic attack-graph SIMULATION on a VIRTUAL model of an
   organisation. No real scan, probe, exploit or monitoring ever happened. Never claim or imply that
   one did, never describe events as live or real-time, never speak of "incidents" or "detections".
2. Only use attack paths, steps, vulnerabilities, assets and principals that appear in the input JSON.
   Never invent paths, vulnerabilities, CVEs or assets. CVE ids in the input are illustrative.
3. NEVER WRITE NUMBERS YOURSELF. Every quantity (score, probability, likelihood, risk, count, delta,
   CVSS) must be written as one of the placeholders listed under PLACEHOLDERS, exactly as listed,
   e.g. "the most likely path has a likelihood of {{path.P1.likelihood}}". The backend fills them in.
   Identifiers (P1.S3, web-01, vuln-ssh-rce) are not numbers and are written as-is.
4. In attack_narrative, each entry describes ONE path: list only that path's own steps, using their
   step ids (a step id P2.S1 belongs to path P2 only).
5. prioritized_remediation must follow the order of the chokepoints list in the input (largest delta first).
Return ONLY a JSON object that matches the provided schema. No Markdown, no prose outside JSON.
"""

LANG_INSTRUCTION = {
    "en": "Write all text values in English.",
    "tr": "Tüm metin değerlerini Türkçe yaz. Kimlikleri ve yer tutucuları ({{...}}) değiştirme.",
    # stated in English too: smaller models otherwise drift into Turkish
    "az": "Write all text values in Azerbaijani (Latin script), not Turkish: use ə and Azerbaijani words and "
    "grammar. Bütün mətn dəyərlərini Azərbaycan dilində yaz. İdentifikatorları və yer tutucuları ({{...}}) dəyişmə.",
}

CHAT_PROMPT = """You are the CyberTwin Security Analyst answering questions about a VIRTUAL model.
Only use facts from the provided context JSON (twin model + latest simulation). The simulation is a
deterministic graph computation; nothing was scanned or monitored. If the answer is not in the context,
say so plainly. Cite asset ids, vulnerability ids and step ids exactly as written in the context.
NEVER WRITE NUMBERS YOURSELF: write every quantity as a placeholder from PLACEHOLDERS (e.g. {{score}}).
Return ONLY a JSON object {"answer": ["paragraph", ...]} matching the provided schema."""


def explain_payload(result: SimulationResult, comparison: Comparison | None) -> dict[str, Any]:
    r = localize(result.model_dump(mode="json", by_alias=True), "en")
    payload: dict[str, Any] = {
        "notice": "SIMULATED findings on a virtual model. CVE ids are illustrative.",
        "scenario": r["scenario_label"],
        "twin_id": r["twin_id"],
        "revision": r["revision"],
        "entry": r["entry"],
        "score": r["score"],
        "p_breach": r["p_breach"],
        "blast_radius": r["blast_radius"],
        "compromised_assets": r["compromised_assets"],
        "paths": [
            {
                "id": p["id"],
                "goal": p["goal"],
                "likelihood": p["likelihood"],
                "risk": p["risk"],
                "steps": [
                    {k: s[k] for k in ("id", "from", "to", "technique", "vuln_id", "p", "reason", "mitre")}
                    for s in p["steps"]
                ],
            }
            for p in r["paths"][:5]
        ],
        "findings": [
            {
                k: f[k]
                for k in (
                    "vuln_id",
                    "title",
                    "severity",
                    "asset_id",
                    "principal_id",
                    "cvss",
                    "cve",
                    "path_count",
                    "delta_score",
                    "mitre",
                )
            }
            for f in r["critical_findings"]
        ],
        "chokepoints": r["chokepoints"],
        "asset_risks": [a for a in r["asset_risks"] if a["risk_score"] > 0],
    }
    if comparison is not None:
        c = localize(comparison.model_dump(mode="json"), "en")
        payload["comparison"] = {
            k: c[k]
            for k in (
                "before_score",
                "after_score",
                "score_delta",
                "changes",
                "before_revision",
                "after_revision",
            )
        }
        payload["comparison"]["blocked_paths"] = len(c["blocked_paths"])
        payload["comparison"]["reduced_paths"] = len(c["reduced_paths"])
        payload["comparison"]["new_paths"] = len(c["new_paths"])
        payload["comparison"]["per_asset_delta"] = [d for d in c["per_asset_delta"] if d["delta"] != 0]
    return payload


def to_json(payload: dict[str, Any]) -> str:
    return json.dumps(payload, sort_keys=True, ensure_ascii=False, indent=1)
