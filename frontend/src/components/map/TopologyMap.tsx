import {
  Background, BackgroundVariant, Controls, MiniMap, ReactFlow, ReactFlowProvider, useNodesState, useReactFlow,
  type Connection as FlowConnection, type NodeMouseHandler, type OnNodeDrag,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { AssetType, SimResult, TwinModel, Zone } from '../../api/types'
import { NeonEdge, type NeonEdgeType } from './NeonEdge'
import { NeonNode, type NeonNodeType } from './NeonNode'
import { MIN_ZOOM, NODE_H, NODE_W, STATE_COLOR, type NodeState } from './visuals'

const nodeTypes = { neon: NeonNode }
const edgeTypes = { neon: NeonEdge }
const ZONE_COL: Record<Zone, number> = { internet: 0, dmz: 1, internal: 2, data: 3, mgmt: 2 }

export interface TopologyMapProps {
  model: TwinModel
  result?: SimResult | null
  /** path whose edges/nodes are highlighted red */
  pathId?: string | null
  /** explicit highlighted asset sequence (replay reveals the path step by step); overrides pathId */
  pathAssets?: string[] | null
  /** assets compromised so far (replay); defaults to the result's compromised assets */
  compromised?: string[] | null
  /** asset currently being attacked (replay); pulses */
  activeAsset?: string | null
  zone?: Zone | null
  types?: AssetType[] | null
  /** nodes the camera should frame (replay follow); default: all visible */
  focus?: string[] | null
  /** small overview maps: names hidden (shown on hover) so the whole graph can fit */
  compact?: boolean
  showMinimap?: boolean
  showControls?: boolean
  showDerived?: boolean
  editable?: boolean
  onNodeClick?: (assetId: string) => void
  onConnect?: (source: string, target: string) => void
  onEdgeClick?: (edgeId: string) => void
  onNodeMoved?: (assetId: string, x: number, y: number) => void
  className?: string
  ariaLabel?: string
}

function defaultPosition(i: number, zone: Zone): { x: number; y: number } {
  return { x: ZONE_COL[zone] * 240, y: 520 + i * 150 }
}

function pathEdges(assets: string[]): Set<string> {
  const set = new Set<string>()
  for (let i = 0; i + 1 < assets.length; i++) {
    const a = assets[i]
    const b = assets[i + 1]
    if (a && b) set.add(`${a}>${b}`)
  }
  return set
}

function MapInner(props: TopologyMapProps) {
  const { t } = useTranslation()
  const { model, result, pathId, zone, types, focus, editable } = props
  const flow = useReactFlow()
  const wrapper = useRef<HTMLDivElement>(null)

  const pathSeq = useMemo(
    () => props.pathAssets ?? result?.paths.find((p) => p.id === pathId)?.assets ?? [],
    [props.pathAssets, result, pathId],
  )
  const onPathAssets = useMemo(() => new Set(pathSeq), [pathSeq])
  const onPathPairs = useMemo(() => pathEdges(pathSeq), [pathSeq])

  const stateOf = useCallback((id: string, type: AssetType): NodeState => {
    if (!result) return 'neutral'
    const compromised = props.compromised ?? result.compromised_assets
    if (compromised.includes(id)) return 'compromised'
    if (type === 'firewall') return onPathAssets.has(id) ? 'warning' : 'secure'
    if (result.reachable_assets.includes(id) || (result.asset_risk[id] ?? 0) > 0) return 'warning'
    return 'secure'
  }, [result, props.compromised, onPathAssets])

  const visible = useCallback(
    (a: { zone: Zone; type: AssetType }) => (!zone || a.zone === zone) && (!types || types.length === 0 || types.includes(a.type)),
    [zone, types],
  )

  const builtNodes: NeonNodeType[] = useMemo(() => {
    const perZone: Record<string, number> = {}
    return model.assets.map((a) => {
      const pos = model.positions[a.id] ?? defaultPosition((perZone[a.zone] = (perZone[a.zone] ?? 0) + 1), a.zone)
      const state = stateOf(a.id, a.type)
      return {
        id: a.id,
        type: 'neon' as const,
        position: { x: pos.x, y: pos.y },
        data: {
          asset: a, state, onPath: onPathAssets.has(a.id), dim: !visible(a), active: props.activeAsset === a.id, compact: !!props.compact,
          stateLabel: state === 'neutral' ? '' : t(`ui.state.${state}`),
        },
        width: NODE_W,
        height: NODE_H,
        draggable: !!editable,
        connectable: !!editable,
      }
    })
  }, [model, stateOf, onPathAssets, visible, props.activeAsset, props.compact, editable, t])
  const minZoom = props.compact ? 0.2 : MIN_ZOOM

  const [nodes, setNodes, onNodesChange] = useNodesState<NeonNodeType>(builtNodes)
  useEffect(() => {
    setNodes(builtNodes)
  }, [builtNodes, setNodes])

  const edges: NeonEdgeType[] = useMemo(() => {
    const byId = new Map(model.assets.map((a) => [a.id, a]))
    const list = [...model.connections, ...(props.showDerived ? model.derived_connections : [])]
    const linked = new Set(list.flatMap((c) => [`${c.source}>${c.target}`, `${c.target}>${c.source}`]))
    // Path hops without a stored link (e.g. credential use from idp-01 to customer-db) are drawn
    // as dashed logical hops so the attack path stays continuous on the map.
    const logical: NeonEdgeType[] = [...onPathPairs].filter((k) => !linked.has(k)).map((k) => {
      const [source = '', target = ''] = k.split('>')
      return {
        id: `hop:${k}`, source, target, type: 'neon' as const, sourceHandle: 's', targetHandle: 't',
        data: { kind: 'trust' as const, onPath: true, dim: false, directed: true, logical: true }, zIndex: 2, selectable: false,
      }
    })
    return [...list.map((c) => {
      const fwd = onPathPairs.has(`${c.source}>${c.target}`)
      const back = onPathPairs.has(`${c.target}>${c.source}`)
      const s = byId.get(c.source)
      const tg = byId.get(c.target)
      const dim = !!(s && tg) && !(visible(s) && visible(tg))
      // Draw path edges in attack direction.
      const [source, target] = back && !fwd ? [c.target, c.source] : [c.source, c.target]
      return {
        id: c.id, source, target, type: 'neon' as const, sourceHandle: 's', targetHandle: 't',
        data: { kind: c.kind, onPath: fwd || back, dim, directed: c.kind !== 'network' || fwd || back },
        zIndex: fwd || back ? 2 : 0,
        selectable: !!editable && !c.derived,
      }
    }), ...logical]
  }, [model, onPathPairs, visible, props.showDerived, editable])

  // Camera: frame the focus set (or visible nodes) without zooming below the label-readability minimum.
  const fit = useCallback(() => {
    const ids = focus?.length ? focus : model.assets.filter(visible).map((a) => a.id)
    if (!ids.length) return
    void flow.fitView({ nodes: ids.map((id) => ({ id })), padding: 0.18, minZoom, maxZoom: 1.25, duration: 450 })
  }, [flow, focus, model.assets, visible, minZoom])

  useEffect(() => {
    const h = window.setTimeout(fit, 60)
    return () => window.clearTimeout(h)
  }, [fit])

  useEffect(() => {
    const el = wrapper.current
    if (!el) return
    let h = 0
    const ro = new ResizeObserver(() => {
      window.clearTimeout(h)
      h = window.setTimeout(fit, 120)
    })
    ro.observe(el)
    return () => {
      ro.disconnect()
      window.clearTimeout(h)
    }
  }, [fit])

  const onNodeClick: NodeMouseHandler<NeonNodeType> = (_, node) => props.onNodeClick?.(node.id)
  const onNodeDragStop: OnNodeDrag<NeonNodeType> = (_, node) => props.onNodeMoved?.(node.id, node.position.x, node.position.y)
  const onConnect = (c: FlowConnection) => {
    if (c.source && c.target && c.source !== c.target) props.onConnect?.(c.source, c.target)
  }

  return (
    <div ref={wrapper} className={`relative h-full w-full ${editable ? 'ct-editable' : ''} ${props.className ?? ''}`}
      role="application" aria-label={props.ariaLabel ?? t('ui.overview.topology')}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={onNodeClick}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        onEdgeClick={(_, e) => props.onEdgeClick?.(e.id)}
        minZoom={minZoom}
        maxZoom={2}
        nodesDraggable={!!editable}
        nodesConnectable={!!editable}
        elementsSelectable
        proOptions={{ hideAttribution: true }}
        fitView
        fitViewOptions={{ padding: 0.18, minZoom }}
      >
        <Background variant={BackgroundVariant.Dots} gap={28} size={1.2} color="rgb(103 232 249 / 0.14)" />
        {props.showControls && <Controls showInteractive={false} position="bottom-right" />}
        {props.showMinimap && (
          <MiniMap pannable zoomable position="bottom-left" maskColor="rgb(4 7 15 / 0.7)"
            nodeColor={(n) => STATE_COLOR[(n.data as { state?: NodeState }).state ?? 'neutral']} />
        )}
      </ReactFlow>
    </div>
  )
}

export function TopologyMap(props: TopologyMapProps) {
  return (
    <ReactFlowProvider>
      <MapInner {...props} />
    </ReactFlowProvider>
  )
}
