"""Post-check: every id-like token in AI output must exist in the input; otherwise it is 'unverified'."""

from __future__ import annotations

import re
from collections.abc import Iterable
from typing import Any

STEP_RE = re.compile(r"\bP\d{1,3}\.S\d{1,3}\b")
CVE_RE = re.compile(r"\bCVE-\d{4}-\d{4,7}\b")
MITRE_RE = re.compile(r"\bT\d{4}(?:\.\d{3})?\b")
# lowercase ids with at least one hyphen and one digit (web-01, vuln-ssh-rce is caught by prefix rule)
ID_RE = re.compile(r"(?<![\w/.-])([a-z][a-z0-9]*(?:[-_.][a-z0-9]+)+)(?![\w-])")
ID_PREFIXES = ("vuln-", "svc-", "adm-", "fw-", "ws-", "idp-", "web-", "app-", "db-", "c-", "t-", "p-")


def _collect(obj: Any, out: set[str]) -> None:
    if isinstance(obj, dict):
        for v in obj.values():
            _collect(v, out)
    elif isinstance(obj, list):
        for v in obj:
            _collect(v, out)
    elif isinstance(obj, str):
        out.add(obj)
        for part in re.split(r"[\s,;:()>'\"`#]+", obj):
            if part:
                out.add(part)


def known_tokens(*sources: Any) -> set[str]:
    out: set[str] = set()
    for s in sources:
        _collect(s, out)
    return out


def _looks_like_id(tok: str) -> bool:
    return any(c.isdigit() for c in tok) or tok.startswith(ID_PREFIXES)


def unverified_ids(text: str, known: Iterable[str]) -> list[str]:
    k = set(known)
    flagged: set[str] = set()
    for rx in (STEP_RE, CVE_RE, MITRE_RE):
        for m in rx.finditer(text):
            if m.group(0) not in k:
                flagged.add(m.group(0))
    for m in ID_RE.finditer(text):
        tok = m.group(1).rstrip(".")
        if _looks_like_id(tok) and tok not in k:
            flagged.add(tok)
    return sorted(flagged)
