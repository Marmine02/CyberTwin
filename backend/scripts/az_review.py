"""Generate docs/i18n/az_review.md: every Azerbaijani string next to its English source, grouped by screen.

    cd backend && .venv/Scripts/python scripts/az_review.py ../logs/ui-strings.json ../docs/i18n/az_review.md

ui-strings.json = {"en": <frontend en resources>, "az": <frontend az resources>} (dumped with node from
frontend/src/i18n/*.ts). Backend tables are imported directly.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

from app.ai.fallback import CHAT, T
from app.ai.prompt import LANG_INSTRUCTION
from app.ai.structured import SECTION_TITLES, TECHNIQUE_LABEL
from app.api.reports import LABELS, MONTHS
from app.i18n import CATALOG

# where each frontend section appears
SCREENS = {
    "nav": "Navigation", "top": "Top bar", "help": "Top bar: help menu", "tour": "Guided demo",
    "common": "Shared (buttons, errors)", "validation": "Forms: validation", "overview": "Overview",
    "map": "Network map", "assets": "Assets", "conn": "Assets: connections", "principals": "Assets: identities",
    "rules": "Assets: firewall rules", "sim": "Attack simulation", "ux": "Attack simulation: replay, narration, toasts",
    "vulns": "Vulnerabilities", "vulnForm": "Vulnerabilities: edit form", "ai": "AI assistant",
    "remed": "Remediation", "reports": "Reports", "residual": "Overview / Remediation: residual exposure",
}
ENGINE_GROUPS = [
    ("story.", "Replay narration and event log (plain-language sentences)"),
    ("edge.", "Attack-path step reasons (path table, AI narrative, reports)"),
    ("note.", "Attack-path step reasons: notes"),
    ("goal.", "Attack goals"),
    ("scenario.", "Scenario names (engine)"),
    ("vuln.", "Finding titles"),
    ("change.", "Remediation: model change log"),
    ("action.", "Remediation: fix titles"),
    ("rec.", "Remediation: fix rationale"),
    ("event.", "Notifications"),
    ("rev.", "Revision notes"),
    ("err.", "API error messages"),
    ("entity.", "API error messages: object names"),
    ("", "Engine labels (zones, levels, kinds)"),
]

# the strings I am least sure about: key -> why
UNSURE: dict[str, str] = {
    "assetType.firewall": "“Brandmauer” (common in AZ IT, from Russian). Alternatives: “şəbəkə ekranı”, or keep “firewall”.",
    "assets.tabRules": "Follows the “Brandmauer” choice.",
    "nav.vulnerabilities": "“Zəifliklər” for vulnerabilities/findings; “boşluqlar” is also used.",
    "nav.assistant": "Abbreviation “Sİ” (süni intellekt). Spelled-out “Süni intellekt köməkçisi” is long for the nav.",
    "top.revision": "“Versiya” for a model revision (TR uses “revizyon”, which would be a calque).",
    "top.readOnly": "“yalnız baxış” (view only) rather than a literal “yalnız oxumaq üçün”.",
    "state.warning": "“Zəiflik var” (has a weakness) for “Has findings”.",
    "scenario.lateral_movement": "“Şəbəkə daxilində yayılma”; a literal “yanal hərəkət” would be a Turkish calque.",
    "scenario.privilege_escalation": "“İmtiyazların yüksəldilməsi”; “səlahiyyətlərin artırılması” is also seen.",
    "scenario.credential_compromise": "“Giriş məlumatları” for credentials throughout; “etimadnamələr” is rarer.",
    "phase.pivot": "“Keçid” (transition) for the pivot phase.",
    "technique.credential_use": "“Etibarlı hesabdan istifadə” for ATT&CK “Valid Accounts”; “qanuni hesab” is possible.",
    "remType.apply_patch": "“Yamaq” for patch; some teams say “yeniləmə” or “patç”.",
    "remed.toggle": "“Növbə ilə” (one at a time) for the before/after toggle view.",
    "residual.title": "“Qalıq risk” for residual exposure.",
    "overview.blast": "“Təsir radiusu” for blast radius.",
    "overview.hardening": "“Aktivlərin möhkəmləndirilməsi” for hardening.",
    "ux.narr.sidePath": "“Yan qol” (side branch) for events not on the main path.",
    "tour.wait3": "Refers to the Apply button, whose label is “{{count}} düzəlişi tətbiq et”.",
    "common.errorTitle": "“Alınmadı” (it did not work), short and neutral.",
    "ai.check.unplaced": "Long technical sentence; please check that it reads naturally.",
    "story.edge.kerberoast": "Technical narration: “servis bileti”, “oflayn sındırılır”.",
    "story.edge.trust_abuse": "Word order with two asset names: “{{target}} {{source}} sisteminə etibar edir”.",
    "edge.reach.via": "Engine sentence used in tables and reports; word order “{{origin}} {{via}} vasitəsilə …”.",
    "vuln.weak_password": "“Kerberoasting-ə həssasdır”: the hyphenated case ending on an English term.",
    "err.not_a_firewall": "“{{type}} növündədir” with an engine label such as “veb-server”.",
}


def flatten(t: dict[str, Any], prefix: str = "") -> dict[str, str]:
    out: dict[str, str] = {}
    for k, v in t.items():
        if isinstance(v, dict):
            out.update(flatten(v, f"{prefix}{k}."))
        else:
            out[f"{prefix}{k}"] = v
    return out


def cell(s: str) -> str:
    return s.replace("|", "\\|").replace("\n", "<br>")


def table(rows: list[tuple[str, str, str]]) -> list[str]:
    lines = ["| Key | English | Azerbaijani |", "|---|---|---|"]
    for key, en, az in rows:
        flag = " ⚠️" if key in UNSURE else ""
        lines.append(f"| `{key}`{flag} | {cell(en)} | {cell(az)} |")
    return lines


def main() -> None:
    ui = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    en_ui, az_ui = flatten(ui["en"]), flatten(ui["az"])
    out: list[str] = [
        "# Azerbaijani strings for review",
        "",
        "Every Azerbaijani (az, Latin script) string next to its English source, grouped by where it appears.",
        "Translated from English, not from Turkish. ⚠️ marks the strings I am least sure about; the reasons are listed",
        "first. Placeholders such as `{{asset}}` are filled at run time (asset names, numbers). Plural forms: Azerbaijani",
        "keeps the noun singular after a number, so `_one` and `_other` hold the same sentence.",
        "",
        "Regenerate: `node` dump of the frontend resources to `logs/ui-strings.json`, then",
        "`cd backend && .venv/Scripts/python scripts/az_review.py ../logs/ui-strings.json ../docs/i18n/az_review.md`.",
        "",
        "## Least sure (please check first)",
        "",
        "| Key | Azerbaijani | Why |",
        "|---|---|---|",
    ]
    az_engine = CATALOG["az"]
    for key, why in UNSURE.items():
        az = az_ui.get(key) or az_engine.get(key, "")
        out.append(f"| `{key}` | {cell(az)} | {cell(why)} |")

    out += ["", "# User interface (frontend)", ""]
    for section, title in SCREENS.items():
        rows = [(k, en_ui[k], az_ui[k]) for k in en_ui if k.split(".")[0] == section]
        if rows:
            out += [f"## {title}", "", *table(rows), ""]
    rest = [(k, en_ui[k], az_ui[k]) for k in en_ui if k.split(".")[0] not in SCREENS]
    out += ["## Labels used on several screens (severity, states, zones, types, techniques)", "", *table(rest), ""]

    out += ["# Engine messages (backend catalog)", ""]
    en_engine = CATALOG["en"]
    done: set[str] = set()
    for prefix, title in ENGINE_GROUPS:
        rows = []
        for k in sorted(az_engine):
            if k in done or not k.startswith(prefix):
                continue
            src = en_engine.get(k) or en_engine.get(f"{k}_other", "")
            rows.append((k, src, az_engine[k]))
            done.add(k)
        if rows:
            out += [f"## {title}", "", *table(rows), ""]

    out += ["# AI assistant without a model (deterministic template)", ""]
    out += table([(k, T["en"].get(k) or T["en"].get(f"{k}_other", ""), v) for k, v in T["az"].items()])
    out += ["", "## Chat answers without a model", ""]
    out += table([(k, CHAT["en"][k], v) for k, v in CHAT["az"].items()])
    out += ["", "## AI section titles and technique names (structured output)", ""]
    out += table([(f"section.{k}", SECTION_TITLES["en"][k], v) for k, v in SECTION_TITLES["az"].items()])
    out += table([(f"technique.{k}", TECHNIQUE_LABEL["en"][k], v) for k, v in TECHNIQUE_LABEL["az"].items()])[2:]
    out += ["", "## Instruction to the language model", "", *table([("lang", LANG_INSTRUCTION["en"], LANG_INSTRUCTION["az"])])]
    out += ["", "# Printable report", ""]
    out += table([(k, LABELS["en"][k], v) for k, v in LABELS["az"].items()])
    out += table([("months", MONTHS["en"], MONTHS["az"])])[2:]
    out.append("")
    Path(sys.argv[2]).write_text("\n".join(out), encoding="utf-8")
    print(f"{sys.argv[2]}: {len(en_ui)} UI + {len(az_engine)} engine strings, {len(UNSURE)} flagged")


if __name__ == "__main__":
    main()
