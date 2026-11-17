"""Network reachability: which ports of asset B can a host on asset A talk to.

Model:
* Network connections are undirected links between assets.
* Traffic may transit firewalls only (any number, simple routes). Every firewall on the route
  evaluates its rules in ascending (order, id); the first matching rule decides. No match = deny.
* A link with a non-empty ``ports`` list only carries those ports.
* The destination must listen on the port, and the port's ``exposed_to_zones`` (if set) must
  contain the source zone.
* If the zone pair (src, dst) is segmented, zone-wide allow rules are ignored: only rules naming
  the destination asset explicitly can allow traffic, and the hop carries the segmentation modifier.
"""

from __future__ import annotations

import ipaddress
import itertools
from dataclasses import dataclass
from functools import cached_property

from app.schemas.twin import Asset, AssetType, ConnectionKind, FirewallRule, RuleAction, TwinSnapshot

MAX_FIREWALL_HOPS = 4


@dataclass(frozen=True)
class Route:
    hops: tuple[str, ...]  # firewall ids in order


@dataclass(frozen=True)
class PortReach:
    port: int
    via: tuple[str, ...]  # firewalls traversed on the first (sorted) route that allows the port
    segmented: bool


class Reachability:
    def __init__(self, snap: TwinSnapshot) -> None:
        self.snap = snap
        self.assets: dict[str, Asset] = {a.id: a for a in snap.assets}
        self.adj: dict[str, set[str]] = {a.id: set() for a in snap.assets}
        self.link_ports: dict[tuple[str, str], frozenset[int]] = {}
        for c in snap.connections:
            if c.kind != ConnectionKind.network:
                continue
            self.adj[c.source].add(c.target)
            self.adj[c.target].add(c.source)
            key = tuple(sorted((c.source, c.target)))
            ports = frozenset(c.ports)
            prev = self.link_ports.get((key[0], key[1]))
            if prev is None:
                self.link_ports[(key[0], key[1])] = ports
            elif prev and ports:
                self.link_ports[(key[0], key[1])] = prev | ports
            else:  # one of the parallel links carries any port
                self.link_ports[(key[0], key[1])] = frozenset()
        self.rules: dict[str, list[FirewallRule]] = {}
        for r in sorted(snap.firewall_rules, key=lambda r: (r.firewall_id, r.order, r.id)):
            self.rules.setdefault(r.firewall_id, []).append(r)
        self.segmented: set[tuple[str, str]] = {z.key() for z in snap.segmented_zones}
        self._cache: dict[tuple[str, str], list[PortReach]] = {}

    @cached_property
    def firewalls(self) -> set[str]:
        return {a.id for a in self.snap.assets if a.asset_type == AssetType.firewall}

    def routes(self, src: str, dst: str) -> list[Route]:
        """All simple routes src -> dst whose intermediate nodes are firewalls. Sorted for determinism."""
        out: list[Route] = []

        def dfs(node: str, hops: list[str], seen: set[str]) -> None:
            for nxt in sorted(self.adj.get(node, ())):
                if nxt == dst:
                    out.append(Route(tuple(hops)))
                    continue
                if nxt in seen or nxt not in self.firewalls or len(hops) >= MAX_FIREWALL_HOPS:
                    continue
                seen.add(nxt)
                hops.append(nxt)
                dfs(nxt, hops, seen)
                hops.pop()
                seen.discard(nxt)

        dfs(src, [], {src})
        return sorted(out, key=lambda r: (len(r.hops), r.hops))

    def _link_allows(self, a: str, b: str, port: int) -> bool:
        x, y = sorted((a, b))
        ports = self.link_ports.get((x, y), frozenset())
        return not ports or port in ports

    def is_segmented(self, src_zone: str, dst_zone: str) -> bool:
        if src_zone == dst_zone:
            return False
        x, y = sorted((src_zone, dst_zone))
        return (x, y) in self.segmented

    def rule_matches(self, rule: FirewallRule, src: Asset, dst: Asset, port: int) -> bool:
        if rule.port is not None and rule.port != port:
            return False
        if rule.src_zone is not None and rule.src_zone != src.zone:
            return False
        if rule.src_cidr is not None and ipaddress.IPv4Address(src.ip) not in ipaddress.IPv4Network(
            rule.src_cidr, strict=False
        ):
            return False
        if rule.dst_asset is not None and rule.dst_asset != dst.id:
            return False
        return not (rule.dst_zone is not None and rule.dst_zone != dst.zone)

    def firewall_decision(self, fw_id: str, src: Asset, dst: Asset, port: int) -> FirewallRule | None:
        """First matching rule on this firewall (ordered), honoring segmentation. None = default deny."""
        segmented = self.is_segmented(src.zone.value, dst.zone.value)
        for rule in self.rules.get(fw_id, []):
            if not self.rule_matches(rule, src, dst, port):
                continue
            if segmented and rule.action == RuleAction.allow and rule.dst_asset is None:
                continue  # zone-wide allows do not cross a segmented boundary
            return rule
        return None

    def _route_allows(self, route: Route, src: Asset, dst: Asset, port: int) -> bool:
        chain = [src.id, *route.hops, dst.id]
        for a, b in itertools.pairwise(chain):
            if not self._link_allows(a, b, port):
                return False
        for fw in route.hops:
            rule = self.firewall_decision(fw, src, dst, port)
            if rule is None or rule.action != RuleAction.allow:
                return False
        return True

    def reachable_ports(self, src_id: str, dst_id: str) -> list[PortReach]:
        key = (src_id, dst_id)
        if key in self._cache:
            return self._cache[key]
        src, dst = self.assets[src_id], self.assets[dst_id]
        result: list[PortReach] = []
        if src_id != dst_id:
            routes = self.routes(src_id, dst_id)
            segmented = self.is_segmented(src.zone.value, dst.zone.value)
            for op in sorted(dst.open_ports, key=lambda p: (p.port, p.proto.value)):
                if op.exposed_to_zones and src.zone not in op.exposed_to_zones:
                    continue
                for route in routes:
                    if segmented and not route.hops:
                        continue  # segmented zones cannot talk over a direct link
                    if self._route_allows(route, src, dst, op.port):
                        result.append(PortReach(op.port, route.hops, segmented))
                        break
        self._cache[key] = result
        return result
