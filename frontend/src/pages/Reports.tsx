import { Crosshair, Download, FileText, Printer } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api, reportUrl } from "../api/client";
import { useRevisions, useSimulations } from "../api/hooks";
import type { DiffCollection } from "../api/types";
import { EmptyState, ErrorState, Loading, Panel } from "../components/ui";
import { inputCls } from "../components/cls";
import { formatDateTime, formatPercent } from "../lib/format";
import { BAND_COLOR, displayScore, scoreBand } from "../lib/score";
import { useUi } from "../stores/ui";
import { useMsg } from "../i18n/engine";

export function ReportsPage() {
  const { t, i18n } = useTranslation();
  const sims = useSimulations();
  return (
    <div className="grid grid-cols-12 gap-3 pt-4">
      <Panel title={t("reports.history")} className="col-span-12 xl:col-span-7" testId="panel-history">
        {sims.isError ? <ErrorState error={sims.error} onRetry={() => void sims.refetch()} /> : !sims.data ? <Loading /> :
          sims.data.length === 0 ? (
            <EmptyState icon={<FileText size={26} />} title={t("overview.noSim")}
              action={<Link to="/simulate" className="font-semibold text-primary hover:underline">{t("reports.goRun")}</Link>} />
          ) : (
            <div className="max-h-[560px] overflow-y-auto">
              <table className="w-full text-[13px]" data-testid="history-table">
                <thead className="sticky top-0 border-b border-line bg-bg-1/95 text-left text-ink-dim"><tr>
                  <th className="px-2 py-2 font-medium">{t("reports.when")}</th><th className="px-2 py-2 font-medium">{t("reports.scenario")}</th>
                  <th className="px-2 py-2 font-medium">{t("reports.revision")}</th><th className="px-2 py-2 font-medium">{t("sim.score")}</th>
                  <th className="px-2 py-2 font-medium">{t("reports.paths")}</th><th className="px-2 py-2 font-medium">{t("overview.blast")}</th>
                  <th className="px-2 py-2"><span className="sr-only">{t("common.actions")}</span></th></tr></thead>
                <tbody>
                  {sims.data.map((s) => (
                    <tr key={s.id} className="border-b border-line/60 hover:bg-white/[0.03]">
                      <td className="px-2 py-2 whitespace-nowrap">{formatDateTime(s.created_at)}</td>
                      <td className="px-2 py-2">{t(`scenario.${s.scenario}`)}</td>
                      <td className="mono px-2 py-2">r{s.revision}</td>
                      <td className="display-num px-2 py-2 text-[16px]" style={{ color: BAND_COLOR[scoreBand(s.score)] }}>{displayScore(s.score)}</td>
                      <td className="px-2 py-2">{s.path_count}</td>
                      <td className="px-2 py-2">{formatPercent(s.blast_radius)}</td>
                      <td className="px-2 py-2">
                        <div className="flex justify-end gap-1">
                          <Link to={`/simulate?run=${s.id}`} className="inline-flex h-8 items-center gap-1 rounded-lg border border-line px-2 text-[12px] hover:bg-white/[0.06]" aria-label={t("reports.open")}><Crosshair size={13} /></Link>
                          <a href={reportUrl(s.id, "html", i18n.language)} target="_blank" rel="noreferrer" data-testid={`report-${s.id}`}
                            className="inline-flex h-8 items-center gap-1 rounded-lg border border-primary/50 bg-primary/10 px-2 text-[12px] text-primary hover:bg-primary/20"><Printer size={13} />{t("reports.printable")}</a>
                          <a href={reportUrl(s.id, "json", i18n.language)} download={`cybertwin-${s.id}.json`} className="inline-flex h-8 items-center rounded-lg border border-line px-2 text-[12px] hover:bg-white/[0.06]" aria-label={t("reports.json")}><Download size={13} /></a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Panel>
      <RevisionDiff />
    </div>
  );
}

function RevisionDiff() {
  const { t } = useTranslation();
  const m = useMsg();
  const revs = useRevisions();
  const twinId = useUi((s) => s.twinId);
  const [baseSel, setBase] = useState<number | null>(null);
  const [targetSel, setTarget] = useState<number | null>(null);
  const latest = revs.data?.[0];
  const target = targetSel ?? latest?.number ?? null;
  const base = baseSel ?? latest?.parent_number ?? target;
  const diff = useQuery({
    queryKey: ["diff", twinId, base, target],
    queryFn: () => api.diff(twinId, base!, target!),
    enabled: base !== null && target !== null,
  });
  const cols = ["assets", "connections", "principals", "firewall_rules", "vulnerabilities"] as const;
  return (
    <Panel title={t("reports.diff")} className="col-span-12 xl:col-span-5" bodyClass="flex flex-col gap-3" testId="panel-diff">
      {!revs.data ? <Loading /> : (
        <>
          <div className="flex items-center gap-2">
            {[{ v: base, set: setBase, label: t("reports.base") }, { v: target, set: setTarget, label: t("reports.target") }].map((x) => (
              <label key={x.label} className="flex flex-1 flex-col gap-1 text-[12px] text-ink-dim">{x.label}
                <select className={inputCls} value={x.v ?? ""} onChange={(e) => x.set(Number(e.target.value))}>
                  {revs.data.map((r) => <option key={r.id} value={r.number}>r{r.number} · {t(`revKind.${r.kind}`)} · {(r.note_msg ? m(r.note_msg) : r.note).slice(0, 40)}</option>)}
                </select>
              </label>
            ))}
          </div>
          <ul className="flex flex-col gap-1 text-[12px] text-ink-dim">
            {revs.data.slice(0, 6).map((r) => <li key={r.id}><span className="mono text-ink">r{r.number}</span> · {formatDateTime(r.created_at)} · {r.note_msg ? m(r.note_msg) : r.note}</li>)}
          </ul>
          {diff.isError ? <ErrorState error={diff.error} compact /> : !diff.data ? <Loading /> : diff.data.diff.total_changes === 0 ? (
            <p className="text-[13px] text-ink-dim">{t("reports.noDiff")}</p>
          ) : (
            <div className="flex flex-col gap-2 text-[12.5px]" data-testid="diff-view">
              {cols.map((c) => {
                const d: DiffCollection = diff.data.diff[c];
                if (!d.added.length && !d.removed.length && !d.changed.length) return null;
                return (
                  <div key={c}>
                    <h3 className="panel-title text-[11.5px]">{t(`reports.col.${c}`)}</h3>
                    {d.added.map((x) => <div key={`a${x}`} className="mono text-secure">+ {x}</div>)}
                    {d.removed.map((x) => <div key={`r${x}`} className="mono text-critical-ink">− {x}</div>)}
                    {d.changed.map((x) => <div key={`c${x.id}`} className="mono text-medium">~ {x.id} <span className="text-ink-faint">({x.fields.join(", ")})</span></div>)}
                  </div>
                );
              })}
              {(diff.data.diff.segmented_zones.added.length > 0) && <div className="mono text-secure">+ {t("reports.segmented")}: {diff.data.diff.segmented_zones.added.map((p) => p.join("↔")).join(", ")}</div>}
            </div>
          )}
          <p className="text-[12px] text-ink-faint">{t("reports.printHint")}</p>
        </>
      )}
    </Panel>
  );
}
