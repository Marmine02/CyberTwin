"""Row -> JSON helpers (dates in ISO 8601 UTC)."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from cybertwin.db.tables import EventRow, RemediationRow, RevisionRow, SimulationRunRow, TwinRow


def iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC).isoformat().replace("+00:00", "Z")


def twin_json(t: TwinRow, head: int) -> dict[str, Any]:
    return {
        "id": t.id,
        "slug": t.slug,
        "name": t.name,
        "description": t.description,
        "head_revision": head,
        "created_at": iso(t.created_at),
    }


def revision_json(r: RevisionRow, *, with_diff: bool = False) -> dict[str, Any]:
    out = {
        "number": r.number,
        "parent": r.parent_number,
        "kind": r.kind,
        "note": r.note_i18n,
        "content_hash": r.content_hash,
        "changes": r.diff.get("summary", {}).get("changes", 0),
        "created_at": iso(r.created_at),
    }
    if with_diff:
        out["diff"] = r.diff
    return out


def run_summary(r: SimulationRunRow) -> dict[str, Any]:
    res = r.result
    return {
        "id": r.id,
        "twin_id": r.twin_id,
        "revision": r.revision_number,
        "scenario": r.scenario,
        "params": r.params,
        "score": res["score"],
        "p_breach": res["p_breach"],
        "paths": len(res["paths"]),
        "compromised_pct": res["compromised_pct"],
        "result_hash": r.result_hash,
        "created_at": iso(r.created_at),
    }


def run_json(r: SimulationRunRow) -> dict[str, Any]:
    return {**run_summary(r), "result": r.result}


def remediation_json(r: RemediationRow) -> dict[str, Any]:
    return {
        "id": r.id,
        "twin_id": r.twin_id,
        "from_revision": r.from_revision,
        "to_revision": r.to_revision,
        "scenario": r.scenario,
        "params": r.params,
        "actions": r.actions,
        "comparison": r.comparison,
        "reverted_by_revision": r.reverted_by_revision,
        "created_at": iso(r.created_at),
    }


def event_json(e: EventRow) -> dict[str, Any]:
    return {
        "id": e.id,
        "twin_id": e.twin_id,
        "code": e.code,
        "params": e.params,
        "read": e.read,
        "created_at": iso(e.created_at),
    }
