import { Pencil, Plus, Trash2, Wrench } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router";
import { api } from "../api/client";
import { useCurrentSimulation, useInvalidateTwin, useTwin } from "../api/hooks";
import type { Vulnerability } from "../api/types";
import { Button, Chip, ConfirmDialog, EmptyState, ErrorState, Loading, Panel, SeverityBadge } from "../components/ui";
import { cx } from "../components/cls";
import { VulnForm } from "../features/vulns/VulnForm";
import { blankVuln } from "../features/vulns/validate";
import { severityFromCvss } from "../lib/score";
import { useMsg } from "../i18n/engine";
import { useToasts, useUi } from "../stores/ui";

export function VulnerabilitiesPage() {
  const { t } = useTranslation();
  const m = useMsg();
  const vt = (v: Vulnerability) => (v.title_i18n ? m(v.title_i18n) : v.title);
  const twin = useTwin();
  const { sim } = useCurrentSimulation();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const readOnly = useUi((s) => s.viewRevision !== null);
  const [form, setForm] = useState<{ v: Vulnerability; isNew: boolean } | null>(null);
  const [deleting, setDeleting] = useState<Vulnerability | null>(null);
  const result = sim.data && twin.data && sim.data.revision === twin.data.revision.number ? sim.data.result : null;
  const vulns = twin.data?.snapshot.vulnerabilities ?? [];
  const byVuln = useMemo(() => new Map(result?.critical_findings.map((f) => [f.vuln_id, f]) ?? []), [result]);
  const choke = useMemo(() => new Map(result?.chokepoints.map((c) => [c.vuln_id, c]) ?? []), [result]);
  const rows = [...vulns].sort((a, b) => (choke.get(b.id)?.delta_score ?? 0) - (choke.get(a.id)?.delta_score ?? 0) || b.cvss - a.cvss);
  const selectedId = params.get("v") ?? rows[0]?.id ?? null;
  const selected = vulns.find((v) => v.id === selectedId) ?? null;

  if (twin.isError) return <div className="pt-4"><ErrorState error={twin.error} onRetry={() => void twin.refetch()} /></div>;
  return (
    <div className="grid grid-cols-12 gap-3 pt-4">
      <Panel title={t("vulns.title")} className="col-span-12 xl:col-span-7" bodyClass="flex flex-col gap-2"
        actions={<Button tone="primary" icon={<Plus size={14} />} disabled={readOnly} onClick={() => setForm({ v: blankVuln(), isNew: true })} data-testid="vuln-add">{t("vulns.add")}</Button>}>
        {!result && <p className="text-[12.5px] text-ink-dim">{t("vulns.noSimNote")}</p>}
        {!twin.data ? <Loading /> : rows.length === 0 ? <EmptyState title={t("vulns.none")} body={t("vulns.noneBody")} /> : (
          <table className="w-full text-[13px]" data-testid="vuln-table">
            <thead className="border-b border-line text-left text-ink-dim"><tr>
              <th className="px-2 py-2 font-medium">{t("vulns.finding")}</th><th className="px-2 py-2 font-medium">CVSS</th>
              <th className="px-2 py-2 font-medium">{t("vulns.affected")}</th><th className="px-2 py-2 font-medium">{t("vulns.paths")}</th>
              <th className="px-2 py-2 font-medium">{t("vulns.delta")}</th></tr></thead>
            <tbody>
              {rows.map((v) => {
                const f = byVuln.get(v.id);
                const c = choke.get(v.id);
                return (
                  <tr key={v.id} onClick={() => setParams({ v: v.id })} data-testid={`vuln-row-${v.id}`}
                    className={cx("cursor-pointer border-b border-line/60 hover:bg-white/[0.04]", v.id === selectedId && "bg-primary/[0.07]")}>
                    <td className="px-2 py-2">
                      <button type="button" className="text-left hover:text-primary" onClick={() => setParams({ v: v.id })}>{vt(v)}</button>
                      <div className="mono text-[11px] text-ink-faint">{v.id}</div>
                    </td>
                    <td className="px-2 py-2"><div className="flex items-center gap-2"><span className="display-num text-[15px]">{v.cvss.toFixed(1)}</span><SeverityBadge severity={f?.severity ?? severityFromCvss(v.cvss)} /></div></td>
                    <td className="mono px-2 py-2 text-[12px]">{v.affected_asset ?? "—"}{v.affected_port ? `:${v.affected_port}` : ""}{v.affected_principal ? ` / ${v.affected_principal}` : ""}</td>
                    <td className="display-num px-2 py-2 text-[15px]">{result ? f?.path_count ?? 0 : "—"}</td>
                    <td className="display-num px-2 py-2 text-[15px]" style={{ color: c && c.delta_score > 0 ? "var(--color-secure)" : undefined }}>
                      {c ? `+${c.delta_score.toFixed(1)}` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>
      <Panel title={t("vulns.detail")} className="col-span-12 xl:col-span-5" testId="vuln-detail">
        {!selected ? <EmptyState title={t("vulns.pick")} /> : (
          <div className="flex flex-col gap-3">
            <div>
              <h3 className="text-[17px] leading-snug font-semibold">{vt(selected)}</h3>
              <p className="mono text-[12px] text-ink-faint">{selected.id}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <SeverityBadge severity={byVuln.get(selected.id)?.severity ?? severityFromCvss(selected.cvss)} />
              <Chip>{t(`vulnKind.${selected.kind}`)}</Chip>
              {selected.cve && <Chip color="var(--color-warning)">{selected.cve} · {t("vulns.illustrative")}</Chip>}
              {selected.mitre_techniques.map((m) => <Chip key={m} color="var(--color-violet)">{m}</Chip>)}
            </div>
            {selected.description && <p className="text-[13px] text-ink-dim">{selected.description}</p>}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[13px]">
              <dt className="text-ink-dim">CVSS</dt><dd>{selected.cvss.toFixed(1)}</dd>
              <dt className="text-ink-dim">{t("vulns.maturity")}</dt><dd>{selected.exploit_maturity.toFixed(2)}</dd>
              <dt className="text-ink-dim">{t("vulns.grants")}</dt><dd>{t(`privilege.${selected.grants_privilege}`)}</dd>
              <dt className="text-ink-dim">{t("vulns.paths")}</dt><dd>{result ? byVuln.get(selected.id)?.path_count ?? 0 : "—"}</dd>
              <dt className="text-ink-dim">{t("vulns.delta")}</dt><dd>{choke.get(selected.id) ? `+${choke.get(selected.id)!.delta_score.toFixed(1)} → ${choke.get(selected.id)!.score_after.toFixed(0)}` : "—"}</dd>
              <dt className="text-ink-dim">{t("vulns.fixedBy")}</dt><dd>{selected.fixed_by_remediation_types.map((r) => t(`remType.${r}`)).join(", ") || "—"}</dd>
            </dl>
            <div className="flex gap-2">
              <Button tone="secure" icon={<Wrench size={14} />} disabled={readOnly || selected.fixed_by_remediation_types.length === 0}
                onClick={() => navigate(`/remediation?fix=${selected.id}${result ? `&scenario=${result.scenario}` : ""}`)} data-testid="fix-vuln">{t("vulns.fix")}</Button>
              <Button icon={<Pencil size={14} />} disabled={readOnly} onClick={() => setForm({ v: structuredClone(selected), isNew: false })} data-testid="vuln-edit">{t("vulnForm.edit")}</Button>
              <Button tone="danger" icon={<Trash2 size={14} />} disabled={readOnly} onClick={() => setDeleting(selected)}>{t("vulns.remove")}</Button>
            </div>
            <p className="text-[12px] text-ink-faint">{t("vulns.removeHint")}</p>
          </div>
        )}
      </Panel>
      {form && twin.data && <VulnForm initial={form.v} isNew={form.isNew} snapshot={twin.data.snapshot} onClose={() => setForm(null)} />}
      {deleting && <DeleteVuln v={deleting} onClose={() => setDeleting(null)} />}
    </div>
  );
}

function DeleteVuln({ v, onClose }: { v: Vulnerability; onClose: () => void }) {
  const { t } = useTranslation();
  const twinId = useUi((s) => s.twinId);
  const invalidate = useInvalidateTwin();
  const push = useToasts((s) => s.push);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  return (
    <ConfirmDialog open tone="danger" title={t("vulns.removeTitle", { id: v.id })} body={t("vulns.removeBody")} confirmLabel={t("vulns.remove")}
      busy={busy} error={error} onClose={onClose}
      onConfirm={async () => {
        setBusy(true);
        try { const out = await api.deleteVuln(twinId, v.id); await invalidate(); push({ tone: "success", title: t("vulns.removed"), body: t("common.newRevision", { n: out.revision.number }) }); onClose(); }
        catch (e) { setError(e); } finally { setBusy(false); }
      }} />
  );
}
