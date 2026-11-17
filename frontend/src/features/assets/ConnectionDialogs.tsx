import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import { useInvalidateTwin } from "../../api/hooks";
import type { Connection, TwinSnapshot } from "../../api/types";
import { Button, ConfirmDialog, Dialog, ErrorState, Field } from "../../components/ui";
import { inputCls } from "../../components/cls";
import { useToasts, useUi } from "../../stores/ui";

/** Ports either endpoint listens on: the only ports a link restriction can meaningfully name. */
function endpointPorts(snap: TwinSnapshot, c: Pick<Connection, "source" | "target">): number[] {
  const ports = [c.source, c.target].flatMap((id) => snap.assets.find((a) => a.id === id)?.open_ports ?? []);
  return [...new Set(ports.map((p) => p.port))].sort((a, b) => a - b);
}

export function EditConnectionDialog({ connection, snapshot, onClose }: {
  connection: Connection;
  snapshot: TwinSnapshot;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const twinId = useUi((s) => s.twinId);
  const invalidate = useInvalidateTwin();
  const push = useToasts((s) => s.push);
  const [c, setC] = useState<Connection>({ ...connection, ports: [...connection.ports] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [deleting, setDeleting] = useState(false);
  const ports = endpointPorts(snapshot, c);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const body: Connection = { ...c, principal_id: c.kind === "trust" ? c.principal_id || null : null };
      const out = await api.updateConnection(twinId, body);
      await invalidate();
      push({ tone: "success", title: t("conn.saved", { id: c.id }), body: t("common.newRevision", { n: out.revision.number }) });
      onClose();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      const out = await api.deleteConnection(twinId, c.id);
      await invalidate();
      push({ tone: "success", title: t("conn.deleted", { id: c.id }), body: t("common.newRevision", { n: out.revision.number }) });
      setDeleting(false);
      onClose();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Dialog open={!deleting} onClose={onClose} title={t("conn.editTitle", { id: c.id })}
        footer={<>
          <Button tone="danger" className="mr-auto" onClick={() => setDeleting(true)} data-testid="conn-delete">{t("conn.delete")}</Button>
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          <Button tone="primary" busy={busy} onClick={save} data-testid="conn-save">{t("common.save")}</Button>
        </>}>
        <div className="flex flex-col gap-3">
          <p className="mono text-[13px] text-ink-dim">{c.source} → {c.target}</p>
          <Field label={t("map.kind")} htmlFor="ec-kind">
            <select id="ec-kind" className={inputCls} value={c.kind} onChange={(e) => setC({ ...c, kind: e.target.value as Connection["kind"] })} data-testid="conn-kind">
              {(["network", "trust", "permission"] as const).map((k) => <option key={k} value={k}>{t(`connKind.${k}`)}</option>)}
            </select>
          </Field>
          <fieldset>
            <legend className="mb-1 text-[12px] font-medium text-ink-dim">{t("map.ports")}</legend>
            <div className="flex flex-wrap gap-2">
              {ports.length === 0 && <span className="text-[13px] text-ink-dim">{t("map.noPorts")}</span>}
              {ports.map((p) => (
                <label key={p} className="flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-[12.5px]">
                  <input type="checkbox" className="accent-[#22d3ee]" checked={c.ports.includes(p)} data-testid={`conn-port-${p}`}
                    onChange={(e) => setC({ ...c, ports: e.target.checked ? [...c.ports, p].sort((a, b) => a - b) : c.ports.filter((x) => x !== p) })} />
                  <span className="mono">{p}</span>
                </label>
              ))}
            </div>
            <p className="mt-1 text-[12px] text-ink-faint">{t("map.portsHint")}</p>
          </fieldset>
          {c.kind === "trust" && (
            <Field label={t("conn.principal")} htmlFor="ec-principal">
              <select id="ec-principal" className={inputCls} value={c.principal_id ?? ""} onChange={(e) => setC({ ...c, principal_id: e.target.value || null })}>
                <option value="">{t("common.none")}</option>
                {snapshot.principals.map((p) => <option key={p.id} value={p.id}>{p.id}</option>)}
              </select>
            </Field>
          )}
          <Field label={t("map.description")} htmlFor="ec-desc">
            <input id="ec-desc" className={inputCls} maxLength={200} value={c.description} onChange={(e) => setC({ ...c, description: e.target.value })} data-testid="conn-desc" />
          </Field>
          {error && !deleting ? <ErrorState error={error} compact /> : null}
        </div>
      </Dialog>
      <ConfirmDialog open={deleting} tone="danger" title={t("conn.deleteTitle", { id: c.id })}
        body={t("conn.deleteBody", { source: c.source, target: c.target })} confirmLabel={t("conn.delete")}
        busy={busy} error={error} onConfirm={remove} onClose={() => { setDeleting(false); setError(null); }} />
    </>
  );
}
