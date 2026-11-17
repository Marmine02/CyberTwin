interface Point { label: string; value: number; title?: string }

interface Props {
  points: Point[]
  height?: number
  /** fixed domain, e.g. [0, 100] for scores */
  domain?: [number, number]
  ariaLabel: string
}

/** Neon area sparkline (SVG). Values outside the domain are clamped. */
export function AreaChart({ points, height = 96, domain = [0, 100], ariaLabel }: Props) {
  const w = 300
  const h = height
  const pad = 6
  const [lo, hi] = domain
  const n = points.length
  const x = (i: number) => (n <= 1 ? w / 2 : pad + (i * (w - 2 * pad)) / (n - 1))
  const y = (v: number) => pad + (1 - (Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo || 1)) * (h - 2 * pad)
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')
  const area = n ? `${line} L${x(n - 1).toFixed(1)},${h} L${x(0).toFixed(1)},${h} Z` : ''
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="block h-full w-full" role="img" aria-label={ariaLabel}>
      <defs>
        <linearGradient id="ac-line" x1="0" x2="1">
          <stop offset="0%" stopColor="#c084fc" />
          <stop offset="100%" stopColor="#22d3ee" />
        </linearGradient>
        <linearGradient id="ac-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#c084fc" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1={0} x2={w} y1={h * f} y2={h * f} stroke="rgb(103 232 249 / 0.07)" />
      ))}
      {n > 0 && <path d={area} fill="url(#ac-fill)" />}
      {n > 0 && (
        <path d={line} fill="none" stroke="url(#ac-line)" strokeWidth={2.5} strokeLinejoin="round"
          style={{ filter: 'drop-shadow(0 0 5px rgb(34 211 238 / 0.7))' }} vectorEffect="non-scaling-stroke" />
      )}
      {points.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.value)} r={n > 12 ? 0 : 3} fill="#67e8f9">
          <title>{p.title ?? `${p.label}: ${p.value}`}</title>
        </circle>
      ))}
    </svg>
  )
}
