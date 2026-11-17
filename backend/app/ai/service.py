"""AI orchestration: provider w/ timeout+retry+backoff, cache by result_hash, deterministic fallback."""

from __future__ import annotations

import asyncio
import hashlib
import json
from collections.abc import AsyncIterator
from typing import Any

import httpx
from pydantic import BaseModel

from app.ai.fallback import answer_chat, render
from app.ai.prompt import CHAT_PROMPT, LANG_INSTRUCTION, SYSTEM_PROMPT, explain_payload, to_json
from app.ai.providers import Provider, ProviderError, make_provider
from app.ai.structured import (
    ChatDoc,
    ExplainDoc,
    StructuredOutputError,
    build_values,
    chat_schema,
    citation_violations,
    duplicate_fixes,
    explain_schema,
    input_numbers,
    order_violations,
    parse_doc,
    placeholder_guide,
    render_chat,
    render_explain,
    stray_numbers,
    technique_violations,
    unplaced_numbers,
)
from app.ai.verify import known_tokens, unverified_ids
from app.core.config import Settings
from app.core.logging import log
from app.models.tables import AiCacheEntry
from app.repositories.repos import AiCacheRepository
from app.schemas.remediation import Comparison
from app.schemas.simulation import SimulationResult

Event = dict[str, Any]
RECOVERABLE = (ProviderError, httpx.HTTPError, json.JSONDecodeError, asyncio.TimeoutError)


EMPTY_CHECKS: dict[str, Any] = {
    "unverified": [],
    "missing_sections": [],
    "numeric_violations": [],
    "citation_violations": [],
    "unknown_placeholders": [],
    "order_violations": [],
    "unplaced_numbers": [],
    "technique_violations": [],
    "duplicate_fixes": [],
}


def _chunks(text: str) -> list[str]:
    """Split for streaming; the concatenation of the chunks equals ``text`` exactly."""
    lines = text.split("\n")
    return [line + "\n" for line in lines[:-1]] + ([lines[-1]] if lines[-1] else [])


class AiService:
    def __init__(self, settings: Settings, cache: AiCacheRepository) -> None:
        self.settings = settings
        self.cache = cache
        try:
            self.provider: Provider | None = make_provider(settings)
            self.config_error: str | None = None
        except ProviderError as exc:
            self.provider = None
            self.config_error = str(exc)

    def status(self) -> dict[str, Any]:
        return {
            "configured_provider": self.settings.ai_provider,
            "provider": self.provider.name if self.provider else "none",
            "model": self.provider.model if self.provider else "",
            "mode": "llm" if self.provider else "fallback",
            "structured_output": True,
            "config_error": self.config_error,
        }

    async def _generate[T: BaseModel](
        self, system: str, messages: list[dict[str, str]], schema: dict[str, Any], model: type[T]
    ) -> AsyncIterator[Event | T]:
        """Yields progress events, then the parsed document; on failure a {'type':'failed'} event."""
        assert self.provider is not None
        last = "unknown error"
        for attempt in range(self.settings.ai_max_retries + 1):
            raw = ""
            try:
                async with asyncio.timeout(self.settings.ai_timeout_seconds * 4):
                    next_report = 0
                    async for chunk in self.provider.stream_json(system, messages, schema):
                        raw += chunk
                        if len(raw) >= next_report:
                            next_report = len(raw) + 400
                            yield {"type": "progress", "chars": len(raw)}
                yield parse_doc(raw, model)
                return
            except (*RECOVERABLE, StructuredOutputError) as exc:
                last = f"{type(exc).__name__}: {exc}"[:300]
                log.warning("ai.provider_error", attempt=attempt, error=last, chars=len(raw))
                if attempt < self.settings.ai_max_retries:
                    await asyncio.sleep(0.5 * 2**attempt)
        yield {"type": "failed", "reason": last}

    async def explain(self, result: SimulationResult, comparison: Comparison | None, lang: str) -> AsyncIterator[Event]:
        payload = explain_payload(result, comparison)
        known = known_tokens(payload)
        cmp_hash = hashlib.sha256(comparison.model_dump_json().encode()).hexdigest()[:16] if comparison else "-"
        status = self.status()
        key = f"explain:v2:{result.result_hash}:{cmp_hash}:{lang}:{status['provider']}:{status['model']}"

        if self.provider is not None:
            cached = await self.cache.get(key)
            if cached is not None:
                yield {
                    "type": "meta",
                    "mode": cached.mode,
                    "provider": cached.provider,
                    "model": cached.model,
                    "cached": True,
                }
                yield {"type": "delta", "text": cached.content}
                yield {"type": "done", "mode": cached.mode, **{**EMPTY_CHECKS, **cached.meta}}
                return
            yield {
                "type": "meta",
                "mode": "llm",
                "provider": status["provider"],
                "model": status["model"],
                "cached": False,
            }
            values = build_values(result, comparison)
            schema = explain_schema(result, comparison)
            user = (
                f"{LANG_INSTRUCTION.get(lang, LANG_INSTRUCTION['en'])}\n\nPLACEHOLDERS (use exactly these keys):\n"
                f"{placeholder_guide(values)}\n\nSimulation result JSON:\n{to_json(payload)}"
            )
            doc: ExplainDoc | None = None
            failed: str | None = None
            async for ev in self._generate(SYSTEM_PROMPT, [{"role": "user", "content": user}], schema, ExplainDoc):
                if isinstance(ev, ExplainDoc):
                    doc = ev
                elif isinstance(ev, dict) and ev["type"] == "failed":
                    failed = ev["reason"]
                elif isinstance(ev, dict):
                    yield ev
            if doc is not None:
                text, missing, unknown = render_explain(doc, values, lang, comparison is not None, result)
                allowed = input_numbers(payload, values)
                checks: dict[str, Any] = {
                    "unverified": unverified_ids(text, known),
                    "missing_sections": missing,
                    "numeric_violations": stray_numbers(doc.texts(), allowed),
                    "unplaced_numbers": unplaced_numbers(doc.texts(), allowed),
                    "technique_violations": technique_violations(doc, result),
                    "duplicate_fixes": duplicate_fixes(doc),
                    "citation_violations": citation_violations(doc, result),
                    "unknown_placeholders": unknown,
                    "order_violations": order_violations(doc, result),
                }
                await self.cache.put(
                    AiCacheEntry(
                        key=key,
                        mode="llm",
                        provider=status["provider"],
                        model=status["model"],
                        content=text,
                        meta=checks,
                    )
                )
                await self.cache.s.commit()
                log.info("ai.explain", **{k: len(v) for k, v in checks.items()})
                for c in _chunks(text):
                    yield {"type": "delta", "text": c}
                yield {"type": "done", "mode": "llm", **checks}
                return
            yield {"type": "reset", "reason": failed or "no output"}
            reason = failed or "no output"
        else:
            reason = self.config_error or "AI_PROVIDER=none"

        text = render(result, comparison, lang)
        yield {
            "type": "meta",
            "mode": "fallback",
            "provider": "template",
            "model": "",
            "cached": False,
            "reason": reason,
        }
        for c in _chunks(text):
            yield {"type": "delta", "text": c}
        yield {"type": "done", "mode": "fallback", **EMPTY_CHECKS, "unverified": unverified_ids(text, known)}

    async def chat(
        self,
        context: dict[str, Any],
        messages: list[dict[str, str]],
        lang: str,
        result: SimulationResult | None = None,
    ) -> AsyncIterator[Event]:
        known = known_tokens(context)
        question = messages[-1]["content"] if messages else ""
        if self.provider is not None:
            status = self.status()
            yield {
                "type": "meta",
                "mode": "llm",
                "provider": status["provider"],
                "model": status["model"],
                "cached": False,
            }
            values = build_values(result, None) if result is not None else {}
            guide = placeholder_guide(values) or "(none: no simulation yet)"
            system = (
                f"{CHAT_PROMPT}\n{LANG_INSTRUCTION.get(lang, LANG_INSTRUCTION['en'])}\n\n"
                f"PLACEHOLDERS (use exactly these keys):\n{guide}"
                f"\n\nContext JSON:\n{json.dumps(context, sort_keys=True, ensure_ascii=False)}"
            )
            doc: ChatDoc | None = None
            failed: str | None = None
            async for ev in self._generate(system, messages, chat_schema(), ChatDoc):
                if isinstance(ev, ChatDoc):
                    doc = ev
                elif isinstance(ev, dict) and ev["type"] == "failed":
                    failed = ev["reason"]
                elif isinstance(ev, dict):
                    yield ev
            if doc is not None and doc.answer:
                text, unknown = render_chat(doc, values)
                for c in _chunks(text):
                    yield {"type": "delta", "text": c}
                yield {
                    "type": "done",
                    "mode": "llm",
                    **EMPTY_CHECKS,
                    "unverified": unverified_ids(text, known),
                    "numeric_violations": stray_numbers(doc.answer, input_numbers(context, values)),
                    "unplaced_numbers": unplaced_numbers(doc.answer, input_numbers(context, values)),
                    "unknown_placeholders": unknown,
                }
                return
            yield {"type": "reset", "reason": failed or "no output"}
            reason = failed or "no output"
        else:
            reason = self.config_error or "AI_PROVIDER=none"
        text = answer_chat(question, context, lang)
        yield {
            "type": "meta",
            "mode": "fallback",
            "provider": "template",
            "model": "",
            "cached": False,
            "reason": reason,
        }
        for c in _chunks(text):
            yield {"type": "delta", "text": c}
        yield {"type": "done", "mode": "fallback", **EMPTY_CHECKS, "unverified": unverified_ids(text, known)}
