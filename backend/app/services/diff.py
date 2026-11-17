"""Structural diff between two snapshots (revision vs revision)."""

from __future__ import annotations

from typing import Any

from app.schemas.twin import TwinSnapshot

COLLECTIONS = ("assets", "connections", "principals", "firewall_rules", "vulnerabilities")
IGNORED_FIELDS = {"position", "risk_score"}


def _index(items: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {i["id"]: i for i in items}


def diff_snapshots(before: TwinSnapshot | None, after: TwinSnapshot) -> dict[str, Any]:
    a = before.model_dump(mode="json") if before else {}
    b = after.model_dump(mode="json")
    out: dict[str, Any] = {}
    total = 0
    for col in COLLECTIONS:
        ia, ib = _index(a.get(col, [])), _index(b.get(col, []))
        added = sorted(set(ib) - set(ia))
        removed = sorted(set(ia) - set(ib))
        changed = []
        for k in sorted(set(ia) & set(ib)):
            fields = sorted(
                f for f in set(ia[k]) | set(ib[k]) if f not in IGNORED_FIELDS and ia[k].get(f) != ib[k].get(f)
            )
            if fields:
                changed.append(
                    {
                        "id": k,
                        "fields": fields,
                        "before": {f: ia[k].get(f) for f in fields},
                        "after": {f: ib[k].get(f) for f in fields},
                    }
                )
        out[col] = {"added": added, "removed": removed, "changed": changed}
        total += len(added) + len(removed) + len(changed)
    seg_a = sorted(tuple(sorted((z["a"], z["b"]))) for z in a.get("segmented_zones", []))
    seg_b = sorted(tuple(sorted((z["a"], z["b"]))) for z in b.get("segmented_zones", []))
    out["segmented_zones"] = {
        "added": [list(p) for p in seg_b if p not in seg_a],
        "removed": [list(p) for p in seg_a if p not in seg_b],
    }
    total += len(out["segmented_zones"]["added"]) + len(out["segmented_zones"]["removed"])
    out["total_changes"] = total
    return out
