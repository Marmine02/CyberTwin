from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import pytest

from cybertwin.domain.model import TwinContent
from cybertwin.engine.findings import collect_findings
from cybertwin.engine.graph import build_attack_graph
from cybertwin.engine.scenarios import SCENARIOS
from cybertwin.i18n.catalog import LANGS, catalog, fmt_pct, fmt_prob, fmt_score, message_key, t
from cybertwin.remediation.actions import ACTION_TYPES

SRC = Path(__file__).resolve().parents[1] / "src" / "cybertwin"


def flatten(d: dict[str, Any], prefix: str = "") -> dict[str, str]:
    out: dict[str, str] = {}
    for k, v in d.items():
        key = f"{prefix}{k}"
        if isinstance(v, dict):
            out.update(flatten(v, key + "."))
        else:
            out[key] = v
    return out


def test_catalogs_have_identical_keys_and_placeholders() -> None:
    flat = {lang: flatten(catalog(lang)) for lang in LANGS}
    assert set(flat["tr"]) == set(flat["en"])
    assert set(flat["az"]) == set(flat["en"])
    var = re.compile(r"\{\{\s*(\w+)\s*\}\}")
    for key, en_text in flat["en"].items():
        for lang in ("tr", "az"):
            assert set(var.findall(flat[lang][key])) == set(var.findall(en_text)), f"{lang}:{key}"
            assert flat[lang][key].strip(), f"empty {lang}:{key}"


def test_every_engine_code_has_a_template(northwind: TwinContent) -> None:
    en = flatten(catalog("en"))
    g = build_attack_graph(northwind)
    for _u, _v, a in g.edges(data=True):
        assert message_key(a["message"]["code"], a["message"]["params"]) in en
        assert f"technique.{a['technique']}" in en
    for f in collect_findings(northwind).values():
        assert f"finding.{f.kind}" in en
        assert f"findingKind.{f.kind}" in en
    for s in SCENARIOS:
        assert f"scenario.{s}.name" in en
    for a in ACTION_TYPES:
        assert f"actionType.{a}" in en


def test_every_error_and_event_code_in_source_has_a_message() -> None:
    en = flatten(catalog("en"))
    text = "\n".join(p.read_text(encoding="utf-8") for p in SRC.rglob("*.py"))
    codes = set(re.findall(r'AppError\(\s*"([a-z_.]+)"', text))
    codes |= set(re.findall(r'ActionError\(\s*"([a-z_.]+)"', text))
    codes |= set(re.findall(r'ScenarioError\(\s*"([a-z_.]+)"', text))
    assert codes, "expected to find error codes"
    for code in codes:
        assert f"error.{code}" in en, code
    for code in set(re.findall(r'"event\.([a-z_]+)"', text)) | {"revision_edit", "revision_revert"}:
        assert f"event.{code}" in en, code


@pytest.mark.parametrize(
    ("lang", "one", "many"),
    [
        ("en", "1 finding stays", "3 findings stay"),
        ("tr", "1 bulgu modelde", "3 bulgu modelde"),
        ("az", "1 tapıntı modeldə", "3 tapıntı modeldə"),
    ],
)
def test_plurals(lang: str, one: str, many: str) -> None:
    assert t(lang, "ai.residual", count=1, items="x").startswith(one)
    assert t(lang, "ai.residual", count=3, items="x").startswith(many)


def test_number_formats() -> None:
    assert fmt_prob("en", 0.716404) == "71.6%"
    assert fmt_prob("tr", 0.716404) == "%71,6"
    assert fmt_prob("az", 0.716404) == "71,6%"
    assert fmt_score("tr", 24.98) == "25,0"
    assert fmt_score("en", 1234.5) == "1,234.5"
    assert fmt_score("az", 1234.5) == "1.234,5"
    assert fmt_pct("tr", 83.33) == "%83"


def test_missing_key_and_unknown_language_fall_back() -> None:
    assert t("de", "severity.high") == "High"
    assert t("tr", "does.not.exist") == "does.not.exist"
    assert t("tr", "step.data_access", asset="db", level="admin").startswith("db")
