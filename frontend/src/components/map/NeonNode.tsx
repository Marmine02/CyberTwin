import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { memo } from 'react'
import type { Asset } from '../../api/types'
import { LABEL_PX, NODE_H, NODE_W, STATE_COLOR, TYPE_COLOR, TYPE_ICON, type NodeState } from './visuals'

export type NeonNodeData = {
  asset: Asset
  state: NodeState
  onPath: boolean
  dim: boolean
  active: boolean
  stateLabel: string
}
export type NeonNodeType = Node<NeonNodeData, 'neon'>

function NeonNodeImpl({ data, selected }: NodeProps<NeonNodeType>) {
  const { asset, state, onPath, dim, active } = data
  const Icon = TYPE_ICON[asset.type]
  const base = TYPE_COLOR[asset.type]
  const glow = state === 'neutral' ? base : STATE_COLOR[state]
  const compromised = state === 'compromised'
  return (
    <div
      className="relative flex select-none flex-col items-center transition-opacity duration-300"
      style={{ width: NODE_W, minHeight: NODE_H, opacity: dim ? 0.22 : 1 }}
      data-testid={`node-${asset.id}`}
      data-state={state}
      data-on-path={onPath ? 'true' : 'false'}
      aria-label={`${asset.name} ${asset.ip} ${data.stateLabel}`}
    >
      {/* state glow behind the pedestal */}
      <div
        className={`pointer-events-none absolute left-1/2 top-[50px] h-[54px] w-[110px] -translate-x-1/2 rounded-[50%] ${compromised ? 'anim-pulse' : ''}`}
        style={{ background: `radial-gradient(closest-side, ${glow}bb, ${glow}33 55%, transparent 75%)`, filter: 'blur(10px)' }}
      />
      {active && (
        <div className="pointer-events-none absolute left-1/2 top-[34px] h-[80px] w-[124px] -translate-x-1/2 rounded-[50%] anim-pulse"
          style={{ border: `2px solid ${STATE_COLOR.compromised}`, boxShadow: `0 0 24px ${STATE_COLOR.compromised}` }} />
      )}
      {/* icon */}
      <div className="relative z-[1] mt-1 grid h-[50px] w-[50px] place-items-center"
        style={{ filter: `drop-shadow(0 0 6px ${base}) drop-shadow(0 0 14px ${glow}88)` }}>
        <Icon size={38} strokeWidth={1.6} color={base} />
      </div>
      {/* pedestal: concentric rings */}
      <svg width="112" height="40" viewBox="0 0 112 40" className="relative z-0 -mt-3" aria-hidden="true">
        <defs>
          <radialGradient id={`pd-${asset.id}`} cx="50%" cy="45%" r="60%">
            <stop offset="0%" stopColor={glow} stopOpacity="0.55" />
            <stop offset="70%" stopColor={base} stopOpacity="0.12" />
            <stop offset="100%" stopColor={base} stopOpacity="0" />
          </radialGradient>
        </defs>
        <ellipse cx="56" cy="22" rx="52" ry="15" fill="none" stroke={glow} strokeOpacity={0.35} strokeWidth="1" />
        <ellipse cx="56" cy="20" rx="42" ry="12" fill={`url(#pd-${asset.id})`} stroke={base} strokeOpacity={0.9} strokeWidth="1.6"
          style={{ filter: `drop-shadow(0 0 4px ${base})` }} />
        <ellipse cx="56" cy="18" rx="30" ry="8" fill="none" stroke={glow} strokeOpacity={0.85} strokeWidth="1.2" />
        <ellipse cx="56" cy="17" rx="16" ry="4" fill={glow} fillOpacity={0.35} />
      </svg>
      <div className="mt-0.5 flex max-w-full flex-col items-center rounded-md bg-ink-950/70 px-1.5 py-0.5">
        <div className="line-clamp-2 max-w-full break-words text-center font-display font-semibold leading-[1.05] text-ink-100"
          style={{ fontSize: LABEL_PX + 1, textShadow: `0 0 10px ${base}88` }} title={asset.name} translate="no">
          {asset.name}
        </div>
        <div className="font-mono leading-tight text-ink-300" style={{ fontSize: LABEL_PX }} translate="no">{asset.ip}</div>
      </div>
      {selected && <div className="pointer-events-none absolute inset-0 rounded-2xl border border-cyan/60" />}
      <Handle type="target" position={Position.Top} id="t" style={{ left: '50%', top: 62 }} />
      <Handle type="source" position={Position.Bottom} id="s" style={{ left: '50%', top: 62 }} />
    </div>
  )
}

export const NeonNode = memo(NeonNodeImpl)
