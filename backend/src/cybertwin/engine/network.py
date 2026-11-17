"""Network reachability on the virtual model: routing over network links + ordered firewall rules.

Rules of the model:
- Traffic between two hosts follows the shortest route over ``network`` connections where every
  intermediate hop is a firewall (hosts never route for others).
- Every firewall on the route evaluates its rules in ``order``; the first match wins; no match
  means deny. All firewalls on the route must allow.
- Hosts linked directly (no firewall in between) reach each other freely.
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import cached_property

import networkx as nx

from cybertwin.domain.model import (
    Asset,
    AssetType,
    ConnectionKind,
    FirewallRule,
    Proto,
    RuleAction,
    TwinContent,
)


@dataclass(frozen=True)
class Reach:
    allowed: bool
    via: tuple[str, ...]  # firewalls crossed, in order
    rule_ids: tuple[str, ...]  # matched rule per firewall (empty string = default deny)


def _endpoint_matches(endpoint: str, asset: Asset) -> bool:
    if endpoint == "any":
        return True
    if endpoint.startswith("zone:"):
        return asset.zone.value == endpoint[5:]
    return endpoint == f"asset:{asset.id}"


def rule_matches(rule: FirewallRule, src: Asset, dst: Asset, port: int, proto: Proto) -> bool:
    return (
        _endpoint_matches(rule.src, src)
        and _endpoint_matches(rule.dst, dst)
        and (rule.port is None or rule.port == port)
        and (rule.proto is None or rule.proto == proto)
    )


class Network:
    def __init__(self, content: TwinContent) -> None:
        self.c = content
        self.assets = {a.id: a for a in content.assets}
        self.rules: dict[str, list[FirewallRule]] = {}
        for r in sorted(content.firewall_rules, key=lambda r: (r.firewall_id, r.order, r.id)):
            self.rules.setdefault(r.firewall_id, []).append(r)
        self._reach_cache: dict[tuple[str, str, int, str], Reach] = {}

    @cached_property
    def _graph(self) -> nx.Graph:
        g = nx.Graph()
        g.add_nodes_from(sorted(self.assets))
        for conn in sorted(self.c.connections, key=lambda x: x.id):
            if conn.kind is ConnectionKind.NETWORK:
                g.add_edge(conn.source, conn.target)
        return g

    def route(self, src: str, dst: str) -> list[str] | None:
        """Shortest route src -> dst whose intermediate nodes are all firewalls (deterministic)."""
        g = self._graph
        allowed = {n for n in g.nodes if n in (src, dst) or self.assets[n].type is AssetType.FIREWALL}
        sub = g.subgraph(sorted(allowed))
        try:
            return list(nx.shortest_path(sub, src, dst))
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            return None

    def evaluate_firewall(self, fw: str, src: Asset, dst: Asset, port: int, proto: Proto) -> tuple[bool, str]:
        for rule in self.rules.get(fw, []):
            if rule_matches(rule, src, dst, port, proto):
                return rule.action is RuleAction.ALLOW, rule.id
        return False, ""

    def reach(self, src: str, dst: str, port: int, proto: Proto = Proto.TCP) -> Reach:
        key = (src, dst, port, proto.value)
        cached = self._reach_cache.get(key)
        if cached is not None:
            return cached
        result = self._compute(src, dst, port, proto)
        self._reach_cache[key] = result
        return result

    def _compute(self, src: str, dst: str, port: int, proto: Proto) -> Reach:
        path = self.route(src, dst)
        if path is None:
            return Reach(False, (), ())
        via = tuple(n for n in path[1:-1])
        rule_ids: list[str] = []
        s, d = self.assets[src], self.assets[dst]
        for fw in via:
            ok, rid = self.evaluate_firewall(fw, s, d, port, proto)
            rule_ids.append(rid)
            if not ok:
                return Reach(False, via, tuple(rule_ids))
        return Reach(True, via, tuple(rule_ids))
