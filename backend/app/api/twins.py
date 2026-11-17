"""Twins, revisions, layout and entity CRUD. Every edit creates a new immutable revision."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query, Response

from app.api.deps import ServicesDep, revision_out
from app.core.errors import DomainError
from app.i18n import render
from app.repositories.repos import iso
from app.schemas.api import (
    AssetImpact,
    LayoutUpdate,
    MutationOut,
    RevisionDetail,
    RevisionOut,
    TwinCreate,
    TwinOut,
    TwinState,
)
from app.schemas.i18n import Message, msg
from app.schemas.twin import (
    Asset,
    Connection,
    ConnectionKind,
    FirewallRule,
    Principal,
    RuleAction,
    TwinSnapshot,
    Vulnerability,
)
from app.services.diff import diff_snapshots

router = APIRouter(tags=["twins"])

ExpectedRev = Query(default=None, description="Optimistic concurrency: fail with 409 if head moved")


def twin_out(t: Any) -> TwinOut:
    return TwinOut(id=t.id, name=t.name, head_revision=t.head_revision, created_at=iso(t.created_at))


# ---- twins ------------------------------------------------------------------------------------
@router.get("/twins", response_model=list[TwinOut])
async def list_twins(svc: ServicesDep) -> list[TwinOut]:
    return [twin_out(t) for t in await svc.twins.list()]


@router.post("/twins", response_model=TwinState, status_code=201)
async def create_twin(body: TwinCreate, svc: ServicesDep) -> TwinState:
    snap = TwinSnapshot(organization=body.name)
    if body.clone_from:
        _, _, snap = await svc.snapshot(body.clone_from)
    twin = await svc.twins.create(body.id, body.name)
    note_msg = msg("rev.cloned", source=body.clone_from) if body.clone_from else msg("rev.created")
    await svc.twins.add_revision(
        twin,
        snap.model_dump(mode="json"),
        parent=None,
        kind="seed",
        note=render(note_msg, "en"),
        diff={**diff_snapshots(None, snap), "note_msg": note_msg.model_dump(mode="json")},
    )
    await svc.s.commit()
    return await get_twin(body.id, svc)


@router.get("/twins/{twin_id}", response_model=TwinState)
async def get_twin(twin_id: str, svc: ServicesDep, revision: int | None = None) -> TwinState:
    twin, rev, _ = await svc.snapshot(twin_id, revision)
    snap = await svc.snapshot_with_layout(twin_id, rev.number)
    runs = await svc.sims.list(twin_id, limit=50)
    latest = next((r for r in runs if r.revision == rev.number), None)
    if latest is not None:
        risks = {a["asset_id"]: a["risk_score"] for a in latest.result_json["asset_risks"]}
        for a in snap.assets:
            a.risk_score = risks.get(a.id)
    return TwinState(
        twin=twin_out(twin),
        revision=revision_out(rev),
        snapshot=snap,
        latest_simulation_id=latest.id if latest else None,
    )


@router.delete("/twins/{twin_id}", status_code=204)
async def delete_twin(twin_id: str, svc: ServicesDep) -> Response:
    await svc.twins.get(twin_id)
    await svc.twins.delete(twin_id)
    await svc.s.commit()
    return Response(status_code=204)


# ---- revisions --------------------------------------------------------------------------------
@router.get("/twins/{twin_id}/revisions", response_model=list[RevisionOut])
async def list_revisions(twin_id: str, svc: ServicesDep) -> list[RevisionOut]:
    await svc.twins.get(twin_id)
    return [revision_out(r) for r in await svc.twins.revisions(twin_id)]


@router.get("/twins/{twin_id}/revisions/{number}", response_model=RevisionDetail)
async def get_revision(twin_id: str, number: int, svc: ServicesDep) -> RevisionDetail:
    rev = await svc.twins.revision(twin_id, number)
    return RevisionDetail(
        **revision_out(rev).model_dump(), snapshot=TwinSnapshot.model_validate(rev.snapshot), diff=rev.diff
    )


@router.get("/twins/{twin_id}/diff")
async def diff_revisions(twin_id: str, svc: ServicesDep, base: int, target: int) -> dict[str, Any]:
    a = await svc.twins.revision(twin_id, base)
    b = await svc.twins.revision(twin_id, target)
    return {
        "base": base,
        "target": target,
        "diff": diff_snapshots(TwinSnapshot.model_validate(a.snapshot), TwinSnapshot.model_validate(b.snapshot)),
    }


# ---- layout (not revisioned; never enters the engine) ------------------------------------------
@router.put("/twins/{twin_id}/layout", status_code=204)
async def save_layout(twin_id: str, body: LayoutUpdate, svc: ServicesDep) -> Response:
    _, _, snap = await svc.snapshot(twin_id)
    ids = {a.id for a in snap.assets}
    unknown = sorted(set(body.positions) - ids)
    if unknown:
        raise DomainError("asset_not_found", msg("err.layout_unknown", ids=", ".join(unknown), count=len(unknown)))
    await svc.layout.upsert(twin_id, {k: (v.x, v.y) for k, v in body.positions.items()})
    await svc.s.commit()
    return Response(status_code=204)


# ---- generic entity helpers ---------------------------------------------------------------------
_ENTITY = {
    "Asset": "entity.asset",
    "Connection": "entity.connection",
    "Principal": "entity.principal",
    "Firewall rule": "entity.rule",
    "Vulnerability": "entity.vuln",
}


def _find(items: list[dict[str, Any]], eid: str, label: str, code: str) -> dict[str, Any]:
    for it in items:
        if it["id"] == eid:
            return it
    raise DomainError(code, msg("err.not_found", kind=msg(_ENTITY[label]), id=eid))


def _ensure_new(items: list[dict[str, Any]], eid: str, label: str) -> None:
    if any(it["id"] == eid for it in items):
        raise DomainError("duplicate_id", msg("err.duplicate", kind=msg(_ENTITY[label]), id=eid))


def _port_open(data: dict[str, Any], asset_id: str, port: int) -> bool:
    asset = next((a for a in data["assets"] if a["id"] == asset_id), None)
    return asset is not None and any(p["port"] == port for p in asset["open_ports"])


def _asset_exists(data: dict[str, Any], asset_id: str) -> None:
    if not any(a["id"] == asset_id for a in data["assets"]):
        raise DomainError("asset_not_found", msg("err.not_found", kind=msg("entity.asset"), id=asset_id))


async def _mutation(
    svc: ServicesDep, twin_id: str, fn: Any, expected: int | None, entity: dict[str, Any] | None = None
) -> MutationOut:
    rev = await svc.mutate(twin_id, fn, expected_revision=expected)
    return MutationOut(revision=revision_out(rev), entity=entity)


# ---- assets ----------------------------------------------------------------------------------
@router.get("/twins/{twin_id}/assets", response_model=list[Asset])
async def list_assets(twin_id: str, svc: ServicesDep) -> list[Asset]:
    return (await get_twin(twin_id, svc)).snapshot.assets


@router.get("/twins/{twin_id}/assets/{asset_id}", response_model=Asset)
async def get_asset(twin_id: str, asset_id: str, svc: ServicesDep) -> Asset:
    for a in (await get_twin(twin_id, svc)).snapshot.assets:
        if a.id == asset_id:
            return a
    raise DomainError("asset_not_found", msg("err.not_found", kind=msg("entity.asset"), id=asset_id))


@router.post("/twins/{twin_id}/assets", response_model=MutationOut, status_code=201)
async def create_asset(
    twin_id: str, body: Asset, svc: ServicesDep, expected_revision: int | None = ExpectedRev
) -> MutationOut:
    def fn(d: dict[str, Any]) -> Message:
        _ensure_new(d["assets"], body.id, "Asset")
        if body.vulnerability_ids:
            raise DomainError("invalid_snapshot", msg("err.vuln_needs_asset"))
        d["assets"].append(body.model_dump(mode="json"))
        return msg("rev.asset_added", id=body.id)

    return await _mutation(svc, twin_id, fn, expected_revision, body.model_dump(mode="json"))


@router.put("/twins/{twin_id}/assets/{asset_id}", response_model=MutationOut)
async def update_asset(
    twin_id: str, asset_id: str, body: Asset, svc: ServicesDep, expected_revision: int | None = ExpectedRev
) -> MutationOut:
    if body.id != asset_id:
        raise DomainError("invalid_snapshot", msg("err.id_mismatch", body=body.id, path=asset_id))

    def fn(d: dict[str, Any]) -> Message:
        cur = _find(d["assets"], asset_id, "Asset", "asset_not_found")
        new = body.model_dump(mode="json")
        new["vulnerability_ids"] = cur["vulnerability_ids"]  # managed via the vulnerabilities API
        new["position"] = cur["position"]
        for v in d["vulnerabilities"]:
            port = v.get("affected_port")
            if v.get("affected_asset") == asset_id and port and not any(p["port"] == port for p in new["open_ports"]):
                raise DomainError(
                    "in_use",
                    msg("err.port_in_use", port=port, asset=asset_id, vuln=v["id"]),
                )
        d["assets"] = [new if a["id"] == asset_id else a for a in d["assets"]]
        return msg("rev.asset_edited", id=asset_id)

    return await _mutation(svc, twin_id, fn, expected_revision, body.model_dump(mode="json"))


def asset_impact(d: dict[str, Any], asset_id: str) -> AssetImpact:
    return AssetImpact(
        asset_id=asset_id,
        connections=sorted(c["id"] for c in d["connections"] if asset_id in (c["source"], c["target"])),
        firewall_rules=sorted(
            r["id"] for r in d["firewall_rules"] if asset_id in (r["firewall_id"], r.get("dst_asset"))
        ),
        principals=sorted(
            p["id"]
            for p in d["principals"]
            if asset_id in p["logged_on_assets"] or any(x["asset_id"] == asset_id for x in p["permissions"])
        ),
        vulnerabilities=sorted(v["id"] for v in d["vulnerabilities"] if v.get("affected_asset") == asset_id),
    )


@router.get("/twins/{twin_id}/assets/{asset_id}/impact", response_model=AssetImpact)
async def get_asset_impact(twin_id: str, asset_id: str, svc: ServicesDep) -> AssetImpact:
    _, _, snap = await svc.snapshot(twin_id)
    d = snap.model_dump(mode="json")
    _find(d["assets"], asset_id, "Asset", "asset_not_found")
    return asset_impact(d, asset_id)


@router.delete("/twins/{twin_id}/assets/{asset_id}", response_model=MutationOut)
async def delete_asset(
    twin_id: str, asset_id: str, svc: ServicesDep, expected_revision: int | None = ExpectedRev
) -> MutationOut:
    def fn(d: dict[str, Any]) -> Message:
        _find(d["assets"], asset_id, "Asset", "asset_not_found")
        imp = asset_impact(d, asset_id)
        d["assets"] = [a for a in d["assets"] if a["id"] != asset_id]
        d["connections"] = [c for c in d["connections"] if c["id"] not in imp.connections]
        d["firewall_rules"] = [r for r in d["firewall_rules"] if r["id"] not in imp.firewall_rules]
        for p in d["principals"]:
            p["logged_on_assets"] = [a for a in p["logged_on_assets"] if a != asset_id]
            p["permissions"] = [x for x in p["permissions"] if x["asset_id"] != asset_id]
        gone = set(imp.vulnerabilities)
        d["vulnerabilities"] = [v for v in d["vulnerabilities"] if v["id"] not in gone]
        for a in d["assets"]:
            a["vulnerability_ids"] = [v for v in a["vulnerability_ids"] if v not in gone]
        extra = sum(len(x) for x in (imp.connections, imp.firewall_rules, imp.vulnerabilities))
        return (
            msg("rev.asset_deleted_deps", id=asset_id, count=extra) if extra else msg("rev.asset_deleted", id=asset_id)
        )

    return await _mutation(svc, twin_id, fn, expected_revision)


# ---- connections -----------------------------------------------------------------------------
def _validate_connection(d: dict[str, Any], c: Connection, ignore_id: str | None = None) -> None:
    _asset_exists(d, c.source)
    _asset_exists(d, c.target)
    for other in d["connections"]:
        if other["id"] == ignore_id:
            continue
        same = (
            {other["source"], other["target"]} == {c.source, c.target}
            if c.kind == ConnectionKind.network
            else (other["source"], other["target"]) == (c.source, c.target)
        )
        if same and other["kind"] == c.kind.value:
            raise DomainError(
                "conflict",
                msg(
                    "err.connection_exists",
                    kind=msg(f"connkind.{c.kind.value}"),
                    source=c.source,
                    target=c.target,
                    existing=other["id"],
                ),
            )
    for port in c.ports:
        if not (_port_open(d, c.source, port) or _port_open(d, c.target, port)):
            raise DomainError(
                "port_not_open",
                msg("err.connection_port_closed", source=c.source, target=c.target, port=port),
                {"port": port},
            )
    if c.principal_id and not any(p["id"] == c.principal_id for p in d["principals"]):
        raise DomainError("principal_not_found", msg("err.not_found", kind=msg("entity.principal"), id=c.principal_id))


@router.get("/twins/{twin_id}/connections", response_model=list[Connection])
async def list_connections(twin_id: str, svc: ServicesDep) -> list[Connection]:
    return (await svc.snapshot(twin_id))[2].connections


@router.post("/twins/{twin_id}/connections", response_model=MutationOut, status_code=201)
async def create_connection(
    twin_id: str, body: Connection, svc: ServicesDep, expected_revision: int | None = ExpectedRev
) -> MutationOut:
    def fn(d: dict[str, Any]) -> Message:
        _ensure_new(d["connections"], body.id, "Connection")
        _validate_connection(d, body)
        d["connections"].append(body.model_dump(mode="json"))
        return msg(
            "rev.connection_added", source=body.source, target=body.target, kind=msg(f"connkind.{body.kind.value}")
        )

    return await _mutation(svc, twin_id, fn, expected_revision, body.model_dump(mode="json"))


@router.put("/twins/{twin_id}/connections/{conn_id}", response_model=MutationOut)
async def update_connection(
    twin_id: str,
    conn_id: str,
    body: Connection,
    svc: ServicesDep,
    expected_revision: int | None = ExpectedRev,
) -> MutationOut:
    if body.id != conn_id:
        raise DomainError("invalid_snapshot", msg("err.id_mismatch", body=body.id, path=conn_id))

    def fn(d: dict[str, Any]) -> Message:
        _find(d["connections"], conn_id, "Connection", "connection_not_found")
        _validate_connection(d, body, ignore_id=conn_id)
        d["connections"] = [body.model_dump(mode="json") if c["id"] == conn_id else c for c in d["connections"]]
        return msg("rev.connection_edited", id=conn_id)

    return await _mutation(svc, twin_id, fn, expected_revision, body.model_dump(mode="json"))


@router.delete("/twins/{twin_id}/connections/{conn_id}", response_model=MutationOut)
async def delete_connection(
    twin_id: str, conn_id: str, svc: ServicesDep, expected_revision: int | None = ExpectedRev
) -> MutationOut:
    def fn(d: dict[str, Any]) -> Message:
        _find(d["connections"], conn_id, "Connection", "connection_not_found")
        d["connections"] = [c for c in d["connections"] if c["id"] != conn_id]
        return msg("rev.connection_deleted", id=conn_id)

    return await _mutation(svc, twin_id, fn, expected_revision)


# ---- principals ------------------------------------------------------------------------------
@router.get("/twins/{twin_id}/principals", response_model=list[Principal])
async def list_principals(twin_id: str, svc: ServicesDep) -> list[Principal]:
    return (await svc.snapshot(twin_id))[2].principals


@router.post("/twins/{twin_id}/principals", response_model=MutationOut, status_code=201)
async def create_principal(
    twin_id: str, body: Principal, svc: ServicesDep, expected_revision: int | None = ExpectedRev
) -> MutationOut:
    def fn(d: dict[str, Any]) -> Message:
        _ensure_new(d["principals"], body.id, "Principal")
        d["principals"].append(body.model_dump(mode="json"))
        return msg("rev.principal_added", id=body.id)

    return await _mutation(svc, twin_id, fn, expected_revision, body.model_dump(mode="json"))


@router.put("/twins/{twin_id}/principals/{principal_id}", response_model=MutationOut)
async def update_principal(
    twin_id: str,
    principal_id: str,
    body: Principal,
    svc: ServicesDep,
    expected_revision: int | None = ExpectedRev,
) -> MutationOut:
    if body.id != principal_id:
        raise DomainError("invalid_snapshot", msg("err.id_mismatch", body=body.id, path=principal_id))

    def fn(d: dict[str, Any]) -> Message:
        _find(d["principals"], principal_id, "Principal", "principal_not_found")
        d["principals"] = [body.model_dump(mode="json") if p["id"] == principal_id else p for p in d["principals"]]
        return msg("rev.principal_edited", id=principal_id)

    return await _mutation(svc, twin_id, fn, expected_revision, body.model_dump(mode="json"))


@router.delete("/twins/{twin_id}/principals/{principal_id}", response_model=MutationOut)
async def delete_principal(
    twin_id: str, principal_id: str, svc: ServicesDep, expected_revision: int | None = ExpectedRev
) -> MutationOut:
    def fn(d: dict[str, Any]) -> Message:
        _find(d["principals"], principal_id, "Principal", "principal_not_found")
        d["principals"] = [p for p in d["principals"] if p["id"] != principal_id]
        for c in d["connections"]:
            if c.get("principal_id") == principal_id:
                c["principal_id"] = None
        gone = {v["id"] for v in d["vulnerabilities"] if v.get("affected_principal") == principal_id}
        d["vulnerabilities"] = [v for v in d["vulnerabilities"] if v["id"] not in gone]
        for a in d["assets"]:
            a["vulnerability_ids"] = [v for v in a["vulnerability_ids"] if v not in gone]
        return msg("rev.principal_deleted", id=principal_id)

    return await _mutation(svc, twin_id, fn, expected_revision)


# ---- firewall rules --------------------------------------------------------------------------
def _validate_rule(d: dict[str, Any], r: FirewallRule) -> None:
    fw = next((a for a in d["assets"] if a["id"] == r.firewall_id), None)
    if fw is None:
        raise DomainError("asset_not_found", msg("err.not_found", kind=msg("entity.firewall"), id=r.firewall_id))
    if fw["asset_type"] != "firewall":
        raise DomainError(
            "invalid_snapshot", msg("err.not_a_firewall", id=r.firewall_id, type=msg(f"assettype.{fw['asset_type']}"))
        )
    if r.dst_asset is not None:
        _asset_exists(d, r.dst_asset)
        if r.port is not None and r.action == RuleAction.allow and not _port_open(d, r.dst_asset, r.port):
            raise DomainError(
                "port_not_open",
                msg("err.rule_port_closed", asset=r.dst_asset, port=r.port),
                {"asset_id": r.dst_asset, "port": r.port},
            )


@router.get("/twins/{twin_id}/firewall-rules", response_model=list[FirewallRule])
async def list_rules(twin_id: str, svc: ServicesDep) -> list[FirewallRule]:
    rules = (await svc.snapshot(twin_id))[2].firewall_rules
    return sorted(rules, key=lambda r: (r.firewall_id, r.order, r.id))


@router.post("/twins/{twin_id}/firewall-rules", response_model=MutationOut, status_code=201)
async def create_rule(
    twin_id: str, body: FirewallRule, svc: ServicesDep, expected_revision: int | None = ExpectedRev
) -> MutationOut:
    def fn(d: dict[str, Any]) -> Message:
        _ensure_new(d["firewall_rules"], body.id, "Firewall rule")
        _validate_rule(d, body)
        d["firewall_rules"].append(body.model_dump(mode="json"))
        return msg("rev.rule_added", id=body.id, firewall=body.firewall_id)

    return await _mutation(svc, twin_id, fn, expected_revision, body.model_dump(mode="json"))


@router.put("/twins/{twin_id}/firewall-rules/{rule_id}", response_model=MutationOut)
async def update_rule(
    twin_id: str,
    rule_id: str,
    body: FirewallRule,
    svc: ServicesDep,
    expected_revision: int | None = ExpectedRev,
) -> MutationOut:
    if body.id != rule_id:
        raise DomainError("invalid_snapshot", msg("err.id_mismatch", body=body.id, path=rule_id))

    def fn(d: dict[str, Any]) -> Message:
        _find(d["firewall_rules"], rule_id, "Firewall rule", "rule_not_found")
        _validate_rule(d, body)
        d["firewall_rules"] = [body.model_dump(mode="json") if r["id"] == rule_id else r for r in d["firewall_rules"]]
        return msg("rev.rule_edited", id=rule_id)

    return await _mutation(svc, twin_id, fn, expected_revision, body.model_dump(mode="json"))


@router.delete("/twins/{twin_id}/firewall-rules/{rule_id}", response_model=MutationOut)
async def delete_rule(
    twin_id: str, rule_id: str, svc: ServicesDep, expected_revision: int | None = ExpectedRev
) -> MutationOut:
    def fn(d: dict[str, Any]) -> Message:
        _find(d["firewall_rules"], rule_id, "Firewall rule", "rule_not_found")
        d["firewall_rules"] = [r for r in d["firewall_rules"] if r["id"] != rule_id]
        return msg("rev.rule_deleted", id=rule_id)

    return await _mutation(svc, twin_id, fn, expected_revision)


# ---- vulnerabilities ---------------------------------------------------------------------------
def _validate_vuln(d: dict[str, Any], v: Vulnerability) -> None:
    if v.affected_asset is not None:
        _asset_exists(d, v.affected_asset)
        if v.affected_port is not None and not _port_open(d, v.affected_asset, v.affected_port):
            raise DomainError(
                "port_not_open",
                msg("err.vuln_port_closed", asset=v.affected_asset, port=v.affected_port),
            )
    elif v.affected_port is not None:
        raise DomainError("invalid_snapshot", msg("err.port_requires_asset"))
    if v.affected_principal and not any(p["id"] == v.affected_principal for p in d["principals"]):
        raise DomainError(
            "principal_not_found", msg("err.not_found", kind=msg("entity.principal"), id=v.affected_principal)
        )


def _title_consistent(v: Vulnerability) -> dict[str, Any]:
    """Keep title_i18n only while it still says what `title` says (else the user's own title wins)."""
    data = v.model_dump(mode="json")
    if v.title_i18n is not None and render(v.title_i18n, "en") != v.title:
        data["title_i18n"] = None
    return data


def _sync_asset_vulns(d: dict[str, Any]) -> None:
    owner = {v["id"]: v.get("affected_asset") for v in d["vulnerabilities"]}
    for a in d["assets"]:
        a["vulnerability_ids"] = sorted(vid for vid, aid in owner.items() if aid == a["id"])


@router.get("/twins/{twin_id}/vulnerabilities", response_model=list[Vulnerability])
async def list_vulns(twin_id: str, svc: ServicesDep) -> list[Vulnerability]:
    return (await svc.snapshot(twin_id))[2].vulnerabilities


@router.post("/twins/{twin_id}/vulnerabilities", response_model=MutationOut, status_code=201)
async def create_vuln(
    twin_id: str, body: Vulnerability, svc: ServicesDep, expected_revision: int | None = ExpectedRev
) -> MutationOut:
    def fn(d: dict[str, Any]) -> Message:
        _ensure_new(d["vulnerabilities"], body.id, "Vulnerability")
        _validate_vuln(d, body)
        d["vulnerabilities"].append(_title_consistent(body))
        _sync_asset_vulns(d)
        return msg("rev.vuln_added", id=body.id)

    return await _mutation(svc, twin_id, fn, expected_revision, body.model_dump(mode="json"))


@router.put("/twins/{twin_id}/vulnerabilities/{vuln_id}", response_model=MutationOut)
async def update_vuln(
    twin_id: str,
    vuln_id: str,
    body: Vulnerability,
    svc: ServicesDep,
    expected_revision: int | None = ExpectedRev,
) -> MutationOut:
    if body.id != vuln_id:
        raise DomainError("invalid_snapshot", msg("err.id_mismatch", body=body.id, path=vuln_id))

    def fn(d: dict[str, Any]) -> Message:
        _find(d["vulnerabilities"], vuln_id, "Vulnerability", "vuln_not_found")
        _validate_vuln(d, body)
        d["vulnerabilities"] = [_title_consistent(body) if v["id"] == vuln_id else v for v in d["vulnerabilities"]]
        _sync_asset_vulns(d)
        return msg("rev.vuln_edited", id=vuln_id)

    return await _mutation(svc, twin_id, fn, expected_revision, body.model_dump(mode="json"))


@router.delete("/twins/{twin_id}/vulnerabilities/{vuln_id}", response_model=MutationOut)
async def delete_vuln(
    twin_id: str, vuln_id: str, svc: ServicesDep, expected_revision: int | None = ExpectedRev
) -> MutationOut:
    def fn(d: dict[str, Any]) -> Message:
        _find(d["vulnerabilities"], vuln_id, "Vulnerability", "vuln_not_found")
        d["vulnerabilities"] = [v for v in d["vulnerabilities"] if v["id"] != vuln_id]
        _sync_asset_vulns(d)
        return msg("rev.vuln_deleted", id=vuln_id)

    return await _mutation(svc, twin_id, fn, expected_revision)
