"""Twins, revisions (+diff/restore), model view, node positions and CRUD on every collection.

No ``from __future__ import annotations`` here: the CRUD factory passes the body model as a runtime
annotation, which FastAPI must see as a class, not a string.
"""

from functools import lru_cache
from typing import Any

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from cybertwin.api.deps import Repo
from cybertwin.api.serializers import revision_json, twin_json
from cybertwin.domain.diff import diff_contents
from cybertwin.domain.model import (
    Asset,
    Connection,
    FirewallRule,
    Principal,
    TwinContent,
    Vulnerability,
)
from cybertwin.engine.simulate import simulate
from cybertwin.services import core
from cybertwin.services.edits import (
    Collection,
    asset_dependents,
    create_item,
    delete_item,
    get_item,
    update_item,
)

router = APIRouter(tags=["twins"])


@lru_cache(maxsize=64)
def _asset_risk(content_json: str) -> dict[str, float]:
    """Asset risk from an internet-entry analysis (goal-independent), cached per content."""
    content = TwinContent.model_validate_json(content_json)
    if not any(a.type == "internet_gateway" for a in content.assets):
        return {}
    risk: dict[str, float] = simulate(content, "sensitive_data_exposure", whatif=False)["asset_risk"]
    return risk


def model_view(content: TwinContent) -> dict[str, Any]:
    data = content.model_dump(mode="json")
    risk = _asset_risk(content.model_dump_json())
    vulns_by_asset: dict[str, list[str]] = {}
    for v in content.vulnerabilities:
        vulns_by_asset.setdefault(v.asset_id, []).append(v.id)
    for a in data["assets"]:
        a["vulnerability_ids"] = sorted(vulns_by_asset.get(a["id"], []))
        a["risk_score"] = risk.get(a["id"], 0.0)
    derived = []
    for p in content.principals:
        homes = sorted(p.logged_on_assets)
        for perm in p.permissions:
            src = homes[0] if homes else None
            if src is None or src == perm.asset_id:
                continue
            derived.append(
                {
                    "id": f"perm:{p.id}:{perm.asset_id}",
                    "source": src,
                    "target": perm.asset_id,
                    "kind": "permission",
                    "label": f"{p.id} ({perm.level.value})",
                    "principal_id": p.id,
                    "level": perm.level.value,
                    "derived": True,
                }
            )
    data["derived_connections"] = sorted(derived, key=lambda x: x["id"])
    return data


# ---- twins & revisions ----------------------------------------------------------------------
@router.get("/twins")
async def list_twins(repo: Repo) -> list[dict[str, Any]]:
    return [twin_json(t, await repo.head_number(t.id)) for t in await repo.list_twins()]


@router.get("/twins/{twin_id}")
async def get_twin(twin_id: int, repo: Repo) -> dict[str, Any]:
    return twin_json(await repo.get_twin(twin_id), await repo.head_number(twin_id))


@router.get("/twins/{twin_id}/revisions")
async def list_revisions(twin_id: int, repo: Repo) -> list[dict[str, Any]]:
    await repo.get_twin(twin_id)
    return [revision_json(r) for r in reversed(await repo.list_revisions(twin_id))]


@router.get("/twins/{twin_id}/revisions/{number}")
async def get_revision(twin_id: int, number: int, repo: Repo) -> dict[str, Any]:
    rev = await repo.get_revision(twin_id, number)
    return {**revision_json(rev.row, with_diff=True), "model": model_view(rev.content)}


@router.get("/twins/{twin_id}/revisions/{number}/diff")
async def revision_diff(
    twin_id: int, number: int, repo: Repo, against: int | None = Query(default=None, ge=1)
) -> dict[str, Any]:
    rev = await repo.get_revision(twin_id, number)
    base_no = against if against is not None else rev.row.parent_number
    if base_no is None:
        return {"from": None, "to": number, "diff": {"summary": {"changes": 0}}}
    base = await repo.get_revision(twin_id, base_no)
    return {"from": base_no, "to": number, "diff": diff_contents(base.content, rev.content)}


@router.post("/twins/{twin_id}/revisions/{number}/restore", status_code=201)
async def restore(twin_id: int, number: int, repo: Repo) -> dict[str, Any]:
    return revision_json(await core.restore_revision(repo, twin_id, number), with_diff=True)


@router.get("/twins/{twin_id}/model")
async def get_model(
    twin_id: int, repo: Repo, revision: int | None = Query(default=None, ge=1)
) -> dict[str, Any]:
    rev = await repo.get_revision(twin_id, revision)
    positions = await repo.get_positions(twin_id)
    return {
        "twin_id": twin_id,
        "revision": rev.row.number,
        "content_hash": rev.row.content_hash,
        **model_view(rev.content),
        "positions": {k: {"x": x, "y": y} for k, (x, y) in sorted(positions.items())},
    }


class Point(BaseModel):
    x: float = Field(ge=-100_000, le=100_000)
    y: float = Field(ge=-100_000, le=100_000)


class PositionsBody(BaseModel):
    positions: dict[str, Point] = Field(max_length=500)


@router.put("/twins/{twin_id}/positions")
async def put_positions(twin_id: int, body: PositionsBody, repo: Repo) -> dict[str, Any]:
    await repo.get_twin(twin_id)
    await repo.set_positions(twin_id, {k: (v.x, v.y) for k, v in body.positions.items()})
    return {"saved": len(body.positions)}


# ---- CRUD -----------------------------------------------------------------------------------
async def _commit(
    repo: Repo,
    twin_id: int,
    content: TwinContent,
    op: str,
    entity: str,
    item_id: str,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    row = await core.commit_content(
        repo,
        twin_id,
        content,
        kind="edit",
        note_i18n={"code": f"revision.{op}", "params": {"entity": entity, "id": item_id}},
    )
    return {"revision": revision_json(row, with_diff=True), **(extra or {})}


def _crud(path: str, coll: Collection, entity: str, model: type[BaseModel]) -> None:
    @router.get(f"/twins/{{twin_id}}/{path}", name=f"list_{path}")
    async def list_items(
        twin_id: int, repo: Repo, revision: int | None = Query(default=None, ge=1)
    ) -> list[dict[str, Any]]:
        rev = await repo.get_revision(twin_id, revision)
        items: list[dict[str, Any]] = model_view(rev.content)[coll]
        return items

    @router.get(f"/twins/{{twin_id}}/{path}/{{item_id}}", name=f"get_{entity}")
    async def get_one(twin_id: int, item_id: str, repo: Repo) -> dict[str, Any]:
        rev = await repo.get_revision(twin_id)
        get_item(rev.content, coll, item_id)
        return next(x for x in model_view(rev.content)[coll] if x["id"] == item_id)

    @router.post(f"/twins/{{twin_id}}/{path}", status_code=201, name=f"create_{entity}")
    async def create(twin_id: int, body: model, repo: Repo) -> dict[str, Any]:  # type: ignore[valid-type]
        rev = await repo.get_revision(twin_id)
        item = body.model_dump(mode="json")  # type: ignore[attr-defined]
        content = create_item(rev.content, coll, item)
        return await _commit(repo, twin_id, content, "create", entity, item["id"], {"item": item})

    @router.put(f"/twins/{{twin_id}}/{path}/{{item_id}}", name=f"update_{entity}")
    async def update(twin_id: int, item_id: str, body: model, repo: Repo) -> dict[str, Any]:  # type: ignore[valid-type]
        rev = await repo.get_revision(twin_id)
        item = body.model_dump(mode="json")  # type: ignore[attr-defined]
        content = update_item(rev.content, coll, item_id, item)
        return await _commit(repo, twin_id, content, "update", entity, item_id, {"item": item})

    @router.delete(f"/twins/{{twin_id}}/{path}/{{item_id}}", name=f"delete_{entity}")
    async def delete(twin_id: int, item_id: str, repo: Repo) -> dict[str, Any]:
        rev = await repo.get_revision(twin_id)
        content, affected = delete_item(rev.content, coll, item_id)
        return await _commit(repo, twin_id, content, "delete", entity, item_id, {"affected": affected})


_crud("assets", "assets", "asset", Asset)
_crud("connections", "connections", "connection", Connection)
_crud("principals", "principals", "principal", Principal)
_crud("firewall-rules", "firewall_rules", "firewall_rule", FirewallRule)
_crud("vulnerabilities", "vulnerabilities", "vulnerability", Vulnerability)


@router.get("/twins/{twin_id}/assets/{asset_id}/dependents")
async def dependents(twin_id: int, asset_id: str, repo: Repo) -> dict[str, list[str]]:
    rev = await repo.get_revision(twin_id)
    get_item(rev.content, "assets", asset_id)
    return asset_dependents(rev.content, asset_id)
