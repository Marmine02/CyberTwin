"""Health, demo reset, events (notifications), vulnerability catalog."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query, Request

from cybertwin import __version__
from cybertwin.api.deps import Repo
from cybertwin.api.serializers import event_json, twin_json
from cybertwin.seed.catalog import catalog
from cybertwin.services import core

router = APIRouter(tags=["system"])


@router.get("/health")
async def health(request: Request, repo: Repo) -> dict[str, Any]:
    twins = await repo.list_twins()
    return {
        "status": "ok",
        "version": __version__,
        "simulation_only": True,
        "twins": len(twins),
        "ai_provider": request.app.state.settings.ai_provider,
    }


@router.post("/demo/reset", status_code=201)
async def demo_reset(repo: Repo) -> dict[str, Any]:
    twin = await core.reset_demo(repo)
    return twin_json(twin, 1)


@router.get("/events")
async def events(repo: Repo, limit: int = Query(default=30, ge=1, le=200)) -> dict[str, Any]:
    rows = await repo.list_events(limit)
    return {"unread": sum(1 for r in rows if not r.read), "items": [event_json(r) for r in rows]}


@router.post("/events/read")
async def events_read(repo: Repo) -> dict[str, int]:
    return {"marked": await repo.mark_events_read()}


@router.get("/vulns/catalog")
async def vuln_catalog() -> list[dict[str, Any]]:
    return catalog()
