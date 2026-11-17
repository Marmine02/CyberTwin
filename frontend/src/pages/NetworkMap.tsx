import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { useCurrentSimulation, useInvalidateTwin, useTwin } from "../api/hooks";
import type { Connection } from "../api/types";
import { Button, Dialog, ErrorState, Field, IconButton, Panel, Skeleton } from "../components/ui";
import { X } from "lucide-react";
import { inputCls } from "../components/cls";
import { AssetDetails } from "../features/assets/AssetDetails";
import { EditConnectionDialog } from "../features/assets/ConnectionDialogs";
import { TwinMap } from "../features/map/TwinMap";
import { ZoneSwitcher } from "../features/map/ZoneSwitcher";
import { errorMessage } from "../lib/format";
import { STATE_COLOR } from "../lib/score";
import { useToasts, useUi } from "../stores/ui";

export function NetworkMapPage() {
  const { t } = useTranslation();
  const twin = useTwin();
  const { sim } = useCurrentSimulation();
  const { selectedAssetId, select, viewRevision, twinId } = useUi();
  const [overlay, setOverlay] = useState(true);
  const [pending, setPending] = useState<{ source: string; target: string } | null>(null);
  const [editingConn, setEditingConn] = useState<Connection | null>(null);
  const push = useToasts((s) => s.push);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queued = useRef<Record<string, { x: number; y: number }>>({});

  const snapshot = twin.data?.snapshot;
  const selected = useMemo(() => snapshot?.assets.find((a) => a.id === selectedAssetId) ?? null, [snapshot, selectedAssetId]);
  const editable = viewRevision === null;
  const simMatches = sim.data && twin.data && sim.data.revision === twin.data.revision.number;
  const result = overlay && simMatches ? sim.data!.result : null;

  const saveLayout = (pos: Record<string, { x: number; y: number }>) => {
    queued.current = { ...queued.current, ...pos };
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const payload = queued.current;
      queued.current = {};
      api.saveLayout(twinId, payload).catch((e) => push({ tone: "error", title: t("map.layoutFailed"), body: errorMessage(e) }));
    }, 400);
  };

  return (
    <div className="flex h-full flex-col gap-3 pt-4">
      <Panel title={t("map.title")} className="min-h-[600px] flex-1" bodyClass="relative flex flex-col gap-2 p-2"
        actions={
          <>
            <label className="flex items-center gap-2 text-[12.5px] text-ink-dim">
              <input type="checkbox" checked={overlay} onChange={(e) => setOverlay(e.target.checked)} className="accent-[#22d3ee]" />
              {t("map.overlay")}
            </label>
            {!editable && <span className="text-[12px] text-warning">{t("map.readOnly")}</span>}
          </>
        }>
        {twin.isError ? <ErrorState error={twin.error} onRetry={() => void twin.refetch()} /> : (
          <div className="flex min-h-[520px] flex-1 gap-2">
          <div className="relative min-w-0 flex-1">
            {snapshot ? (
              <TwinMap snapshot={snapshot} result={result} path={result?.primary_path} editable={editable} showZones halo={!!result}
                onSelect={select} onConnectRequest={(source, target) => setPending({ source, target })}
                onLayoutChange={saveLayout} testId="network-map"
                onEdgeSelect={editable ? (id) => setEditingConn(snapshot.connections.find((c) => c.id === id) ?? null) : undefined} />
            ) : <Skeleton className="h-full w-full" />}
            <Legend />
          </div>
          {/* details beside the map, not over it: the map re-fits to the remaining width */}
          {selected && snapshot && (
            <aside className="flex w-[340px] shrink-0 flex-col rounded-lg border border-line bg-bg-0/60" aria-label={selected.name}>
              <header className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
                <h2 className="panel-title truncate">{selected.name}</h2>
                <IconButton label={t("common.close")} onClick={() => select(null)}><X size={16} /></IconButton>
              </header>
              <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
                <AssetDetails asset={selected} snapshot={snapshot} />
              </div>
            </aside>
          )}
          </div>
        )}
        <div className="flex items-center justify-between px-2">
          <p className="text-[12px] text-ink-faint">{editable ? t("map.hint") : t("map.hintReadOnly")}</p>
          <ZoneSwitcher />
          <span className="w-[200px]" />
        </div>
      </Panel>
      {editingConn && snapshot && <EditConnectionDialog connection={editingConn} snapshot={snapshot} onClose={() => setEditingConn(null)} />}
      {pending && snapshot && (
        <ConnectDialog source={pending.source} target={pending.target} existing={snapshot.connections}
          ports={[...new Set([...(snapshot.assets.find((a) => a.id === pending.source)?.open_ports ?? []), ...(snapshot.assets.find((a) => a.id === pending.target)?.open_ports ?? [])].map((p) => p.port))].sort((a, b) => a - b)}
          onClose={() => setPending(null)} />
      )}
    </div>
  );
}

function Legend() {
  const { t } = useTranslation();
  const items = [
    { c: STATE_COLOR.secure, k: "state.secure" },
    { c: STATE_COLOR.warning, k: "state.warning" },
    { c: STATE_COLOR.compromised, k: "state.compromised" },
  ] as const;
  return (
    <div className="pointer-events-none absolute top-2 left-2 flex flex-col gap-1 rounded-lg border border-line bg-bg-0/70 px-2.5 py-2 text-[11.5px] backdrop-blur">
      {items.map((i) => (
        <span key={i.k} className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: i.c }} />{t(i.k)}</span>
      ))}
      <span className="flex items-center gap-2"><span className="h-0.5 w-4 bg-[#22d3ee]" />{t("connKind.network")}</span>
      <span className="flex items-center gap-2"><span className="h-0 w-4 border-t border-dashed border-violet" />{t("connKind.trust")}</span>
      <span className="flex items-center gap-2"><span className="h-0.5 w-4 bg-critical" />{t("map.attackPath")}</span>
    </div>
  );
}

function ConnectDialog({ source, target, ports, existing, onClose }: {
  source: string;
  target: string;
  ports: number[];
  existing: Connection[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const twinId = useUi((s) => s.twinId);
  const invalidate = useInvalidateTwin();
  const push = useToasts((s) => s.push);
  const [kind, setKind] = useState<Connection["kind"]>("network");
  const [chosen, setChosen] = useState<number[]>([]);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const baseId = `c-${source}-${target}`.slice(0, 60);
  let id = baseId;
  for (let i = 2; existing.some((c) => c.id === id); i++) id = `${baseId}-${i}`;
  const dup = existing.find((c) => c.kind === kind && ((c.source === source && c.target === target) || (kind === "network" && c.source === target && c.target === source)));

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const out = await api.createConnection(twinId, { id, source, target, kind, ports: chosen, description, principal_id: null });
      await invalidate();
      push({ tone: "success", title: t("map.connected", { source, target }), body: t("common.newRevision", { n: out.revision.number }) });
      onClose();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={onClose} title={t("map.connectTitle")}
      footer={<><Button onClick={onClose}>{t("common.cancel")}</Button><Button tone="primary" busy={busy} disabled={!!dup} onClick={submit} data-testid="connect-confirm">{t("map.createConnection")}</Button></>}>
      <div className="flex flex-col gap-3">
        <p className="text-[13px] text-ink-dim">{t("map.connectBody", { source, target })}</p>
        <Field label={t("map.kind")} htmlFor="ckind">
          <select id="ckind" className={inputCls} value={kind} onChange={(e) => setKind(e.target.value as Connection["kind"])}>
            {(["network", "trust", "permission"] as const).map((k) => <option key={k} value={k}>{t(`connKind.${k}`)}</option>)}
          </select>
        </Field>
        <Field label={t("map.ports")} hint={t("map.portsHint")}>
          <div className="flex flex-wrap gap-2">
            {ports.length === 0 && <span className="text-[13px] text-ink-dim">{t("map.noPorts")}</span>}
            {ports.map((p) => (
              <label key={p} className="flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-[12.5px]">
                <input type="checkbox" className="accent-[#22d3ee]" checked={chosen.includes(p)}
                  onChange={(e) => setChosen((c) => (e.target.checked ? [...c, p] : c.filter((x) => x !== p)))} />
                <span className="mono">{p}</span>
              </label>
            ))}
          </div>
        </Field>
        <Field label={t("map.description")} htmlFor="cdesc">
          <input id="cdesc" className={inputCls} maxLength={200} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        {dup && <p className="text-[13px] text-warning" role="alert">{t("map.duplicate", { id: dup.id })}</p>}
        {error ? <ErrorState error={error} compact /> : null}
      </div>
    </Dialog>
  );
}
