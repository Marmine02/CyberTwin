import { BaseEdge, type Edge, type EdgeProps } from '@xyflow/react'
import { memo } from 'react'
import { EDGE_INSET } from './visuals'

export type NeonEdgeData = {
  kind: 'network' | 'trust' | 'permission'
  onPath: boolean
  dim: boolean
  directed: boolean
  /** attack-path hop with no stored link (credential use, trust): dashed */
  logical?: boolean
}
export type NeonEdgeType = Edge<NeonEdgeData, 'neon'>

const COLORS = {
  network: ['#22d3ee', '#c084fc'],
  trust: ['#c084fc', '#e879f9'],
  permission: ['#e879f9', '#e879f9'],
  path: ['#f43f5e', '#fb7185'],
} as const

function NeonEdgeImpl({ id, sourceX, sourceY, targetX, targetY, data }: EdgeProps<NeonEdgeType>) {
  const kind = data?.kind ?? 'network'
  const onPath = data?.onPath ?? false
  const dim = data?.dim ?? false
  const dx0 = targetX - sourceX
  const dy0 = targetY - sourceY
  const len = Math.hypot(dx0, dy0) || 1
  const ux = dx0 / len
  const uy = dy0 / len
  const inset = Math.min(EDGE_INSET, len / 3)
  const sx = sourceX + ux * inset
  const sy = sourceY + uy * inset
  const tx = targetX - ux * (inset + 4)
  const ty = targetY - uy * (inset + 4)
  const path = `M${sx},${sy} L${tx},${ty}`
  const [c1, c2] = onPath ? COLORS.path : COLORS[kind]
  const width = onPath ? 3.2 : kind === 'network' ? 1.6 : 1.3
  const dash = data?.logical ? '9 6' : kind === 'trust' ? '7 5' : kind === 'permission' ? '2 5' : undefined
  const angle = (Math.atan2(uy, ux) * 180) / Math.PI
  const particles = onPath ? 3 : kind === 'network' ? 2 : 0
  const dur = Math.max(1.4, len / (onPath ? 150 : 90))
  return (
    <g style={{ opacity: dim ? 0.12 : onPath ? 1 : 0.8, transition: 'opacity 300ms' }} data-testid={`edge-${id}`} data-on-path={onPath ? 'true' : 'false'}>
      <defs>
        <linearGradient id={`eg-${id}`} gradientUnits="userSpaceOnUse" x1={sx} y1={sy} x2={tx} y2={ty}>
          <stop offset="0%" stopColor={c1} />
          <stop offset="100%" stopColor={c2} />
        </linearGradient>
      </defs>
      {/* wide soft glow */}
      <path d={path} stroke={c1} strokeOpacity={onPath ? 0.45 : 0.18} strokeWidth={width * 4} fill="none" strokeLinecap="round"
        style={{ filter: 'blur(3px)' }} />
      <BaseEdge id={id} path={path} interactionWidth={14}
        style={{ stroke: `url(#eg-${id})`, strokeWidth: width, strokeDasharray: dash, filter: `drop-shadow(0 0 4px ${c1})` }} />
      {(data?.directed ?? true) && (
        <polygon points="0,-5 10,0 0,5" fill={c2} transform={`translate(${tx},${ty}) rotate(${angle})`}
          style={{ filter: `drop-shadow(0 0 4px ${c2})` }} />
      )}
      {Array.from({ length: particles }, (_, i) => (
        <circle
          key={i}
          className="edge-particle"
          cx={sx}
          cy={sy}
          r={onPath ? 3 : 2.2}
          fill={onPath ? '#fecdd3' : '#a5f3fc'}
          style={{
            ['--dx' as string]: `${tx - sx}px`,
            ['--dy' as string]: `${ty - sy}px`,
            animation: `particle ${dur}s linear ${(-i * dur) / particles}s infinite`,
            filter: `drop-shadow(0 0 4px ${c1})`,
          }}
        />
      ))}
    </g>
  )
}

export const NeonEdge = memo(NeonEdgeImpl)
