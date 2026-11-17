import { BaseEdge, useInternalNode, type EdgeProps } from "@xyflow/react";
import { memo } from "react";
import { NODE_SIZE } from "./build";
import type { FlowEdge } from "./build";

const COLORS = { network: "#22d3ee", trust: "#a78bfa", permission: "#c4b5fd", logical: "#f43f5e" } as const;
const ACTIVE = "#fb7185";
const ICON_CENTER_Y = 29;
const TRIM = 32;

/** Straight "floating" edge between node icon centres. Motion carries meaning: idle links get one slow, faint
 *  particle; the attack path pulses; the replay step being shown is the brightest thing on the map. */
function ParticleEdgeImpl({ id, source, target, data, markerEnd }: EdgeProps<FlowEdge>) {
  const s = useInternalNode(source);
  const t = useInternalNode(target);
  if (!s || !t || !data) return null;
  let a = { x: s.internals.positionAbsolute.x + NODE_SIZE / 2, y: s.internals.positionAbsolute.y + ICON_CENTER_Y };
  let b = { x: t.internals.positionAbsolute.x + NODE_SIZE / 2, y: t.internals.positionAbsolute.y + ICON_CENTER_Y };
  if (data.reverse) [a, b] = [b, a];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const trim = Math.min(TRIM, len / 3);
  const p1 = { x: a.x + ux * trim, y: a.y + uy * trim };
  const p2 = { x: b.x - ux * trim, y: b.y - uy * trim };
  const d = `M${p1.x.toFixed(1)},${p1.y.toFixed(1)} L${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;

  const active = !!data.active;
  const color = active ? ACTIVE : data.attack ? COLORS.logical : COLORS[data.kind];
  const dashed = !active && (data.kind === "trust" || data.kind === "permission" || data.kind === "logical");
  const particles = active ? 3 : data.attack ? 2 : data.kind === "network" ? 1 : 0;
  const dur = active ? Math.max(0.9, len / 220) : data.attack ? Math.max(1.6, len / 110) : Math.max(5, len / 28);
  const hot = active || data.attack;
  return (
    <g data-testid={active ? "active-edge" : data.attack ? `attack-edge-${id}` : `edge-${id}`} data-attack={data.attack ? "true" : "false"}
      data-active={active ? "true" : undefined}>
      {hot && <path d={d} stroke={color} strokeWidth={active ? 12 : 8} opacity={active ? 0.28 : 0.16} fill="none" style={{ filter: "blur(4px)" }} />}
      <BaseEdge
        id={id}
        path={d}
        markerEnd={hot || data.kind !== "network" ? markerEnd : undefined}
        style={{
          stroke: color,
          strokeWidth: active ? 3.2 : data.attack ? 2.4 : 1,
          opacity: hot ? 1 : data.kind === "network" ? 0.32 : 0.45,
          strokeDasharray: dashed ? "5 5" : undefined,
          filter: hot ? `drop-shadow(0 0 ${active ? 7 : 4}px ${color})` : undefined,
        }}
      />
      {Array.from({ length: particles }, (_, i) => (
        <circle key={i} r={active ? 3.2 : data.attack ? 2.6 : 1.3} fill={hot ? "#ffe4e6" : color} opacity={hot ? 1 : 0.55}
          className="particle" style={hot ? { filter: `drop-shadow(0 0 4px ${color})` } : undefined}>
          <animateMotion dur={`${dur}s`} repeatCount="indefinite" path={d} begin={`${-(i * dur) / particles}s`} />
        </circle>
      ))}
    </g>
  );
}

export const ParticleEdge = memo(ParticleEdgeImpl);
