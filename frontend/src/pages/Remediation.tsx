import { ArrowRight, Check, RotateCcw, ShieldCheck, Undo2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { api } from "../api/client";
import {
  useApplyRemediation,
  useInvalidateTwin,
  useRecommendations,
  useRemediations,
  useRevisions,
  useRunSimulation,
  useSimulation,
  useTwin,
} from "../api/hooks";
import { SCENARIO_IDS, type Comparison, type PathRef, type Recommendation, type ScenarioId, type TwinSnapshot } from "../api/types";
import { Button, ConfirmDialog, CountUp, EmptyState, ErrorState, Loading, Panel, SeverityBadge, Skeleton, Tabs } from "../components/ui";
import { cx, inputCls } from "../components/cls";
import { TwinMap } from "../features/map/TwinMap";
import { actionLabel } from "../features/remediation/labels";
import { assetNames, pathChain } from "../features/sim/narrate";
import { ResidualList } from "../features/remediation/ResidualExposure";
import { useMsg } from "../i18n/engine";
import { errorMessage } from "../lib/format";
import { BAND_COLOR, displayScore, scoreBand } from "../lib/score";
import { useToasts, useUi } from "../stores/ui";
import { useTour } from "../stores/tour";

export function RemediationPage() {
  const { t } = useTranslation();
  const tt = t as unknown as (k: string, o?: Record<string, unknown>) => string;
  const [params, setParams] = useSearchParams();
  const { lastScenario, viewRevision } = useUi();
  const scenario = (params.get("scenario") as ScenarioId | null) ?? lastScenario;
  const twin = useTwin();
  const head = twin.data?.twin.head_revision;
  const recs = useRecommendations(viewRevision === null ? head : undefined, scenario);
  const remeds = useRemediations();
  const apply = useApplyRemediation();
  const push = useToasts((s) => s.push);
  const selKey = `${scenario}|${head ?? 0}`;
  const [sel, setSel] = useState<{ key: string; ids: string[] }>({ key: selKey, ids: [] });
  const selected = sel.key === selKey ? sel.ids : [];
  const setSelected = (f: string[] | ((s: string[]) => string[])) =>
    setSel({ key: selKey, ids: typeof f === "function" ? f(selected) : f });
  const [confirming, setConfirming] = useState(false);
  const [lastApplied, setLastApplied] = useState<{ comparison: Comparison; remediationId: string } | null>(null);

  // preselect from ?fix=<vuln> once the recommendations for this revision are known
  const fix = params.get("fix");
  const [fixHandled, setFixHandled] = useState<string | null>(null);
  if (fix && recs.data && fixHandled !== `${fix}|${selKey}`) {
    setFixHandled(`${fix}|${selKey}`);
    const r = recs.data.recommendations.find((x) => x.fixes_vuln_ids.includes(fix));
    if (r && !selected.includes(r.id)) setSel({ key: selKey, ids: [...selected, r.id] });
  }

  const latestRecord = remeds.data?.[0];
  const comparison: Comparison | null =
    lastApplied?.comparison ?? (latestRecord && latestRecord.to_revision === head ? latestRecord.comparison : null);
  const chosen = (recs.data?.recommendations ?? []).filter((r) => selected.includes(r.id));

  const doApply = () =>
    apply.mutateAsync({ scenario, actions: chosen.map((c) => c.action) }).then((out) => {
      setConfirming(false);
      setSelected([]);
      setLastApplied({ comparison: out.comparison, remediationId: out.remediation_id });
      useTour.getState().event("applied");
      push({ tone: "success", title: t("remed.applied", { n: out.revision.number }),
        body: t("remed.appliedBody", { before: displayScore(out.comparison.before_score), after: displayScore(out.comparison.after_score), count: out.comparison.blocked_paths.length }) });
    }, () => undefined /* shown in the dialog via apply.error */);

  if (twin.isError) return <div className="pt-4"><ErrorState error={twin.error} onRetry={() => void twin.refetch()} /></div>;
  return (
    <div className="grid grid-cols-12 gap-3 pt-4">
      <Panel title={t("remed.recommended")} className="col-span-12 xl:col-span-5" bodyClass="flex flex-col gap-3" testId="panel-recs"
        actions={
          <select aria-label={t("remed.scenario")} className={`${inputCls} w-[220px]!`} value={scenario} data-testid="remed-scenario"
            onChange={(e) => setParams({ scenario: e.target.value })}>
            {SCENARIO_IDS.map((s) => <option key={s} value={s}>{t(`scenario.${s}`)}</option>)}
          </select>
        }>
        {viewRevision !== null ? <p className="text-[13px] text-warning">{t("remed.readOnly")}</p> :
          recs.isError ? <ErrorState error={recs.error} onRetry={() => void recs.refetch()} /> :
          !recs.data ? <Loading label={t("remed.computing")} /> : (
          <>
            <p className="text-[12.5px] text-ink-dim">{t("remed.baseline", { score: displayScore(recs.data.baseline_score), rev: recs.data.revision })}</p>
            {recs.data.recommendations.length > 0 && recs.data.recommendations.every((r) => r.expected_delta_score <= 0) && (
              <p className="rounded-lg bg-secure/[0.07] px-3 py-2 text-[12.5px] text-ink-dim" data-testid="recs-residual-only">
                {t("ux.remed.residualOnly", { rev: recs.data.revision })}
              </p>
            )}
            {recs.data.recommendations.length === 0 ? <EmptyState icon={<ShieldCheck size={26} className="text-secure" />} title={t("remed.none")} body={t("remed.noneBody")} /> : (
              <ul className="flex flex-col gap-2" data-testid="rec-list">
                {recs.data.recommendations.map((r, i) => <RecRow key={r.id} r={r} rank={i + 1} checked={selected.includes(r.id)}
                  onToggle={() => setSelected((s) => (s.includes(r.id) ? s.filter((x) => x !== r.id) : [...s, r.id]))} />)}
              </ul>
            )}
            <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
              <Button disabled={!(recs.data?.recommendations ?? []).some((r) => r.expected_delta_score > 0)} data-tour="select-top3"
                onClick={() => setSelected((recs.data?.recommendations ?? []).filter((r) => r.expected_delta_score > 0).slice(0, 3).map((r) => r.id))} data-testid="select-top3">
                {t("remed.selectTop3")}
              </Button>
              <Button tone="secure" icon={<Check size={14} />} disabled={chosen.length === 0} onClick={() => setConfirming(true)} data-testid="apply-selected" data-tour="apply">
                {t("remed.apply", { count: chosen.length })}
              </Button>
            </div>
          </>
        )}
      </Panel>

      <div className="col-span-12 flex flex-col gap-3 xl:col-span-7">
        {comparison ? <ComparisonView comparison={comparison} /> : (
          <Panel title={t("remed.beforeAfter")}>
            <EmptyState icon={<ShieldCheck size={26} />} title={t("remed.noComparison")} body={t("remed.noComparisonBody")} />
          </Panel>
        )}
        <History />
      </div>

      <ConfirmDialog open={confirming} title={t("remed.confirmTitle")} body={t("remed.confirmBody", { rev: head })} confirmLabel={t("remed.confirmApply")}
        tone="secure" busy={apply.isPending} error={apply.error} onConfirm={doApply} onClose={() => { setConfirming(false); apply.reset(); }}>
        <ul className="mt-3 flex flex-col gap-1.5 text-[13px]">
          {chosen.map((c) => (
            <li key={c.id} className="flex justify-between gap-3"><span>{actionLabel(tt, c.action)}</span><span className="display-num text-secure">+{c.expected_delta_score.toFixed(1)}</span></li>
          ))}
        </ul>
        <p className="mt-2 text-[12px] text-ink-faint">{t("remed.confirmNote")}</p>
      </ConfirmDialog>
    </div>
  );
}

function RecRow({ r, rank, checked, onToggle }: { r: Recommendation; rank: number; checked: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  const tt = t as unknown as (k: string, o?: Record<string, unknown>) => string;
  return (
    <li>
      <label className={cx("flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors",
        checked ? "border-secure/60 bg-secure/[0.07]" : "border-line hover:bg-white/[0.03]")} data-testid={`rec-${r.id}`}>
        <input type="checkbox" className="mt-1 accent-[#34d399]" checked={checked} onChange={onToggle} aria-describedby={`rec-d-${rank}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="mono text-[11px] text-ink-faint">#{rank}</span>
            <span className="font-medium">{actionLabel(tt, r.action)}</span>
          </div>
          <p id={`rec-d-${rank}`} className="text-[12px] text-ink-dim">
            {r.fixes_vuln_ids.length ? t("remed.addresses", { ids: r.fixes_vuln_ids.join(", ") }) : t("remed.boundary")}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="display-num text-[18px]" style={{ color: r.expected_delta_score > 0 ? "var(--color-secure)" : "var(--color-ink-faint)" }}>
            {r.expected_delta_score > 0 ? "+" : ""}{r.expected_delta_score.toFixed(1)}
          </span>
          <SeverityBadge severity={r.severity} />
        </div>
      </label>
    </li>
  );
}

/** Graph nodes of a path signature ("u>v:technique" per step). */
function sigNodes(p: PathRef): string[] {
  const steps = p.signature.map((s) => {
    const [from, rest = ""] = s.split(">");
    return { from: from!, to: rest.slice(0, rest.lastIndexOf(":")) };
  });
  return steps.length ? [steps[0]!.from, ...steps.map((x) => x.to)] : [];
}

function ComparisonView({ comparison: c }: { comparison: Comparison }) {
  const { t } = useTranslation();
  const m = useMsg();
  const tt = t as unknown as (k: string, o?: Record<string, unknown>) => string;
  const twin = useTwin();
  const before = useSimulation(c.before_simulation_id);
  const after = useSimulation(c.after_simulation_id);
  const revisions = useRevisions();
  const invalidate = useInvalidateTwin();
  const rerun = useRunSimulation();
  const push = useToasts((s) => s.push);
  const twinId = useUi((s) => s.twinId);
  const [mode, setMode] = useState<"side" | "toggle">("side");
  const [showAfter, setShowAfter] = useState(true);
  const [reverting, setReverting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [beforeSnap, setBeforeSnap] = useState<TwinSnapshot | null>(null);
  useEffect(() => {
    let alive = true;
    api.twin(twinId, c.before_revision).then((s) => alive && setBeforeSnap(s.snapshot)).catch(() => undefined);
    return () => { alive = false; };
  }, [twinId, c.before_revision]);
  const afterRev = useMemo(() => revisions.data?.find((r) => r.number === c.after_revision), [revisions.data, c.after_revision]);
  const names = useMemo(() => assetNames(beforeSnap?.assets ?? twin.data?.snapshot.assets), [beforeSnap, twin.data]);
  const sigText = (p: PathRef) => pathChain(sigNodes(p), names, tt).join(" → ");
  const isHead = twin.data?.twin.head_revision === c.after_revision;

  const doRevert = async () => {
    if (!afterRev) return;
    setBusy(true);
    setError(null);
    try {
      const rev = await api.revert(afterRev.id);
      await invalidate();
      setReverting(false);
      // await the re-run instead of using per-call mutate callbacks: this panel unmounts once the revert is
      // the new head, and TanStack Query skips per-call callbacks after unmount (no feedback toast).
      try {
        const run = await rerun.mutateAsync({ scenario: c.scenario });
        push({ tone: "info", title: t("remed.reverted", { n: rev.number }), body: t("remed.revertedBody", { score: displayScore(run.score) }),
          action: { label: t("ux.toast.open"), to: `/simulate?run=${run.id}` } });
      } catch (e) {
        push({ tone: "error", title: t("sim.failed"), body: errorMessage(e) });
      }
    } catch (e) { setError(e); } finally { setBusy(false); }
  };

  const mini = (which: "before" | "after") => {
    const run = which === "before" ? before.data : after.data;
    const snap = which === "before" ? beforeSnap : twin.data && twin.data.revision.number === c.after_revision ? twin.data.snapshot : null;
    return (
      <div className="flex min-h-[260px] flex-1 flex-col rounded-xl border border-line bg-bg-0/40">
        <div className="flex items-center justify-between px-3 py-1.5 text-[12px]">
          <span className="font-medium">{t(which === "before" ? "remed.before" : "remed.after")} · r{which === "before" ? c.before_revision : c.after_revision}</span>
          <span className="display-num text-[16px]" style={{ color: BAND_COLOR[scoreBand(which === "before" ? c.before_score : c.after_score)] }}>
            {displayScore(which === "before" ? c.before_score : c.after_score)}
          </span>
        </div>
        <div className="relative flex-1">
          {run && snap ? <TwinMap snapshot={snap} result={run.result} path={run.result.primary_path} compact ignoreFilters testId={`mini-${which}`} /> : <Skeleton className="absolute inset-2" />}
        </div>
      </div>
    );
  };

  return (
    <Panel title={t("remed.beforeAfter")} testId="panel-comparison" bodyClass="flex flex-col gap-3"
      actions={<>
        <Tabs label={t("remed.view")} value={mode} onChange={setMode} items={[{ id: "side", label: t("remed.sideBySide") }, { id: "toggle", label: t("remed.toggle") }]} />
        <Button tone="danger" icon={<Undo2 size={14} />} disabled={!isHead || !afterRev} onClick={() => setReverting(true)} data-testid="revert">{t("remed.revert")}</Button>
      </>}>
      <div className="flex items-center gap-6">
        <div>
          <div className="text-[12px] text-ink-dim">{t("remed.scoreChange")}</div>
          <div className="flex items-baseline gap-3">
            <span className="display-num text-[30px]" style={{ color: BAND_COLOR[scoreBand(c.before_score)] }}>{displayScore(c.before_score)}</span>
            <ArrowRight size={20} className="text-ink-faint" />
            <span className="text-[30px]" style={{ color: BAND_COLOR[scoreBand(c.after_score)] }} data-testid="after-score"><CountUp value={displayScore(c.after_score)} /></span>
            <span className="display-num text-[20px] text-secure" data-testid="score-delta">{c.score_delta >= 0 ? "+" : ""}<CountUp value={c.score_delta} decimals={1} /></span>
          </div>
        </div>
        <dl className="ml-auto grid grid-cols-3 gap-4 text-center">
          <div><dt className="text-[11.5px] text-ink-dim">{t("remed.blocked")}</dt><dd className="display-num text-[22px] text-secure" data-testid="blocked-count">{c.blocked_paths.length}</dd></div>
          <div><dt className="text-[11.5px] text-ink-dim">{t("remed.reduced")}</dt><dd className="display-num text-[22px] text-medium">{c.reduced_paths.length}</dd></div>
          <div><dt className="text-[11.5px] text-ink-dim">{t("remed.new")}</dt><dd className="display-num text-[22px] text-critical">{c.new_paths.length}</dd></div>
        </dl>
      </div>

      {mode === "side" ? <div className="flex gap-3">{mini("before")}{mini("after")}</div> : (
        <div className="flex flex-col gap-2">
          <Tabs label={t("remed.toggle")} value={showAfter ? "after" : "before"} onChange={(v) => setShowAfter(v === "after")}
            items={[{ id: "before", label: t("remed.before") }, { id: "after", label: t("remed.after") }]} />
          <div className="flex h-[300px]">{mini(showAfter ? "after" : "before")}</div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <h3 className="panel-title mb-1 text-[12px]">{t("remed.pathChanges")}</h3>
          <ul className="flex max-h-[200px] flex-col gap-1.5 overflow-y-auto text-[12.5px]" data-testid="blocked-paths">
            {c.blocked_paths.map((p, i) => (
              <li key={`b${i}`} className="flex items-start gap-2"><Check size={13} className="mt-0.5 shrink-0 text-secure" />
                <span className="text-ink-dim">{sigText(p)}</span></li>
            ))}
            {c.reduced_paths.map((p, i) => (
              <li key={`r${i}`} className="text-medium">↓ {sigText(p)} ({(p.likelihood_before * 100).toFixed(1)}% → {((p.likelihood_after ?? 0) * 100).toFixed(1)}%)</li>
            ))}
            {c.new_paths.map((p, i) => <li key={`n${i}`} className="text-critical-ink">+ {sigText(p)}</li>)}
            {c.blocked_paths.length + c.reduced_paths.length + c.new_paths.length === 0 && <li className="text-ink-dim">{t("remed.noPathChange")}</li>}
          </ul>
        </div>
        <div>
          <h3 className="panel-title mb-1 text-[12px]">{t("remed.perAsset")}</h3>
          <table className="w-full text-[12.5px]">
            <tbody>
              {c.per_asset_delta.filter((d) => d.delta !== 0).map((d) => (
                <tr key={d.asset_id} className="border-b border-line/50">
                  <td className="py-1">{names.get(d.asset_id) ?? d.asset_id}</td>
                  <td className="py-1 text-right text-ink-dim">{Math.round(d.before)} → {Math.round(d.after)}</td>
                  <td className="display-num py-1 text-right" style={{ color: d.delta < 0 ? "var(--color-secure)" : "var(--color-critical-ink)" }}>{d.delta > 0 ? "+" : ""}{d.delta.toFixed(0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <section aria-labelledby="residual-h" data-testid="remed-residual">
        <h3 id="residual-h" className="panel-title mb-1 text-[12px]">{t("residual.title")}</h3>
        {after.data ? <ResidualList items={after.data.result.residual_findings ?? []} /> : <Loading />}
      </section>
      <details className="text-[12.5px] text-ink-dim">
        <summary className="cursor-pointer">{t("remed.changes", { n: c.changes.length })}</summary>
        <ul className="mt-1 ml-4 list-disc">{c.changes.map((x, i) => <li key={i}>{m(x)}</li>)}</ul>
        <p className="mt-1">{c.applied_actions.map((a) => actionLabel(tt, a)).join(" · ")}</p>
      </details>
      <ConfirmDialog open={reverting} title={t("remed.revertTitle", { rev: c.after_revision })} body={t("remed.revertBody", { rev: c.before_revision })}
        confirmLabel={t("remed.revert")} tone="danger" busy={busy} error={error} onConfirm={doRevert} onClose={() => setReverting(false)} />
    </Panel>
  );
}

function History() {
  const { t } = useTranslation();
  const tt = t as unknown as (k: string, o?: Record<string, unknown>) => string;
  const remeds = useRemediations();
  if (!remeds.data || remeds.data.length === 0) return null;
  return (
    <Panel title={t("remed.history")}>
      <ul className="flex flex-col gap-1.5 text-[12.5px]">
        {remeds.data.map((r) => (
          <li key={r.id} className="flex items-center gap-3">
            <RotateCcw size={13} className="text-ink-faint" />
            <span className="mono">r{r.from_revision} → r{r.to_revision}</span>
            <span className="flex-1 truncate text-ink-dim">{r.actions.map((a) => actionLabel(tt, a)).join(" · ")}</span>
            <span className="display-num">{displayScore(r.comparison.before_score)} → {displayScore(r.comparison.after_score)}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
