import { useReducedMotion } from "motion/react";
import { useId } from "react";

/** Ring gauge (0..1). */
export function RingGauge({
  value,
  size = 88,
  stroke = 8,
  color = "var(--color-primary)",
  label,
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  label: string;
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  const reduce = useReducedMotion();
  return (
    <div className="relative" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgb(148 163 184 / 0.12)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          style={{
            transition: reduce ? undefined : "stroke-dashoffset 900ms cubic-bezier(.2,.8,.2,1)",
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}

/** Small area chart for score history. Points are 0..100. */
export function AreaChart({
  points,
  height = 110,
  label,
}: {
  points: { x: string; y: number; tip: string }[];
  height?: number;
  label: string;
}) {
  const id = useId().replace(/:/g, "");
  const w = 320;
  const pad = 6;
  if (points.length === 0) return null;
  const xs = (i: number) => (points.length === 1 ? w / 2 : pad + (i * (w - 2 * pad)) / (points.length - 1));
  const ys = (y: number) => pad + (1 - y / 100) * (height - 2 * pad);
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${xs(i).toFixed(1)},${ys(p.y).toFixed(1)}`).join(" ");
  const area = `${line} L${xs(points.length - 1).toFixed(1)},${height} L${xs(0).toFixed(1)},${height} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="h-full w-full" preserveAspectRatio="none" role="img" aria-label={label}>
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.45" />
          <stop offset="100%" stopColor="var(--color-violet)" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {[25, 50, 75].map((g) => (
        <line key={g} x1={0} x2={w} y1={ys(g)} y2={ys(g)} stroke="rgb(148 163 184 / 0.08)" strokeDasharray="3 4" />
      ))}
      <path d={area} fill={`url(#g${id})`} />
      <path d={line} fill="none" stroke="var(--color-primary)" strokeWidth={2} vectorEffect="non-scaling-stroke"
        />
      {points.map((p, i) => (
        <circle key={i} cx={xs(i)} cy={ys(p.y)} r={2.6} fill="var(--color-bg-0)" stroke="var(--color-primary)"
          strokeWidth={1.5} vectorEffect="non-scaling-stroke">
          <title>{p.tip}</title>
        </circle>
      ))}
    </svg>
  );
}

/** Horizontal labelled bars. */
export function Bars({ items, max }: { items: { label: string; value: number; color: string; tip?: string }[]; max?: number }) {
  const m = max ?? Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="flex flex-col gap-2">
      {items.map((it) => (
        <li key={it.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1" title={it.tip}>
          <span className="truncate text-[12.5px] text-ink-dim">{it.label}</span>
          <span className="display-num text-[15px]" style={{ color: it.color }}>
            {it.value}
          </span>
          <div className="col-span-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
            <div className="h-full rounded-full transition-[width] duration-700"
              style={{ width: `${(it.value / m) * 100}%`, background: it.color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Vertical column chart (findings by severity). */
export function Columns({ items, height = 90 }: { items: { label: string; value: number; color: string }[]; height?: number }) {
  const m = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="flex items-end gap-3" style={{ height }} role="img"
      aria-label={items.map((i) => `${i.label}: ${i.value}`).join(", ")}>
      {items.map((it) => (
        <div key={it.label} className="flex flex-1 flex-col items-center justify-end gap-1 h-full">
          <div className="w-full max-w-9 rounded-t-md transition-[height] duration-700"
            style={{ height: `${Math.max(4, (it.value / m) * (height - 20))}px`, background: it.color, opacity: 0.85 }} />
        </div>
      ))}
    </div>
  );
}
