import { ArrowDownUp, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { api } from "../api/client";
import { useInvalidateTwin, useTwin } from "../api/hooks";
import {
  ASSET_TYPES,
  ZONES,
  type Asset,
  type AssetImpact,
  type Connection,
  type FirewallRule,
  type Principal,
  type TwinSnapshot,
} from "../api/types";
import { Button, Chip, ConfirmDialog, Dialog, EmptyState, ErrorState, Field, IconButton, Loading, Panel, Tabs } from "../components/ui";
import { inputCls } from "../components/cls";
import { EditConnectionDialog } from "../features/assets/ConnectionDialogs";
import { blankAsset, CIDR_RE, ID_RE, validateAsset, type Errors } from "../features/assets/validate";
import { BAND_COLOR, scoreBand } from "../lib/score";
import { useToasts, useUi } from "../stores/ui";

type Tab = "assets" | "connections" | "principals" | "rules";

export function AssetsPage() {
  const { t } = useTranslation();
  const twin = useTwin();
  const [tab, setTab] = useState<Tab>("assets");
  const readOnly = useUi((s) => s.viewRevision !== null);
  const snap = twin.data?.snapshot;
  return (
    <div className="flex flex-col gap-3 pt-4">
      <Panel title={t("assets.title")} bodyClass="flex flex-col gap-3"
        actions={<Tabs label={t("assets.title")} value={tab} onChange={setTab} items={[
          { id: "assets", label: t("assets.tabAssets"), count: snap?.assets.length },
          { id: "connections", label: t("assets.tabConnections"), count: snap?.connections.length },
          { id: "principals", label: t("assets.tabPrincipals"), count: snap?.principals.length },
          { id: "rules", label: t("assets.tabRules"), count: snap?.firewall_rules.length },
        ]} />}>
        {readOnly && <p className="text-[13px] text-warning">{t("assets.readOnly")}</p>}
        {twin.isError ? <ErrorState error={twin.error} onRetry={() => void twin.refetch()} /> : !snap ? <Loading /> :
          tab === "assets" ? <AssetsTab snap={snap} readOnly={readOnly} /> :
          tab === "connections" ? <ConnectionsTab snap={snap} readOnly={readOnly} /> :
          tab === "principals" ? <PrincipalsTab snap={snap} readOnly={readOnly} /> :
          <RulesTab snap={snap} readOnly={readOnly} />}
      </Panel>
    </div>
  );
}

// ======================================================================= assets
type SortKey = "name" | "asset_type" | "zone" | "criticality" | "risk_score";

function AssetsTab({ snap, readOnly }: { snap: TwinSnapshot; readOnly: boolean }) {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [type, setType] = useState<string>("all");
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: "name", dir: 1 });
  const [editing, setEditing] = useState<{ asset: Asset; isNew: boolean } | null>(null);
  const [deleting, setDeleting] = useState<Asset | null>(null);

  const editId = params.get("edit");
  useEffect(() => {
    if (!editId) return;
    const a = snap.assets.find((x) => x.id === editId);
    if (a && !readOnly) setEditing({ asset: structuredClone(a), isNew: false });
    params.delete("edit");
    setParams(params, { replace: true });
  }, [editId, snap.assets, params, setParams, readOnly]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return snap.assets
      .filter((a) => type === "all" || a.asset_type === type)
      .filter((a) => !q || [a.id, a.name, a.ip, a.os].some((s) => s.toLowerCase().includes(q)))
      .sort((a, b) => {
        const va = a[sort.k] ?? -1;
        const vb = b[sort.k] ?? -1;
        return (va < vb ? -1 : va > vb ? 1 : a.id.localeCompare(b.id)) * sort.dir;
      });
  }, [snap.assets, query, type, sort]);

  const th = (k: SortKey, label: string) => (
    <th scope="col" className="px-2 py-2 text-left font-medium" aria-sort={sort.k === k ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button type="button" className="inline-flex items-center gap-1 hover:text-ink"
        onClick={() => setSort((s) => ({ k, dir: s.k === k ? (s.dir === 1 ? -1 : 1) : 1 }))}>
        {label}<ArrowDownUp size={12} className={sort.k === k ? "text-primary" : "opacity-40"} />
      </button>
    </th>
  );

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-[280px]">
          <Search size={14} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-faint" />
          <input className={`${inputCls} pl-8`} placeholder={t("assets.search")} aria-label={t("assets.search")}
            value={query} onChange={(e) => setQuery(e.target.value)} data-testid="asset-search" />
        </div>
        <select className={`${inputCls} w-[200px]!`} aria-label={t("assets.filterType")} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="all">{t("assets.allTypes")}</option>
          {ASSET_TYPES.map((x) => <option key={x} value={x}>{t(`assetType.${x}`)}</option>)}
        </select>
        <div className="flex-1" />
        <Button tone="primary" icon={<Plus size={14} />} disabled={readOnly} data-testid="new-asset"
          onClick={() => setEditing({ asset: blankAsset(), isNew: true })}>{t("assets.new")}</Button>
      </div>
      {rows.length === 0 ? <EmptyState title={t("assets.noMatch")} body={t("assets.noMatchBody")} /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]" data-testid="asset-table">
            <thead className="border-b border-line text-ink-dim">
              <tr>
                {th("name", t("assets.name"))}
                {th("asset_type", t("assets.type"))}
                {th("zone", t("assets.zone"))}
                <th scope="col" className="px-2 py-2 text-left font-medium">{t("assets.ip")}</th>
                <th scope="col" className="px-2 py-2 text-left font-medium">{t("assets.ports")}</th>
                {th("criticality", t("assets.criticality"))}
                {th("risk_score", t("assets.risk"))}
                <th scope="col" className="px-2 py-2"><span className="sr-only">{t("common.actions")}</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="border-b border-line/60 hover:bg-white/[0.03]" data-testid={`asset-row-${a.id}`}>
                  <td className="px-2 py-2"><div className="font-medium">{a.name}</div><div className="mono text-[11px] text-ink-faint">{a.id}</div></td>
                  <td className="px-2 py-2 text-ink-dim">{t(`assetType.${a.asset_type}`)}</td>
                  <td className="px-2 py-2 text-ink-dim">{t(`zone.${a.zone}`)}</td>
                  <td className="mono px-2 py-2">{a.ip}</td>
                  <td className="px-2 py-2"><div className="flex flex-wrap gap-1">{a.open_ports.map((p) => <Chip key={p.port} color="var(--color-primary)">{p.port}</Chip>)}</div></td>
                  <td className="px-2 py-2">{a.criticality}/5</td>
                  <td className="px-2 py-2">{a.risk_score === null ? <span className="text-ink-faint">—</span> :
                    <span className="display-num text-[15px]" style={{ color: BAND_COLOR[scoreBand(100 - a.risk_score)] }}>{Math.round(a.risk_score)}</span>}</td>
                  <td className="px-2 py-2">
                    <div className="flex justify-end gap-1">
                      <IconButton label={t("common.editItem", { name: a.name })} disabled={readOnly} onClick={() => setEditing({ asset: structuredClone(a), isNew: false })}><Pencil size={14} /></IconButton>
                      <IconButton label={t("common.deleteItem", { name: a.name })} disabled={readOnly} onClick={() => setDeleting(a)} data-testid={`delete-${a.id}`}><Trash2 size={14} /></IconButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <AssetForm initial={editing.asset} isNew={editing.isNew} snap={snap} onClose={() => setEditing(null)} />}
      {deleting && <DeleteAsset asset={deleting} onClose={() => setDeleting(null)} />}
    </>
  );
}

function DeleteAsset({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  const { t } = useTranslation();
  const twinId = useUi((s) => s.twinId);
  const invalidate = useInvalidateTwin();
  const push = useToasts((s) => s.push);
  const [impact, setImpact] = useState<AssetImpact | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => { api.assetImpact(twinId, asset.id).then(setImpact).catch(setError); }, [twinId, asset.id]);
  const confirm = async () => {
    setBusy(true);
    try {
      const out = await api.deleteAsset(twinId, asset.id);
      await invalidate();
      push({ tone: "success", title: t("assets.deleted", { name: asset.name }), body: t("common.newRevision", { n: out.revision.number }) });
      onClose();
    } catch (e) { setError(e); } finally { setBusy(false); }
  };
  return (
    <ConfirmDialog open title={t("assets.deleteTitle", { name: asset.name })} confirmLabel={t("assets.deleteConfirm")} tone="danger"
      busy={busy} error={error} onConfirm={confirm} onClose={onClose} body={t("assets.deleteBody")}>
      {!impact ? <Loading /> : (
        <ul className="mt-3 flex flex-col gap-1 text-[13px]" data-testid="delete-impact">
          {(["connections", "firewall_rules", "vulnerabilities", "principals"] as const).map((k) => (
            <li key={k}><span className="text-ink-dim">{t(`assets.impact.${k}`)}:</span>{" "}
              {impact[k].length ? impact[k].map((x) => <span key={x} className="mono mr-1.5 text-warning">{x}</span>) : <span className="text-ink-faint">{t("common.none")}</span>}
            </li>
          ))}
        </ul>
      )}
    </ConfirmDialog>
  );
}

function AssetForm({ initial, isNew, snap, onClose }: { initial: Asset; isNew: boolean; snap: TwinSnapshot; onClose: () => void }) {
  const { t } = useTranslation();
  const twinId = useUi((s) => s.twinId);
  const invalidate = useInvalidateTwin();
  const push = useToasts((s) => s.push);
  const [a, setA] = useState<Asset>(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Asset>(k: K, v: Asset[K]) => setA((x) => ({ ...x, [k]: v }));
  const err = (k: string) => (errors[k] ? t(errors[k] as "validation.required") : null);

  const submit = async () => {
    const e = validateAsset(a, snap.assets.map((x) => x.id), isNew);
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    setServerError(null);
    try {
      const out = isNew ? await api.createAsset(twinId, a) : await api.updateAsset(twinId, a);
      await invalidate();
      push({ tone: "success", title: t(isNew ? "assets.created" : "assets.updated", { name: a.name }), body: t("common.newRevision", { n: out.revision.number }) });
      onClose();
    } catch (ex) { setServerError(ex); } finally { setBusy(false); }
  };

  return (
    <Dialog open wide onClose={onClose} title={isNew ? t("assets.new") : t("assets.editTitle", { name: initial.name })}
      footer={<><Button onClick={onClose}>{t("common.cancel")}</Button><Button tone="primary" busy={busy} onClick={submit} data-testid="save-asset">{t("common.save")}</Button></>}>
      <form className="grid grid-cols-2 gap-3" onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate>
        <Field label={t("assets.id")} error={err("id")} hint={t("assets.idHint")} htmlFor="f-id">
          <input id="f-id" className={inputCls} value={a.id} disabled={!isNew} aria-invalid={!!errors.id} onChange={(e) => set("id", e.target.value)} data-testid="f-id" />
        </Field>
        <Field label={t("assets.name")} error={err("name")} htmlFor="f-name">
          <input id="f-name" className={inputCls} value={a.name} aria-invalid={!!errors.name} onChange={(e) => set("name", e.target.value)} data-testid="f-name" />
        </Field>
        <Field label={t("assets.ip")} error={err("ip")} htmlFor="f-ip">
          <input id="f-ip" className={`${inputCls} mono`} value={a.ip} aria-invalid={!!errors.ip} onChange={(e) => set("ip", e.target.value)} data-testid="f-ip" />
        </Field>
        <Field label={t("assets.os")} htmlFor="f-os">
          <input id="f-os" className={inputCls} value={a.os} onChange={(e) => set("os", e.target.value)} />
        </Field>
        <Field label={t("assets.type")} htmlFor="f-type">
          <select id="f-type" className={inputCls} value={a.asset_type} onChange={(e) => set("asset_type", e.target.value as Asset["asset_type"])} data-testid="f-type">
            {ASSET_TYPES.map((x) => <option key={x} value={x}>{t(`assetType.${x}`)}</option>)}
          </select>
        </Field>
        <Field label={t("assets.zone")} htmlFor="f-zone">
          <select id="f-zone" className={inputCls} value={a.zone} onChange={(e) => set("zone", e.target.value as Asset["zone"])} data-testid="f-zone">
            {ZONES.map((x) => <option key={x} value={x}>{t(`zone.${x}`)}</option>)}
          </select>
        </Field>
        <Field label={t("assets.criticality")} htmlFor="f-crit">
          <input id="f-crit" type="number" min={1} max={5} className={inputCls} value={a.criticality} onChange={(e) => set("criticality", Number(e.target.value))} />
        </Field>
        <Field label={t("assets.sensitivity")} htmlFor="f-sens">
          <input id="f-sens" type="number" min={0} max={3} className={inputCls} value={a.data_sensitivity} onChange={(e) => set("data_sensitivity", Number(e.target.value))} />
        </Field>

        <fieldset className="col-span-2 flex flex-col gap-2">
          <legend className="mb-1 text-[12px] font-medium text-ink-dim">{t("assets.ports")}</legend>
          {a.open_ports.map((p, i) => (
            <div key={i} className="grid grid-cols-[90px_80px_1fr_1fr_1fr_auto] items-start gap-2">
              <input aria-label={t("assets.port")} type="number" className={`${inputCls} mono`} value={p.port} aria-invalid={!!errors[`port.${i}`]}
                onChange={(e) => set("open_ports", a.open_ports.map((x, j) => (j === i ? { ...x, port: Number(e.target.value) } : x)))} data-testid={`f-port-${i}`} />
              <select aria-label={t("assets.proto")} className={inputCls} value={p.proto}
                onChange={(e) => set("open_ports", a.open_ports.map((x, j) => (j === i ? { ...x, proto: e.target.value as "tcp" } : x)))}>
                <option value="tcp">tcp</option><option value="udp">udp</option>
              </select>
              <input aria-label={t("assets.service")} placeholder={t("assets.service")} className={inputCls} value={p.service}
                onChange={(e) => set("open_ports", a.open_ports.map((x, j) => (j === i ? { ...x, service: e.target.value } : x)))} data-testid={`f-service-${i}`} />
              <input aria-label={t("assets.version")} placeholder={t("assets.version")} className={`${inputCls} mono`} value={p.version} aria-invalid={!!errors[`pversion.${i}`]}
                onChange={(e) => set("open_ports", a.open_ports.map((x, j) => (j === i ? { ...x, version: e.target.value } : x)))} />
              <input aria-label={t("assets.exposedTo")} placeholder={t("assets.exposedToPh")} className={inputCls} value={p.exposed_to_zones.join(",")}
                onChange={(e) => set("open_ports", a.open_ports.map((x, j) => (j === i ? { ...x, exposed_to_zones: e.target.value.split(",").map((s) => s.trim()).filter((s): s is Asset["zone"] => (ZONES as string[]).includes(s)) } : x)))} />
              <IconButton label={t("common.remove")} onClick={() => set("open_ports", a.open_ports.filter((_, j) => j !== i))}><Trash2 size={14} /></IconButton>
              {(err(`port.${i}`) || err(`service.${i}`) || err(`pversion.${i}`)) && (
                <p className="col-span-6 text-[12px] text-critical-ink" role="alert">{err(`port.${i}`) ?? err(`service.${i}`) ?? err(`pversion.${i}`)}</p>
              )}
            </div>
          ))}
          <Button className="self-start" icon={<Plus size={14} />} data-testid="add-port"
            onClick={() => set("open_ports", [...a.open_ports, { port: 443, proto: "tcp", service: "https", version: "", exposed_to_zones: [] }])}>{t("assets.addPort")}</Button>
        </fieldset>

        <fieldset className="col-span-2 flex flex-col gap-2">
          <legend className="mb-1 text-[12px] font-medium text-ink-dim">{t("assets.software")}</legend>
          {a.software.map((s, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_auto_auto] items-center gap-2">
              <input aria-label={t("assets.swName")} placeholder={t("assets.swName")} className={inputCls} value={s.name}
                onChange={(e) => set("software", a.software.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <input aria-label={t("assets.version")} placeholder={t("assets.version")} className={`${inputCls} mono`} value={s.version} aria-invalid={!!errors[`swversion.${i}`]}
                onChange={(e) => set("software", a.software.map((x, j) => (j === i ? { ...x, version: e.target.value } : x)))} />
              <label className="flex items-center gap-1.5 text-[12.5px]"><input type="checkbox" className="accent-[#fb923c]" checked={s.eol}
                onChange={(e) => set("software", a.software.map((x, j) => (j === i ? { ...x, eol: e.target.checked } : x)))} />{t("assets.eol")}</label>
              <IconButton label={t("common.remove")} onClick={() => set("software", a.software.filter((_, j) => j !== i))}><Trash2 size={14} /></IconButton>
              {(err(`swname.${i}`) || err(`swversion.${i}`)) && <p className="col-span-4 text-[12px] text-critical-ink" role="alert">{err(`swname.${i}`) ?? err(`swversion.${i}`)}</p>}
            </div>
          ))}
          <Button className="self-start" icon={<Plus size={14} />} onClick={() => set("software", [...a.software, { name: "", version: "1.0", eol: false }])}>{t("assets.addSoftware")}</Button>
        </fieldset>

        <fieldset className="col-span-2 flex flex-wrap items-center gap-4">
          <legend className="mb-1 text-[12px] font-medium text-ink-dim">{t("assets.security")}</legend>
          {(["mfa_enabled", "edr", "disk_encryption"] as const).map((k) => (
            <label key={k} className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" className="accent-[#22d3ee]" checked={a.security_config[k]}
                onChange={(e) => set("security_config", { ...a.security_config, [k]: e.target.checked })} />
              {t(`assets.sc.${k}`)}
            </label>
          ))}
          <label className="flex items-center gap-2 text-[13px]">{t("assets.pwPolicy")}
            <select className={`${inputCls} w-[120px]!`} value={a.security_config.password_policy}
              onChange={(e) => set("security_config", { ...a.security_config, password_policy: e.target.value as "weak" })}>
              {(["weak", "medium", "strong"] as const).map((s) => <option key={s} value={s}>{t(`strength.${s}`)}</option>)}
            </select>
          </label>
        </fieldset>
        {serverError ? <div className="col-span-2"><ErrorState error={serverError} compact /></div> : null}
        <button type="submit" className="hidden" />
      </form>
    </Dialog>
  );
}

// ======================================================================= connections
function ConnectionsTab({ snap, readOnly }: { snap: TwinSnapshot; readOnly: boolean }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<Connection | null>(null);
  const rows = [...snap.connections].sort((a, b) => a.id.localeCompare(b.id));
  if (rows.length === 0) return <EmptyState title={t("conn.none")} body={t("conn.noneBody")} />;
  return (
    <>
      <p className="text-[12.5px] text-ink-dim">{t("conn.explain")}</p>
      <table className="w-full text-[13px]" data-testid="connection-table">
        <thead className="border-b border-line text-left text-ink-dim"><tr>
          <th className="px-2 py-2 font-medium">{t("assets.id")}</th><th className="px-2 py-2 font-medium">{t("conn.endpoints")}</th>
          <th className="px-2 py-2 font-medium">{t("map.kind")}</th><th className="px-2 py-2 font-medium">{t("map.ports")}</th>
          <th className="px-2 py-2 font-medium">{t("map.description")}</th>
          <th className="px-2 py-2"><span className="sr-only">{t("common.actions")}</span></th></tr></thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id} className="border-b border-line/60 hover:bg-white/[0.03]" data-testid={`conn-row-${c.id}`}>
              <td className="mono px-2 py-2">{c.id}</td>
              <td className="mono px-2 py-2 text-[12px]">{c.source} → {c.target}{c.principal_id ? ` (${c.principal_id})` : ""}</td>
              <td className="px-2 py-2">{t(`connKind.${c.kind}`)}</td>
              <td className="mono px-2 py-2">{c.ports.length ? c.ports.join(", ") : t("rules.any")}</td>
              <td className="px-2 py-2 text-ink-dim">{c.description}</td>
              <td className="px-2 py-2"><div className="flex justify-end">
                <IconButton label={t("common.editItem", { name: c.id })} disabled={readOnly} onClick={() => setEditing(c)} data-testid={`conn-edit-${c.id}`}><Pencil size={14} /></IconButton>
              </div></td>
            </tr>
          ))}
        </tbody>
      </table>
      {editing && <EditConnectionDialog connection={editing} snapshot={snap} onClose={() => setEditing(null)} />}
    </>
  );
}

// ======================================================================= principals
function blankPrincipal(): Principal {
  return { id: "", name: "", kind: "user", privilege: "user", credential_strength: "medium", mfa: false, logged_on_assets: [], permissions: [] };
}

function PrincipalsTab({ snap, readOnly }: { snap: TwinSnapshot; readOnly: boolean }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<{ p: Principal; isNew: boolean } | null>(null);
  const [deleting, setDeleting] = useState<Principal | null>(null);
  const twinId = useUi((s) => s.twinId);
  const invalidate = useInvalidateTwin();
  const push = useToasts((s) => s.push);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  return (
    <>
      <div className="flex justify-end">
        <Button tone="primary" icon={<Plus size={14} />} disabled={readOnly} onClick={() => setEditing({ p: blankPrincipal(), isNew: true })}>{t("principals.new")}</Button>
      </div>
      <table className="w-full text-[13px]">
        <thead className="border-b border-line text-left text-ink-dim">
          <tr><th className="px-2 py-2 font-medium">{t("principals.name")}</th><th className="px-2 py-2 font-medium">{t("principals.privilege")}</th>
            <th className="px-2 py-2 font-medium">{t("principals.credential")}</th><th className="px-2 py-2 font-medium">{t("principals.mfa")}</th>
            <th className="px-2 py-2 font-medium">{t("principals.loggedOn")}</th><th className="px-2 py-2 font-medium">{t("principals.permissions")}</th>
            <th className="px-2 py-2"><span className="sr-only">{t("common.actions")}</span></th></tr>
        </thead>
        <tbody>
          {snap.principals.map((p) => (
            <tr key={p.id} className="border-b border-line/60 hover:bg-white/[0.03]">
              <td className="px-2 py-2"><div>{p.name}</div><div className="mono text-[11px] text-ink-faint">{p.id} · {t(`principals.kind.${p.kind}`)}</div></td>
              <td className="px-2 py-2">{t(`privilege.${p.privilege}`)}</td>
              <td className="px-2 py-2" style={{ color: p.credential_strength === "weak" ? "var(--color-critical-ink)" : p.credential_strength === "medium" ? "var(--color-warning)" : "var(--color-secure)" }}>{t(`strength.${p.credential_strength}`)}</td>
              <td className="px-2 py-2">{p.mfa ? t("common.yes") : <span className="text-warning">{t("common.no")}</span>}</td>
              <td className="mono px-2 py-2 text-[12px]">{p.logged_on_assets.join(", ") || "—"}</td>
              <td className="px-2 py-2 text-[12px]">{p.permissions.map((x) => `${x.asset_id}:${t(`level.${x.level}`)}`).join(", ") || "—"}</td>
              <td className="px-2 py-2"><div className="flex justify-end gap-1">
                <IconButton label={t("common.editItem", { name: p.name })} disabled={readOnly} onClick={() => setEditing({ p: structuredClone(p), isNew: false })}><Pencil size={14} /></IconButton>
                <IconButton label={t("common.deleteItem", { name: p.name })} disabled={readOnly} onClick={() => setDeleting(p)}><Trash2 size={14} /></IconButton>
              </div></td>
            </tr>
          ))}
        </tbody>
      </table>
      {editing && <PrincipalForm initial={editing.p} isNew={editing.isNew} snap={snap} onClose={() => setEditing(null)} />}
      {deleting && (
        <ConfirmDialog open tone="danger" title={t("principals.deleteTitle", { name: deleting.name })} body={t("principals.deleteBody")}
          confirmLabel={t("common.delete")} busy={busy} error={error} onClose={() => { setDeleting(null); setError(null); }}
          onConfirm={async () => {
            setBusy(true);
            try { const out = await api.deletePrincipal(twinId, deleting.id); await invalidate(); push({ tone: "success", title: t("principals.deleted"), body: t("common.newRevision", { n: out.revision.number }) }); setDeleting(null); }
            catch (e) { setError(e); } finally { setBusy(false); }
          }} />
      )}
    </>
  );
}

function PrincipalForm({ initial, isNew, snap, onClose }: { initial: Principal; isNew: boolean; snap: TwinSnapshot; onClose: () => void }) {
  const { t } = useTranslation();
  const twinId = useUi((s) => s.twinId);
  const invalidate = useInvalidateTwin();
  const push = useToasts((s) => s.push);
  const [p, setP] = useState(initial);
  const [error, setError] = useState<unknown>(null);
  const [idErr, setIdErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!ID_RE.test(p.id)) return setIdErr(t("validation.id"));
    if (isNew && snap.principals.some((x) => x.id === p.id)) return setIdErr(t("validation.idTaken"));
    setIdErr(null);
    setBusy(true);
    try {
      const out = isNew ? await api.createPrincipal(twinId, p) : await api.updatePrincipal(twinId, p);
      await invalidate();
      push({ tone: "success", title: t("principals.saved"), body: t("common.newRevision", { n: out.revision.number }) });
      onClose();
    } catch (e) { setError(e); } finally { setBusy(false); }
  };
  const assets = snap.assets.filter((a) => a.asset_type !== "internet_gateway");
  return (
    <Dialog open wide onClose={onClose} title={isNew ? t("principals.new") : p.name}
      footer={<><Button onClick={onClose}>{t("common.cancel")}</Button><Button tone="primary" busy={busy} onClick={submit}>{t("common.save")}</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("assets.id")} error={idErr} htmlFor="p-id"><input id="p-id" className={inputCls} disabled={!isNew} value={p.id} onChange={(e) => setP({ ...p, id: e.target.value })} /></Field>
        <Field label={t("principals.name")} htmlFor="p-name"><input id="p-name" className={inputCls} value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} /></Field>
        <Field label={t("principals.kindLabel")} htmlFor="p-kind"><select id="p-kind" className={inputCls} value={p.kind} onChange={(e) => setP({ ...p, kind: e.target.value as "user" })}>
          {(["user", "service"] as const).map((k) => <option key={k} value={k}>{t(`principals.kind.${k}`)}</option>)}</select></Field>
        <Field label={t("principals.privilege")} htmlFor="p-priv"><select id="p-priv" className={inputCls} value={p.privilege} onChange={(e) => setP({ ...p, privilege: e.target.value as "user" })}>
          {(["user", "admin", "domain_admin"] as const).map((k) => <option key={k} value={k}>{t(`privilege.${k}`)}</option>)}</select></Field>
        <Field label={t("principals.credential")} htmlFor="p-cred"><select id="p-cred" className={inputCls} value={p.credential_strength} onChange={(e) => setP({ ...p, credential_strength: e.target.value as "weak" })}>
          {(["weak", "medium", "strong"] as const).map((k) => <option key={k} value={k}>{t(`strength.${k}`)}</option>)}</select></Field>
        <label className="flex items-center gap-2 self-end pb-2 text-[13px]"><input type="checkbox" className="accent-[#22d3ee]" checked={p.mfa} onChange={(e) => setP({ ...p, mfa: e.target.checked })} />{t("principals.mfa")}</label>
        <fieldset className="col-span-2">
          <legend className="mb-1 text-[12px] font-medium text-ink-dim">{t("principals.access")}</legend>
          <div className="grid grid-cols-2 gap-1.5">
            {assets.map((a) => {
              const perm = p.permissions.find((x) => x.asset_id === a.id);
              return (
                <div key={a.id} className="flex items-center gap-2 text-[12.5px]">
                  <span className="mono w-[110px] truncate">{a.id}</span>
                  <select aria-label={t("principals.permOn", { asset: a.id })} className={`${inputCls} min-h-8! w-[100px]! py-0.5!`} value={perm?.level ?? ""}
                    onChange={(e) => setP({ ...p, permissions: [...p.permissions.filter((x) => x.asset_id !== a.id), ...(e.target.value ? [{ asset_id: a.id, level: e.target.value as "read" }] : [])] })}>
                    <option value="">—</option>
                    {(["read", "write", "admin"] as const).map((l) => <option key={l} value={l}>{t(`level.${l}`)}</option>)}
                  </select>
                  <label className="flex items-center gap-1 text-ink-dim"><input type="checkbox" className="accent-[#c084fc]" checked={p.logged_on_assets.includes(a.id)}
                    onChange={(e) => setP({ ...p, logged_on_assets: e.target.checked ? [...p.logged_on_assets, a.id] : p.logged_on_assets.filter((x) => x !== a.id) })} />{t("principals.cached")}</label>
                </div>
              );
            })}
          </div>
        </fieldset>
        {error ? <div className="col-span-2"><ErrorState error={error} compact /></div> : null}
      </div>
    </Dialog>
  );
}

// ======================================================================= firewall rules
function RulesTab({ snap, readOnly }: { snap: TwinSnapshot; readOnly: boolean }) {
  const { t } = useTranslation();
  const firewalls = snap.assets.filter((a) => a.asset_type === "firewall");
  const [editing, setEditing] = useState<{ r: FirewallRule; isNew: boolean } | null>(null);
  const [deleting, setDeleting] = useState<FirewallRule | null>(null);
  const twinId = useUi((s) => s.twinId);
  const invalidate = useInvalidateTwin();
  const push = useToasts((s) => s.push);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const rules = [...snap.firewall_rules].sort((a, b) => a.firewall_id.localeCompare(b.firewall_id) || a.order - b.order || a.id.localeCompare(b.id));
  if (firewalls.length === 0) return <EmptyState title={t("rules.noFirewalls")} body={t("rules.noFirewallsBody")} />;
  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-[12.5px] text-ink-dim">{t("rules.explain")}</p>
        <Button tone="primary" icon={<Plus size={14} />} disabled={readOnly}
          onClick={() => setEditing({ isNew: true, r: { id: "", firewall_id: firewalls[0]!.id, order: 100, src_zone: "internal", src_cidr: null, dst_asset: null, dst_zone: "dmz", port: null, action: "deny", description: "" } })}>{t("rules.new")}</Button>
      </div>
      <table className="w-full text-[13px]">
        <thead className="border-b border-line text-left text-ink-dim"><tr>
          <th className="px-2 py-2 font-medium">{t("rules.firewall")}</th><th className="px-2 py-2 font-medium">{t("rules.order")}</th>
          <th className="px-2 py-2 font-medium">{t("rules.source")}</th><th className="px-2 py-2 font-medium">{t("rules.destination")}</th>
          <th className="px-2 py-2 font-medium">{t("rules.port")}</th><th className="px-2 py-2 font-medium">{t("rules.action")}</th>
          <th className="px-2 py-2 font-medium">{t("rules.description")}</th><th className="px-2 py-2"><span className="sr-only">{t("common.actions")}</span></th></tr></thead>
        <tbody>
          {rules.map((r) => (
            <tr key={r.id} className="border-b border-line/60 hover:bg-white/[0.03]">
              <td className="mono px-2 py-2">{r.firewall_id}</td><td className="mono px-2 py-2">{r.order}</td>
              <td className="mono px-2 py-2">{r.src_zone ? t(`zone.${r.src_zone}`) : r.src_cidr}</td>
              <td className="mono px-2 py-2">{r.dst_asset ?? (r.dst_zone ? t(`zone.${r.dst_zone}`) : "")}</td>
              <td className="mono px-2 py-2">{r.port ?? t("rules.any")}</td>
              <td className="px-2 py-2"><Chip color={r.action === "allow" ? "var(--color-secure)" : "var(--color-critical-ink)"}>{t(`rules.${r.action}`)}</Chip></td>
              <td className="px-2 py-2 text-ink-dim">{r.description}</td>
              <td className="px-2 py-2"><div className="flex justify-end gap-1">
                <IconButton label={t("common.editItem", { name: r.id })} disabled={readOnly} onClick={() => setEditing({ r: { ...r }, isNew: false })}><Pencil size={14} /></IconButton>
                <IconButton label={t("common.deleteItem", { name: r.id })} disabled={readOnly} onClick={() => setDeleting(r)}><Trash2 size={14} /></IconButton>
              </div></td>
            </tr>
          ))}
        </tbody>
      </table>
      {editing && <RuleForm initial={editing.r} isNew={editing.isNew} snap={snap} onClose={() => setEditing(null)} />}
      {deleting && (
        <ConfirmDialog open tone="danger" title={t("rules.deleteTitle", { id: deleting.id })} body={t("rules.deleteBody")} confirmLabel={t("common.delete")}
          busy={busy} error={error} onClose={() => { setDeleting(null); setError(null); }}
          onConfirm={async () => {
            setBusy(true);
            try { const out = await api.deleteRule(twinId, deleting.id); await invalidate(); push({ tone: "success", title: t("rules.deleted"), body: t("common.newRevision", { n: out.revision.number }) }); setDeleting(null); }
            catch (e) { setError(e); } finally { setBusy(false); }
          }} />
      )}
    </>
  );
}

function RuleForm({ initial, isNew, snap, onClose }: { initial: FirewallRule; isNew: boolean; snap: TwinSnapshot; onClose: () => void }) {
  const { t } = useTranslation();
  const twinId = useUi((s) => s.twinId);
  const invalidate = useInvalidateTwin();
  const push = useToasts((s) => s.push);
  const [r, setR] = useState(initial);
  const [srcMode, setSrcMode] = useState<"zone" | "cidr">(initial.src_cidr ? "cidr" : "zone");
  const [dstMode, setDstMode] = useState<"zone" | "asset">(initial.dst_asset ? "asset" : "zone");
  const [error, setError] = useState<unknown>(null);
  const [local, setLocal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const body: FirewallRule = {
      ...r,
      src_zone: srcMode === "zone" ? r.src_zone ?? "internet" : null,
      src_cidr: srcMode === "cidr" ? r.src_cidr ?? "" : null,
      dst_zone: dstMode === "zone" ? r.dst_zone ?? "dmz" : null,
      dst_asset: dstMode === "asset" ? r.dst_asset ?? snap.assets[0]?.id ?? null : null,
    };
    if (!ID_RE.test(body.id)) return setLocal(t("validation.id"));
    if (body.src_cidr !== null && !CIDR_RE.test(body.src_cidr)) return setLocal(t("validation.cidr"));
    setLocal(null);
    setBusy(true);
    try {
      const out = isNew ? await api.createRule(twinId, body) : await api.updateRule(twinId, body);
      await invalidate();
      push({ tone: "success", title: t("rules.saved"), body: t("common.newRevision", { n: out.revision.number }) });
      onClose();
    } catch (e) { setError(e); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} title={isNew ? t("rules.new") : r.id}
      footer={<><Button onClick={onClose}>{t("common.cancel")}</Button><Button tone="primary" busy={busy} onClick={submit} data-testid="save-rule">{t("common.save")}</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("assets.id")} htmlFor="r-id"><input id="r-id" className={inputCls} disabled={!isNew} value={r.id} onChange={(e) => setR({ ...r, id: e.target.value })} data-testid="r-id" /></Field>
        <Field label={t("rules.firewall")} htmlFor="r-fw"><select id="r-fw" className={inputCls} value={r.firewall_id} onChange={(e) => setR({ ...r, firewall_id: e.target.value })}>
          {snap.assets.filter((a) => a.asset_type === "firewall").map((a) => <option key={a.id} value={a.id}>{a.id}</option>)}</select></Field>
        <Field label={t("rules.order")} htmlFor="r-order"><input id="r-order" type="number" className={inputCls} value={r.order} onChange={(e) => setR({ ...r, order: Number(e.target.value) })} /></Field>
        <Field label={t("rules.action")} htmlFor="r-act"><select id="r-act" className={inputCls} value={r.action} onChange={(e) => setR({ ...r, action: e.target.value as "allow" })} data-testid="r-action">
          <option value="allow">{t("rules.allow")}</option><option value="deny">{t("rules.deny")}</option></select></Field>
        <Field label={t("rules.source")} htmlFor="r-src">
          <div className="flex gap-2">
            <select aria-label={t("rules.sourceKind")} className={`${inputCls} w-[90px]!`} value={srcMode} onChange={(e) => setSrcMode(e.target.value as "zone")}><option value="zone">{t("rules.zone")}</option><option value="cidr">CIDR</option></select>
            {srcMode === "zone" ? (
              <select id="r-src" className={inputCls} value={r.src_zone ?? "internet"} onChange={(e) => setR({ ...r, src_zone: e.target.value as "dmz" })}>{ZONES.map((z) => <option key={z} value={z}>{t(`zone.${z}`)}</option>)}</select>
            ) : <input id="r-src" className={`${inputCls} mono`} placeholder="0.0.0.0/0" value={r.src_cidr ?? ""} onChange={(e) => setR({ ...r, src_cidr: e.target.value })} data-testid="r-cidr" />}
          </div>
        </Field>
        <Field label={t("rules.destination")} htmlFor="r-dst">
          <div className="flex gap-2">
            <select aria-label={t("rules.destKind")} className={`${inputCls} w-[90px]!`} value={dstMode} onChange={(e) => setDstMode(e.target.value as "zone")} data-testid="r-dstmode"><option value="zone">{t("rules.zone")}</option><option value="asset">{t("rules.asset")}</option></select>
            {dstMode === "zone" ? (
              <select id="r-dst" className={inputCls} value={r.dst_zone ?? "dmz"} onChange={(e) => setR({ ...r, dst_zone: e.target.value as "dmz" })}>{ZONES.map((z) => <option key={z} value={z}>{t(`zone.${z}`)}</option>)}</select>
            ) : <select id="r-dst" className={inputCls} value={r.dst_asset ?? ""} onChange={(e) => setR({ ...r, dst_asset: e.target.value })} data-testid="r-dstasset">
              <option value="" disabled>—</option>{snap.assets.map((a) => <option key={a.id} value={a.id}>{a.id}</option>)}</select>}
          </div>
        </Field>
        <Field label={t("rules.port")} hint={t("rules.portHint")} htmlFor="r-port"><input id="r-port" type="number" className={`${inputCls} mono`} value={r.port ?? ""} onChange={(e) => setR({ ...r, port: e.target.value ? Number(e.target.value) : null })} data-testid="r-port" /></Field>
        <Field label={t("rules.description")} htmlFor="r-desc"><input id="r-desc" className={inputCls} value={r.description} onChange={(e) => setR({ ...r, description: e.target.value })} /></Field>
        {local && <p className="col-span-2 text-[12.5px] text-critical-ink" role="alert">{local}</p>}
        {error ? <div className="col-span-2"><ErrorState error={error} compact /></div> : null}
      </div>
    </Dialog>
  );
}
