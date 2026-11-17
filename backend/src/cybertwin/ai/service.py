"""AI analyst: explanations and grounded chat over engine results.

Mode "llm" when a provider is configured and answers within schema; otherwise mode "template"
(deterministic, EN/TR/AZ). Explanations are cached by result_hash + language + provider/model.
"""

from __future__ import annotations

import json
import re
import unicodedata
from typing import Any

from cybertwin.ai.checks import check_explanation, check_ids, check_text, fill
from cybertwin.ai.context import build_grounding, llm_input
from cybertwin.ai.narrative import Lookup, attack_steps, finding_text, route_text, template_explanation
from cybertwin.ai.providers import Provider, ProviderError
from cybertwin.db.repository import Repository
from cybertwin.i18n.catalog import fmt_prob, fmt_score, render_action, t

LANG_NAMES = {"en": "English", "tr": "Turkish", "az": "Azerbaijani"}

EXPLANATION_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["summary", "key_risks", "remediation_plan", "residual_note"],
    "properties": {
        "summary": {"type": "string"},
        "key_risks": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["text", "path_id", "step_ids", "finding_ids"],
                "properties": {
                    "text": {"type": "string"},
                    "path_id": {"type": "string"},
                    "step_ids": {"type": "array", "items": {"type": "string"}},
                    "finding_ids": {"type": "array", "items": {"type": "string"}},
                },
            },
        },
        "remediation_plan": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["text", "recommendation_id"],
                "properties": {"text": {"type": "string"}, "recommendation_id": {"type": "string"}},
            },
        },
        "residual_note": {"type": "string"},
    },
}

CHAT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["answer", "cited_ids"],
    "properties": {"answer": {"type": "string"}, "cited_ids": {"type": "array", "items": {"type": "string"}}},
}

RULES = (
    "You explain the output of a deterministic attack-graph engine that runs on a VIRTUAL model of an "
    "organization. Nothing real was scanned or attacked. Rules: (1) Never invent paths, vulnerabilities, "
    "assets, scores or probabilities; only use ids present in the input. (2) Never write digits or numbers; "
    "when you need a number, write a placeholder from the 'placeholders' list exactly as {{name}}. "
    "(3) Cite path ids, step ids and finding ids exactly. (4) List remediation in the engine's rank order. "
    "(5) Write in {language}. Keep it concise and concrete."
)


def _system(lang: str) -> str:
    return RULES.replace("{language}", LANG_NAMES.get(lang, "English"))


def cache_key(kind: str, result_hash: str, lang: str, provider: Provider | None) -> str:
    who = f"{provider.name}:{provider.model}" if provider else "template"
    return f"{kind}:{result_hash}:{lang}:{who}"[:160]


async def explain(
    repo: Repository,
    provider: Provider | None,
    result: dict[str, Any],
    model: dict[str, Any],
    revision: int,
    lang: str,
) -> dict[str, Any]:
    key = cache_key("explain", result["result_hash"], lang, provider)
    cached = await repo.cache_get(key)
    if cached is not None:
        return {**cached, "cached": True}
    template = template_explanation(lang, result, model, revision)
    out: dict[str, Any] = {
        "mode": "template",
        "provider": None,
        "model": None,
        "flags": [],
        "notice": None,
        **template,
    }
    if provider is None:
        out["notice"] = {"code": "error.ai.not_configured", "params": {}}
    else:
        g = build_grounding(result, model, revision)
        lk = Lookup(model)
        user = json.dumps(llm_input(result, g, lk.names), ensure_ascii=False)
        try:
            raw = await provider.generate(_system(lang), user, EXPLANATION_SCHEMA)
            out = _llm_explanation(raw, g, lang, template, provider)
        except ProviderError as exc:
            out["notice"] = {"code": "error.ai.provider", "params": {"reason": exc.reason}}
    if out["mode"] == "llm" or provider is None:
        await repo.cache_put(key, out)  # provider failures are not cached, so a later retry can succeed
    return {**out, "cached": False}


def _llm_explanation(
    raw: dict[str, Any], g: Any, lang: str, template: dict[str, Any], provider: Provider
) -> dict[str, Any]:
    flags = check_explanation(raw, g)
    bad = {(f["section"], f["index"]) for f in flags}
    section_bad = {f["section"] for f in flags if f["index"] is None}
    risks = [
        {
            "text": fill(r.get("text", ""), g, lang),
            "path_id": r.get("path_id"),
            "step_ids": r.get("step_ids", []),
            "finding_ids": r.get("finding_ids", []),
            "verified": ("key_risks", i) not in bad,
        }
        for i, r in enumerate(raw.get("key_risks", []))
    ]
    plan = [
        {
            "text": fill(p.get("text", ""), g, lang),
            "recommendation_id": p.get("recommendation_id"),
            "rank": g.rec_rank.get(p.get("recommendation_id", "")),
            "kind": "llm",
            "verified": ("remediation_plan", i) not in bad and "remediation_plan" not in section_bad,
        }
        for i, p in enumerate(raw.get("remediation_plan", []))
    ]
    return {
        "mode": "llm",
        "provider": provider.name,
        "model": provider.model,
        "notice": None,
        "flags": flags,
        "summary": [fill(raw.get("summary", ""), g, lang)],
        "summary_verified": "summary" not in section_bad,
        "key_risks": risks,
        "attack_steps": template["attack_steps"],  # always engine-rendered
        "remediation_plan": plan,
        "residual": [fill(raw.get("residual_note", ""), g, lang)],
        "residual_verified": "residual" not in section_bad,
    }


# ---- chat ------------------------------------------------------------------------------------
def _norm(text: str) -> str:
    text = text.replace("İ", "i").replace("I", "ı").lower()
    return unicodedata.normalize("NFC", text)


INTENTS = {
    "score": ("score", "puan", "bal", "skor"),
    "fix": ("fix", "remed", "recommend", "düzelt", "düzəlt", "öneri", "tövsiy", "yama", "patch"),
    "residual": ("residual", "artık", "qalıq", "kalan"),
    "path": ("why", "path", "neden", "niye", "niyə", "yol", "how", "nasıl", "necə", "primary", "p1"),
    "steps": ("step", "adım", "addım"),
}


def template_chat(
    lang: str, message: str, result: dict[str, Any] | None, model: dict[str, Any], revision: int
) -> tuple[str, list[str]]:
    if result is None:
        return t(lang, "ai.chat.no_run"), []
    lk = Lookup(model)
    text = _norm(message)
    words = set(re.findall(r"[\wəğıöşçü.-]+", text))
    parts: list[str] = []
    cited: list[str] = []
    paths = result["paths"]
    p1 = paths[0] if paths else None
    scenario = t(lang, f"scenario.{result['scenario']}.name")
    asked = {k for k, keys in INTENTS.items() if any(key in text for key in keys)}

    if "score" in asked:
        parts.append(
            t(
                lang,
                "ai.chat.score",
                revision=revision,
                scenario=scenario,
                score=fmt_score(lang, result["score"]),
                p_breach=fmt_prob(lang, result["p_breach"]),
            )
        )
    if "path" in asked or "steps" in asked:
        if p1 is None:
            parts.append(t(lang, "no_path.unreachable", entry=lk.asset(result["entry"]["asset_id"])))
        else:
            parts.append(
                t(
                    lang,
                    "ai.chat.path",
                    path=p1["id"],
                    likelihood=fmt_prob(lang, p1["likelihood"]),
                    route=route_text(p1, lk),
                )
            )
            steps = attack_steps(lang, result, lk)
            parts.append(
                t(lang, "ai.chat.steps", steps="; ".join(f"{s['step_id']} {s['text']}" for s in steps))
            )
            cited += [p1["id"], *[s["step_id"] for s in steps]]
    if "fix" in asked:
        recs = [r for r in result["recommendations"] if r["kind"] == "blocking"]
        if recs:
            r = recs[0]
            parts.append(
                t(
                    lang,
                    "ai.chat.fix",
                    action=render_action(lang, r["action"], cves=lk.cves, names=lk.names),
                    delta="+" + fmt_score(lang, r["delta_score"]),
                    after=fmt_score(lang, r["score_after"]),
                )
            )
            cited.append(r["id"])
        else:
            parts.append(t(lang, "ai.chat.fix_none"))
    if "residual" in asked:
        findings = {f["id"]: f for f in result["findings"]}
        items = [
            finding_text(lang, findings[f], lk) for f in result["residual_exposure"][:5] if f in findings
        ]
        parts.append(t(lang, "ai.chat.residual", items="; ".join(items) or t(lang, "report.none")))
    for asset in model.get("assets", []):
        if asset["id"] in words or _norm(asset["name"]) in text:
            through = [p["id"] for p in paths if asset["id"] in p["assets"]]
            parts.append(
                t(
                    lang,
                    "ai.chat.asset",
                    asset=asset["name"],
                    type=t(lang, f"assetType.{asset['type']}"),
                    zone=t(lang, f"zone.{asset['zone']}"),
                    risk=fmt_score(lang, result["asset_risk"].get(asset["id"], 0.0)),
                    criticality=asset["criticality"],
                )
            )
            if through:
                parts.append(t(lang, "ai.chat.asset_paths", count=len(through), paths=", ".join(through)))
            else:
                parts.append(t(lang, "ai.chat.asset_paths_none"))
            own = [f for f in result["findings"] if f["asset_id"] == asset["id"]]
            if own:
                parts.append(
                    t(
                        lang,
                        "ai.chat.asset_findings",
                        items="; ".join(finding_text(lang, f, lk) for f in own[:5]),
                    )
                )
            cited.append(asset["id"])
    if not parts:
        parts.append(t(lang, "ai.chat.unknown"))
    return " ".join(parts), cited


async def chat(
    provider: Provider | None,
    lang: str,
    message: str,
    history: list[dict[str, str]],
    result: dict[str, Any] | None,
    model: dict[str, Any],
    revision: int,
) -> dict[str, Any]:
    if provider is None or result is None:
        answer, cited = template_chat(lang, message, result, model, revision)
        notice = None if provider is not None else {"code": "error.ai.not_configured", "params": {}}
        return {
            "mode": "template",
            "answer": answer,
            "cited_ids": cited,
            "flags": [],
            "verified": True,
            "notice": notice,
        }
    g = build_grounding(result, model, revision)
    lk = Lookup(model)
    context = json.dumps(llm_input(result, g, lk.names), ensure_ascii=False)
    convo = "\n".join(f"{h['role']}: {h['content']}" for h in history[-8:])
    user = f"ENGINE RESULT:\n{context}\n\nCONVERSATION:\n{convo}\nuser: {message}"
    try:
        raw = await provider.generate(_system(lang), user, CHAT_SCHEMA)
    except ProviderError as exc:
        answer, cited = template_chat(lang, message, result, model, revision)
        return {
            "mode": "template",
            "answer": answer,
            "cited_ids": cited,
            "flags": [],
            "verified": True,
            "notice": {"code": "error.ai.provider", "params": {"reason": exc.reason}},
        }
    flags = check_text(raw.get("answer", ""), g, "answer", None)
    flags += check_ids(list(raw.get("cited_ids", [])), g, "answer", 0)
    return {
        "mode": "llm",
        "answer": fill(raw.get("answer", ""), g, lang),
        "cited_ids": raw.get("cited_ids", []),
        "flags": flags,
        "verified": not flags,
        "notice": None,
    }
