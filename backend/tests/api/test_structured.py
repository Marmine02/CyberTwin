from __future__ import annotations

import pytest

from app.ai.prompt import explain_payload
from app.ai.structured import (
    UNKNOWN,
    ExplainDoc,
    StructuredOutputError,
    build_values,
    citation_violations,
    explain_schema,
    input_numbers,
    order_violations,
    parse_doc,
    render_explain,
    stray_numbers,
)
from app.engine.simulate import run_simulation
from app.schemas.simulation import ScenarioId, SimulationResult
from app.seed.northwind import northwind_snapshot


@pytest.fixture(scope="module")
def result() -> SimulationResult:
    return run_simulation(northwind_snapshot(), "northwind", 1, ScenarioId.sensitive_data_exposure)


def _doc(**kw: object) -> ExplainDoc:
    base: dict[str, object] = {
        "executive_summary": ["Score is {{score}} and breach probability {{p_breach}}."],
        "attack_narrative": [
            {
                "path_id": "P1",
                "summary": "Likelihood {{path.P1.likelihood}}.",
                "steps": [{"step_id": "P1.S1", "text": "SSH reachable (p={{step.P1.S1.p}})."}],
            }
        ],
        "business_impact": ["Customer data on customer-db is exposed."],
        "prioritized_remediation": [
            {
                "vuln_id": "vuln-ssh-exposed",
                "action_id": "restrict_port:web-01:22:mgmt",
                "text": "{{chokepoint.vuln-ssh-exposed.delta}}",
            },
            {"vuln_id": "vuln-svcweb-weakpw", "action_id": "enforce_mfa:svc-web", "text": "Enforce MFA."},
        ],
        "best_practices": ["Restrict admin services."],
    }
    base.update(kw)
    return ExplainDoc.model_validate(base)


def test_values_and_fill(result: SimulationResult) -> None:
    values = build_values(result, None)
    assert values["path.P1.likelihood"][0] == "70.9%"
    assert values["score"][0] == "24.5"
    assert values["step.P1.S2.p"][0] == "0.93"
    text, missing, unknown = render_explain(_doc(), values, "en", False)
    assert "Score is 24.5 and breach probability 75.5%." in text
    assert "Likelihood 70.9%." in text and "(p=0.99)" in text and "+75.5" in text
    assert missing == [] and unknown == []


def test_unknown_placeholder_is_reported(result: SimulationResult) -> None:
    doc = _doc(business_impact=["Risk {{path.P42.risk}} and {{nonsense}}."])
    text, _, unknown = render_explain(doc, build_values(result, None), "en", False)
    assert unknown == ["nonsense", "path.P42.risk"]
    assert UNKNOWN in text


def test_numbers_written_by_model_are_checked(result: SimulationResult) -> None:
    values = build_values(result, None)
    allowed = input_numbers(explain_payload(result, None), values)
    texts = [
        "Likelihood is 70.9% (correct), 70.6% is close enough to 70.924, port tcp/22 is input data.",
        "But 37.09% and 12 are invented. Ids like web-01, P1.S3, CVE-2099-0101 and T1190 are not numbers.",
    ]
    assert stray_numbers(texts, allowed) == ["37.09%", "12"]
    assert stray_numbers(["{{score}} only"], allowed) == []


def test_step_ids_must_belong_to_their_path(result: SimulationResult) -> None:
    p2_step = result.paths[1].steps[-1].id  # exists, but belongs to P2
    doc = _doc(
        attack_narrative=[
            {
                "path_id": "P1",
                "summary": f"Also see {p2_step}.",
                "steps": [{"step_id": "P1.S1", "text": "ok"}, {"step_id": "P1.S9", "text": "invented"}],
            }
        ]
    )
    v = citation_violations(doc, result)
    assert {"step_id": p2_step, "cited_under": "P1", "problem": "wrong_path"} in v
    assert {"step_id": "P1.S9", "cited_under": "P1", "problem": "unknown_step"} in v
    assert citation_violations(_doc(), result) == []


def test_remediation_order_follows_engine(result: SimulationResult) -> None:
    assert order_violations(_doc(), result) == []
    swapped = _doc(
        prioritized_remediation=[
            {"vuln_id": "vuln-svcweb-weakpw", "action_id": "enforce_mfa:svc-web", "text": ""},
            {"vuln_id": "vuln-ssh-exposed", "action_id": "restrict_port:web-01:22:mgmt", "text": ""},
        ]
    )
    assert order_violations(swapped, result) == ["vuln-svcweb-weakpw before vuln-ssh-exposed"]


def test_missing_sections_and_turkish_titles(result: SimulationResult) -> None:
    text, missing, _ = render_explain(
        _doc(business_impact=[], best_practices=[]), build_values(result, None), "tr", True
    )
    assert "## Yönetici özeti" in text
    assert missing == ["İş etkisi", "En iyi uygulamalar", "Önce/sonra karşılaştırması"]


def test_schema_enumerates_real_ids(result: SimulationResult) -> None:
    schema = explain_schema(result, None)
    narr = schema["properties"]["attack_narrative"]
    assert narr["required"] == ["P1", "P2", "P3"]
    assert narr["properties"]["P1"]["required"] == ["summary"]
    assert "steps" not in narr["properties"]["P1"]["properties"]
    keyed = ExplainDoc.model_validate(
        {"attack_narrative": {"P1": {"summary": "s", "steps": {"P1.S1": "a", "P1.S2": "b"}}}}
    )
    assert [st.step_id for st in keyed.attack_narrative[0].steps] == ["P1.S1", "P1.S2"]
    assert "before_after" not in schema["properties"]
    assert "before_after" in explain_schema(result, object())["required"]  # type: ignore[arg-type]


def test_parse_doc_rejects_garbage() -> None:
    with pytest.raises(StructuredOutputError):
        parse_doc("not json", ExplainDoc)
    assert parse_doc('```json\n{"executive_summary": ["x"]}\n```', ExplainDoc).executive_summary == ["x"]


def test_technique_mismatch_duplicates_and_unplaced_numbers(result: SimulationResult) -> None:
    from app.ai.structured import duplicate_fixes, technique_violations, unplaced_numbers

    doc = _doc(
        attack_narrative=[
            {
                "path_id": "P1",
                "summary": "",
                "steps": [
                    {"step_id": "P1.S3", "text": "Brute force attack on the identity server."},  # engine: trust_abuse
                    {"step_id": "P1.S2", "text": "Exploit the outdated OpenSSH."},  # matches remote_exploit
                ],
            }
        ],
        prioritized_remediation=[
            {"fix_id": "vuln-ssh-exposed|restrict_port:web-01:22:mgmt", "text": ""},
            {"fix_id": "vuln-ssh-exposed|restrict_port:web-01:22:mgmt", "text": ""},
        ],
    )
    assert technique_violations(doc, result) == [
        {"step_id": "P1.S3", "engine": "trust_abuse", "claimed": "brute_force"}
    ]
    assert duplicate_fixes(doc) == ["vuln-ssh-exposed|restrict_port:web-01:22:mgmt"]
    assert doc.prioritized_remediation[0].vuln_id == "vuln-ssh-exposed"
    allowed = input_numbers(explain_payload(result, None), build_values(result, None))
    # 24.54 is the score: it matches an input value, so it is not "stray", but it is reported as unplaced
    texts = ["Path P1 has a likelihood score of 24.54."]
    assert stray_numbers(texts, allowed) == []
    assert unplaced_numbers(texts, allowed) == ["24.54"]


def test_fix_ids_are_valid_pairs(result: SimulationResult) -> None:
    fixes = explain_schema(result, None)["properties"]["prioritized_remediation"]["items"]["properties"]["fix_id"][
        "enum"
    ]
    assert fixes[0] == "vuln-ssh-exposed|restrict_port:web-01:22:mgmt"
    assert all("|" in f for f in fixes)


def test_steps_are_rendered_from_the_engine_not_the_model(result: SimulationResult) -> None:
    doc = _doc(attack_narrative={"P1": {"summary": "Most likely path."}})
    text, _, _ = render_explain(doc, build_values(result, None), "en", False, result)
    assert "- **P1.S1** _[network reach]_ internet can reach web-01 tcp/22" in text
    assert "- **P1.S3** _[trust abuse]_ Abuse the trust web-01 → idp-01 as 'svc-web'" in text
    tr, _, _ = render_explain(doc, build_values(result, None), "tr", False, result)
    assert (
        "- **P1.S3** _[güven ilişkisi istismarı]_ web-01 → idp-01 güven ilişkisi istismar edilir ('svc-web' olarak)"
        in tr
    )
    assert "SSH reachable (p=" not in text  # model step text from _doc() is ignored when the engine path is known
