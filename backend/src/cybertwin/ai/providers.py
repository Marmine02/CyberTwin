"""LLM provider adapters (selected only via environment; keys never leave the backend).

All adapters return the parsed JSON object that matches the requested schema.
- ollama:            POST {base}/api/chat with ``format`` = JSON schema
- openai_compatible: POST {base}/chat/completions with ``response_format`` json_schema (strict)
- anthropic:         official SDK, Messages API with structured outputs (``output_config.format``).
  Forced tool use (``tool_choice: tool``) is rejected with a 400 by current Claude models, so the
  JSON-schema output constraint is used instead (see docs/KNOWN_GAPS.md).
"""

from __future__ import annotations

import asyncio
import json
from typing import Any, Protocol

import anthropic
import httpx

from cybertwin.config import Settings

DEFAULT_MODELS = {"ollama": "llama3.1", "openai_compatible": "gpt-4o-mini", "anthropic": "claude-opus-5-5"}
DEFAULT_BASE = {"ollama": "http://127.0.0.1:11434", "openai_compatible": "https://api.openai.com/v1"}
RETRY_STATUS = {408, 409, 429, 500, 502, 503, 504}


class ProviderError(RuntimeError):
    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


class Provider(Protocol):
    name: str
    model: str

    async def generate(self, system: str, user: str, schema: dict[str, Any]) -> dict[str, Any]: ...


def _parse_json(text: str) -> dict[str, Any]:
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ProviderError("invalid_json") from exc
    if not isinstance(data, dict):
        raise ProviderError("invalid_json")
    return data


class _HttpProvider:
    name = "http"

    def __init__(self, settings: Settings, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self.settings = settings
        self.model = settings.ai_model or DEFAULT_MODELS[self.name]
        self.base = (settings.ai_base_url or DEFAULT_BASE[self.name]).rstrip("/")
        self.transport = transport

    async def _post(self, url: str, body: dict[str, Any], headers: dict[str, str]) -> dict[str, Any]:
        attempts = max(1, self.settings.ai_retries + 1)
        last = "unknown"
        async with httpx.AsyncClient(timeout=self.settings.ai_timeout_s, transport=self.transport) as client:
            for i in range(attempts):
                try:
                    resp = await client.post(url, json=body, headers=headers)
                except httpx.TimeoutException:
                    last = "timeout"
                except httpx.TransportError:
                    last = "connection_error"
                else:
                    if resp.status_code < 400:
                        data: dict[str, Any] = resp.json()
                        return data
                    last = f"http_{resp.status_code}"
                    if resp.status_code not in RETRY_STATUS:
                        break
                if i < attempts - 1:
                    await asyncio.sleep(min(0.25 * 2**i, 4.0))
        raise ProviderError(last)


class OllamaProvider(_HttpProvider):
    name = "ollama"

    async def generate(self, system: str, user: str, schema: dict[str, Any]) -> dict[str, Any]:
        body = {
            "model": self.model,
            "stream": False,
            "format": schema,
            "options": {"temperature": 0},
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        }
        data = await self._post(f"{self.base}/api/chat", body, {})
        try:
            return _parse_json(data["message"]["content"])
        except (KeyError, TypeError) as exc:
            raise ProviderError("unexpected_response") from exc


class OpenAICompatibleProvider(_HttpProvider):
    name = "openai_compatible"

    async def generate(self, system: str, user: str, schema: dict[str, Any]) -> dict[str, Any]:
        body = {
            "model": self.model,
            "temperature": 0,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            "response_format": {
                "type": "json_schema",
                "json_schema": {"name": "cybertwin_output", "schema": schema, "strict": True},
            },
        }
        headers = {}
        key = self.settings.ai_api_key.get_secret_value()
        if key:
            headers["Authorization"] = f"Bearer {key}"
        data = await self._post(f"{self.base}/chat/completions", body, headers)
        try:
            return _parse_json(data["choices"][0]["message"]["content"])
        except (KeyError, IndexError, TypeError) as exc:
            raise ProviderError("unexpected_response") from exc


class AnthropicProvider:
    name = "anthropic"

    def __init__(self, settings: Settings, http_client: Any | None = None) -> None:
        self.model = settings.ai_model or DEFAULT_MODELS["anthropic"]
        kwargs: dict[str, Any] = {"timeout": settings.ai_timeout_s, "max_retries": settings.ai_retries}
        key = settings.ai_api_key.get_secret_value()
        if key:
            kwargs["api_key"] = key
        if settings.ai_base_url:
            kwargs["base_url"] = settings.ai_base_url
        if http_client is not None:
            kwargs["http_client"] = http_client
        self.client = anthropic.AsyncAnthropic(**kwargs)

    async def generate(self, system: str, user: str, schema: dict[str, Any]) -> dict[str, Any]:
        try:
            resp = await self.client.messages.create(
                model=self.model,
                max_tokens=16000,
                system=system,
                messages=[{"role": "user", "content": user}],
                output_config={"format": {"type": "json_schema", "schema": schema}},
                # Server-side refusal fallback (routes by refusal category).
                extra_headers={"anthropic-beta": "server-side-fallback-2026-07-01"},
                extra_body={"fallbacks": "default"},
            )
        except anthropic.APITimeoutError as exc:
            raise ProviderError("timeout") from exc
        except anthropic.APIConnectionError as exc:
            raise ProviderError("connection_error") from exc
        except anthropic.APIStatusError as exc:
            raise ProviderError(f"http_{exc.status_code}") from exc
        if resp.stop_reason == "refusal":
            raise ProviderError("refusal")
        if resp.stop_reason == "max_tokens":
            raise ProviderError("max_tokens")
        text = next((b.text for b in resp.content if b.type == "text"), None)
        if text is None:
            raise ProviderError("unexpected_response")
        return _parse_json(text)


def make_provider(settings: Settings) -> Provider | None:
    if settings.ai_provider == "ollama":
        return OllamaProvider(settings)
    if settings.ai_provider == "openai_compatible":
        return OpenAICompatibleProvider(settings)
    if settings.ai_provider == "anthropic":
        return AnthropicProvider(settings)
    return None
