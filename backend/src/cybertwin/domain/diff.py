"""Structural diff between two revision contents (deterministic, JSON-ready)."""

from __future__ import annotations

from typing import Any

from cybertwin.domain.model import TwinContent

COLLECTIONS = ("assets", "connections", "principals", "firewall_rules", "vulnerabilities")


def diff_contents(before: TwinContent, after: TwinContent) -> dict[str, Any]:
    """Return ``{collection: {added, removed, changed}}`` plus ``policy`` and a ``summary``.

    ``changed`` maps id -> list of ``{field, before, after}`` for top-level fields.
    Only non-empty collections are included.
    """
    b = before.normalized().model_dump(mode="json")
    a = after.normalized().model_dump(mode="json")
    out: dict[str, Any] = {}
    total = 0
    for coll in COLLECTIONS:
        bmap = {x["id"]: x for x in b[coll]}
        amap = {x["id"]: x for x in a[coll]}
        added = sorted(set(amap) - set(bmap))
        removed = sorted(set(bmap) - set(amap))
        changed: dict[str, list[dict[str, Any]]] = {}
        for key in sorted(set(amap) & set(bmap)):
            fields = [
                {"field": f, "before": bmap[key].get(f), "after": amap[key].get(f)}
                for f in sorted(set(amap[key]) | set(bmap[key]))
                if amap[key].get(f) != bmap[key].get(f)
            ]
            if fields:
                changed[key] = fields
        if added or removed or changed:
            out[coll] = {"added": added, "removed": removed, "changed": changed}
            total += len(added) + len(removed) + len(changed)
    if a["policy"] != b["policy"]:
        out["policy"] = {"before": b["policy"], "after": a["policy"]}
        total += 1
    out["summary"] = {"changes": total}
    return out
