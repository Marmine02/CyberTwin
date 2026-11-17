"""LLM provider adapters. Configured only via env; keys stay server-side.

Every adapter returns *structured* output as a JSON string matching a JSON schema:
* Ollama: ``format=<schema>`` on ``/api/chat`` (streamed; chunks are concatenated JSON text)
* OpenAI-compatible: ``response_format={"type":"json_schema", ...}`` on ``/chat/completions``
* Anthropic: forced tool use (``tool_choice={"type":"tool"}``) whose ``input_schema`` is the schema
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any, Protocol

import httpx

from app.core.config import Settings

TOOL_NAME = "submit_report"


class ProviderError(Exception):
    pass


class Provider(Protocol):
    name: str
    model: str

    def stream_json(
        self, system: str, messages: list[dict[str, str]], schema: dict[str, Any]
    ) -> AsyncIterator[str]: ...


def _timeout(s: Settings) -> httpx.Timeout:
    return httpx.Timeout(s.ai_timeout_seconds, connect=5.0)


class OllamaProvider:
    name = "ollama"

    def __init__(self, s: Settings) -> None:
        self.base = (s.ai_base_url or "http://localhost:11434").rstrip("/")
        self.model = s.ai_model or "qwen2.5:7b"
        self.timeout = _timeout(s)

    async def stream_json(
        self, system: str, messages: list[dict[str, str]], schema: dict[str, Any]
    ) -> AsyncIterator[str]:
        body = {
            "model": self.model,
            "stream": True,
            "format": schema,
            "options": {"temperature": 0},
            "messages": [{"role": "system", "content": system}, *messages],
        }
        async with (
            httpx.AsyncClient(timeout=self.timeout) as c,
            c.stream("POST", f"{self.base}/api/chat", json=body) as r,
        ):
            if r.status_code != 200:
                raise ProviderError(f"ollama returned HTTP {r.status_code}")
            async for line in r.aiter_lines():
                if not line.strip():
                    continue
                data = json.loads(line)
                if data.get("error"):
                    raise ProviderError(str(data["error"]))
                chunk = data.get("message", {}).get("content", "")
                if chunk:
                    yield chunk
                if data.get("done"):
                    break


class OpenAICompatibleProvider:
    name = "openai_compatible"

    def __init__(self, s: Settings) -> None:
        if not s.ai_base_url:
            raise ProviderError("AI_BASE_URL is required for openai_compatible")
        if not s.ai_model:
            raise ProviderError("AI_MODEL is required for openai_compatible")
        self.base = s.ai_base_url.rstrip("/")
        self.model = s.ai_model
        self.key = s.ai_api_key.get_secret_value()
        self.timeout = _timeout(s)

    async def stream_json(
        self, system: str, messages: list[dict[str, str]], schema: dict[str, Any]
    ) -> AsyncIterator[str]:
        headers = {"Authorization": f"Bearer {self.key}"} if self.key else {}
        body = {
            "model": self.model,
            "temperature": 0,
            "messages": [{"role": "system", "content": system}, *messages],
            "response_format": {
                "type": "json_schema",
                "json_schema": {"name": "cybertwin_report", "strict": True, "schema": schema},
            },
        }
        async with httpx.AsyncClient(timeout=self.timeout) as c:
            r = await c.post(f"{self.base}/chat/completions", json=body, headers=headers)
        if r.status_code != 200:
            raise ProviderError(f"provider returned HTTP {r.status_code}")
        data = r.json()
        choices = data.get("choices") or []
        if not choices:
            raise ProviderError("provider returned no choices")
        msg = choices[0].get("message") or {}
        if msg.get("refusal"):
            raise ProviderError(f"provider refused: {str(msg['refusal'])[:200]}")
        content = msg.get("content")
        if not isinstance(content, str) or not content.strip():
            raise ProviderError("provider returned empty content")
        yield content


class AnthropicProvider:
    name = "anthropic"

    def __init__(self, s: Settings) -> None:
        self.base = (s.ai_base_url or "https://api.anthropic.com").rstrip("/")
        self.model = s.ai_model or "claude-sonnet-5-5"
        self.key = s.ai_api_key.get_secret_value()
        if not self.key:
            raise ProviderError("AI_API_KEY is required for anthropic")
        self.timeout = _timeout(s)

    async def stream_json(
        self, system: str, messages: list[dict[str, str]], schema: dict[str, Any]
    ) -> AsyncIterator[str]:
        headers = {"x-api-key": self.key, "anthropic-version": "2023-06-01", "content-type": "application/json"}
        body = {
            "model": self.model,
            "max_tokens": 4096,
            "temperature": 0,
            "system": system,
            "messages": messages,
            "tools": [
                {
                    "name": TOOL_NAME,
                    "description": "Submit the analyst output. Must match the input schema exactly.",
                    "input_schema": schema,
                }
            ],
            "tool_choice": {"type": "tool", "name": TOOL_NAME},
        }
        async with httpx.AsyncClient(timeout=self.timeout) as c:
            r = await c.post(f"{self.base}/v1/messages", json=body, headers=headers)
        if r.status_code != 200:
            raise ProviderError(f"anthropic returned HTTP {r.status_code}")
        data = r.json()
        for block in data.get("content") or []:
            if block.get("type") == "tool_use" and block.get("name") == TOOL_NAME:
                yield json.dumps(block.get("input", {}), ensure_ascii=False)
                return
        raise ProviderError(f"anthropic returned no {TOOL_NAME} tool call (stop_reason={data.get('stop_reason')})")


def make_provider(s: Settings) -> Provider | None:
    if s.ai_provider == "none":
        return None
    if s.ai_provider == "ollama":
        return OllamaProvider(s)
    if s.ai_provider == "openai_compatible":
        return OpenAICompatibleProvider(s)
    return AnthropicProvider(s)
