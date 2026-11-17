"""Post-checks on model output and placeholder filling.

Flags (each makes the item "unverified" in the UI):
- unknown_placeholder: ``{{x}}`` that is not in the grounding values
- literal_number: a number written by the model that matches no engine value within +-0.5 %
- wrong_path_step: a step id cited under a path it does not belong to
- unknown_id: a cited path/step/finding/recommendation id that does not exist
- remediation_order: plan order differs from the engine's recommendation rank order
"""

from __future__ import annotations

import re
from typing import Any

from cybertwin.ai.context import Grounding
from cybertwin.i18n.catalog import fmt_number, fmt_pct, fmt_prob, fmt_score

PLACEHOLDER = re.compile(r"\{\{\s*([^{}\s]+)\s*\}\}")
ID_TOKENS = re.compile(
    r"CVE-\d{4}-\d{4,7}|T\d{4}(?:\.\d{3})?|P\d+\.S\d+|\bP\d+\b|\br\d+\b|\b[a-z][a-z0-9]*(?:-[a-z0-9]+)+\b",
    re.IGNORECASE,
)
NUMBER = re.compile(r"(?<![\w.])\d+(?:[.,]\d+)?")
TOLERANCE = 0.005


def _flag(code: str, section: str, index: int | None, **params: Any) -> dict[str, Any]:
    return {
        "code": code,
        "section": section,
        "index": index,
        "params": params,
        "message": {"code": f"check.{code}", "params": params},
    }


def check_text(text: str, g: Grounding, section: str, index: int | None) -> list[dict[str, Any]]:
    flags = []
    for name in PLACEHOLDER.findall(text):
        if name not in g.values:
            flags.append(_flag("unknown_placeholder", section, index, placeholder=name))
    stripped = PLACEHOLDER.sub(" ", text)
    for known in sorted(g.ids, key=len, reverse=True):
        stripped = stripped.replace(known, " ")
    stripped = ID_TOKENS.sub(" ", stripped)
    allowed: list[float] = list(g.extra_numbers)
    for value, kind in g.values.values():
        allowed.append(float(value))
        if kind == "prob":
            allowed.append(float(value) * 100)
    for raw in NUMBER.findall(stripped):
        num = float(raw.replace(",", "."))
        if not any(abs(num - a) <= max(abs(a) * TOLERANCE, 1e-9) for a in allowed):
            flags.append(_flag("literal_number", section, index, value=raw))
    return flags


def check_ids(ids: list[str], g: Grounding, section: str, index: int) -> list[dict[str, Any]]:
    return [_flag("unknown_id", section, index, id=i) for i in ids if i not in g.ids]


def check_explanation(out: dict[str, Any], g: Grounding) -> list[dict[str, Any]]:
    flags = check_text(out.get("summary", ""), g, "summary", None)
    for i, item in enumerate(out.get("key_risks", [])):
        flags += check_text(item.get("text", ""), g, "key_risks", i)
        path_id = item.get("path_id")
        flags += check_ids([x for x in [path_id] if x], g, "key_risks", i)
        flags += check_ids(item.get("step_ids", []) + item.get("finding_ids", []), g, "key_risks", i)
        if path_id in g.path_steps:
            for step in item.get("step_ids", []):
                if step in g.ids and step not in g.path_steps[path_id]:
                    flags.append(_flag("wrong_path_step", "key_risks", i, step=step, path=path_id))
    ranks: list[int] = []
    for i, item in enumerate(out.get("remediation_plan", [])):
        flags += check_text(item.get("text", ""), g, "remediation_plan", i)
        rid = item.get("recommendation_id", "")
        if rid not in g.rec_rank:
            flags.append(_flag("unknown_id", "remediation_plan", i, id=rid))
        else:
            ranks.append(g.rec_rank[rid])
    if ranks != sorted(ranks) or len(set(ranks)) != len(ranks):
        flags.append(_flag("remediation_order", "remediation_plan", None))
    flags += check_text(out.get("residual_note", ""), g, "residual", None)
    return flags


def format_value(lang: str, value: float, kind: str) -> str:
    if kind == "prob":
        return fmt_prob(lang, value)
    if kind == "score":
        return fmt_score(lang, value)
    if kind == "delta":
        return ("+" if value > 0 else "") + fmt_score(lang, value)
    if kind == "pct":
        return fmt_pct(lang, value)
    if kind == "count":
        return str(int(value))
    return fmt_number(lang, value)


def fill(text: str, g: Grounding, lang: str) -> str:
    def repl(m: re.Match[str]) -> str:
        entry = g.values.get(m.group(1))
        return "[?]" if entry is None else format_value(lang, entry[0], entry[1])

    return PLACEHOLDER.sub(repl, text)
