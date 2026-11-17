"""Single table of engine constants. Documented in docs/ENGINE.md."""

from __future__ import annotations

ENGINE_VERSION = "1.1.0"

P_MIN = 0.01
P_MAX = 0.99

# Multiplicative modifiers applied to edge probabilities.
MODIFIERS: dict[str, float] = {
    "mfa": 0.15,
    "password_strong": 0.2,
    "password_medium": 0.5,
    "password_weak": 1.0,
    "edr": 0.6,
    "segmented_zone_hop": 0.5,
}

# Base probabilities for techniques that are not driven by a CVSS score.
BASE_P: dict[str, float] = {
    "reach": 1.0,  # clamped to P_MAX
    "brute_force": 0.8,
    "kerberoast": 0.9,
    "credential_theft": 0.9,
    "credential_use": 0.95,
    "trust_abuse": 0.9,
    "data_access": 1.0,  # clamped to P_MAX
    "domain_takeover": 0.95,
}

# Services that accept interactive/credential authentication (brute-force targets).
AUTH_PORTS: frozenset[int] = frozenset({22, 3389, 88, 389, 636})
AUTH_SERVICE_HINTS: tuple[str, ...] = ("login", "sso", "ssh", "rdp", "kerberos", "ldap")

LEVEL_FACTOR: dict[str, float] = {"read": 0.5, "write": 0.75, "admin": 1.0}

TOP_K = 10
MAX_DEPTH = 12
MAX_TIMELINE_EVENTS = 80

MITRE: dict[str, list[str]] = {
    "reach": ["T1046"],
    "remote_exploit": ["T1190"],
    "brute_force": ["T1110"],
    "kerberoast": ["T1558.003"],
    "credential_theft": ["T1003"],
    "credential_use": ["T1078"],
    "local_privesc": ["T1068"],
    "trust_abuse": ["T1550"],
    "permission_abuse": ["T1078"],
    "data_access": ["T1005"],
    "domain_takeover": ["T1484"],
}

PHASE: dict[str, str] = {
    "reach": "recon",
    "remote_exploit": "exploit",
    "brute_force": "credential",
    "kerberoast": "credential",
    "credential_theft": "credential",
    "credential_use": "pivot",
    "local_privesc": "escalate",
    "trust_abuse": "pivot",
    "permission_abuse": "pivot",
    "data_access": "exfil",
    "domain_takeover": "escalate",
}

ALL_TECHNIQUES: frozenset[str] = frozenset(PHASE)


def clamp(p: float) -> float:
    return max(P_MIN, min(P_MAX, p))


def password_modifier(strength: str) -> float:
    return MODIFIERS[f"password_{strength}"]
