"""Backend side of the shared EN/TR/AZ catalogs (shared/i18n/*.json, also bundled by the frontend).

i18next-compatible: nested keys, ``{{var}}`` interpolation, plurals via ``_one`` / ``_other``
(CLDR: en, tr and az all use one / other). Numbers and percentages are formatted per language.
"""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal

from cybertwin.config import get_settings

Lang = Literal["en", "tr", "az"]
LANGS: tuple[Lang, ...] = ("en", "tr", "az")
_VAR = re.compile(r"\{\{\s*([\w.]+)\s*\}\}")


@lru_cache(maxsize=8)
def _load(lang: str, directory: str) -> dict[str, Any]:
    data: dict[str, Any] = json.loads((Path(directory) / f"{lang}.json").read_text(encoding="utf-8"))
    return data


def catalog(lang: str) -> dict[str, Any]:
    return _load(normalize_lang(lang), str(get_settings().i18n_dir))


def normalize_lang(lang: str | None) -> Lang:
    base = (lang or "en").split(",")[0].split("-")[0].strip().lower()
    for lang in LANGS:
        if base == lang:
            return lang
    return "en"


def _lookup(data: dict[str, Any], key: str) -> Any:
    node: Any = data
    for part in key.split("."):
        if not isinstance(node, dict) or part not in node:
            return None
        node = node[part]
    return node


def has_key(lang: str, key: str) -> bool:
    return isinstance(_lookup(catalog(lang), key), str)


def t(lang: str, key: str, **params: Any) -> str:
    """Translate ``key``; falls back to English, then to the key itself (never crashes)."""
    count = params.get("count")
    candidates = []
    if isinstance(count, int):
        candidates.append(f"{key}_{'one' if count == 1 else 'other'}")
    candidates.append(key)
    for lng in (normalize_lang(lang), "en"):
        data = catalog(lng)
        for k in candidates:
            value = _lookup(data, k)
            if isinstance(value, str):
                return _VAR.sub(lambda m: _fmt_value(params.get(m.group(1), m.group(0))), value)
    return key


def _fmt_value(v: Any) -> str:
    if isinstance(v, list):
        return ", ".join(str(x) for x in v)
    return str(v)


# ---- number formatting --------------------------------------------------------------------
def fmt_number(lang: str, value: float, digits: int = 2) -> str:
    text = f"{value:,.{digits}f}"
    if normalize_lang(lang) in ("tr", "az"):
        text = text.replace(",", "\x00").replace(".", ",").replace("\x00", ".")
    return text


def fmt_score(lang: str, value: float) -> str:
    return fmt_number(lang, value, 1)


def fmt_prob(lang: str, value: float) -> str:
    """Probability as a percentage: en 71.6%, tr %71,6, az 71,6%."""
    num = fmt_number(lang, value * 100, 1)
    return f"%{num}" if normalize_lang(lang) == "tr" else f"{num}%"


def fmt_pct(lang: str, value: float) -> str:
    num = fmt_number(lang, value, 0)
    return f"%{num}" if normalize_lang(lang) == "tr" else f"{num}%"


def fmt_datetime(lang: str, iso: str) -> str:
    """ISO 8601 UTC -> 'DD/MM/YYYY HH:MM UTC' (en) or 'DD.MM.YYYY HH:MM UTC' (tr, az)."""
    from datetime import datetime

    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    except ValueError:
        return iso
    sep = "/" if normalize_lang(lang) == "en" else "."
    return dt.strftime(f"%d{sep}%m{sep}%Y %H:%M UTC")


def fmt_list(lang: str, items: list[str]) -> str:
    if len(items) <= 1:
        return "".join(items)
    return f"{', '.join(items[:-1])} {t(lang, 'list.and')} {items[-1]}"


# ---- engine messages ----------------------------------------------------------------------
_ENUM_PARAMS = {"grants": "level", "level": "level", "strength": "strength", "privilege": "privilege"}


def _localize_params(lang: str, params: dict[str, Any], names: dict[str, str] | None) -> dict[str, Any]:
    out = dict(params)
    for key, ns in _ENUM_PARAMS.items():
        if isinstance(out.get(key), str) and out[key]:
            out[key] = t(lang, f"{ns}.{out[key]}")
    for key in ("src", "dst", "a", "b"):
        if isinstance(out.get(key), str) and has_key(lang, f"zone.{out[key]}"):
            out[key] = t(lang, f"zone.{out[key]}")
    if names:
        for key in ("asset", "src", "source", "target"):
            if isinstance(out.get(key), str) and out[key] in names:
                out[key] = names[out[key]]
        if isinstance(out.get("via"), list):
            out["via"] = fmt_list(lang, [names.get(x, x) for x in out["via"]])
    elif isinstance(out.get("via"), list):
        out["via"] = fmt_list(lang, [str(x) for x in out["via"]])
    if isinstance(out.get("cvss"), (int, float)):
        out["cvss"] = fmt_number(lang, float(out["cvss"]), 1)
    return out


def message_key(code: str, params: dict[str, Any]) -> str:
    """Pick a template variant from params (e.g. step.network_reach_via when a firewall is crossed)."""
    if code == "step.network_reach" and params.get("via"):
        return "step.network_reach_via"
    if code == "step.brute_force" and not params.get("principal"):
        return "step.brute_force_local"
    if code == "step.credential_use" and params.get("level") == "domain_admin":
        return "step.credential_use_domain"
    return code


def render_message(lang: str, message: dict[str, Any], names: dict[str, str] | None = None) -> str:
    params = message.get("params", {})
    return t(lang, message_key(message["code"], params), **_localize_params(lang, params, names))


def render_action(
    lang: str,
    action: dict[str, Any],
    *,
    cves: dict[str, tuple[str, str]] | None = None,
    names: dict[str, str] | None = None,
) -> str:
    kind = action["action"]
    params: dict[str, Any] = {k: v for k, v in action.items() if k != "action"}
    key = f"action.{kind}"
    if kind == "set_password_policy":
        key += "_principal" if params.get("principal_id") else "_asset"
    if kind == "apply_patch":
        cve, asset = (cves or {}).get(
            str(params.get("vulnerability_id")), (str(params.get("vulnerability_id")), "")
        )
        params.update(cve=cve, asset=asset)
    if kind == "segment_zones":
        params["a"], params["b"] = params["zones"][0], params["zones"][1]
    params.setdefault("asset", params.pop("asset_id", ""))
    params.setdefault("principal", params.pop("principal_id", ""))
    return t(lang, key, **_localize_params(lang, params, names))


def goal_label(lang: str, goal: dict[str, Any], names: dict[str, str] | None = None) -> str:
    kind = goal["kind"]
    asset = (names or {}).get(goal.get("asset_id") or "", goal.get("asset_id") or "")
    if kind == "privilege" and str(goal["id"]).endswith(":user"):
        return t(lang, "goal.privilege_user", asset=asset)
    return t(lang, f"goal.{kind}", asset=asset, principal=goal.get("principal_id") or "")
