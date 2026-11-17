"""Structured LLM output: JSON schema, numeric placeholders filled by the backend, and integrity checks.

The model is asked to return JSON matching a schema (Ollama `format`, OpenAI `response_format`,
Anthropic forced tool use). It must not write quantities itself: every number is a placeholder such as
``{{path.P1.likelihood}}`` that the backend fills from the engine result. Post-checks:

* placeholders: unknown keys are reported and rendered as ``⟨?⟩``;
* numbers: any digit the model wrote anyway (outside identifiers) must match an input number within ±0.5 %;
* citations: in the attack narrative every step id must belong to the path it is cited under;
* order: prioritized remediation must follow the engine's Δscore order.
"""

from __future__ import annotations

import itertools
import json
import re
from collections.abc import Callable
from typing import Any

from pydantic import BaseModel, Field, ValidationError, field_validator

from app.i18n import render
from app.schemas.remediation import Comparison
from app.schemas.simulation import PathStep, SimulationResult

PLACEHOLDER_RE = re.compile(r"\{\{\s*([A-Za-z0-9_.:\-]+)\s*\}\}")
STEP_ID_RE = re.compile(r"\bP\d{1,3}\.S\d{1,3}\b")
PATH_ID_RE = re.compile(r"\bP\d{1,3}\b(?!\.S)")
# identifiers that legitimately contain digits: step/path ids, CVE, ATT&CK, lowercase ids like web-01, tcp/22-style
IDENT_RE = re.compile(
    r"\bP\d{1,3}(?:\.S\d{1,3})?\b|\bCVE-\d{4}-\d{4,7}\b|\bT\d{4}(?:\.\d{3})?\b"
    r"|(?<![\w])[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)+(?![\w-])|\br\d+\b"
)
NUMBER_RE = re.compile(r"(?<![\w.])(\d+(?:[.,]\d+)?)(\s*%)?")
TOLERANCE = 0.005

SECTION_TITLES = {
    "en": {
        "executive_summary": "Executive summary",
        "attack_narrative": "Attack narrative",
        "business_impact": "Business impact",
        "prioritized_remediation": "Prioritized remediation",
        "best_practices": "Best practices",
        "before_after": "Before/after comparison",
    },
    "tr": {
        "executive_summary": "Yönetici özeti",
        "attack_narrative": "Saldırı anlatımı",
        "business_impact": "İş etkisi",
        "prioritized_remediation": "Önceliklendirilmiş iyileştirme",
        "best_practices": "En iyi uygulamalar",
        "before_after": "Önce/sonra karşılaştırması",
    },
    "az": {
        "executive_summary": "Rəhbərlik üçün xülasə",
        "attack_narrative": "Hücumun gedişatı",
        "business_impact": "Biznesə təsir",
        "prioritized_remediation": "Prioritetləşdirilmiş düzəlişlər",
        "best_practices": "Ən yaxşı təcrübələr",
        "before_after": "Əvvəl/sonra müqayisəsi",
    },
}
UNKNOWN = "⟨?⟩"


# ---------------------------------------------------------------- values table
def _pct(x: float) -> str:
    return f"{x * 100:.1f}%"


def build_values(result: SimulationResult, comparison: Comparison | None) -> dict[str, tuple[str, float]]:
    """placeholder key -> (formatted text, raw number)."""
    v: dict[str, tuple[str, float]] = {}

    def put(key: str, text: str, raw: float) -> None:
        v[key] = (text, raw)

    put("score", f"{result.score:.1f}", result.score)
    put("p_breach", _pct(result.p_breach), result.p_breach)
    put("blast_radius", _pct(result.blast_radius), result.blast_radius)
    put("compromised_count", str(len(result.compromised_assets)), len(result.compromised_assets))
    put("reachable_count", str(len(result.reachable_assets)), len(result.reachable_assets))
    put("total_assets", str(result.total_assets), result.total_assets)
    put("path_count", str(len(result.paths)), len(result.paths))
    before = comparison.before_score if comparison else result.score
    after = comparison.after_score if comparison else result.score
    put("score.before", f"{before:.1f}", before)
    put("score.after", f"{after:.1f}", after)
    put("score.delta", f"{after - before:+.1f}", after - before)
    for p in result.paths:
        put(f"path.{p.id}.likelihood", _pct(p.likelihood), p.likelihood)
        put(f"path.{p.id}.risk", f"{p.risk:.3f}", p.risk)
        put(f"path.{p.id}.step_count", str(len(p.steps)), len(p.steps))
        for s in p.steps:
            put(f"step.{s.id}.p", f"{s.p:.2f}", s.p)
    for c in result.chokepoints:
        put(f"chokepoint.{c.vuln_id}.delta", f"{c.delta_score:+.1f}", c.delta_score)
        put(f"chokepoint.{c.vuln_id}.score_after", f"{c.score_after:.1f}", c.score_after)
    for f in result.critical_findings:
        put(f"finding.{f.vuln_id}.cvss", f"{f.cvss:.1f}", f.cvss)
        put(f"finding.{f.vuln_id}.paths", str(f.path_count), f.path_count)
    for a in result.asset_risks:
        if a.risk_score > 0:
            put(f"asset.{a.asset_id}.risk", f"{a.risk_score:.0f}", a.risk_score)
    if comparison:
        put("cmp.blocked", str(len(comparison.blocked_paths)), len(comparison.blocked_paths))
        put("cmp.reduced", str(len(comparison.reduced_paths)), len(comparison.reduced_paths))
        put("cmp.new", str(len(comparison.new_paths)), len(comparison.new_paths))
    return v


def placeholder_guide(values: dict[str, tuple[str, float]]) -> str:
    """Keys only: the model never sees formatted values in the guide."""
    return "\n".join(f"{{{{{k}}}}}" for k in values)


# ---------------------------------------------------------------- schemas
def _str_list(min_items: int = 1, max_items: int = 4) -> dict[str, Any]:
    return {"type": "array", "items": {"type": "string"}, "minItems": min_items, "maxItems": max_items}


def explain_schema(result: SimulationResult, comparison: Comparison | None, max_paths: int = 3) -> dict[str, Any]:
    paths = result.paths[:max_paths]
    path_ids = [p.id for p in paths]
    fix_ids = [f"{c.vuln_id}|{c.action_id}" for c in result.chokepoints if c.delta_score > 0] or ["none|none"]
    props: dict[str, Any] = {
        "executive_summary": _str_list(1, 3),
        # One summary per path, keyed by path id. Step-by-step text is NOT written by the model: live runs showed
        # 7-8B models shifting step descriptions by one position, so steps are rendered from the engine's own
        # reasons. (Ollama 0.30 does not support `pattern`, so digits cannot be banned at grammar level.)
        "attack_narrative": {
            "type": "object",
            "additionalProperties": False,
            "required": path_ids,
            "properties": {
                p.id: {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["summary"],
                    "properties": {"summary": {"type": "string"}},
                }
                for p in paths
            },
        },
        "business_impact": _str_list(1, 3),
        "prioritized_remediation": {
            "type": "array",
            "maxItems": 6,
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["fix_id", "text"],
                "properties": {
                    "fix_id": {"type": "string", "enum": fix_ids},
                    "text": {"type": "string"},
                },
            },
        },
        "best_practices": _str_list(1, 5),
    }
    required = list(props)
    if comparison is not None:
        props["before_after"] = _str_list(1, 3)
        required.append("before_after")
    return {"type": "object", "additionalProperties": False, "required": required, "properties": props}


def chat_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "additionalProperties": False,
        "required": ["answer"],
        "properties": {"answer": _str_list(1, 5)},
    }


class _Step(BaseModel):
    step_id: str
    text: str = ""


class _Narr(BaseModel):
    path_id: str
    summary: str = ""
    steps: list[_Step] = Field(default_factory=list)


class _Rem(BaseModel):
    fix_id: str = ""
    vuln_id: str = ""
    action_id: str = ""
    text: str = ""

    def model_post_init(self, _ctx: Any) -> None:
        if self.fix_id and "|" in self.fix_id and not self.vuln_id:
            self.vuln_id, self.action_id = self.fix_id.split("|", 1)


class ExplainDoc(BaseModel):
    executive_summary: list[str] = Field(default_factory=list)
    attack_narrative: list[_Narr] = Field(default_factory=list)

    @field_validator("attack_narrative", mode="before")
    @classmethod
    def _keyed(cls, v: Any) -> Any:
        """Accept the keyed form {"P1": {"summary", "steps": {"P1.S1": text}}} as well as a list."""
        if isinstance(v, dict):
            out = []
            for pid, body in v.items():
                body = body if isinstance(body, dict) else {}
                steps = body.get("steps") or {}
                if isinstance(steps, dict):
                    steps = [{"step_id": k, "text": t} for k, t in steps.items()]
                out.append({"path_id": pid, "summary": body.get("summary", ""), "steps": steps})
            return out
        return v

    business_impact: list[str] = Field(default_factory=list)
    prioritized_remediation: list[_Rem] = Field(default_factory=list)
    best_practices: list[str] = Field(default_factory=list)
    before_after: list[str] = Field(default_factory=list)

    def texts(self) -> list[str]:
        out = [*self.executive_summary, *self.business_impact, *self.best_practices, *self.before_after]
        for n in self.attack_narrative:
            out.append(n.summary)
            out.extend(s.text for s in n.steps)
        out.extend(r.text for r in self.prioritized_remediation)
        return out


class ChatDoc(BaseModel):
    answer: list[str] = Field(default_factory=list)


class StructuredOutputError(ValueError):
    pass


def parse_doc[T: BaseModel](raw: str, model: type[T]) -> T:
    text = raw.strip()
    if text.startswith("```"):
        text = text.strip("`").removeprefix("json").strip()
    try:
        return model.model_validate(json.loads(text))
    except (json.JSONDecodeError, ValidationError) as exc:
        raise StructuredOutputError(f"model output is not valid {model.__name__} JSON: {str(exc)[:200]}") from exc


# ---------------------------------------------------------------- checks
def fill(text: str, values: dict[str, tuple[str, float]], unknown: set[str]) -> str:
    def rep(m: re.Match[str]) -> str:
        key = m.group(1)
        if key in values:
            return values[key][0]
        unknown.add(key)
        return UNKNOWN

    return PLACEHOLDER_RE.sub(rep, text)


def input_numbers(payload: Any, values: dict[str, tuple[str, float]]) -> list[float]:
    nums: set[float] = set()

    def walk(o: Any) -> None:
        if isinstance(o, bool):
            return
        if isinstance(o, int | float):
            nums.add(float(o))
            if 0 <= o <= 1:
                nums.add(round(float(o) * 100, 6))
        elif isinstance(o, dict):
            for x in o.values():
                walk(x)
        elif isinstance(o, list):
            for x in o:
                walk(x)
        elif isinstance(o, str):
            for m in NUMBER_RE.finditer(IDENT_RE.sub(" ", o)):
                nums.add(float(m.group(1).replace(",", ".")))

    walk(payload)
    for _, raw in values.values():
        walk(raw)
    return sorted(nums)


def stray_numbers(texts: list[str], allowed: list[float]) -> list[str]:
    """Numbers the model wrote itself that do not match any input number within ±0.5 %."""
    bad: list[str] = []
    for t in texts:
        stripped = IDENT_RE.sub(" ", PLACEHOLDER_RE.sub(" ", t))
        for m in NUMBER_RE.finditer(stripped):
            n = float(m.group(1).replace(",", "."))
            if not any(abs(n - a) <= TOLERANCE * max(abs(a), 1e-9) for a in allowed):
                token = m.group(0).strip()
                if token not in bad:
                    bad.append(token)
    return bad


def unplaced_numbers(texts: list[str], allowed: list[float]) -> list[str]:
    """Numbers written literally that DO match an input value: allowed by the ±0.5 % rule, but which
    quantity they refer to cannot be verified (e.g. the score quoted as a path likelihood)."""
    out: list[str] = []
    for t in texts:
        stripped = IDENT_RE.sub(" ", PLACEHOLDER_RE.sub(" ", t))
        for m in NUMBER_RE.finditer(stripped):
            n = float(m.group(1).replace(",", "."))
            token = m.group(0).strip()
            if any(abs(n - a) <= TOLERANCE * max(abs(a), 1e-9) for a in allowed) and token not in out:
                out.append(token)
    return out


TECHNIQUE_LABEL = {
    "en": {
        "reach": "network reach",
        "remote_exploit": "remote exploit",
        "brute_force": "password guessing",
        "kerberoast": "Kerberoasting",
        "credential_theft": "credential dumping",
        "credential_use": "valid account use",
        "local_privesc": "local privilege escalation",
        "trust_abuse": "trust abuse",
        "permission_abuse": "stored credential abuse",
        "data_access": "data access",
        "domain_takeover": "domain takeover",
    },
    "tr": {
        "reach": "ağ erişimi",
        "remote_exploit": "uzaktan istismar",
        "brute_force": "parola tahmini",
        "kerberoast": "Kerberoasting",
        "credential_theft": "kimlik bilgisi dökümü",
        "credential_use": "geçerli hesap kullanımı",
        "local_privesc": "yerel yetki yükseltme",
        "trust_abuse": "güven ilişkisi istismarı",
        "permission_abuse": "kayıtlı kimlik bilgisi istismarı",
        "data_access": "veri erişimi",
        "domain_takeover": "etki alanı ele geçirme",
    },
    "az": {
        "reach": "şəbəkə əlçatanlığı",
        "remote_exploit": "uzaqdan istismar",
        "brute_force": "parolun təxmin edilməsi",
        "kerberoast": "Kerberoasting",
        "credential_theft": "giriş məlumatlarının çıxarılması",
        "credential_use": "etibarlı hesabdan istifadə",
        "local_privesc": "lokal imtiyaz yüksəltmə",
        "trust_abuse": "etibardan sui-istifadə",
        "permission_abuse": "saxlanmış giriş məlumatından sui-istifadə",
        "data_access": "məlumata giriş",
        "domain_takeover": "domenin ələ keçirilməsi",
    },
}
# distinctive words per technique; a step text that uses another technique's words and none of its own is flagged
TECHNIQUE_WORDS = {
    "brute_force": ("brute", "guess", "kaba kuvvet", "tahmin", "təxmin"),
    "kerberoast": ("kerberoast", "service ticket", "servis bileti"),
    "credential_theft": ("dump", "steal", "döküm", "çal", "çıxar", "oğurla"),
    "local_privesc": ("privilege escalation", "escalat", "yetki yükselt", "imtiyaz yüksəlt"),
    "remote_exploit": ("exploit", "istismar", "rce", "remote code", "uzaqdan kod"),
    "trust_abuse": ("trust", "keytab", "token", "güven", "etibar"),
    "domain_takeover": ("domain admin", "domain takeover", "etki alanı", "domen admin", "domenin ələ"),
}
STRONG = ("brute_force", "kerberoast", "credential_theft", "local_privesc")


def technique_violations(doc: ExplainDoc, result: SimulationResult) -> list[dict[str, str]]:
    tech = {s.id: s.technique for p in result.paths for s in p.steps}
    out: list[dict[str, str]] = []
    for n in doc.attack_narrative:
        for st in n.steps:
            real = tech.get(st.step_id)
            if real is None:
                continue
            low = st.text.casefold()
            own = TECHNIQUE_WORDS.get(real, ())
            if any(w in low for w in own):
                continue
            claimed = [t for t in STRONG if t != real and any(w in low for w in TECHNIQUE_WORDS[t])]
            if claimed:
                out.append({"step_id": st.step_id, "engine": real, "claimed": claimed[0]})
    return out


def duplicate_fixes(doc: ExplainDoc) -> list[str]:
    seen: set[str] = set()
    dup: list[str] = []
    for r in doc.prioritized_remediation:
        key = f"{r.vuln_id}|{r.action_id}"
        if key in seen and key not in dup:
            dup.append(key)
        seen.add(key)
    return dup


def citation_violations(doc: ExplainDoc, result: SimulationResult) -> list[dict[str, str]]:
    steps_by_path = {p.id: {s.id for s in p.steps} for p in result.paths}
    out: list[dict[str, str]] = []
    for n in doc.attack_narrative:
        if n.path_id not in steps_by_path:
            out.append({"step_id": "", "cited_under": n.path_id, "problem": "unknown_path"})
            continue
        cited = [s.step_id for s in n.steps]
        for t in [n.summary, *(s.text for s in n.steps)]:
            cited.extend(STEP_ID_RE.findall(t))
        for sid in cited:
            if sid not in steps_by_path[n.path_id]:
                exists = any(sid in s for s in steps_by_path.values())
                out.append(
                    {"step_id": sid, "cited_under": n.path_id, "problem": "wrong_path" if exists else "unknown_step"}
                )
    return out


def order_violations(doc: ExplainDoc, result: SimulationResult) -> list[str]:
    """A fix listed before one with a strictly larger engine Δscore is out of order (ties may go either way)."""
    delta = {c.vuln_id: c.delta_score for c in result.chokepoints if c.delta_score > 0}
    seq = [r.vuln_id for r in doc.prioritized_remediation if r.vuln_id in delta]
    out = [f"{a} before {b}" for a, b in itertools.pairwise(seq) if delta[a] < delta[b] - 1e-9]
    out.extend(r.vuln_id for r in doc.prioritized_remediation if r.vuln_id not in delta)
    return out


# ---------------------------------------------------------------- rendering
def render_explain(
    doc: ExplainDoc,
    values: dict[str, tuple[str, float]],
    lang: str,
    with_comparison: bool,
    result: SimulationResult | None = None,
    reason_text: Callable[[PathStep], str] | None = None,
) -> tuple[str, list[str], list[str]]:
    """-> (markdown, missing_sections, unknown_placeholders)"""
    titles = SECTION_TITLES.get(lang, SECTION_TITLES["en"])
    unknown: set[str] = set()
    missing: list[str] = []
    out: list[str] = []

    def paras(key: str, items: list[str]) -> None:
        out.append(f"## {titles[key]}")
        if not [i for i in items if i.strip()]:
            missing.append(titles[key])
        out.extend(fill(i, values, unknown) for i in items if i.strip())
        out.append("")

    paras("executive_summary", doc.executive_summary)
    out.append(f"## {titles['attack_narrative']}")
    if not doc.attack_narrative:
        missing.append(titles["attack_narrative"])
    for n in doc.attack_narrative:
        out.append(f"**{n.path_id}** {fill(n.summary, values, unknown)}".rstrip())
        labels = TECHNIQUE_LABEL.get(lang, TECHNIQUE_LABEL["en"])
        engine_path = next((p for p in result.paths if p.id == n.path_id), None) if result else None
        if engine_path is not None:
            # authoritative step list: engine technique + engine reason (never model text)
            for st in engine_path.steps:
                why = reason_text(st) if reason_text else render(st.reason, lang)
                out.append(f"- **{st.id}** _[{labels.get(st.technique, st.technique)}]_ {why}")
        else:
            for ms in n.steps:
                out.append(f"- **{ms.step_id}** {fill(ms.text, values, unknown)}")
    out.append("")
    paras("business_impact", doc.business_impact)
    out.append(f"## {titles['prioritized_remediation']}")
    if not doc.prioritized_remediation:
        missing.append(titles["prioritized_remediation"])
    for i, r in enumerate(doc.prioritized_remediation, start=1):
        out.append(f"{i}. `{r.vuln_id}` → `{r.action_id}`: {fill(r.text, values, unknown)}")
    out.append("")
    out.append(f"## {titles['best_practices']}")
    if not doc.best_practices:
        missing.append(titles["best_practices"])
    out.extend(f"- {fill(b, values, unknown)}" for b in doc.best_practices)
    if with_comparison:
        out.append("")
        paras("before_after", doc.before_after)
    return "\n".join(out).strip() + "\n", missing, sorted(unknown)


def render_chat(doc: ChatDoc, values: dict[str, tuple[str, float]]) -> tuple[str, list[str]]:
    unknown: set[str] = set()
    text = "\n\n".join(fill(p, values, unknown) for p in doc.answer if p.strip())
    return text, sorted(unknown)
