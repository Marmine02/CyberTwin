"""Pure edit operations on a TwinContent snapshot. Each returns a new validated snapshot."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import ValidationError

from cybertwin.domain.model import TwinContent
from cybertwin.errors import AppError

Collection = Literal["assets", "connections", "principals", "firewall_rules", "vulnerabilities"]
COLLECTIONS: tuple[Collection, ...] = (
    "assets",
    "connections",
    "principals",
    "firewall_rules",
    "vulnerabilities",
)
SINGULAR = {
    "assets": "asset",
    "connections": "connection",
    "principals": "principal",
    "firewall_rules": "firewall_rule",
    "vulnerabilities": "vulnerability",
}


def _validate(data: dict[str, Any]) -> TwinContent:
    try:
        return TwinContent.model_validate(data).normalized()
    except ValidationError as exc:
        errors = []
        for e in exc.errors(include_url=False):
            msg = str(e.get("msg", ""))
            errors.append(
                {"loc": [str(x) for x in e.get("loc", ())], "msg": msg.removeprefix("Value error, ")}
            )
        raise AppError(
            "validation.integrity", 422, "The change would make the model inconsistent.", errors=errors
        ) from exc


def get_item(c: TwinContent, coll: Collection, item_id: str) -> dict[str, Any]:
    for item in c.model_dump(mode="json")[coll]:
        if item["id"] == item_id:
            return dict(item)
    raise AppError(
        "not_found", 404, f"{SINGULAR[coll]} {item_id} not found", entity=SINGULAR[coll], id=item_id
    )


def create_item(c: TwinContent, coll: Collection, item: dict[str, Any]) -> TwinContent:
    data = c.model_dump(mode="json")
    if any(x["id"] == item.get("id") for x in data[coll]):
        raise AppError(
            "conflict.duplicate_id",
            409,
            f"{SINGULAR[coll]} id already exists",
            entity=SINGULAR[coll],
            id=item.get("id"),
        )
    data[coll].append(item)
    return _validate(data)


def update_item(c: TwinContent, coll: Collection, item_id: str, item: dict[str, Any]) -> TwinContent:
    get_item(c, coll, item_id)
    if item.get("id", item_id) != item_id:
        raise AppError("validation.id_immutable", 422, "The id cannot be changed.", id=item_id)
    data = c.model_dump(mode="json")
    data[coll] = [{**item, "id": item_id} if x["id"] == item_id else x for x in data[coll]]
    return _validate(data)


def asset_dependents(c: TwinContent, asset_id: str) -> dict[str, list[str]]:
    """Everything that references an asset (shown before deleting it)."""
    ref = f"asset:{asset_id}"
    return {
        "connections": sorted(x.id for x in c.connections if asset_id in (x.source, x.target)),
        "firewall_rules": sorted(
            r.id for r in c.firewall_rules if ref in (r.src, r.dst) or r.firewall_id == asset_id
        ),
        "vulnerabilities": sorted(v.id for v in c.vulnerabilities if v.asset_id == asset_id),
        "principals": sorted(
            p.id
            for p in c.principals
            if asset_id in p.logged_on_assets or any(x.asset_id == asset_id for x in p.permissions)
        ),
    }


def delete_item(c: TwinContent, coll: Collection, item_id: str) -> tuple[TwinContent, dict[str, list[str]]]:
    """Delete an item. Deleting an asset cascades to everything that references it."""
    get_item(c, coll, item_id)
    data = c.model_dump(mode="json")
    affected: dict[str, list[str]] = {}
    if coll == "assets":
        affected = asset_dependents(c, item_id)
        data["connections"] = [x for x in data["connections"] if x["id"] not in affected["connections"]]
        data["firewall_rules"] = [
            r for r in data["firewall_rules"] if r["id"] not in affected["firewall_rules"]
        ]
        data["vulnerabilities"] = [v for v in data["vulnerabilities"] if v["asset_id"] != item_id]
        for p in data["principals"]:
            p["logged_on_assets"] = [a for a in p["logged_on_assets"] if a != item_id]
            p["permissions"] = [x for x in p["permissions"] if x["asset_id"] != item_id]
    elif coll == "principals":
        for a in data["assets"]:
            sc = a["security_config"]
            if item_id in sc["local_admins"]:
                sc["local_admins"] = [x for x in sc["local_admins"] if x != item_id]
                affected.setdefault("assets", []).append(a["id"])
    data[coll] = [x for x in data[coll] if x["id"] != item_id]
    return _validate(data), affected
