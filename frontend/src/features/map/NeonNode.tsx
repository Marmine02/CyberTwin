import { Handle, Position, type NodeProps } from "@xyflow/react";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import { ICONS } from "./icons";
import { ROLE_COLOR, SEVERITY_COLOR, STATE_COLOR, roleOf } from "../../lib/score";
import type { AreaNode, NeonNode as NeonNodeT } from "./build";
import { NODE_SIZE } from "./build";

const hidden = { opacity: 0, width: 8, height: 8, top: NODE_SIZE / 2, left: NODE_SIZE / 2, transform: "translate(-50%,-50%)" };

function NeonNodeImpl({ data, selected }: NodeProps<NeonNodeT>) {
  const { t } = useTranslation();
  const { asset, state, severity, vulnCount, dim, onPath, active } = data;
  const role = roleOf(asset.asset_type);
  const roleColor = ROLE_COLOR[role];
  const glow = asset.asset_type === "internet_gateway" ? roleColor : STATE_COLOR[state];
  const Icon = ICONS[asset.asset_type];
  const compromised = state === "compromised";
  // glow carries state: only compromised, on-path, active (replay) and selected nodes get a lit pedestal
  const lit = compromised || onPath || active || selected;
  const cx = (NODE_SIZE + 28) / 2;
  return (
    <div
      className="relative transition-opacity duration-300"
      style={{ width: NODE_SIZE, height: NODE_SIZE, opacity: dim ? 0.28 : 1 }}
      role="img"
      aria-label={`${asset.name} (${asset.id}), ${t(`state.${state}`)}`}
      data-testid={`node-${asset.id}`}
      data-state={state}
      data-onpath={onPath ? "true" : "false"}
      data-active={active ? "true" : undefined}
    >
      <svg className="pointer-events-none absolute inset-x-[-14px] top-[30px] overflow-visible" width={NODE_SIZE + 28} height={44} aria-hidden>
        {lit && <ellipse cx={cx} cy={26} rx={44} ry={13} fill={glow} opacity={active ? 0.3 : 0.16} style={{ filter: "blur(7px)" }} />}
        <ellipse cx={cx} cy={24} rx={36} ry={10} fill="none" stroke={glow} strokeWidth={lit ? 1.6 : 1} opacity={lit ? 0.9 : 0.35}
          style={lit ? { filter: `drop-shadow(0 0 5px ${glow})` } : undefined} />
        {lit && <ellipse cx={cx} cy={24} rx={22} ry={5.5} fill={glow} opacity={0.3} />}
      </svg>
      {active && (
        <span aria-hidden className="anim-ping-once pointer-events-none absolute left-1/2 top-[6px] h-[46px] w-[46px] -translate-x-1/2 rounded-full"
          style={{ boxShadow: "0 0 0 2px #fb7185, 0 0 24px #fb7185" }} />
      )}
      <div
        className="absolute left-1/2 top-[6px] flex h-[46px] w-[46px] -translate-x-1/2 items-center justify-center rounded-full"
        style={{
          background: "radial-gradient(circle at 50% 40%, rgb(17 26 38 / 0.98), rgb(8 12 18 / 0.95))",
          border: `1.5px solid ${active ? "#fb7185" : selected ? "#fff" : roleColor}`,
          boxShadow: compromised || active ? "0 0 16px rgb(244 63 94 / 0.6)" : undefined,
        }}
      >
        <Icon size={22} color={roleColor} strokeWidth={1.7} />
      </div>
      {severity && vulnCount > 0 && (
        <span
          className="absolute top-0 right-0 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-bg-0"
          style={{ background: SEVERITY_COLOR[severity] }}
          title={t(`severity.${severity}`)}
        >
          {vulnCount}
        </span>
      )}
      <div className="pointer-events-none absolute top-[72px] left-1/2 flex -translate-x-1/2 flex-col items-center leading-tight">
        <div className={`max-w-[160px] truncate rounded px-1.5 text-[12.5px] ${active || onPath ? "font-semibold" : "font-medium"}`}
          style={{ color: active ? "#fecdd3" : onPath ? "#fda4af" : "var(--color-ink)", background: "rgb(8 12 18 / 0.78)" }}>
          {asset.name}
        </div>
        <div className="mono rounded px-1 text-[10px] text-ink-faint" style={{ background: "rgb(8 12 18 / 0.6)" }}>{asset.ip}</div>
      </div>
      <Handle type="target" position={Position.Top} style={hidden} isConnectableStart={false} isConnectableEnd />
      <Handle type="source" position={Position.Bottom} id="out" style={{ top: NODE_SIZE - 6, bottom: "auto" }} />
    </div>
  );
}

export const NeonNode = memo(NeonNodeImpl);

function AreaNodeImpl({ data }: NodeProps<AreaNode>) {
  const { t } = useTranslation();
  if (data.kind === "halo") {
    return (
      <div
        aria-hidden
        className="pointer-events-none rounded-[50%]"
        data-testid="blast-halo"
        style={{
          width: data.width,
          height: data.height,
          background: "radial-gradient(ellipse at center, rgb(244 63 94 / 0.16), rgb(244 63 94 / 0.05) 55%, transparent 72%)",
          border: "1px dashed rgb(244 63 94 / 0.35)",
        }}
      />
    );
  }
  return (
    <div
      aria-hidden
      className="pointer-events-none rounded-2xl"
      style={{ width: data.width, height: data.height, border: "1px solid rgb(148 163 184 / 0.12)", background: "rgb(148 163 184 / 0.025)" }}
    >
      <span className="absolute top-2 left-3 text-[11.5px] font-medium text-ink-faint">
        {t(`zone.${data.label as "dmz"}`)}
      </span>
    </div>
  );
}

export const AreaNodeView = memo(AreaNodeImpl);
