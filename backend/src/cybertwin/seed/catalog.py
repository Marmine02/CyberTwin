"""Vulnerability catalog: templates for creating vulnerabilities in the model.

Every entry is illustrative: CVSS and maturity values are representative, used only to drive the
simulation on a virtual model. Nothing here is a feed or a live data source.
"""

from __future__ import annotations

from typing import Any

CATALOG: list[dict[str, Any]] = [
    {
        "cve": "CVE-2023-38408",
        "title": "OpenSSH remote code execution",
        "cvss": 9.8,
        "exploit_maturity": "functional",
        "kind": "remote_exploit",
        "service": "ssh",
        "grants": "user",
        "attack_ids": ["T1190", "T1210"],
        "fixed_by": {"software": "OpenSSH", "version": "9.8p1"},
    },
    {
        "cve": "CVE-2021-23017",
        "title": "nginx resolver off-by-one",
        "cvss": 7.7,
        "exploit_maturity": "poc",
        "kind": "remote_exploit",
        "service": "https",
        "grants": "user",
        "attack_ids": ["T1190"],
        "fixed_by": {"software": "nginx", "version": "1.26.2"},
    },
    {
        "cve": "CVE-2020-1938",
        "title": "Tomcat AJP file inclusion",
        "cvss": 7.5,
        "exploit_maturity": "functional",
        "kind": "remote_exploit",
        "service": "http",
        "grants": "user",
        "attack_ids": ["T1190"],
        "fixed_by": {"software": "Apache Tomcat", "version": "9.0.98"},
    },
    {
        "cve": "CVE-2021-44228",
        "title": "Log4j JNDI remote code execution",
        "cvss": 10.0,
        "exploit_maturity": "high",
        "kind": "remote_exploit",
        "service": "http",
        "grants": "user",
        "attack_ids": ["T1190"],
        "fixed_by": {"software": "log4j", "version": "2.17.1"},
    },
    {
        "cve": "CVE-2019-0708",
        "title": "Remote Desktop Services remote code execution",
        "cvss": 9.8,
        "exploit_maturity": "functional",
        "kind": "remote_exploit",
        "service": "rdp",
        "grants": "admin",
        "attack_ids": ["T1210"],
        "fixed_by": {"software": "", "version": ""},
    },
    {
        "cve": "CVE-2020-0796",
        "title": "SMBv3 compression remote code execution",
        "cvss": 10.0,
        "exploit_maturity": "poc",
        "kind": "remote_exploit",
        "service": "smb",
        "grants": "admin",
        "attack_ids": ["T1210"],
        "fixed_by": {"software": "", "version": ""},
    },
    {
        "cve": "CVE-2022-29143",
        "title": "SQL Server remote code execution",
        "cvss": 7.5,
        "exploit_maturity": "unproven",
        "kind": "remote_exploit",
        "service": "mssql",
        "grants": "user",
        "attack_ids": ["T1210"],
        "fixed_by": {"software": "SQL Server", "version": "2016 SP3"},
    },
    {
        "cve": "CVE-2021-34527",
        "title": "Print Spooler privilege escalation",
        "cvss": 8.8,
        "exploit_maturity": "high",
        "kind": "local_privesc",
        "service": None,
        "grants": "admin",
        "attack_ids": ["T1068"],
        "fixed_by": {"software": "Print Spooler", "version": "10.0.19041.1083"},
    },
    {
        "cve": "CVE-2021-4034",
        "title": "pkexec local privilege escalation",
        "cvss": 7.8,
        "exploit_maturity": "high",
        "kind": "local_privesc",
        "service": None,
        "grants": "admin",
        "attack_ids": ["T1068"],
        "fixed_by": {"software": "polkit", "version": "0.120"},
    },
    {
        "cve": "CVE-2021-3156",
        "title": "sudo heap overflow privilege escalation",
        "cvss": 7.8,
        "exploit_maturity": "functional",
        "kind": "local_privesc",
        "service": None,
        "grants": "admin",
        "attack_ids": ["T1068", "T1548.003"],
        "fixed_by": {"software": "sudo", "version": "1.9.5p2"},
    },
]


def catalog() -> list[dict[str, Any]]:
    return [{**entry, "illustrative": True} for entry in sorted(CATALOG, key=lambda e: e["cve"])]
