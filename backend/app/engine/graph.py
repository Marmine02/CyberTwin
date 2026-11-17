"""Attack state graph construction (NetworkX DiGraph). Pure function of (snapshot, technique filter).

Node ids (strings, sorted for determinism):
  ATTACKER@internet            special entry
  <asset>#network:<port>       attacker can talk to <asset> on <port>
  <asset>#user / <asset>#admin attacker executes code on <asset> with that privilege
  CRED:<principal>             attacker holds usable credentials of <principal>
  DATA:<asset>                 attacker can read sensitive data of <asset>
  DOMAIN_ADMIN                 attacker controls the identity domain
"""

from __future__ import annotations

import math
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

import networkx as nx

from app.engine.constants import (
    AUTH_PORTS,
    AUTH_SERVICE_HINTS,
    BASE_P,
    MITRE,
    MODIFIERS,
    clamp,
    password_modifier,
)
from app.engine.reach import Reachability
from app.i18n import vuln_title
from app.schemas.i18n import Message, MsgParam, msg
from app.schemas.twin import (
    Asset,
    AssetType,
    ConnectionKind,
    OpenPort,
    PermissionLevel,
    Privilege,
    TwinSnapshot,
    Vulnerability,
    VulnKind,
)

ENTRY_INTERNET = "ATTACKER@internet"
DOMAIN_ADMIN = "DOMAIN_ADMIN"


def net_node(asset: str, port: int) -> str:
    return f"{asset}#network:{port}"


def state_node(asset: str, privilege: str) -> str:
    return f"{asset}#{privilege}"


def cred_node(principal: str) -> str:
    return f"CRED:{principal}"


def data_node(asset: str) -> str:
    return f"DATA:{asset}"


def node_asset(node: str) -> str | None:
    if node.startswith("DATA:"):
        return node[5:]
    if "#" in node and not node.startswith("ATTACKER"):
        return node.split("#", 1)[0]
    return None


def node_privilege(node: str) -> str | None:
    if "#" not in node or node.startswith("ATTACKER"):
        return None
    tail = node.split("#", 1)[1]
    return "network" if tail.startswith("network") else tail


@dataclass(frozen=True)
class Edge:
    u: str
    v: str
    technique: str
    p: float
    reason: Message
    vuln_id: str | None = None
    via: tuple[str, ...] = ()
    mitre: tuple[str, ...] = ()


VulnFilter = Callable[[Vulnerability, Asset], bool]


@dataclass
class AttackGraph:
    g: Any  # nx.DiGraph
    entry_asset: dict[str, str] = field(default_factory=dict)

    def edge(self, u: str, v: str) -> dict[str, Any]:
        data: dict[str, Any] = self.g.edges[u, v]
        return data


def _is_auth_port(op: OpenPort) -> bool:
    return op.port in AUTH_PORTS or any(h in op.service.lower() for h in AUTH_SERVICE_HINTS)


def _edr(asset: Asset) -> float:
    return MODIFIERS["edr"] if asset.security_config.edr else 1.0


def _edr_note(asset: Asset) -> str | Message:
    return msg("note.edr") if asset.security_config.edr else ""


def build_graph(
    snap: TwinSnapshot,
    techniques: frozenset[str],
    vuln_filter: VulnFilter | None = None,
    extra_entry_nodes: tuple[str, ...] = (),
) -> AttackGraph:
    reach = Reachability(snap)
    assets = sorted(snap.assets, key=lambda a: a.id)
    by_id = {a.id: a for a in assets}
    principals = sorted(snap.principals, key=lambda p: p.id)
    vulns = sorted(snap.vulnerabilities, key=lambda v: v.id)
    gateways = [a for a in assets if a.asset_type == AssetType.internet_gateway]
    targets = [a for a in assets if a.asset_type != AssetType.internet_gateway]

    edges: dict[tuple[str, str], Edge] = {}

    def add(e: Edge) -> None:
        if e.technique != "reach" and e.technique not in techniques:
            return
        e = Edge(
            e.u,
            e.v,
            e.technique,
            round(clamp(e.p), 6),
            e.reason,
            e.vuln_id,
            e.via,
            tuple(MITRE.get(e.technique, [])) if not e.mitre else e.mitre,
        )
        prev = edges.get((e.u, e.v))
        if prev is None or (e.p, prev.technique) > (prev.p, e.technique):
            edges[(e.u, e.v)] = e

    def misconfig_for(asset_id: str, port: int | None = None, principal: str | None = None) -> str | None:
        for v in vulns:
            if v.kind != VulnKind.misconfig or v.affected_asset != asset_id:
                continue
            if port is not None and v.affected_port == port:
                return v.id
            if principal is not None and v.affected_principal == principal:
                return v.id
        return None

    def vuln_of_kind(kind: VulnKind, principal: str, asset_id: str | None = None) -> str | None:
        for v in vulns:
            if (
                v.kind == kind
                and v.affected_principal == principal
                and (asset_id is None or v.affected_asset == asset_id)
            ):
                return v.id
        return None

    # --- reachability (from entry gateway and from every user/admin state) -------------------
    sources: list[tuple[str, Asset]] = []
    if gateways:
        sources.append((ENTRY_INTERNET, gateways[0]))
    for a in targets:
        sources.append((state_node(a.id, "user"), a))
        sources.append((state_node(a.id, "admin"), a))
    for src_node, src in sources:
        for dst in targets:
            if dst.id == src.id:
                continue
            for rp in reach.reachable_ports(src.id, dst.id):
                op = dst.port(rp.port)
                svc = f"{op.service} {op.version}".strip() if op else str(rp.port)
                p = BASE_P["reach"] * (MODIFIERS["segmented_zone_hop"] if rp.segmented else 1.0)
                origin: str | Message = msg("word.internet") if src_node == ENTRY_INTERNET else src.id
                common: dict[str, MsgParam] = {"origin": origin, "dst": dst.id, "port": rp.port, "service": svc}
                why = (
                    msg("edge.reach.via", via=", ".join(rp.via), **common)
                    if rp.via
                    else msg("edge.reach.direct", **common)
                )
                add(
                    Edge(
                        src_node,
                        net_node(dst.id, rp.port),
                        "reach",
                        p,
                        why,
                        misconfig_for(dst.id, port=rp.port),
                        rp.via,
                    )
                )

    # --- remote exploits, brute force ------------------------------------------------------------
    for b in targets:
        for op in sorted(b.open_ports, key=lambda o: o.port):
            n = net_node(b.id, op.port)
            for v in vulns:
                if v.affected_asset != b.id or v.affected_port != op.port:
                    continue
                if v.kind not in (VulnKind.remote_service, VulnKind.outdated_software):
                    continue
                if vuln_filter is not None and not vuln_filter(v, b):
                    continue
                p = v.cvss / 10 * v.exploit_maturity * _edr(b)
                add(
                    Edge(
                        n,
                        state_node(b.id, v.grants_privilege),
                        "remote_exploit",
                        p,
                        msg(
                            "edge.remote_exploit",
                            vuln=vuln_title(v),
                            asset=b.id,
                            port=op.port,
                            privilege=msg(f"priv.{v.grants_privilege}"),
                            edr=_edr_note(b),
                        ),
                        v.id,
                        (),
                        tuple(v.mitre_techniques) or tuple(MITRE["remote_exploit"]),
                    )
                )
            if _is_auth_port(op):
                for pr in principals:
                    if not any(perm.asset_id == b.id for perm in pr.permissions):
                        continue
                    p = BASE_P["brute_force"] * password_modifier(pr.credential_strength.value)
                    if pr.mfa:
                        p *= MODIFIERS["mfa"]
                    add(
                        Edge(
                            n,
                            cred_node(pr.id),
                            "brute_force",
                            p,
                            msg(
                                "edge.brute_force",
                                strength=msg(f"strength.{pr.credential_strength.value}"),
                                principal=pr.id,
                                asset=b.id,
                                service=op.service,
                                port=op.port,
                                mfa=msg("note.mfa_enabled") if pr.mfa else msg("note.no_mfa"),
                            ),
                            vuln_of_kind(VulnKind.weak_credential, pr.id),
                        )
                    )

    # --- local privilege escalation ---------------------------------------------------------------
    for v in vulns:
        if v.kind != VulnKind.local_privesc or v.affected_asset not in by_id:
            continue
        a = by_id[v.affected_asset]
        p = v.cvss / 10 * v.exploit_maturity * _edr(a)
        add(
            Edge(
                state_node(a.id, "user"),
                state_node(a.id, "admin"),
                "local_privesc",
                p,
                msg("edge.local_privesc", asset=a.id, vuln=vuln_title(v), edr=_edr_note(a)),
                v.id,
                (),
                tuple(v.mitre_techniques) or tuple(MITRE["local_privesc"]),
            )
        )

    # --- credentials ------------------------------------------------------------------------------
    for pr in principals:
        for asset_id in sorted(pr.logged_on_assets):
            a = by_id[asset_id]
            add(
                Edge(
                    state_node(a.id, "admin"),
                    cred_node(pr.id),
                    "credential_theft",
                    BASE_P["credential_theft"] * _edr(a),
                    msg("edge.credential_theft", principal=pr.id, asset=a.id, edr=_edr_note(a)),
                    misconfig_for(a.id, principal=pr.id),
                )
            )
        mfa = MODIFIERS["mfa"] if pr.mfa else 1.0
        challenge: str | Message = msg("note.mfa_challenge") if pr.mfa else ""
        for perm in sorted(pr.permissions, key=lambda x: x.asset_id):
            level = "admin" if perm.level == PermissionLevel.admin else "user"
            excessive = vuln_of_kind(VulnKind.excessive_permission, pr.id, perm.asset_id)
            add(
                Edge(
                    cred_node(pr.id),
                    state_node(perm.asset_id, level),
                    "credential_use",
                    BASE_P["credential_use"] * mfa,
                    msg(
                        "edge.credential_use",
                        asset=perm.asset_id,
                        principal=pr.id,
                        level=msg(f"level.{perm.level.value}"),
                        mfa=challenge,
                    ),
                    excessive,
                )
            )
            if by_id[perm.asset_id].data_sensitivity >= 1:
                add(
                    Edge(
                        cred_node(pr.id),
                        data_node(perm.asset_id),
                        "data_access",
                        BASE_P["credential_use"] * mfa,
                        msg(
                            "edge.data_access.cred",
                            asset=perm.asset_id,
                            principal=pr.id,
                            level=msg(f"level.{perm.level.value}"),
                            mfa=challenge,
                        ),
                        excessive,
                    )
                )
        if pr.privilege == Privilege.domain_admin:
            add(
                Edge(
                    cred_node(pr.id),
                    DOMAIN_ADMIN,
                    "domain_takeover",
                    BASE_P["domain_takeover"] * mfa,
                    msg("edge.domain_takeover.principal", principal=pr.id, mfa=challenge),
                    None,
                )
            )

    for idp in (a for a in targets if a.asset_type == AssetType.identity_server):
        for pr in principals:
            if pr.kind != "service":
                continue
            p = BASE_P["kerberoast"] * password_modifier(pr.credential_strength.value)
            for priv in ("user", "admin"):
                add(
                    Edge(
                        state_node(idp.id, priv),
                        cred_node(pr.id),
                        "kerberoast",
                        p,
                        msg(
                            "edge.kerberoast",
                            principal=pr.id,
                            asset=idp.id,
                            strength=msg(f"strength.{pr.credential_strength.value}"),
                        ),
                        vuln_of_kind(VulnKind.weak_credential, pr.id),
                    )
                )
        add(
            Edge(
                state_node(idp.id, "admin"),
                DOMAIN_ADMIN,
                "domain_takeover",
                BASE_P["domain_takeover"],
                msg("edge.domain_takeover.idp", asset=idp.id),
                None,
            )
        )

    # --- trust / permission connections ------------------------------------------------------------
    for c in sorted(snap.connections, key=lambda c: c.id):
        if c.kind == ConnectionKind.network:
            continue
        ports = reach.reachable_ports(c.source, c.target)
        if not ports:
            continue
        seg = any(pr.segmented for pr in ports)
        technique = "trust_abuse" if c.kind == ConnectionKind.trust else "permission_abuse"
        p = BASE_P["trust_abuse"] * (MODIFIERS["segmented_zone_hop"] if seg else 1.0)
        who: str | Message = msg("note.as_principal", principal=c.principal_id) if c.principal_id else ""
        why = (
            msg("edge.trust_abuse", source=c.source, target=c.target, **{"as": who})
            if c.kind == ConnectionKind.trust
            else msg("edge.permission_abuse", source=c.source, target=c.target)
        )
        add(
            Edge(
                state_node(c.source, "admin"),
                state_node(c.target, "user"),
                technique,
                p,
                why,
                None,
                (),
            )
        )

    # --- data -----------------------------------------------------------------------------------
    for a in targets:
        if a.data_sensitivity >= 1:
            add(
                Edge(
                    state_node(a.id, "admin"),
                    data_node(a.id),
                    "data_access",
                    BASE_P["data_access"],
                    msg("edge.data_access.admin", asset=a.id, sensitivity=a.data_sensitivity),
                    None,
                )
            )

    g = nx.DiGraph()
    nodes: set[str] = {ENTRY_INTERNET, *extra_entry_nodes}
    for eu, ev in edges:
        nodes.add(eu)
        nodes.add(ev)
    for n in sorted(nodes):
        g.add_node(n, asset=node_asset(n), privilege=node_privilege(n))
    for key in sorted(edges):
        e = edges[key]
        g.add_edge(
            e.u,
            e.v,
            technique=e.technique,
            p=e.p,
            w=-math.log(e.p),
            reason=e.reason,
            vuln_id=e.vuln_id,
            via=list(e.via),
            mitre=list(e.mitre),
        )
    ag = AttackGraph(g)
    if gateways:
        ag.entry_asset[ENTRY_INTERNET] = gateways[0].id
    return ag
