"""AI analyst (SSE), reports and i18n catalog routes."""

from __future__ import annotations

import json
import re
from collections.abc import AsyncIterator
from typing import Any, Literal

from fastapi import APIRouter, Query, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, ConfigDict, Field
from sse_starlette import EventSourceResponse

from cybertwin.ai import service
from cybertwin.api.deps import Repo
from cybertwin.api.routes.twins import model_view
from cybertwin.api.serializers import run_json, twin_json
from cybertwin.db.tables import SimulationRunRow
from cybertwin.errors import AppError
from cybertwin.i18n.catalog import LANGS, catalog, normalize_lang
from cybertwin.reports.render import build_report, render_html

router = APIRouter(tags=["ai", "reports", "i18n"])
LangParam = Literal["en", "tr", "az"]


class ExplainBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    run_id: int = Field(ge=1)
    lang: LangParam = "en"


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=4000)


class ChatBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    twin_id: int = Field(ge=1)
    run_id: int | None = Field(default=None, ge=1)
    message: str = Field(min_length=1, max_length=2000)
    history: list[ChatTurn] = Field(default_factory=list, max_length=20)
    lang: LangParam = "en"


def _event(name: str, data: Any) -> dict[str, str]:
    return {"event": name, "data": json.dumps(data, ensure_ascii=False)}


@router.get("/ai/status")
async def ai_status(request: Request) -> dict[str, Any]:
    p = request.app.state.ai_provider
    return {"configured": p is not None, "provider": p.name if p else "none", "model": p.model if p else None}


@router.post("/ai/explain")
async def explain(body: ExplainBody, request: Request, repo: Repo) -> EventSourceResponse:
    run = await repo.get_run(body.run_id)
    rev = await repo.get_revision(run.twin_id, run.revision_number)
    model = model_view(rev.content)
    provider = request.app.state.ai_provider
    result, revision = run.result, run.revision_number

    async def stream() -> AsyncIterator[dict[str, str]]:
        yield _event(
            "meta",
            {
                "status": "generating",
                "run_id": body.run_id,
                "lang": body.lang,
                "provider": provider.name if provider else "none",
            },
        )
        out = await service.explain(repo, provider, result, model, revision, body.lang)
        yield _event("mode", {k: out.get(k) for k in ("mode", "provider", "model", "cached", "notice")})
        for section in ("summary", "key_risks", "attack_steps", "remediation_plan", "residual"):
            yield _event(
                "section",
                {"name": section, "items": out[section], "verified": out.get(f"{section}_verified", True)},
            )
        yield _event("checks", {"flags": out["flags"]})
        yield _event("done", {"result_hash": result["result_hash"]})

    return EventSourceResponse(stream())


@router.post("/ai/chat")
async def chat(body: ChatBody, request: Request, repo: Repo) -> EventSourceResponse:
    await repo.get_twin(body.twin_id)
    run: SimulationRunRow | None
    if body.run_id is not None:
        run = await repo.get_run(body.run_id)
        if run.twin_id != body.twin_id:
            raise AppError(
                "not_found", 404, "Run does not belong to this twin", entity="run", id=str(body.run_id)
            )
    else:
        run = await repo.latest_run(body.twin_id)
    revision = run.revision_number if run else await repo.head_number(body.twin_id)
    rev = await repo.get_revision(body.twin_id, revision)
    model = model_view(rev.content)
    provider = request.app.state.ai_provider
    history = [h.model_dump() for h in body.history]

    async def stream() -> AsyncIterator[dict[str, str]]:
        yield _event(
            "meta", {"status": "generating", "run_id": run.id if run else None, "revision": revision}
        )
        out = await service.chat(
            provider, body.lang, body.message, history, run.result if run else None, model, revision
        )
        yield _event("mode", {"mode": out["mode"], "notice": out["notice"]})
        for chunk in re.split(r"(?<=[.!?])\s+", out["answer"]):
            if chunk:
                yield _event("token", {"text": chunk + " "})
        yield _event("answer", out)
        yield _event("done", {})

    return EventSourceResponse(stream())


async def _report_inputs(repo: Repo, run_id: int) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    run = await repo.get_run(run_id)
    twin = await repo.get_twin(run.twin_id)
    rev = await repo.get_revision(run.twin_id, run.revision_number)
    return twin_json(twin, await repo.head_number(twin.id)), run_json(run), model_view(rev.content)


@router.get("/reports/runs/{run_id}")
async def report_json(run_id: int, repo: Repo, lang: LangParam = "en") -> dict[str, Any]:
    twin, run, model = await _report_inputs(repo, run_id)
    return build_report(lang, twin=twin, run=run, model=model)


@router.get("/reports/runs/{run_id}/html", response_class=HTMLResponse)
async def report_html(run_id: int, repo: Repo, lang: LangParam = "en") -> HTMLResponse:
    twin, run, model = await _report_inputs(repo, run_id)
    return HTMLResponse(render_html(build_report(lang, twin=twin, run=run, model=model)))


@router.get("/i18n")
async def languages() -> dict[str, Any]:
    return {"languages": list(LANGS), "default": "en"}


@router.get("/i18n/{lang}")
async def i18n_catalog(lang: str, q: str | None = Query(default=None, max_length=40)) -> dict[str, Any]:
    norm = normalize_lang(lang)
    if norm != lang:
        raise AppError("not_found", 404, f"No catalog for {lang}", entity="language", id=lang)
    data = catalog(norm)
    return {k: v for k, v in data.items() if q is None or k == q}
