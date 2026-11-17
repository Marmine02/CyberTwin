from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Response

from app.api.deps import ServicesDep
from app.api.twins import twin_out
from app.engine.constants import ENGINE_VERSION
from app.i18n import CATALOG
from app.repositories.repos import iso
from app.schemas.api import EventOut, TwinOut

router = APIRouter(tags=["misc"])

# Templates the UI can add to an asset. CVE ids are illustrative (CVE-2099-*), never real advisories.
VULN_CATALOG: list[dict[str, Any]] = [
    {
        "template": "outdated-ssh",
        "title_i18n": {"code": "vuln.tpl.outdated_ssh", "params": {}},
        "title": "Outdated OpenSSH: pre-auth remote code execution",
        "cvss": 9.8,
        "exploit_maturity": 0.95,
        "kind": "outdated_software",
        "needs_port": True,
        "grants_privilege": "admin",
        "mitre_techniques": ["T1190"],
        "fixed_by_remediation_types": ["apply_patch", "restrict_port"],
        "cve": "CVE-2099-0101",
    },
    {
        "template": "rce-web",
        "title_i18n": {"code": "vuln.tpl.rce_web", "params": {}},
        "title": "Web application remote code execution",
        "cvss": 9.1,
        "exploit_maturity": 0.8,
        "kind": "remote_service",
        "needs_port": True,
        "grants_privilege": "user",
        "mitre_techniques": ["T1190"],
        "fixed_by_remediation_types": ["apply_patch"],
        "cve": "CVE-2099-0201",
    },
    {
        "template": "rdp-exposed",
        "title_i18n": {"code": "vuln.tpl.rdp_exposed", "params": {}},
        "title": "RDP exposed beyond the management zone",
        "cvss": 6.5,
        "exploit_maturity": 1.0,
        "kind": "misconfig",
        "needs_port": True,
        "grants_privilege": "user",
        "mitre_techniques": ["T1133"],
        "fixed_by_remediation_types": ["restrict_port"],
        "cve": None,
    },
    {
        "template": "local-privesc",
        "title_i18n": {"code": "vuln.tpl.local_privesc", "params": {}},
        "title": "Kernel local privilege escalation",
        "cvss": 7.8,
        "exploit_maturity": 0.9,
        "kind": "local_privesc",
        "needs_port": False,
        "grants_privilege": "admin",
        "mitre_techniques": ["T1068"],
        "fixed_by_remediation_types": ["apply_patch"],
        "cve": "CVE-2099-0301",
    },
    {
        "template": "weak-password",
        "title_i18n": {"code": "vuln.tpl.weak_password", "params": {}},
        "title": "Weak password without MFA",
        "cvss": 8.1,
        "exploit_maturity": 0.9,
        "kind": "weak_credential",
        "needs_port": False,
        "needs_principal": True,
        "grants_privilege": "user",
        "mitre_techniques": ["T1110"],
        "fixed_by_remediation_types": ["set_password_policy", "enforce_mfa"],
        "cve": None,
    },
    {
        "template": "excessive-perm",
        "title_i18n": {"code": "vuln.tpl.excessive_perm", "params": {}},
        "title": "Excessive permission on a sensitive asset",
        "cvss": 6.5,
        "exploit_maturity": 1.0,
        "kind": "excessive_permission",
        "needs_port": False,
        "needs_principal": True,
        "grants_privilege": "user",
        "mitre_techniques": ["T1078"],
        "fixed_by_remediation_types": ["reduce_permission"],
        "cve": None,
    },
]


@router.get("/i18n/engine")
async def engine_catalog() -> dict[str, dict[str, str]]:
    """Message catalog for engine output ({code, params}); the frontend translates with it."""
    return CATALOG


@router.get("/health")
async def health(svc: ServicesDep) -> dict[str, Any]:
    twins = await svc.twins.list()
    return {"status": "ok", "engine_version": ENGINE_VERSION, "twins": len(twins), "mode": "simulation"}


@router.post("/demo/reset", response_model=TwinOut)
async def demo_reset(svc: ServicesDep) -> TwinOut:
    return twin_out(await svc.reset_demo())


@router.get("/vulnerabilities/catalog")
async def vuln_catalog() -> list[dict[str, Any]]:
    return VULN_CATALOG


@router.get("/events", response_model=list[EventOut])
async def events(svc: ServicesDep, twin: str | None = None, limit: int = 30) -> list[EventOut]:
    return [
        EventOut(
            id=e.id,
            twin_id=e.twin_id,
            kind=e.kind,
            title=e.title,
            payload=e.payload,
            read=e.read,
            created_at=iso(e.created_at),
        )
        for e in await svc.events.list(twin, min(max(limit, 1), 100))
    ]


@router.post("/events/read", status_code=204)
async def events_read(svc: ServicesDep, twin: str | None = None) -> Response:
    await svc.events.mark_all_read(twin)
    await svc.s.commit()
    return Response(status_code=204)
