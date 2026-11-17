from __future__ import annotations

import re
from typing import Any

import pytest

from app.api.misc import VULN_CATALOG
from app.engine.simulate import run_simulation
from app.i18n import CATALOG, is_message, localize, render
from app.remediation.actions import apply_actions
from app.remediation.candidates import generate_candidates
from app.remediation.recommend import action_title, build_recommendations
from app.schemas.i18n import Message, msg
from app.schemas.simulation import ScenarioId
from app.schemas.twin import Vulnerability
from app.seed.northwind import northwind_snapshot

PH = re.compile(r"\{\{\s*(\w+)\s*\}\}")
PLURAL = re.compile(r"_(one|other)$")


def _resolves(table: dict[str, str], code: str) -> bool:
    """i18next resolution: the base key, or both count forms (code_one + code_other)."""
    return code in table or (f"{code}_one" in table and f"{code}_other" in table)


def _forms(table: dict[str, str], code: str) -> list[str]:
    return [t for k in (code, f"{code}_one", f"{code}_other") if (t := table.get(k)) is not None]


def _codes(obj: Any, out: set[str]) -> set[str]:
    if isinstance(obj, Message):
        obj = obj.model_dump(mode="json")
    if is_message(obj):
        out.add(obj["code"])
        _codes(obj["params"], out)
    elif isinstance(obj, dict):
        for v in obj.values():
            _codes(v, out)
    elif isinstance(obj, list):
        for v in obj:
            _codes(v, out)
    return out


def test_languages_have_identical_keys_and_placeholders() -> None:
    # plural forms (code_one/code_other) count as one message; Turkish needs no count forms (no plural after numerals)
    bases = {lang: {PLURAL.sub("", k) for k in table} for lang, table in CATALOG.items()}
    assert set(CATALOG) == {"en", "tr", "az"}
    assert bases["en"] == bases["tr"] == bases["az"]
    for code in bases["en"]:
        for lang, table in CATALOG.items():
            assert _resolves(table, code), (lang, code)
        placeholders = {frozenset(PH.findall(t)) for lang in CATALOG for t in _forms(CATALOG[lang], code)}
        assert len(placeholders) == 1, (code, placeholders)


def test_every_emitted_code_exists_in_every_language() -> None:
    """Run every scenario and every candidate fix on the demo; collect all message codes the engine emits."""
    snap = northwind_snapshot()
    codes: set[str] = set()
    for sc in ScenarioId:
        r = run_simulation(snap, "northwind", 1, sc)
        _codes(r.model_dump(mode="json"), codes)
        _codes(build_recommendations(snap, "northwind", 1, sc, {}).model_dump(mode="json"), codes)
    for cand in generate_candidates(snap, [("dmz", "internal")]):
        _, log = apply_actions(snap, [cand.action])
        _codes([m.model_dump(mode="json") for m in log], codes)
        _codes(action_title(snap, cand.action).model_dump(mode="json"), codes)
    for code in ("event.simulation", "event.remediation", "event.revert", "event.demo_reset"):
        codes.add(code)
    assert len(codes) > 40
    missing = sorted(c for c in codes if not all(_resolves(CATALOG[lang], c) for lang in CATALOG))
    assert missing == []


def test_turkish_rendering_differs_and_nests() -> None:
    m = msg(
        "edge.brute_force",
        strength=msg("strength.weak"),
        principal="svc-web",
        asset="web-01",
        service="ssh",
        port=22,
        mfa=msg("note.no_mfa"),
    )
    assert render(m, "en") == "Guess the weak password of 'svc-web' on web-01 ssh/22 (no MFA)"
    assert render(m, "tr") == "'svc-web' hesabının zayıf parolası web-01 ssh/22 üzerinde tahmin edilir (MFA yok)"
    zones = msg(
        "change.port_restricted", asset="web-01", port=22, proto="tcp", zones=[msg("zone.mgmt"), msg("zone.dmz")]
    )
    assert render(zones, "tr").endswith("Yönetim, DMZ bölgesinden trafik kabul ediyor")
    assert render(msg("no.such.code"), "tr") == "no.such.code"  # never crashes, shows the code


def test_azerbaijani_rendering_is_its_own_language() -> None:
    m = msg(
        "edge.brute_force",
        strength=msg("strength.weak"),
        principal="svc-web",
        asset="web-01",
        service="ssh",
        port=22,
        mfa=msg("note.no_mfa"),
    )
    assert render(m, "az") == "'svc-web' hesabının zəif parolu web-01 ssh/22 üzərində təxmin edilir (MFA yoxdur)"
    zones = msg(
        "change.port_restricted", asset="web-01", port=22, proto="tcp", zones=[msg("zone.mgmt"), msg("zone.dmz")]
    )
    assert render(zones, "az").endswith("artıq yalnız İdarəetmə, DMZ zonasından trafik qəbul edir")
    # Azerbaijani, not Turkish with letters swapped: no Turkish-only letters or common Turkish word forms
    az_text = " ".join(CATALOG["az"].values())
    tr_only = ("üzerinde", "erişim", "bulgu", "değil", "veri", "kullanıcı", "yönetici", "zafiyet", "güvenlik duvarı")
    words = set(re.findall(r"[\w']+", az_text.lower()))
    assert [w for w in tr_only if (w in words if " " not in w else w in az_text.lower())] == []
    assert az_text.count("ə") > 100  # schwa is used throughout


def test_result_reasons_are_messages_and_localize_walks_them() -> None:
    r = run_simulation(northwind_snapshot(), "northwind", 1, ScenarioId.sensitive_data_exposure)
    assert r.primary_path is not None
    step = r.primary_path.steps[2]
    assert step.reason.code == "edge.trust_abuse"
    data = r.model_dump(mode="json", by_alias=True)
    tr = localize(data, "tr")
    assert (
        tr["primary_path"]["steps"][2]["reason"] == "web-01 → idp-01 güven ilişkisi istismar edilir ('svc-web' olarak)"
    )
    assert tr["critical_findings"][0]["title"].startswith("Eski OpenSSH 7.2p2")
    assert isinstance(localize(data, "en")["replay_timeline"][0]["label"], str)


@pytest.mark.parametrize("vuln", northwind_snapshot().vulnerabilities, ids=lambda v: v.id)
def test_seed_titles_match_their_translation_key(vuln: Vulnerability) -> None:
    assert vuln.title_i18n is not None
    assert render(vuln.title_i18n, "en") == vuln.title


def test_catalog_template_titles_match_their_translation_key() -> None:
    for item in VULN_CATALOG:
        assert render(Message.model_validate(item["title_i18n"]), "en") == item["title"], item["template"]


def test_every_literal_code_in_the_source_is_in_the_catalog() -> None:
    """Static guard: msg("some.code") literals anywhere in app/ must exist in EN and TR."""
    import pathlib

    root = pathlib.Path(__file__).resolve().parents[2] / "app"
    literal = re.compile(r'\bmsg\(\s*"([a-z0-9_.]+)"')
    dynamic = re.compile(r'\bmsg\(\s*f"([a-z0-9_.]+)\{')
    found: set[str] = set()
    prefixes: set[str] = set()
    for py in root.rglob("*.py"):
        text = py.read_text(encoding="utf-8")
        found.update(literal.findall(text))
        prefixes.update(dynamic.findall(text))
    assert len(found) > 30
    assert sorted(c for c in found if not all(_resolves(CATALOG[lang], c) for lang in CATALOG)) == []
    for prefix in prefixes:  # f"zone.{...}", f"strength.{...}" etc. must have at least one entry
        assert any(k.startswith(prefix) for k in CATALOG["en"]), prefix


def test_plural_forms_follow_count() -> None:
    one = msg("event.remediation", count=1, rev=3, before=40, after=20)
    many = msg("event.remediation", count=3, rev=3, before=40, after=20)
    assert render(one) == "1 fix applied → r3: score 40 → 20"
    assert render(many) == "3 fixes applied → r3: score 40 → 20"
    assert render(many, "tr").startswith("3 düzeltme")  # TR base key, no count forms
    assert render(one, "az").startswith("1 düzəliş") and render(many, "az").startswith("3 düzəliş")  # AZ: same form
    assert "(s)" not in " ".join(CATALOG["en"].values()) and "(es)" not in " ".join(CATALOG["en"].values())


def test_enum_label_keys_cover_every_value() -> None:
    from app.schemas.twin import AssetType, ConnectionKind, VulnKind

    for prefix, enum in (("assettype", AssetType), ("vulnkind", VulnKind), ("connkind", ConnectionKind)):
        for v in enum:
            for lang in CATALOG:
                assert f"{prefix}.{v.value}" in CATALOG[lang], (lang, prefix, v)


def test_every_step_reason_has_a_story_with_the_same_params() -> None:
    """The replay narration renders story.<code> for each step reason; it must exist and use only known params."""
    snap = northwind_snapshot()
    reasons: set[str] = set()
    for sc in ScenarioId:
        r = run_simulation(snap, "northwind", 1, sc)
        for e in r.replay_timeline:
            reasons.add(e.label.code)
    assert {c for c in reasons if c.startswith("edge.")} == reasons
    for lang, table in CATALOG.items():
        for code in reasons:
            story = table.get(f"story.{code}")
            assert story, (lang, code)
            assert set(PH.findall(story)) <= set(PH.findall(table[code])), (lang, code)
