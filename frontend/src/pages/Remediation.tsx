import { useMutation, useQuery } from '@tanstack/react-query'
import { ArrowRight, CheckSquare, GitCompare, RotateCcw, ShieldCheck, Square } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { api } from '../api/client'
import {
  useCurrentTwin, useInvalidateAll, useModel, useRecommendations, useRemediations, useRevisions, useRun,
} from '../api/hooks'
import { SCENARIOS, type Comparison, type Remediation as Rem, type ScenarioId, type SimResult } from '../api/types'
import { TopologyMap } from '../components/map/TopologyMap'
import { CountUp } from '../components/ui/CountUp'
import { ConfirmDialog } from '../components/ui/Dialog'
import { GlassPanel } from '../components/ui/GlassPanel'
import { Empty, ErrorState, Loading } from '../components/ui/States'
import type { Lang } from '../i18n'
import { fmtDateTime, fmtDelta, fmtProb, fmtScore } from '../i18n/format'
import { renderAction, renderMessage } from '../i18n/messages'
import { errorText } from '../lib/errors'
import { assetNames, vulnCves } from '../lib/model'
import { useApp } from '../store/app'
import { toast } from '../store/toast'

interface CompareView {
  revA: number
  revB: number
  comparison: Comparison
  resultA: SimResult | null
  resultB: SimResult | null
  remediation?: Rem
}

function scoreClass(s: number) {
  return s >= 80 ? 'neon-text-secure' : s >= 50 ? 'neon-text-medium' : 'neon-text-critical'
}

function MiniMap({ rev, result, label }: { rev: number; result: SimResult | null; label: string }) {
  const model = useModel(rev)
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="text-[12px] uppercase tracking-wider text-ink-400">{label}</div>
      <div className="relative h-[260px] overflow-hidden rounded-xl border border-cyan/12">
        {model.data ? <TopologyMap model={model.data} result={result} pathId={result?.primary_path} ariaLabel={label} compact />
          : model.isError ? <ErrorState error={model.error} /> : <Loading rows={4} />}
      </div>
    </div>
  )
}

function CompareResult({ view, onRevert, reverting }: { view: CompareView; onRevert?: () => void; reverting: boolean }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as Lang
  const model = useModel(view.revB)
  const names = useMemo(() => assetNames(model.data), [model.data])
  const c = view.comparison
  const findings = new Map((view.resultB?.findings ?? []).map((f) => [f.id, f]))
  const route = (assets: string[]) => assets.map((a) => names[a] ?? a).join(' → ')
  const canRevert = view.remediation && view.remediation.reverted_by_revision === null && onRevert
  return (
    <div className="flex flex-col gap-4" data-testid="compare-result">
      <div className="flex flex-wrap items-center gap-6">
        <div>
          <div className="text-[12px] uppercase tracking-wider text-ink-400">{t('ui.rem.before')} · r{view.revA}</div>
          <div className={`num text-[40px] leading-none ${scoreClass(c.before.score)}`} data-testid="score-before">{fmtScore(lang, c.before.score)}</div>
        </div>
        <ArrowRight className="text-ink-400" />
        <div>
          <div className="text-[12px] uppercase tracking-wider text-ink-400">{t('ui.rem.after')} · r{view.revB}</div>
          <CountUp value={c.after.score} format={(v) => fmtScore(lang, v)} className={`num block text-[40px] leading-none ${scoreClass(c.after.score)}`} testId="score-after" />
        </div>
        <div className="chip border-secure/40 bg-secure/10 text-emerald-200 text-[14px]">{fmtDelta(lang, c.score_delta)} {t('ui.common.points')}</div>
        {view.remediation?.reverted_by_revision != null && (
          <span className="chip text-ink-300" data-testid="reverted-chip">{t('ui.rem.revertedIn', { n: view.remediation.reverted_by_revision })}</span>
        )}
        {canRevert && (
          <button type="button" className="btn-ghost btn-danger ml-auto" onClick={onRevert} disabled={reverting} data-testid="revert-button">
            <RotateCcw size={15} /> {t('ui.rem.revert')}
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <MiniMap rev={view.revA} result={view.resultA} label={`${t('ui.rem.before')} · r${view.revA}`} />
        <MiniMap rev={view.revB} result={view.resultB} label={`${t('ui.rem.after')} · r${view.revB}`} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section>
          <h3 className="panel-title mb-1 text-[13px]">{t('ui.rem.blocked', { count: c.blocked_paths.length })}</h3>
          {c.blocked_paths.length ? (
            <ul className="flex flex-col gap-1 text-[13px]" data-testid="blocked-paths">
              {c.blocked_paths.map((p) => (
                <li key={p.id} className="text-ink-300"><span className="mono mr-1 text-secure">{p.id}</span>
                  <s className="decoration-critical decoration-2">{route(p.assets)}</s> <span className="text-ink-400">({fmtProb(lang, p.likelihood)})</span></li>
              ))}
            </ul>
          ) : <p className="text-[13px] text-ink-400">{t('ui.common.none')}</p>}
          {c.reduced_paths.length > 0 && (
            <>
              <h3 className="panel-title mt-3 mb-1 text-[13px]">{t('ui.rem.reduced', { count: c.reduced_paths.length })}</h3>
              <ul className="flex flex-col gap-1 text-[13px] text-ink-200">
                {c.reduced_paths.map((p) => <li key={p.id}><span className="mono mr-1">{p.id}</span>{fmtProb(lang, p.likelihood)} → {fmtProb(lang, p.likelihood_after)}</li>)}
              </ul>
            </>
          )}
          {c.new_paths.length > 0 && (
            <>
              <h3 className="panel-title mt-3 mb-1 text-[13px]">{t('ui.rem.newPaths', { count: c.new_paths.length })}</h3>
              <ul className="flex flex-col gap-1 text-[13px] text-orange-200">
                {c.new_paths.map((p) => <li key={p.id}><span className="mono mr-1">{p.id}</span>{route(p.assets)} ({fmtProb(lang, p.likelihood)})</li>)}
              </ul>
            </>
          )}
        </section>
        <section>
          <h3 className="panel-title mb-1 text-[13px]">{t('ui.rem.perAsset')}</h3>
          {c.per_asset_delta.length ? (
            <table className="w-full text-[13px]" data-testid="asset-deltas">
              <thead><tr className="text-left text-ink-400"><th className="py-1 font-medium">{t('ui.form.asset')}</th><th className="font-medium">{t('ui.rem.before')}</th><th className="font-medium">{t('ui.rem.after')}</th><th className="font-medium">Δ</th></tr></thead>
              <tbody>
                {c.per_asset_delta.map((d) => (
                  <tr key={d.asset_id} className="border-t border-cyan/8">
                    <td className="py-1 text-ink-100" translate="no">{names[d.asset_id] ?? d.asset_id}</td>
                    <td className="num">{fmtScore(lang, d.before)}</td><td className="num">{fmtScore(lang, d.after)}</td>
                    <td className={`num ${d.delta < 0 ? 'text-secure' : 'text-critical'}`}>{fmtDelta(lang, d.delta)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="text-[13px] text-ink-400">{t('ui.common.none')}</p>}
          <h3 className="panel-title mt-3 mb-1 text-[13px]">{t('ui.overview.residual')}</h3>
          <ul className="flex flex-col gap-1 text-[13px] text-ink-200" data-testid="residual-list">
            {c.residual_exposure.map((id) => {
              const f = findings.get(id)
              return <li key={id}>• {f ? renderMessage(t, lang, f.message, names) : id}</li>
            })}
          </ul>
        </section>
      </div>
    </div>
  )
}

export function Remediation() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as Lang
  const [params, setParams] = useSearchParams()
  const twin = useCurrentTwin()
  const setRevision = useApp((s) => s.setRevision)
  const appScenario = useApp((s) => s.scenario)
  const foothold = useApp((s) => s.foothold)
  const scenario = (params.get('scenario') as ScenarioId | null) ?? appScenario
  const setScenario = useApp((s) => s.setScenario)
  const head = twin?.head_revision ?? null
  const recs = useRecommendations(scenario, head, ['lateral_movement', 'privilege_escalation'].includes(scenario) ? foothold : null)
  const remediations = useRemediations()
  const revisions = useRevisions()
  const invalidate = useInvalidateAll()
  const model = useModel(head)
  const names = useMemo(() => assetNames(model.data), [model.data])
  const cves = useMemo(() => vulnCves(model.data), [model.data])
  const [selected, setSelected] = useState<string[]>([])
  const [confirm, setConfirm] = useState(false)
  const [confirmRevert, setConfirmRevert] = useState<Rem | null>(null)
  const [shown, setShown] = useState<number | null>(null)

  // ?select=<recommendation id> from the Vulnerabilities page
  const pre = params.get('select')
  const [handledPre, setHandledPre] = useState<string | null>(null)
  if (pre && handledPre !== pre) {
    setHandledPre(pre)
    setSelected((s) => (s.includes(pre) ? s : [...s, pre]))
  }

  // ?compare=a,b from the no-path state
  const compareParam = params.get('compare')
  const [ca, cb] = (compareParam ?? '').split(',').map(Number)
  const compareQ = useQuery({
    queryKey: ['compare', twin?.id, ca, cb, scenario],
    queryFn: () => api.post<{ revision_a: number; revision_b: number; comparison: Comparison; result_a: SimResult; result_b: SimResult }>(
      `/twins/${twin?.id}/compare`, { scenario, revision_a: ca, revision_b: cb }),
    enabled: !!twin && !!ca && !!cb && ca !== cb,
  })
  const [pickA, setPickA] = useState<number>(1)
  const [pickB, setPickB] = useState<number | null>(null)

  const apply = useMutation({
    mutationFn: () => {
      const actions = (recs.data?.recommendations ?? []).filter((r) => selected.includes(r.id)).sort((a, b) => a.rank - b.rank).map((r) => r.action)
      return api.post<Rem>(`/twins/${twin?.id}/remediations/apply`, { actions, scenario, params: foothold && ['lateral_movement', 'privilege_escalation'].includes(scenario) ? { foothold } : {} })
    },
    onSuccess: (r) => {
      setConfirm(false)
      setSelected([])
      setRevision(null)
      setShown(r.id)
      setParams({}, { replace: true })
      void invalidate()
      toast.success(t('ui.rem.applied', { n: r.to_revision }), t('ui.rem.appliedBody', { a: fmtScore(lang, r.comparison.before.score), b: fmtScore(lang, r.comparison.after.score) }))
    },
    onError: (e) => { setConfirm(false); toast.error(t('ui.crud.failed'), errorText(t, e)) },
  })
  const revert = useMutation({
    mutationFn: (id: number) => api.post<{ revision: { number: number }; run: { score: number } }>(`/remediations/${id}/revert`),
    onSuccess: (r) => {
      setConfirmRevert(null)
      setRevision(null)
      void invalidate()
      toast.success(t('ui.rem.reverted', { n: r.revision.number }), t('ui.rem.revertedBody', { score: fmtScore(lang, r.run.score) }))
    },
    onError: (e) => { setConfirmRevert(null); toast.error(t('ui.crud.failed'), errorText(t, e)) },
  })

  const current = remediations.data?.find((r) => r.id === shown) ?? remediations.data?.[0]
  const beforeRun = useRun(current?.comparison.before.run_id ?? null)
  const afterRun = useRun(current?.comparison.after.run_id ?? null)
  const view: CompareView | null = compareQ.data
    ? { revA: compareQ.data.revision_a, revB: compareQ.data.revision_b, comparison: compareQ.data.comparison, resultA: compareQ.data.result_a, resultB: compareQ.data.result_b }
    : current ? { revA: current.from_revision, revB: current.to_revision, comparison: current.comparison, resultA: beforeRun.data?.result ?? null, resultB: afterRun.data?.result ?? null, remediation: current } : null

  const list = recs.data?.recommendations ?? []
  const chosen = list.filter((r) => selected.includes(r.id)).sort((a, b) => a.rank - b.rank)
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  return (
    <div className="grid min-h-full grid-cols-12 gap-3 pb-2" data-testid="page-remediation">
      <GlassPanel title={t('ui.rem.recommendations')} index={0} className="col-span-12 xl:col-span-5" testId="recs-panel">
        <div className="flex flex-col gap-3" data-tour="fix">
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <label className="flex items-center gap-2"><span className="text-ink-300">{t('ui.attack.scenario')}</span>
              <select className="field w-auto" value={scenario} onChange={(e) => { setScenario(e.target.value as ScenarioId); setParams({}, { replace: true }); setSelected([]) }} data-testid="rem-scenario">
                {SCENARIOS.map((s) => <option key={s} value={s}>{t(`scenario.${s}.name`)}</option>)}
              </select>
            </label>
            {recs.data && <span className="text-ink-300">r{recs.data.revision} · {t('ui.common.score')} <b className={`num text-[16px] ${scoreClass(recs.data.score)}`}>{fmtScore(lang, recs.data.score)}</b></span>}
          </div>
          <p className="text-[12.5px] text-ink-400">{t('ui.rem.intro')}</p>
          {recs.isLoading && <Loading rows={5} />}
          {recs.isError && <ErrorState error={recs.error} onRetry={() => void recs.refetch()} />}
          {recs.data && !list.length && <Empty icon={<ShieldCheck size={22} />}>{t('ai.plan_empty')}</Empty>}
          <ul className="flex flex-col gap-1.5" data-testid="rec-list">
            {list.map((r) => {
              const on = selected.includes(r.id)
              return (
                <li key={r.id}>
                  <button type="button" role="checkbox" aria-checked={on} onClick={() => toggle(r.id)} data-testid={`rec-${r.rank}`}
                    className={`flex w-full items-start gap-2.5 rounded-xl border p-2.5 text-left transition-colors ${on ? 'border-cyan/60 bg-cyan/10' : 'border-cyan/12 hover:border-cyan/35'}`}>
                    {on ? <CheckSquare size={18} className="mt-0.5 shrink-0 text-cyan" /> : <Square size={18} className="mt-0.5 shrink-0 text-ink-400" />}
                    <span className="num w-5 shrink-0 text-[16px] text-ink-300">{r.rank}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] leading-snug text-ink-100">{renderAction(t, lang, r.action, cves, names)}</span>
                      <span className="text-[11.5px] text-ink-400">{t(`ui.rem.kind.${r.kind}`)} · {t('ui.rem.standalone')} {fmtDelta(lang, r.standalone_delta)}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="num block text-[17px] text-secure">{fmtDelta(lang, r.delta_score)}</span>
                      <span className="text-[11px] text-ink-400">→ {fmtScore(lang, r.score_after)}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-ghost" disabled={!list.length} onClick={() => setSelected(list.slice(0, 3).map((r) => r.id))} data-testid="select-top3">{t('ui.rem.top3')}</button>
            <button type="button" className="btn-neon ml-auto" disabled={!chosen.length || apply.isPending} onClick={() => setConfirm(true)} data-testid="apply-button">
              <ShieldCheck size={16} /> {chosen.length ? t('ui.rem.apply', { count: chosen.length }) : t('ui.rem.applyNone')}
            </button>
          </div>
        </div>
      </GlassPanel>

      <GlassPanel title={compareQ.data ? t('ui.rem.compareTitle', { a: ca, b: cb }) : t('ui.rem.beforeAfter')} index={1} className="col-span-12 xl:col-span-7" testId="compare-panel"
        actions={compareParam && <button type="button" className="text-[12px] text-cyan underline" onClick={() => setParams({}, { replace: true })}>{t('ui.rem.showLatest')}</button>}>
        <div data-tour="compare">
          {compareQ.isLoading && <Loading rows={6} />}
          {compareQ.isError && <ErrorState error={compareQ.error} />}
          {!compareQ.isLoading && (view
            ? <CompareResult view={view} reverting={revert.isPending} onRevert={view.remediation ? () => setConfirmRevert(view.remediation ?? null) : undefined} />
            : <Empty>{t('ui.rem.noneYet')}</Empty>)}
          <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-cyan/10 pt-3 text-[13px]">
            <GitCompare size={16} className="mb-2 text-ink-400" />
            <label className="flex flex-col gap-1"><span className="text-ink-300">{t('ui.rem.compareA')}</span>
              <select className="field w-auto font-mono" value={pickA} onChange={(e) => setPickA(Number(e.target.value))}>
                {revisions.data?.map((r) => <option key={r.number} value={r.number}>r{r.number}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1"><span className="text-ink-300">{t('ui.rem.compareB')}</span>
              <select className="field w-auto font-mono" value={pickB ?? head ?? ''} onChange={(e) => setPickB(Number(e.target.value))}>
                {revisions.data?.map((r) => <option key={r.number} value={r.number}>r{r.number}</option>)}
              </select>
            </label>
            <button type="button" className="btn-ghost" disabled={pickA === (pickB ?? head)} data-testid="compare-button"
              onClick={() => setParams({ compare: `${pickA},${pickB ?? head}`, scenario })}>{t('ui.rem.compare')}</button>
          </div>
        </div>
      </GlassPanel>

      <GlassPanel title={t('ui.rem.history')} index={2} className="col-span-12">
        {remediations.isLoading ? <Loading /> : !remediations.data?.length ? <Empty>{t('ui.rem.noneYet')}</Empty> : (
          <ul className="flex flex-col gap-1.5 text-[13px]" data-testid="rem-history">
            {remediations.data.map((r) => (
              <li key={r.id} className={`flex flex-wrap items-center gap-2 rounded-lg px-2 py-1.5 ${r.id === current?.id && !compareQ.data ? 'bg-cyan/8' : ''}`}>
                <button type="button" className="mono text-cyan underline" onClick={() => { setShown(r.id); setParams({}, { replace: true }) }}>#{r.id}</button>
                <span className="text-ink-200">r{r.from_revision} → r{r.to_revision}</span>
                <span className="text-ink-300">{t(`scenario.${r.scenario}.name`)}</span>
                <span className="num text-[15px]">{fmtScore(lang, r.comparison.before.score)} → {fmtScore(lang, r.comparison.after.score)}</span>
                <span className="text-ink-400">{t('ui.rem.actionsCount', { count: r.actions.length })} · {fmtDateTime(lang, r.created_at)}</span>
                {r.reverted_by_revision !== null && <span className="chip text-ink-300">{t('ui.rem.revertedIn', { n: r.reverted_by_revision })}</span>}
              </li>
            ))}
          </ul>
        )}
      </GlassPanel>

      <ConfirmDialog open={confirm} title={t('ui.rem.confirmTitle')} confirmLabel={t('ui.rem.apply', { count: chosen.length })} busy={apply.isPending}
        onClose={() => setConfirm(false)} onConfirm={() => apply.mutate()} testId="apply-dialog">
        <p>{t('ui.rem.confirmBody', { n: (head ?? 0) + 1 })}</p>
        <ol className="mt-2 list-decimal pl-5">{chosen.map((r) => <li key={r.id}>{renderAction(t, lang, r.action, cves, names)}</li>)}</ol>
      </ConfirmDialog>
      <ConfirmDialog open={!!confirmRevert} danger title={t('ui.rem.revert')} confirmLabel={t('ui.rem.revert')} busy={revert.isPending}
        onClose={() => setConfirmRevert(null)} onConfirm={() => confirmRevert && revert.mutate(confirmRevert.id)} testId="revert-dialog">
        {confirmRevert && t('ui.rem.revertBody', { from: confirmRevert.from_revision, n: (head ?? 0) + 1 })}
      </ConfirmDialog>
    </div>
  )
}
