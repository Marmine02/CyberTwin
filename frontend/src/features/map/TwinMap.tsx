import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
  type Connection as RFConnection,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";
import type { AttackPath, SimulationResult, TwinSnapshot } from "../../api/types";
import { STATE_COLOR } from "../../lib/score";
import { useUi } from "../../stores/ui";
import { buildFlow, type AreaNode, type NeonData, type NeonNode as NeonNodeT } from "./build";
import { AreaNodeView, NeonNode } from "./NeonNode";
import { ParticleEdge } from "./ParticleEdge";

const nodeTypes = { neon: NeonNode, area: AreaNodeView };
const edgeTypes = { particle: ParticleEdge };

export interface TwinMapProps {
  snapshot: TwinSnapshot;
  result?: SimulationResult | null;
  path?: AttackPath | null;
  revealed?: Set<string> | null;
  pathReveal?: number;
  editable?: boolean;
  compact?: boolean;
  showZones?: boolean;
  /** Show the minimap (default: when not compact). */
  minimap?: boolean;
  halo?: boolean;
  /** Override global zone / type filters (e.g. mini before/after maps). */
  ignoreFilters?: boolean;
  onSelect?: (assetId: string | null) => void;
  onConnectRequest?: (source: string, target: string) => void;
  onLayoutChange?: (positions: Record<string, { x: number; y: number }>) => void;
  /** Called with the connection id when a modelled edge (not a logical attack hop) is clicked. */
  onEdgeSelect?: (connectionId: string) => void;
  testId?: string;
  ariaLabel?: string;
  /** replay step being shown: highlighted, and the camera frames these assets (from + to) */
  active?: { from: string | null; to: string | null } | null;
}

function Inner(p: TwinMapProps) {
  const { t } = useTranslation();
  const { zone, hiddenTypes, selectedAssetId } = useUi();
  const [overrides, setOverrides] = useState<Record<string, { x: number; y: number }>>({});
  const flow = useMemo(
    () =>
      buildFlow({
        assets: p.snapshot.assets,
        connections: p.snapshot.connections,
        vulns: p.snapshot.vulnerabilities,
        result: p.result,
        path: p.path,
        revealed: p.revealed,
        pathReveal: p.pathReveal,
        zone: p.ignoreFilters ? "all" : zone,
        hiddenTypes: p.ignoreFilters ? [] : hiddenTypes,
        showZones: p.showZones,
        halo: p.halo,
        positions: overrides,
        selectedId: p.onSelect ? selectedAssetId : null,
        active: p.active,
      }),
    [p.snapshot, p.result, p.path, p.revealed, p.pathReveal, p.ignoreFilters, p.showZones, p.halo, p.onSelect, zone,
      hiddenTypes, selectedAssetId, overrides, p.active],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState<NeonNodeT | AreaNode>(flow.nodes);
  useEffect(() => {
    setNodes(flow.nodes);
  }, [flow.nodes, setNodes]);

  const rf = useReactFlow();
  const reduce = useReducedMotion();
  // node sizes must be measured before fitView can frame them (the cause of the half-empty mini maps)
  const ready = useNodesInitialized();
  const wrap = useRef<HTMLDivElement>(null);
  const visibleKey = flow.nodes.filter((n) => n.type === "neon").map((n) => n.id).join(",");
  const focusIds = [p.active?.from, p.active?.to].filter((x): x is string => !!x && visibleKey.split(",").includes(x));
  const focusKey = focusIds.join(">");
  // Frame the map: the replay step's assets when there is one, else every visible node. Runs on load, on
  // filter / zone changes, on each replay step and whenever the container is resized (panels, window).
  const frame = useCallback(
    (animate: boolean) => {
      if (!ready) return;
      const duration = animate && !reduce ? 650 : 0;
      if (focusKey) {
        // frame the step in the part of the map the narration card (bottom-left) leaves free
        void rf.fitView({
          nodes: focusKey.split(">").map((id) => ({ id })),
          padding: { top: "90px", bottom: "280px", left: "120px", right: "120px" },
          maxZoom: 1.0,
          duration,
        });
      } else {
        void rf.fitView({ padding: p.compact ? 0.14 : 0.1, maxZoom: 1.3, duration });
      }
    },
    [rf, focusKey, reduce, p.compact, ready],
  );
  useEffect(() => {
    const id = requestAnimationFrame(() => frame(true));
    return () => cancelAnimationFrame(id);
  }, [visibleKey, frame, p.snapshot]);
  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => frame(false));
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [frame]);

  const handleChange = useCallback(
    (changes: NodeChange<NeonNodeT | AreaNode>[]) => {
      onNodesChange(p.editable ? changes : changes.filter((c) => c.type !== "position"));
    },
    [onNodesChange, p.editable],
  );

  const onConnect = useCallback(
    (c: RFConnection) => {
      if (c.source && c.target && c.source !== c.target) p.onConnectRequest?.(c.source, c.target);
    },
    [p],
  );

  return (
    <div ref={wrap} className="h-full w-full" data-testid={p.testId ? `${p.testId}-frame` : undefined}>
    <ReactFlow
      nodes={nodes}
      edges={flow.edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={handleChange}
      onNodeClick={(_, n) => n.type === "neon" && p.onSelect?.(n.id)}
      onPaneClick={() => p.onSelect?.(null)}
      onEdgeClick={(_, e) => {
        if (p.onEdgeSelect && !e.id.startsWith("atk:")) p.onEdgeSelect(e.id);
      }}
      onNodeDragStop={(_, n) => {
        if (!p.editable || n.type !== "neon") return;
        setOverrides((o) => ({ ...o, [n.id]: n.position }));
        p.onLayoutChange?.({ [n.id]: { x: Math.round(n.position.x), y: Math.round(n.position.y) } });
      }}
      onConnect={onConnect}
      connectionMode={ConnectionMode.Loose}
      connectionRadius={44}
      nodesDraggable={!!p.editable}
      nodesConnectable={!!p.editable}
      elementsSelectable={!!p.onSelect}
      zoomOnScroll={!p.compact}
      panOnDrag={!p.compact || true}
      minZoom={0.25}
      fitView
      fitViewOptions={{ padding: p.compact ? 0.14 : 0.1, maxZoom: 1.3 }}
      maxZoom={2.2}
      className={p.editable ? "editable" : undefined}
      aria-label={p.ariaLabel ?? t("map.ariaLabel")}
      data-testid={p.testId}
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={26} size={1} color="rgb(148 163 184 / 0.18)" />
      {!p.compact && <Controls showInteractive={false} position="bottom-left" />}
      {(p.minimap ?? !p.compact) && (
        <MiniMap
          pannable
          zoomable
          position="bottom-right"
          nodeColor={(n) =>
            n.type === "neon" ? STATE_COLOR[(n.data as NeonData).state] : "transparent"
          }
          maskColor="rgb(5 10 20 / 0.7)"
        />
      )}
    </ReactFlow>
    </div>
  );
}

export function TwinMap(props: TwinMapProps) {
  return (
    <ReactFlowProvider>
      <Inner {...props} />
    </ReactFlowProvider>
  );
}
