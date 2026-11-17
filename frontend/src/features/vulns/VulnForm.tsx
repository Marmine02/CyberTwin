import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import { useCatalog, useInvalidateTwin } from "../../api/hooks";
import type { TwinSnapshot, VulnKind, Vulnerability } from "../../api/types";
import { Button, Dialog, ErrorState, Field } from "../../components/ui";
import { inputCls } from "../../components/cls";
import { useToasts, useUi } from "../../stores/ui";
import { useMsg } from "../../i18n/engine";
import { FIXES, KINDS, validateVuln, type Errors } from "./validate";

export function VulnForm({ initial, isNew, snapshot, onClose }: {
  initial: Vulnerability;
  isNew: boolean;
  snapshot: TwinSnapshot;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const tt = t as unknown as (k: string, o?: Record<string, unknown>) => string;
  const twinId = useUi((s) => s.twinId);
  const invalidate = useInvalidateTwin();
  const push = useToasts((s) => s.push);
  const catalog = useCatalog();
  const m = useMsg();
  const [v, setV] = useState<Vulnerability>({ ...initial, mitre_techniques: [...initial.mitre_techniques] });
  const [mitreText, setMitreText] = useState(initial.mitre_techniques.join(", "));
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Vulnerability>(k: K, val: Vulnerability[K]) => setV((x) => ({ ...x, [k]: val }));
  const err = (k: keyof Errors) => (errors[k] ? tt(errors[k]!) : null);
  const asset = snapshot.assets.find((a) => a.id === v.affected_asset);

  const applyTemplate = (tpl: string) => {
    const c = catalog.data?.find((x) => x.template === tpl);
    if (!c) return;
    setV((x) => ({
      ...x,
      id: x.id || `vuln-${c.template}`,
      title: c.title,
      title_i18n: c.title_i18n ?? null,
      cvss: c.cvss,
      exploit_maturity: c.exploit_maturity,
      kind: c.kind,
      cve: c.cve,
      grants_privilege: c.grants_privilege,
      mitre_techniques: c.mitre_techniques,
      fixed_by_remediation_types: c.fixed_by_remediation_types,
    }));
    setMitreText(c.mitre_techniques.join(", "));
  };

  const submit = async () => {
    const body: Vulnerability = {
      ...v,
      mitre_techniques: mitreText.split(",").map((s) => s.trim()).filter(Boolean),
      cve: v.cve?.trim() || null,
      fixed_version: v.fixed_version?.trim() || null,
    };
    const e = validateVuln(body, snapshot.vulnerabilities.map((x) => x.id), isNew, snapshot);
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    setServerError(null);
    try {
      const out = isNew ? await api.createVuln(twinId, body) : await api.updateVuln(twinId, body);
      await invalidate();
      push({ tone: "success", title: t(isNew ? "vulns.added" : "vulnForm.updated"), body: t("common.newRevision", { n: out.revision.number }) });
      onClose();
    } catch (ex) {
      setServerError(ex);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open wide onClose={onClose} title={isNew ? t("vulns.add") : t("vulnForm.editTitle", { id: initial.id })}
      footer={<><Button onClick={onClose}>{t("common.cancel")}</Button><Button tone="primary" busy={busy} onClick={submit} data-testid="vuln-save">{t("common.save")}</Button></>}>
      <form className="grid grid-cols-2 gap-3" noValidate onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        {isNew && (
          <Field label={t("vulns.template")} hint={t("vulnForm.templateHint")} htmlFor="vf-tpl">
            <select id="vf-tpl" className={inputCls} defaultValue="" onChange={(e) => applyTemplate(e.target.value)} data-testid="vf-template">
              <option value="">{t("vulnForm.blank")}</option>
              {catalog.data?.map((c) => <option key={c.template} value={c.template}>{c.title_i18n ? m(c.title_i18n) : c.title}</option>)}
            </select>
          </Field>
        )}
        <Field label={t("assets.id")} error={err("id")} htmlFor="vf-id">
          <input id="vf-id" className={inputCls} value={v.id} disabled={!isNew} aria-invalid={!!errors.id} onChange={(e) => set("id", e.target.value)} data-testid="vf-id" />
        </Field>
        <div className={isNew ? "col-span-2" : ""}>
          <Field label={t("vulnForm.title")} error={err("title")} htmlFor="vf-title">
            <input id="vf-title" className={inputCls} maxLength={160} value={v.title} aria-invalid={!!errors.title} onChange={(e) => set("title", e.target.value)} data-testid="vf-title" />
          </Field>
        </div>
        <Field label={t("vulnForm.kind")} htmlFor="vf-kind">
          <select id="vf-kind" className={inputCls} value={v.kind} onChange={(e) => set("kind", e.target.value as VulnKind)} data-testid="vf-kind">
            {KINDS.map((k) => <option key={k} value={k}>{t(`vulnKind.${k}`)}</option>)}
          </select>
        </Field>
        <Field label={t("vulns.grants")} htmlFor="vf-grants">
          <select id="vf-grants" className={inputCls} value={v.grants_privilege} onChange={(e) => set("grants_privilege", e.target.value as "user" | "admin")}>
            <option value="user">{t("privilege.user")}</option>
            <option value="admin">{t("privilege.admin")}</option>
          </select>
        </Field>
        <Field label="CVSS" error={err("cvss")} hint={t("vulnForm.cvssHint")} htmlFor="vf-cvss">
          <input id="vf-cvss" type="number" step="0.1" min={0} max={10} className={`${inputCls} mono`} value={v.cvss} aria-invalid={!!errors.cvss}
            onChange={(e) => set("cvss", e.target.value === "" ? Number.NaN : Number(e.target.value))} data-testid="vf-cvss" />
        </Field>
        <Field label={t("vulns.maturity")} error={err("maturity")} hint={t("vulnForm.maturityHint")} htmlFor="vf-mat">
          <input id="vf-mat" type="number" step="0.05" min={0} max={1} className={`${inputCls} mono`} value={v.exploit_maturity} aria-invalid={!!errors.maturity}
            onChange={(e) => set("exploit_maturity", e.target.value === "" ? Number.NaN : Number(e.target.value))} data-testid="vf-maturity" />
        </Field>
        <Field label={t("vulns.asset")} error={err("target")} htmlFor="vf-asset">
          <select id="vf-asset" className={inputCls} value={v.affected_asset ?? ""} onChange={(e) => setV((x) => ({ ...x, affected_asset: e.target.value || null, affected_port: null }))} data-testid="vf-asset">
            <option value="">{t("common.none")}</option>
            {snapshot.assets.filter((a) => a.asset_type !== "internet_gateway").map((a) => <option key={a.id} value={a.id}>{a.id}</option>)}
          </select>
        </Field>
        <Field label={t("assets.port")} error={err("port")} htmlFor="vf-port">
          <select id="vf-port" className={inputCls} value={v.affected_port ?? ""} disabled={!asset} onChange={(e) => set("affected_port", e.target.value ? Number(e.target.value) : null)} data-testid="vf-port">
            <option value="">{t("common.none")}</option>
            {asset?.open_ports.map((p) => <option key={p.port} value={p.port}>{p.port} {p.service}</option>)}
          </select>
        </Field>
        <Field label={t("vulns.principal")} htmlFor="vf-principal">
          <select id="vf-principal" className={inputCls} value={v.affected_principal ?? ""} onChange={(e) => set("affected_principal", e.target.value || null)}>
            <option value="">{t("common.none")}</option>
            {snapshot.principals.map((p) => <option key={p.id} value={p.id}>{p.id}</option>)}
          </select>
        </Field>
        <Field label="CVE" error={err("cve")} hint={t("vulnForm.cveHint")} htmlFor="vf-cve">
          <input id="vf-cve" className={`${inputCls} mono`} placeholder="CVE-2099-0001" value={v.cve ?? ""} aria-invalid={!!errors.cve} onChange={(e) => set("cve", e.target.value)} />
        </Field>
        <Field label={t("vulnForm.mitre")} error={err("mitre")} hint={t("vulnForm.mitreHint")} htmlFor="vf-mitre">
          <input id="vf-mitre" className={`${inputCls} mono`} placeholder="T1190, T1078" value={mitreText} aria-invalid={!!errors.mitre} onChange={(e) => setMitreText(e.target.value)} data-testid="vf-mitre" />
        </Field>
        <Field label={t("vulnForm.fixedVersion")} hint={t("vulnForm.fixedVersionHint")} htmlFor="vf-fixver">
          <input id="vf-fixver" className={`${inputCls} mono`} value={v.fixed_version ?? ""} onChange={(e) => set("fixed_version", e.target.value)} />
        </Field>
        <fieldset className="col-span-2">
          <legend className="mb-1 text-[12px] font-medium text-ink-dim">{t("vulns.fixedBy")}</legend>
          <div className="flex flex-wrap gap-3">
            {FIXES.map((f) => (
              <label key={f} className="flex items-center gap-1.5 text-[12.5px]">
                <input type="checkbox" className="accent-[#34d399]" checked={v.fixed_by_remediation_types.includes(f)}
                  onChange={(e) => set("fixed_by_remediation_types", e.target.checked ? [...v.fixed_by_remediation_types, f] : v.fixed_by_remediation_types.filter((x) => x !== f))} />
                {t(`remType.${f}`)}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="col-span-2">
          <Field label={t("vulnForm.description")} htmlFor="vf-desc">
            <textarea id="vf-desc" rows={2} maxLength={600} className={inputCls} value={v.description} onChange={(e) => set("description", e.target.value)} />
          </Field>
        </div>
        {serverError ? <div className="col-span-2"><ErrorState error={serverError} compact /></div> : null}
        <button type="submit" className="hidden" />
      </form>
    </Dialog>
  );
}
