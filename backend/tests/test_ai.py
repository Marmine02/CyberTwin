"""AI analyst: post-checks, template fallback (real), provider adapters (HTTP contract tests only).

The providers are NOT tested against a real LLM here (none is available on this PC).
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import httpx
import httpx2
import pytest
import respx
from fastapi.testclient import TestClient

from cybertwin.ai.checks import check_explanation, fill
from cybertwin.ai.context import build_grounding
from cybertwin.ai.providers import (
    AnthropicProvider,
    OllamaProvider,
    OpenAICompatibleProvider,
    ProviderError,
)
from cybertwin.ai.service import EXPLANATION_SCHEMA, template_chat
from cybertwin.api.app import create_app
from cybertwin.api.routes.twins import model_view
from cybertwin.config import Settings
from cybertwin.domain.model import TwinContent
from cybertwin.engine.simulate import simulate

V = "/api/v1"
SDE = "sensitive_data_exposure"


@pytest.fixture
def run_result(northwind: TwinContent) -> dict[str, Any]:
    return simulate(northwind, SDE)


def good_output(result: dict[str, Any]) -> dict[str, Any]:
    p1 = result["paths"][0]
    recs = result["recommendations"]
    return {
        "summary": "The score is {{score}} and the breach probability is {{p_breach}}.",
        "key_risks": [
            {
                "text": "P1 reaches the customer database ({{path.P1.likelihood}}).",
                "path_id": "P1",
                "step_ids": [s["id"] for s in p1["steps"]],
                "finding_ids": [p1["steps"][1]["finding_ids"][0]],
            }
        ],
        "remediation_plan": [
            {"text": "First fix: {{rec.1.delta}}.", "recommendation_id": recs[0]["id"]},
            {"text": "Then: {{rec.2.delta}}.", "recommendation_id": recs[1]["id"]},
        ],
        "residual_note": "{{count.residual}} findings remain unused.",
    }


# ---- post-checks -------------------------------------------------------------------------------
def test_checks_pass_on_grounded_output(run_result: dict[str, Any], northwind: TwinContent) -> None:
    g = build_grounding(run_result, model_view(northwind), 1)
    assert check_explanation(good_output(run_result), g) == []


def test_checks_flag_each_problem(run_result: dict[str, Any], northwind: TwinContent) -> None:
    g = build_grounding(run_result, model_view(northwind), 1)
    out = good_output(run_result)
    out["summary"] = "Score {{score}} with {{made.up}} and 42.7 points of nonsense."
    out["key_risks"][0]["step_ids"].append("P2.S1")
    out["key_risks"][0]["finding_ids"].append("vuln:ghost")
    out["remediation_plan"].reverse()
    codes = {f["code"] for f in check_explanation(out, g)}
    assert codes == {
        "unknown_placeholder",
        "literal_number",
        "wrong_path_step",
        "unknown_id",
        "remediation_order",
    }


def test_numbers_that_match_engine_values_are_allowed(
    run_result: dict[str, Any], northwind: TwinContent
) -> None:
    g = build_grounding(run_result, model_view(northwind), 1)
    out = good_output(run_result)
    likelihood_pct = round(run_result["paths"][0]["likelihood"] * 100, 1)  # 71.6, within 0.5 %
    out["summary"] = f"About {likelihood_pct} percent, via port 22 on web-01 (CVE-2023-38408, T1190) in r1."
    assert check_explanation(out, g) == []


def test_fill_formats_per_language(run_result: dict[str, Any], northwind: TwinContent) -> None:
    g = build_grounding(run_result, model_view(northwind), 1)
    assert fill("{{path.P1.likelihood}}", g, "tr") == "%71,6"
    assert fill("{{path.P1.likelihood}}", g, "en") == "71.6%"
    assert fill("{{rec.1.delta}} / {{nope}}", g, "az").endswith("/ [?]")


# ---- provider adapters: HTTP contract tests ------------------------------------------------------
def settings(**kw: Any) -> Settings:
    return Settings(ai_retries=2, ai_timeout_s=2.0, **kw)


@respx.mock
async def test_ollama_contract() -> None:
    route = respx.post("http://127.0.0.1:11434/api/chat").mock(
        return_value=httpx.Response(
            200, json={"message": {"content": json.dumps({"answer": "ok", "cited_ids": []})}}
        )
    )
    p = OllamaProvider(settings(ai_provider="ollama", ai_model="llama3.1"))
    out = await p.generate("sys", "user", {"type": "object"})
    assert out == {"answer": "ok", "cited_ids": []}
    body = json.loads(route.calls[0].request.content)
    assert body["format"] == {"type": "object"}
    assert body["stream"] is False
    assert body["messages"][0] == {"role": "system", "content": "sys"}


@respx.mock
async def test_openai_compatible_contract_with_retry() -> None:
    route = respx.post("http://llm.local/v1/chat/completions").mock(
        side_effect=[
            httpx.Response(503),
            httpx.Response(
                200, json={"choices": [{"message": {"content": '{"answer": "hi", "cited_ids": []}'}}]}
            ),
        ]
    )
    p = OpenAICompatibleProvider(
        settings(
            ai_provider="openai_compatible",
            ai_base_url="http://llm.local/v1",
            ai_api_key="sk-test-123",
            ai_model="m",
        )
    )
    out = await p.generate("s", "u", EXPLANATION_SCHEMA)
    assert out["answer"] == "hi"
    assert route.call_count == 2
    req = route.calls[1].request
    assert req.headers["authorization"] == "Bearer sk-test-123"
    body = json.loads(req.content)
    assert body["response_format"]["type"] == "json_schema"
    assert body["response_format"]["json_schema"]["strict"] is True


@respx.mock
async def test_http_provider_gives_up_with_reason() -> None:
    respx.post("http://llm.local/v1/chat/completions").mock(side_effect=httpx.ConnectTimeout("slow"))
    p = OpenAICompatibleProvider(settings(ai_provider="openai_compatible", ai_base_url="http://llm.local/v1"))
    with pytest.raises(ProviderError) as exc:
        await p.generate("s", "u", {})
    assert exc.value.reason == "timeout"
    respx.post("http://llm.local/v1/chat/completions").mock(return_value=httpx.Response(401))
    with pytest.raises(ProviderError) as exc:
        await p.generate("s", "u", {})
    assert exc.value.reason == "http_401"
    respx.post("http://llm.local/v1/chat/completions").mock(
        return_value=httpx.Response(200, json={"choices": [{"message": {"content": "not json"}}]})
    )
    with pytest.raises(ProviderError, match="invalid_json"):
        await p.generate("s", "u", {})


def anthropic_reply(text: str, stop: str = "end_turn") -> dict[str, Any]:
    return {
        "id": "msg_1",
        "type": "message",
        "role": "assistant",
        "model": "claude-opus-5-5",
        "content": [{"type": "text", "text": text}],
        "stop_reason": stop,
        "stop_sequence": None,
        "usage": {"input_tokens": 10, "output_tokens": 5},
    }


async def test_anthropic_contract() -> None:
    seen: list[httpx2.Request] = []

    def handler(request: httpx2.Request) -> httpx2.Response:
        seen.append(request)
        return httpx2.Response(200, json=anthropic_reply(json.dumps({"answer": "a", "cited_ids": ["P1"]})))

    client = httpx2.AsyncClient(transport=httpx2.MockTransport(handler))
    p = AnthropicProvider(settings(ai_provider="anthropic", ai_api_key="sk-ant-test"), http_client=client)
    assert p.model == "claude-opus-5-5"
    out = await p.generate("system text", "user text", {"type": "object"})
    assert out == {"answer": "a", "cited_ids": ["P1"]}
    req = seen[0]
    assert req.url.path == "/v1/messages"
    # SDK 2.x (API version 2026-10-21) sends the key as a bearer token.
    assert req.headers["authorization"] == "Bearer sk-ant-test"
    assert "server-side-fallback-2026-07-01" in req.headers["anthropic-beta"]
    body = json.loads(req.content)
    assert body["model"] == "claude-opus-5-5"
    assert body["system"] == "system text"
    assert body["output_config"] == {"format": {"type": "json_schema", "schema": {"type": "object"}}}
    assert body["fallbacks"] == "default"
    assert "tool_choice" not in body


async def test_anthropic_refusal_is_an_error() -> None:
    client = httpx2.AsyncClient(
        transport=httpx2.MockTransport(
            lambda r: httpx2.Response(200, json=anthropic_reply("", stop="refusal"))
        )
    )
    p = AnthropicProvider(settings(ai_provider="anthropic", ai_api_key="k"), http_client=client)
    with pytest.raises(ProviderError, match="refusal"):
        await p.generate("s", "u", {})


# ---- template chat ------------------------------------------------------------------------------
@pytest.mark.parametrize(
    ("lang", "question", "expect"),
    [
        ("en", "what is the score?", "score is"),
        ("tr", "Puan nedir?", "puanı"),
        ("az", "Bal neçədir?", "balı"),
        ("tr", "Önce neyi düzeltmeliyim?", "düzeltme"),
        ("en", "tell me about web-01", "Public Web Server"),
        ("az", "P1 niyə mümkündür?", "Əsas yol P1"),
        ("en", "hello", "only answer from the engine"),
    ],
)
def test_template_chat(
    run_result: dict[str, Any], northwind: TwinContent, lang: str, question: str, expect: str
) -> None:
    answer, _ = template_chat(lang, question, run_result, model_view(northwind), 1)
    assert expect in answer


# ---- through the real API -----------------------------------------------------------------------
@pytest.fixture
def client(tmp_path: Path) -> Iterator[TestClient]:
    s = Settings(database_url=f"sqlite+aiosqlite:///{(tmp_path / 'ai.db').as_posix()}")
    with TestClient(create_app(s)) as c:
        yield c


def sse_events(text: str) -> list[tuple[str, Any]]:
    events = []
    for block in text.replace("\r\n", "\n").split("\n\n"):
        name, data = None, None
        for line in block.split("\n"):
            if line.startswith("event:"):
                name = line[6:].strip()
            elif line.startswith("data:"):
                data = json.loads(line[5:].strip())
        if name:
            events.append((name, data))
    return events


@pytest.mark.parametrize("lang", ["en", "tr", "az"])
def test_explain_sse_template_mode(client: TestClient, lang: str) -> None:
    tid = client.get(f"{V}/twins").json()[0]["id"]
    run = client.post(f"{V}/twins/{tid}/simulations", json={"scenario": SDE}).json()
    resp = client.post(f"{V}/ai/explain", json={"run_id": run["id"], "lang": lang})
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/event-stream")
    events = sse_events(resp.text)
    names = [e[0] for e in events]
    assert names[0] == "meta"
    assert names[-1] == "done"
    mode = dict(events)["mode"]
    assert mode["mode"] == "template"
    assert mode["notice"]["code"] == "error.ai.not_configured"
    sections = {d["name"]: d["items"] for n, d in events if n == "section"}
    assert set(sections) == {"summary", "key_risks", "attack_steps", "remediation_plan", "residual"}
    assert [s["step_id"] for s in sections["attack_steps"]] == [
        s["id"] for s in run["result"]["paths"][0]["steps"]
    ]
    again = sse_events(client.post(f"{V}/ai/explain", json={"run_id": run["id"], "lang": lang}).text)
    assert dict(again)["mode"]["cached"] is True


def test_chat_sse_and_status(client: TestClient) -> None:
    assert client.get(f"{V}/ai/status").json() == {"configured": False, "provider": "none", "model": None}
    tid = client.get(f"{V}/twins").json()[0]["id"]
    no_run = sse_events(
        client.post(f"{V}/ai/chat", json={"twin_id": tid, "message": "score", "lang": "en"}).text
    )
    assert "no simulation run" in dict(no_run)["answer"]["answer"]
    client.post(f"{V}/twins/{tid}/simulations", json={"scenario": SDE})
    ev = sse_events(client.post(f"{V}/ai/chat", json={"twin_id": tid, "message": "puan?", "lang": "tr"}).text)
    assert "token" in [n for n, _ in ev]
    assert "puanı" in dict(ev)["answer"]["answer"]


def test_reports_json_and_html_localized(client: TestClient) -> None:
    tid = client.get(f"{V}/twins").json()[0]["id"]
    run = client.post(f"{V}/twins/{tid}/simulations", json={"scenario": SDE}).json()
    rep = client.get(f"{V}/reports/runs/{run['id']}", params={"lang": "tr"}).json()
    assert rep["meta"]["scenario"] == "Hassas Veri İfşası"
    assert rep["summary"]["p_breach"].startswith("%")
    html = client.get(f"{V}/reports/runs/{run['id']}/html", params={"lang": "az"})
    assert html.headers["content-type"].startswith("text/html")
    assert "<html lang='az'>" in html.text
    assert "CyberTwin simulyasiya hesabatı" in html.text
    assert "Yalnız simulyasiya" in html.text
    assert client.get(f"{V}/i18n/tr").json()["severity"]["high"] == "Yüksek"
    assert client.get(f"{V}/i18n/de").status_code == 404
