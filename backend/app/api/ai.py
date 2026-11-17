"""AI endpoints. Server-Sent Events over POST (fetch + ReadableStream on the client)."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.api.deps import AiDep, ServicesDep
from app.core.errors import DomainError
from app.i18n import localize
from app.models.tables import RemediationRecord
from app.schemas.api import ChatRequest, ExplainRequest
from app.schemas.i18n import msg
from app.schemas.remediation import Comparison
from app.schemas.simulation import SimulationResult

router = APIRouter(tags=["ai"])


def _sse(events: AsyncIterator[dict[str, Any]]) -> StreamingResponse:
    async def gen() -> AsyncIterator[bytes]:
        async for ev in events:
            yield f"event: {ev['type']}\ndata: {json.dumps(ev, ensure_ascii=False)}\n\n".encode()

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/ai/status")
async def ai_status(ai: AiDep) -> dict[str, Any]:
    return ai.status()


@router.post("/ai/explain")
async def explain(body: ExplainRequest, svc: ServicesDep, ai: AiDep) -> StreamingResponse:
    run = await svc.sims.get(body.simulation_id)
    result = SimulationResult.model_validate(run.result_json)
    comparison = None
    if body.remediation_id:
        rec = await svc.s.get(RemediationRecord, body.remediation_id)
        if rec is None:
            raise DomainError("not_found", msg("err.not_found", kind=msg("entity.remediation"), id=body.remediation_id))
        comparison = Comparison.model_validate(rec.comparison)
    return _sse(ai.explain(result, comparison, body.lang))


@router.post("/ai/chat")
async def chat(body: ChatRequest, svc: ServicesDep, ai: AiDep) -> StreamingResponse:
    twin, rev, snap = await svc.snapshot(body.twin_id)
    if body.simulation_id:
        run = await svc.sims.get(body.simulation_id)
    else:
        runs = await svc.sims.list(twin.id, limit=1)
        run = runs[0] if runs else None  # type: ignore[assignment]
    context: dict[str, Any] = {
        "notice": "Virtual model + deterministic simulation output. Nothing was scanned.",
        "twin": {
            "id": twin.id,
            "revision": rev.number,
            **snap.model_dump(mode="json", exclude={"organization"}),
        },
        "simulation": None,
    }
    if run is not None:
        r = run.result_json
        context["simulation"] = {
            k: r[k]
            for k in (
                "scenario",
                "scenario_label",
                "revision",
                "score",
                "p_breach",
                "primary_path",
                "chokepoints",
                "asset_risks",
                "compromised_assets",
                "critical_findings",
            )
        }
    context = localize(context, "en")
    msgs = [m.model_dump() for m in body.messages][-10:]
    result = SimulationResult.model_validate(run.result_json) if run is not None else None
    return _sse(ai.chat(context, msgs, body.lang, result))
