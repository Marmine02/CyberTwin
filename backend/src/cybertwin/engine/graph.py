"""Attack state graph builder.

Nodes (attacker states):
    PRIV:<asset>:<user|admin>   attacker runs code on the asset at that privilege
    NET:<asset>:<port>          attacker can send traffic to that port
    CRED:<principal>            attacker holds the principal's credentials
    DATA:<asset>                attacker reads the asset's sensitive data
    DOMAIN_ADMIN                attacker controls the identity domain

Edges carry: technique, p, weight=-ln(p), attack_ids, finding_ids, message {code, params} and
optional asset/port/vuln/principal/via fields. Parallel candidates for the same (u, v) keep the
highest p (ties: lowest sort key), so the graph is identical for identical input.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any

import networkx as nx

from cybertwin.domain.model import (
    AccessLevel,
    Asset,
    AssetType,
    ConnectionKind,
    Privilege,
    TwinContent,
    VulnKind,
)
from cybertwin.engine import constants as K
from cybertwin.engine.findings import exposed_finding_id, vuln_finding_id
from cybertwin.engine.network import Network

DOMAIN_ADMIN = "DOMAIN_ADMIN"


def priv(asset_id: str, level: str) -> str:
    return f"PRIV:{asset_id}:{level}"


def net(asset_id: str, port: int) -> str:
    return f"NET:{asset_id}:{port}"


def cred(principal_id: str) -> str:
    return f"CRED:{principal_id}"


def data(asset_id: str) -> str:
    return f"DATA:{asset_id}"


def node_asset(node: str) -> str | None:
    parts = node.split(":")
    if parts[0] in ("PRIV", "NET", "DATA"):
        return parts[1]
    return None


def clamp(p: float) -> float:
    return min(K.P_MAX, max(K.P_MIN, p))


@dataclass(order=True)
class EdgeSpec:
    sort_key: tuple[Any, ...]
    u: str = field(compare=False)
    v: str = field(compare=False)
    attrs: dict[str, Any] = field(compare=False)


class GraphBuilder:
    def __init__(self, content: TwinContent) -> None:
        self.c = content
        self.network = Network(content)
        self.assets = {a.id: a for a in content.assets}
        self.principals = {p.id: p for p in content.principals}
        self._edges: dict[tuple[str, str], EdgeSpec] = {}

    # -- helpers ---------------------------------------------------------------------------
    def _add(
        self,
        u: str,
        v: str,
        technique: str,
        p: float,
        *,
        structural: bool = False,
        message_params: dict[str, Any] | None = None,
        **extra: Any,
    ) -> None:
        p = p if structural else clamp(p)
        attrs: dict[str, Any] = {
            "technique": technique,
            "p": round(p, K.ROUND),
            "weight": -math.log(p) if p < 1.0 else 0.0,
            "structural": structural,
            "attack_ids": list(extra.pop("attack_ids", [])),
            "finding_ids": sorted(set(extra.pop("finding_ids", []))),
            "message": {"code": f"step.{technique}", "params": message_params or {}},
        }
        attrs.update(extra)
        spec = EdgeSpec((-attrs["p"], technique, str(sorted(attrs["finding_ids"]))), u, v, attrs)
        cur = self._edges.get((u, v))
        if cur is None or spec < cur:
            self._edges[(u, v)] = spec

    def _domain_joined(self, a: Asset) -> bool:
        return a.type not in (AssetType.INTERNET_GATEWAY, AssetType.FIREWALL)

    def _hosts(self) -> list[Asset]:
        return [
            a for a in sorted(self.assets.values(), key=lambda a: a.id) if a.type is not AssetType.FIREWALL
        ]

    # -- generators ------------------------------------------------------------------------
    def build(self) -> nx.DiGraph:
        hosts = self._hosts()
        self._implied_privilege(hosts)
        self._reachability(hosts)
        self._remote_exploits()
        self._brute_force(hosts)
        self._local_privesc()
        self._credential_theft()
        self._kerberoasting()
        self._credential_use(hosts)
        self._trust_abuse()
        self._data_access(hosts)
        self._domain_takeover()
        g = nx.DiGraph()
        for key in sorted(self._edges):
            spec = self._edges[key]
            g.add_edge(spec.u, spec.v, **spec.attrs)
        return g

    def _implied_privilege(self, hosts: list[Asset]) -> None:
        for a in hosts:
            self._add(
                priv(a.id, "admin"),
                priv(a.id, "user"),
                "privilege_implied",
                1.0,
                structural=True,
                asset_id=a.id,
                message_params={"asset": a.id},
            )

    def _reachability(self, hosts: list[Asset]) -> None:
        policy = self.c.policy
        for src in hosts:
            for dst in hosts:
                if src.id == dst.id or dst.type is AssetType.INTERNET_GATEWAY:
                    continue
                for port in dst.open_ports:
                    r = self.network.reach(src.id, dst.id, port.port, port.proto)
                    if not r.allowed:
                        continue
                    segmented = src.zone != dst.zone and policy.is_segmented(src.zone, dst.zone)
                    # Candidate finding ids; ids that are not actual findings are dropped later.
                    findings = [f"flat_network:{rid}" for rid in r.rule_ids if rid]
                    if src.type is AssetType.INTERNET_GATEWAY and port.service in K.AUTH_SERVICES:
                        findings.append(exposed_finding_id(dst.id, port.port))
                    self._add(
                        priv(src.id, "user"),
                        net(dst.id, port.port),
                        "network_reach",
                        K.MOD_SEGMENTED_HOP if segmented else 1.0,
                        structural=not segmented,
                        asset_id=dst.id,
                        src_asset=src.id,
                        port=port.port,
                        via=list(r.via),
                        rule_ids=list(r.rule_ids),
                        segmented=segmented,
                        finding_ids=findings,
                        message_params={
                            "src": src.id,
                            "asset": dst.id,
                            "port": port.port,
                            "service": port.service,
                            "via": list(r.via),
                            "segmented": segmented,
                        },
                    )

    def _remote_exploits(self) -> None:
        for v in sorted(self.c.vulnerabilities, key=lambda v: v.id):
            if v.kind is not VulnKind.REMOTE_EXPLOIT or v.port is None:
                continue
            a = self.assets[v.asset_id]
            mods = K.MOD_EDR if a.security_config.edr else 1.0
            p = v.cvss / 10 * K.EXPLOIT_MATURITY[v.exploit_maturity.value] * mods
            # Only the end-of-life software that runs the exploited service makes this step possible.
            svc_version = next((p.version for p in a.open_ports if p.port == v.port), "").lower()
            eol = [
                f"eol_software:{a.id}:{s.name}"
                for s in a.software
                if s.eol and svc_version.startswith(s.name.lower())
            ]
            self._add(
                net(a.id, v.port),
                priv(a.id, v.grants.value),
                "remote_exploit",
                p,
                asset_id=a.id,
                port=v.port,
                vuln_id=v.id,
                attack_ids=v.attack_ids,
                finding_ids=[vuln_finding_id(v.id), *eol],
                message_params={
                    "asset": a.id,
                    "port": v.port,
                    "cve": v.cve,
                    "vuln_id": v.id,
                    "title": v.title,
                    "cvss": v.cvss,
                    "grants": v.grants.value,
                    "edr": a.security_config.edr,
                },
            )

    def _brute_force(self, hosts: list[Asset]) -> None:
        for a in hosts:
            for port in a.open_ports:
                if port.service not in K.AUTH_SERVICES:
                    continue
                # Domain/service principals that may log on here.
                for pid in sorted(self.principals):
                    pr = self.principals[pid]
                    perm = next((x for x in pr.permissions if x.asset_id == a.id), None)
                    if perm is None:
                        continue
                    mfa = pr.mfa or a.security_config.mfa
                    p = K.TECHNIQUE_BASE["brute_force"] * K.MOD_PASSWORD[pr.credential_strength.value]
                    p *= K.MOD_MFA if mfa else 1.0
                    fids = [f"weak_credential:{pr.id}"] + ([] if mfa else [f"no_mfa:{pr.id}"])
                    self._add(
                        net(a.id, port.port),
                        priv(a.id, perm.level.value),
                        "brute_force",
                        p,
                        asset_id=a.id,
                        port=port.port,
                        principal_id=pr.id,
                        attack_ids=["T1110"],
                        finding_ids=fids,
                        message_params={
                            "asset": a.id,
                            "port": port.port,
                            "service": port.service,
                            "principal": pr.id,
                            "strength": pr.credential_strength.value,
                            "mfa": mfa,
                            "level": perm.level.value,
                        },
                    )
                # Local accounts on interactive services.
                if port.service in K.INTERACTIVE_SERVICES:
                    sc = a.security_config
                    p = K.TECHNIQUE_BASE["brute_force"] * K.MOD_PASSWORD[sc.password_policy.value]
                    p *= K.MOD_MFA if sc.mfa else 1.0
                    self._add(
                        net(a.id, port.port),
                        priv(a.id, "admin"),
                        "brute_force",
                        p,
                        asset_id=a.id,
                        port=port.port,
                        principal_id=None,
                        attack_ids=["T1110"],
                        finding_ids=[f"weak_password_policy:{a.id}"],
                        message_params={
                            "asset": a.id,
                            "port": port.port,
                            "service": port.service,
                            "principal": "",
                            "strength": sc.password_policy.value,
                            "mfa": sc.mfa,
                            "level": "admin",
                        },
                    )

    def _local_privesc(self) -> None:
        for v in sorted(self.c.vulnerabilities, key=lambda v: v.id):
            if v.kind is not VulnKind.LOCAL_PRIVESC:
                continue
            a = self.assets[v.asset_id]
            p = v.cvss / 10 * K.EXPLOIT_MATURITY[v.exploit_maturity.value]
            p *= K.MOD_EDR if a.security_config.edr else 1.0
            self._add(
                priv(a.id, "user"),
                priv(a.id, "admin"),
                "local_privesc",
                p,
                asset_id=a.id,
                vuln_id=v.id,
                attack_ids=v.attack_ids or ["T1068"],
                finding_ids=[vuln_finding_id(v.id)],
                message_params={
                    "asset": a.id,
                    "cve": v.cve,
                    "vuln_id": v.id,
                    "title": v.title,
                    "cvss": v.cvss,
                    "edr": a.security_config.edr,
                },
            )

    def _credential_theft(self) -> None:
        for pid in sorted(self.principals):
            pr = self.principals[pid]
            for aid in sorted(pr.logged_on_assets):
                a = self.assets[aid]
                p = K.TECHNIQUE_BASE["credential_theft"] * (K.MOD_EDR if a.security_config.edr else 1.0)
                self._add(
                    priv(aid, "admin"),
                    cred(pid),
                    "credential_theft",
                    p,
                    asset_id=aid,
                    principal_id=pid,
                    attack_ids=["T1003"],
                    finding_ids=[f"cached_credential:{pid}:{aid}"],
                    message_params={"asset": aid, "principal": pid, "edr": a.security_config.edr},
                )

    def _kerberoasting(self) -> None:
        idps = [a for a in self._hosts() if a.type is AssetType.IDENTITY_SERVER]
        for idp in idps:
            port = next((p for p in idp.open_ports if p.service == K.KERBEROS_SERVICE), None)
            if port is None:
                continue
            for pid in sorted(self.principals):
                pr = self.principals[pid]
                if not pr.kerberoastable:
                    continue
                p = K.TECHNIQUE_BASE["kerberoasting"] * K.MOD_PASSWORD[pr.credential_strength.value]
                self._add(
                    net(idp.id, port.port),
                    cred(pid),
                    "kerberoasting",
                    p,
                    asset_id=idp.id,
                    port=port.port,
                    principal_id=pid,
                    attack_ids=["T1558.003"],
                    finding_ids=[f"kerberoastable:{pid}", f"weak_credential:{pid}"],
                    message_params={
                        "asset": idp.id,
                        "principal": pid,
                        "strength": pr.credential_strength.value,
                    },
                )

    def _auth_reachable(self, target: Asset, hosts: list[Asset]) -> int | None:
        """An auth port on ``target`` reachable from some other host (approximation documented
        in docs/ENGINE.md: credentials are used from any foothold that can reach the target)."""
        for port in target.open_ports:
            if port.service not in K.AUTH_SERVICES:
                continue
            for src in hosts:
                if (
                    src.id != target.id
                    and self.network.reach(src.id, target.id, port.port, port.proto).allowed
                ):
                    return port.port
        return None

    def _credential_use(self, hosts: list[Asset]) -> None:
        for pid in sorted(self.principals):
            pr = self.principals[pid]
            for perm in sorted(pr.permissions, key=lambda x: x.asset_id):
                a = self.assets[perm.asset_id]
                port = self._auth_reachable(a, hosts)
                if port is None:
                    continue
                mfa = pr.mfa or a.security_config.mfa
                p = K.TECHNIQUE_BASE["credential_use"] * (K.MOD_MFA if mfa else 1.0)
                fids = [] if mfa else [f"no_mfa:{pid}"]
                if perm.level is AccessLevel.ADMIN:
                    fids.append(f"excessive_privilege:{pid}:{a.id}")
                self._add(
                    cred(pid),
                    priv(a.id, perm.level.value),
                    "credential_use",
                    p,
                    asset_id=a.id,
                    port=port,
                    principal_id=pid,
                    attack_ids=["T1078"],
                    finding_ids=fids,
                    message_params={
                        "asset": a.id,
                        "principal": pid,
                        "level": perm.level.value,
                        "port": port,
                        "mfa": mfa,
                    },
                )
            if pr.privilege is Privilege.DOMAIN_ADMIN:
                for idp in (h for h in hosts if h.type is AssetType.IDENTITY_SERVER):
                    if self._auth_reachable(idp, hosts) is None:
                        continue
                    p = K.TECHNIQUE_BASE["credential_use"] * (K.MOD_MFA if pr.mfa else 1.0)
                    self._add(
                        cred(pid),
                        DOMAIN_ADMIN,
                        "credential_use",
                        p,
                        asset_id=idp.id,
                        principal_id=pid,
                        attack_ids=["T1078.002"],
                        finding_ids=[] if pr.mfa else [f"no_mfa:{pid}"],
                        message_params={
                            "asset": idp.id,
                            "principal": pid,
                            "level": "domain_admin",
                            "mfa": pr.mfa,
                        },
                    )

    def _trust_abuse(self) -> None:
        for conn in sorted(self.c.connections, key=lambda x: x.id):
            if conn.kind is not ConnectionKind.TRUST:
                continue
            self._add(
                priv(conn.source, "admin"),
                priv(conn.target, "user"),
                "trust_abuse",
                K.TECHNIQUE_BASE["trust_abuse"],
                asset_id=conn.target,
                src_asset=conn.source,
                attack_ids=["T1550", "T1134"],
                finding_ids=[f"trust:{conn.id}"],
                message_params={"src": conn.source, "asset": conn.target, "label": conn.label},
            )

    def _data_access(self, hosts: list[Asset]) -> None:
        for a in hosts:
            if a.data_sensitivity <= 0:
                continue
            for level in ("admin", "user"):
                self._add(
                    priv(a.id, level),
                    data(a.id),
                    "data_access",
                    K.TECHNIQUE_BASE[f"data_access_{level}"],
                    asset_id=a.id,
                    attack_ids=["T1005", "T1213"] if level == "admin" else ["T1005"],
                    message_params={"asset": a.id, "level": level, "sensitivity": a.data_sensitivity},
                )

    def _domain_takeover(self) -> None:
        for a in self._hosts():
            if a.type is AssetType.IDENTITY_SERVER:
                self._add(
                    priv(a.id, "admin"),
                    DOMAIN_ADMIN,
                    "domain_takeover",
                    K.TECHNIQUE_BASE["domain_takeover"],
                    asset_id=a.id,
                    attack_ids=["T1003.006"],
                    message_params={"asset": a.id},
                )


def build_attack_graph(content: TwinContent) -> nx.DiGraph:
    return GraphBuilder(content).build()
