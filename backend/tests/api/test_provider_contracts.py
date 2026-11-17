"""Contract tests for the LLM adapters (respx-mocked HTTP).

These pin down the exact request each adapter sends and how it parses responses and errors. They are
CONTRACT tests against the providers' documented wire formats; none of them talks to a real provider.
"""

from __future__ import annotations

import json
from typing import Any

import httpx
import pytest
import respx

from app.ai.providers import TOOL_NAME
from app.ai.service import AiService
from app.core.config import Settings
from app.engine.simulate import run_simulation
from app.schemas.simulation import ScenarioId, SimulationResult
from app.seed.northwind import northwind_snapshot

OPENAI_BASE = "https://llm.example.test/v1"
ANTHROPIC_BASE = "https://api.anthropic.com"


class _NoCommit:
    async def commit(self) -> None:
        return None


class NoCache:
    def __init__(self) -> None:
        self.s = _NoCommit()
        self.stored: list[Any] = []

    async def get(self, key: str) -> None:
        return None

    async def put(self, entry: Any) -> None:
        self.stored.append(entry)


@pytest.fixture(scope="module")
def result() -> SimulationResult:
    return run_simulation(northwind_snapshot(), "northwind", 1, ScenarioId.sensitive_data_exposure)


def doc() -> dict[str, Any]:
    return {
        "executive_summary": ["Score {{score}}; most likely path {{path.P1.likelihood}}."],
        "attack_narrative": {
            "P1": {"summary": "From the internet to customer-db."},
            "P2": {"summary": "Variant via a second route."},
            "P3": {"summary": "Third variant."},
        },
        "business_impact": ["Customer data exposure."],
        "prioritized_remediation": [
            {"fix_id": "vuln-ssh-exposed|restrict_port:web-01:22:mgmt", "text": "{{chokepoint.vuln-ssh-exposed.delta}}"}
        ],
        "best_practices": ["Keep admin services off the internet."],
    }


def service(**kw: Any) -> AiService:
    s = Settings(ai_timeout_seconds=5, ai_max_retries=1, **kw)
    return AiService(s, NoCache())  # type: ignore[arg-type]


async def collect(svc: AiService, result: SimulationResult) -> list[dict[str, Any]]:
    return [ev async for ev in svc.explain(result, None, "en")]


def text_of(evs: list[dict[str, Any]]) -> str:
    return "".join(e.get("text", "") for e in evs if e["type"] == "delta")


# ------------------------------------------------------------------------------- OpenAI-compatible
@respx.mock
async def test_openai_compatible_request_shape_and_parse(result: SimulationResult) -> None:
    route = respx.post(f"{OPENAI_BASE}/chat/completions").mock(
        return_value=httpx.Response(
            200, json={"choices": [{"message": {"role": "assistant", "content": json.dumps(doc())}}]}
        )
    )
    svc = service(
        ai_provider="openai_compatible", ai_base_url=OPENAI_BASE, ai_model="gpt-test", ai_api_key="sk-test-123"
    )
    evs = await collect(svc, result)

    assert route.call_count == 1
    req = route.calls[0].request
    assert req.headers["authorization"] == "Bearer sk-test-123"
    body = json.loads(req.content)
    assert body["model"] == "gpt-test" and body["temperature"] == 0
    assert body["messages"][0]["role"] == "system" and "NEVER WRITE NUMBERS" in body["messages"][0]["content"]
    assert body["messages"][1]["role"] == "user" and "{{path.P1.likelihood}}" in body["messages"][1]["content"]
    rf = body["response_format"]
    assert rf["type"] == "json_schema" and rf["json_schema"]["strict"] is True
    assert rf["json_schema"]["schema"]["properties"]["attack_narrative"]["required"] == ["P1", "P2", "P3"]
    assert "stream" not in body

    done = evs[-1]
    assert done["mode"] == "llm" and done["numeric_violations"] == [] and done["unknown_placeholders"] == []
    text = text_of(evs)
    assert "Score 24.5; most likely path 70.9%." in text
    assert "- **P1.S1** _[network reach]_ internet can reach web-01 tcp/22" in text


@respx.mock
@pytest.mark.parametrize(
    ("response", "why"),
    [
        (httpx.Response(500, json={"error": {"message": "boom"}}), "HTTP 500"),
        (httpx.Response(200, json={"choices": []}), "no choices"),
        (httpx.Response(200, json={"choices": [{"message": {"refusal": "cannot help"}}]}), "refused"),
        (httpx.Response(200, json={"choices": [{"message": {"content": "not json"}}]}), "not valid ExplainDoc JSON"),
    ],
)
async def test_openai_compatible_failures_retry_then_fall_back(
    result: SimulationResult, response: httpx.Response, why: str
) -> None:
    route = respx.post(f"{OPENAI_BASE}/chat/completions").mock(return_value=response)
    svc = service(ai_provider="openai_compatible", ai_base_url=OPENAI_BASE, ai_model="gpt-test")
    evs = await collect(svc, result)
    assert route.call_count == 2  # first attempt + one retry
    reset = next(e for e in evs if e["type"] == "reset")
    assert why in reset["reason"]
    assert evs[-1]["mode"] == "fallback"
    assert "## Executive summary" in text_of(evs)


def test_openai_compatible_requires_base_url_and_model() -> None:
    assert "AI_BASE_URL" in (service(ai_provider="openai_compatible", ai_model="m").config_error or "")
    assert "AI_MODEL" in (service(ai_provider="openai_compatible", ai_base_url=OPENAI_BASE).config_error or "")


# ------------------------------------------------------------------------------- Anthropic
@respx.mock
async def test_anthropic_request_shape_and_tool_use_parse(result: SimulationResult) -> None:
    route = respx.post(f"{ANTHROPIC_BASE}/v1/messages").mock(
        return_value=httpx.Response(
            200,
            json={
                "id": "msg_1",
                "type": "message",
                "role": "assistant",
                "stop_reason": "tool_use",
                "content": [
                    {"type": "text", "text": "Calling the tool."},
                    {"type": "tool_use", "id": "toolu_1", "name": TOOL_NAME, "input": doc()},
                ],
            },
        )
    )
    svc = service(ai_provider="anthropic", ai_model="claude-sonnet-5-5", ai_api_key="sk-ant-test")
    evs = await collect(svc, result)

    req = route.calls[0].request
    assert req.headers["x-api-key"] == "sk-ant-test"
    assert req.headers["anthropic-version"] == "2023-06-01"
    body = json.loads(req.content)
    assert body["model"] == "claude-sonnet-5-5" and body["max_tokens"] == 4096
    assert "NEVER WRITE NUMBERS" in body["system"]
    assert body["messages"][0]["role"] == "user"
    assert body["tool_choice"] == {"type": "tool", "name": TOOL_NAME}
    tool = body["tools"][0]
    assert tool["name"] == TOOL_NAME
    assert tool["input_schema"]["required"][0] == "executive_summary"

    assert evs[-1]["mode"] == "llm"
    assert "Score 24.5; most likely path 70.9%." in text_of(evs)


@respx.mock
@pytest.mark.parametrize(
    ("response", "why"),
    [
        (httpx.Response(529, json={"type": "error", "error": {"type": "overloaded_error"}}), "HTTP 529"),
        (
            httpx.Response(200, json={"content": [{"type": "text", "text": "no tool"}], "stop_reason": "end_turn"}),
            "no submit_report tool call",
        ),
    ],
)
async def test_anthropic_failures_retry_then_fall_back(
    result: SimulationResult, response: httpx.Response, why: str
) -> None:
    route = respx.post(f"{ANTHROPIC_BASE}/v1/messages").mock(return_value=response)
    svc = service(ai_provider="anthropic", ai_api_key="sk-ant-test")
    evs = await collect(svc, result)
    assert route.call_count == 2
    assert why in next(e for e in evs if e["type"] == "reset")["reason"]
    assert evs[-1]["mode"] == "fallback"


# ------------------------------------------------------------------------------- Ollama (wire format)
@respx.mock
async def test_ollama_sends_schema_in_format_and_concatenates_stream(result: SimulationResult) -> None:
    raw = json.dumps(doc())
    halves = [raw[: len(raw) // 2], raw[len(raw) // 2 :]]
    lines = "\n".join(
        [json.dumps({"message": {"content": h}, "done": False}) for h in halves] + [json.dumps({"done": True})]
    )
    route = respx.post("http://ollama.test:11434/api/chat").mock(return_value=httpx.Response(200, text=lines))
    svc = service(ai_provider="ollama", ai_base_url="http://ollama.test:11434", ai_model="qwen2.5:7b")
    evs = await collect(svc, result)
    body = json.loads(route.calls[0].request.content)
    assert body["stream"] is True and body["options"]["temperature"] == 0
    assert body["format"]["type"] == "object" and "attack_narrative" in body["format"]["properties"]
    assert any(e["type"] == "progress" for e in evs)
    assert evs[-1]["mode"] == "llm"
