import { MarkerType, type Edge, type Node } from "@xyflow/react";
import type { Asset, AssetType, AttackPath, Connection, Severity, SimulationResult, Vulnerability, Zone } from "../../api/types";
import { assetState, maxSeverity, severityFromCvss, type NodeState } from "../../lib/score";

export const NODE_SIZE = 72;

export interface NeonData extends Record<string, unknown> {
  asset: Asset;
  state: NodeState;
  severity: Severity | null;
  vulnCount: number;
  dim: boolean;
  onPath: boolean;
  risk: number | null;
  /** target of the replay step being shown */
  active: boolean;
}
export interface AreaData extends Record<string, unknown> {
  kind: "zone" | "halo";
  label?: string;
  width: number;
  height: number;
}
export interface EdgeData extends Record<string, unknown> {
  kind: Connection["kind"] | "logical";
  attack: boolean;
  reverse: boolean;
  dim: boolean;
  /** the hop of the replay step being shown */
  active?: boolean;
}

export type NeonNode = Node<NeonData, "neon">;
export type AreaNode = Node<AreaData, "area">;
export type FlowEdge = Edge<EdgeData, "particle">;

export interface BuildInput {
  assets: Asset[];
  connections: Connection[];
  vulns: Vulnerability[];
  result?: SimulationResult | null;
  path?: AttackPath | null;
  /** Assets revealed by the replay cursor (null = everything revealed). */
  revealed?: Set<string> | null;
  /** How many leading path assets are revealed (replay). Infinity = whole path. */
  pathReveal?: number;
  zone: Zone | "all";
  hiddenTypes: AssetType[];
  showZones?: boolean;
  halo?: boolean;
  positions?: Record<string, { x: number; y: number }>;
  selectedId?: string | null;
  /** replay step being shown: highlight its target asset and the hop from its source asset */
  active?: { from: string | null; to: string | null } | null;
}

const ATTACK = "#f43f5e";

function bbox(nodes: { x: number; y: number }[], pad: number) {
  const xs = nodes.map((n) => n.x);
  const ys = nodes.map((n) => n.y);
  const x = Math.min(...xs) - pad;
  const y = Math.min(...ys) - pad;
  return { x, y, width: Math.max(...xs) + NODE_SIZE + pad - x, height: Math.max(...ys) + NODE_SIZE + 34 + pad - y };
}

/** Pure: derive React Flow nodes/edges from model + simulation. Unit-testable. */
export function buildFlow(inp: BuildInput): { nodes: (NeonNode | AreaNode)[]; edges: FlowEdge[] } {
  const visible = inp.assets.filter(
    (a) => (inp.zone === "all" || a.zone === inp.zone) && !inp.hiddenTypes.includes(a.asset_type),
  );
  const visibleIds = new Set(visible.map((a) => a.id));
  const pos = (a: Asset) => inp.positions?.[a.id] ?? a.position;

  // ---- severity per asset (from findings when simulated, else vulnerability CVSS)
  const sevByAsset = new Map<string, Severity[]>();
  if (inp.result) {
    for (const f of inp.result.critical_findings) {
      if (f.asset_id) sevByAsset.set(f.asset_id, [...(sevByAsset.get(f.asset_id) ?? []), f.severity]);
    }
  }
  for (const v of inp.vulns) {
    if (v.affected_asset && !inp.result) {
      sevByAsset.set(v.affected_asset, [...(sevByAsset.get(v.affected_asset) ?? []), severityFromCvss(v.cvss)]);
    }
  }
  const risk = new Map(inp.result?.asset_risks.map((r) => [r.asset_id, r.risk_score]) ?? []);

  // ---- attack path pairs (ordered), truncated by replay
  const pathAssets = inp.path ? inp.path.assets.slice(0, inp.pathReveal ?? Infinity) : [];
  const onPath = new Set(pathAssets);
  const pairs: [string, string][] = [];
  for (let i = 0; i + 1 < pathAssets.length; i++) {
    const a = pathAssets[i]!;
    const b = pathAssets[i + 1]!;
    if (a !== b) pairs.push([a, b]);
  }

  const nodes: (NeonNode | AreaNode)[] = [];

  // ---- zone backgrounds
  if (inp.showZones) {
    const byZone = new Map<Zone, { x: number; y: number }[]>();
    for (const a of visible) byZone.set(a.zone, [...(byZone.get(a.zone) ?? []), pos(a)]);
    for (const [zone, pts] of [...byZone.entries()].sort()) {
      const b = bbox(pts, 34);
      nodes.push({
        id: `zone:${zone}`,
        type: "area",
        position: { x: b.x, y: b.y },
        data: { kind: "zone", label: zone, width: b.width, height: b.height },
        draggable: false,
        selectable: false,
        focusable: false,
        zIndex: -2,
      });
    }
  }

  // ---- blast-radius halo around compromised assets
  if (inp.halo && inp.result) {
    const comp = visible.filter(
      (a) => inp.result!.compromised_assets.includes(a.id) && (!inp.revealed || inp.revealed.has(a.id)),
    );
    if (comp.length > 0) {
      const b = bbox(comp.map(pos), 46);
      nodes.push({
        id: "halo",
        type: "area",
        position: { x: b.x, y: b.y },
        data: { kind: "halo", width: b.width, height: b.height },
        draggable: false,
        selectable: false,
        focusable: false,
        zIndex: -1,
      });
    }
  }

  for (const a of visible) {
    let state = assetState(a, inp.result);
    if (inp.revealed && !inp.revealed.has(a.id) && inp.result) state = "unreached";
    const sev = sevByAsset.get(a.id) ?? [];
    nodes.push({
      id: a.id,
      type: "neon",
      position: pos(a),
      selected: inp.selectedId === a.id,
      data: {
        asset: a,
        state,
        severity: maxSeverity(sev),
        vulnCount: sev.length,
        dim: !!inp.revealed && !inp.revealed.has(a.id) && a.asset_type !== "internet_gateway",
        onPath: onPath.has(a.id),
        risk: risk.get(a.id) ?? null,
        active: !!inp.active && inp.active.to === a.id,
      },
    });
  }

  // ---- edges
  const edges: FlowEdge[] = [];
  const used = new Set<string>();
  let activeLinked = false;
  const sorted = [...inp.connections].sort((x, y) => x.id.localeCompare(y.id));
  for (const c of sorted) {
    if (!visibleIds.has(c.source) || !visibleIds.has(c.target)) continue;
    const pairIdx = pairs.findIndex(
      ([a, b]) => (a === c.source && b === c.target) || (a === c.target && b === c.source),
    );
    let attack = false;
    let reverse = false;
    if (pairIdx >= 0) {
      const [a, b] = pairs[pairIdx]!;
      const key = `${a}>${b}`;
      // prefer a trust/permission link for a logical hop, network link otherwise; mark only once
      const better =
        !used.has(key) &&
        (c.kind === "network" ||
          !sorted.some(
            (o) => o.kind === "network" && ((o.source === a && o.target === b) || (o.source === b && o.target === a)),
          ));
      if (better) {
        attack = true;
        reverse = c.source === b;
        used.add(key);
      }
    }
    const color = attack ? ATTACK : c.kind === "trust" ? "#c084fc" : c.kind === "permission" ? "#e879f9" : "#22d3ee";
    const act = inp.active;
    const isActive = !activeLinked &&
      !!act && !!act.from && !!act.to && act.from !== act.to &&
      ((c.source === act.from && c.target === act.to) || (c.source === act.to && c.target === act.from));
    if (isActive) {
      activeLinked = true;
      reverse = c.source === act!.to;
    }
    edges.push({
      id: c.id,
      source: c.source,
      target: c.target,
      type: "particle",
      data: { kind: c.kind, attack, reverse, dim: false, active: isActive },
      markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
      zIndex: isActive ? 6 : attack ? 5 : 0,
    });
  }
  // the replay hop has no modelled link (e.g. a credential used on another host): draw it as a logical hop
  const act = inp.active;
  if (act?.from && act.to && act.from !== act.to && !activeLinked && visibleIds.has(act.from) && visibleIds.has(act.to)) {
    edges.push({
      id: `act:${act.from}>${act.to}`,
      source: act.from,
      target: act.to,
      type: "particle",
      data: { kind: "logical", attack: true, reverse: false, dim: false, active: true },
      markerEnd: { type: MarkerType.ArrowClosed, color: ATTACK, width: 16, height: 16 },
      zIndex: 6,
    });
  }
  // logical hops on the path with no modelled link (e.g. credential use idp -> db)
  for (const [a, b] of pairs) {
    if (used.has(`${a}>${b}`) || !visibleIds.has(a) || !visibleIds.has(b)) continue;
    edges.push({
      id: `atk:${a}>${b}`,
      source: a,
      target: b,
      type: "particle",
      data: { kind: "logical", attack: true, reverse: false, dim: false },
      markerEnd: { type: MarkerType.ArrowClosed, color: ATTACK, width: 16, height: 16 },
      zIndex: 5,
    });
  }
  return { nodes, edges };
}
