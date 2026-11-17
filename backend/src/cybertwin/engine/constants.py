"""Every probability constant the engine uses, in one table (documented in docs/ENGINE.md).

p(edge) = clamp(base * product(modifiers), P_MIN, P_MAX)
  - CVE-based edges: base = cvss / 10 * EXPLOIT_MATURITY[maturity]
  - other techniques: base = TECHNIQUE_BASE[technique]
Structural edges (network reach without segmentation, implied privilege) have p = 1 and are not
clamped, so they never change a path's likelihood.
"""

from __future__ import annotations

from typing import Final

P_MIN: Final = 0.01
P_MAX: Final = 0.99

EXPLOIT_MATURITY: Final[dict[str, float]] = {
    "unproven": 0.3,
    "poc": 0.6,
    "functional": 0.9,
    "high": 1.0,
}

# Modifiers (multiplicative).
MOD_MFA: Final = 0.15
MOD_PASSWORD: Final[dict[str, float]] = {"strong": 0.2, "medium": 0.5, "weak": 1.0}
MOD_EDR: Final = 0.6
MOD_SEGMENTED_HOP: Final = 0.5

# Base probabilities of techniques that are not tied to a CVE.
TECHNIQUE_BASE: Final[dict[str, float]] = {
    "brute_force": 0.6,
    "credential_theft": 0.85,
    "credential_use": 0.9,
    "kerberoasting": 0.95,
    "trust_abuse": 0.7,
    "data_access_admin": 0.95,
    "data_access_user": 0.5,
    "domain_takeover": 0.95,
}

# Path search.
TOP_K: Final = 10
MAX_DEPTH: Final = 12
MAX_CANDIDATE_PATHS_PER_GOAL: Final = 60
MAX_RECOMMENDATIONS: Final = 8
DISCOVERY_LIMIT: Final = 250

# Services an attacker can authenticate to (brute force, credential use).
AUTH_SERVICES: Final = frozenset({"ssh", "rdp", "smb", "winrm", "mssql"})
# Interactive services where a host's local accounts can be brute forced.
INTERACTIVE_SERVICES: Final = frozenset({"ssh", "rdp", "winrm"})
KERBEROS_SERVICE: Final = "kerberos"

# Impact of goals (0..1).
IMPACT_PRIVILEGE: Final[dict[str, float]] = {"domain_admin": 1.0, "admin": 0.8, "user": 0.4}

ROUND: Final = 6
