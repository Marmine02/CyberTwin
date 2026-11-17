import { AlertTriangle, Play, ShieldAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useExplanation } from '../api/ai'
import { useLatestRun, useModel, useRunSimulation, useRuns, useViewedRevision } from '../api/hooks'
import { SCENARIOS, ZONES, type Finding, type Run, type ScenarioId, type Zone } from '../api/types'
import { TopologyMap } from '../components/map/TopologyMap'
import { AreaChart } from '../components/ui/AreaChart'
import { CountUp } from '../components/ui/CountUp'
import { GlassPanel } from '../components/ui/GlassPanel'
import { RingGauge } from '../components/ui/RingGauge'
import { Empty, ErrorState, Loading } from '../components/ui/States'
import type { Lang } from '../i18n'
import { fmtPct, fmtScore } from '../i18n/format'
import { renderMessage } from '../i18n/messages'
import { SEVERITIES, assetNames, hardeningByGroup, severityCounts } from '../lib/model'

const SEV_CLASS = { critical: 'neon-text-critical', high: 'neon-text-warning', medium: 'neon-text-medium', low: 'neon-text-cyan' } as const
const SEV_BAR = { critical: '#f43f5e', high: '#fb923c', medium: '#facc15', low: '#22d3ee' } as const

function scoreClass(score: number): string {
  if (score >= 80) return 'neon-text-secure'
  if (score >= 50) return 'neon-text-medium'
  return 'neon-text-critical'
}

function RunButton({ scenario, small }: { scenario: ScenarioId; small?: boolean }) {
  const { t } = useTranslation()
  const rev = useViewedRevision()
  const run = useRunSimulation()
  return (
    <button type="button" className={small ? 'grid h-8 w-8 shrink-0 place-items-center rounded-full border border-cyan/40 text-cyan hover:bg-cyan/15 disabled:opacity-40' : 'btn-neon'}
      disabled={run.isPending || rev === null} onClick={() => run.mutate({ scenario, revision: rev })}
      aria-label={t('ui.overview.runScenario', { scenario: t(`scenario.${scenario}.name`) })}
      data-testid={`run-${scenario}`}>
      <Play size={small ? 14 : 16} className={small ? 'translate-x-[1px]' : ''} />
      {!small && t('ui.overview.runNow')}
    </button>
  )
}

function CriticalFindings({ run, names }: { run: Run; names: Record<string, string> }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as Lang
  const items = run.result.findings.filter((f) => f.used && (f.severity === 'critical' || f.severity === 'high')).slice(0, 4)
  if (!items.length) return <Empty icon={<ShieldAlert size={22} />}>{t('ui.overview.noCriticalFindings')}</Empty>
  return (
    <ul className="flex flex-col divide-y divide-cyan/10">
      {items.map((f: Finding) => (
        <li key={f.id} className="flex items-start gap-3 py-2">
          <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full border ${f.severity === 'critical' ? 'border-critical/50 bg-critical/10 text-critical anim-pulse' : 'border-warning/50 bg-warning/10 text-warning'}`}>
            <AlertTriangle size={15} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] leading-snug text-ink-100">{renderMessage(t, lang, f.message, names)}</div>
            <div className="text-[11.5px] text-ink-400">{t(`severity.${f.severity}`)} · {t(`findingKind.${f.kind}`)} · <span className="mono">{f.paths.join(', ')}</span></div>
          </div>
        </li>
      ))}
    </ul>
  )
}

function SeverityPanel({ run }: { run: Run }) {
  const { t } = useTranslation()
  const counts = severityCounts(run.result.findings)
  const max = Math.max(1, ...SEVERITIES.map((s) => counts[s]))
  const total = run.result.findings.length
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="grid grid-cols-4 gap-2">
        {SEVERITIES.map((s) => (
          <div key={s} className="min-w-0">
            <CountUp value={counts[s]} format={(v) => String(Math.round(v))} className={`num block text-[30px] leading-none ${SEV_CLASS[s]}`} testId={`sev-${s}`} />
            <div className="truncate text-[12.5px] text-ink-300">{t(`severity.${s}`)}</div>
          </div>
        ))}
      </div>
      <div className="flex min-h-[70px] flex-1 items-end gap-2" aria-hidden="true">
        {SEVERITIES.map((s) => (
          <div key={s} className="flex h-full flex-1 items-end rounded-full bg-cyan/6">
            <div className="w-full origin-bottom rounded-full transition-transform duration-700"
              style={{ height: '100%', transform: `scaleY(${counts[s] / max})`, background: `linear-gradient(180deg, ${SEV_BAR[s]}, #c084fc)`, boxShadow: `0 0 14px ${SEV_BAR[s]}88` }} />
          </div>
        ))}
      </div>
      <div className="text-[12px] text-ink-400">{t('ui.overview.totalFindings', { count: total })}</div>
    </div>
  )
}

function ScenarioCoverage() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as Lang
  const rev = useViewedRevision()
  const runs = useRuns()
  const latest = useMemo(() => {
    const m = new Map<ScenarioId, number>()
    for (const r of runs.data ?? []) if (r.revision === rev && !m.has(r.scenario)) m.set(r.scenario, r.score)
    return m
  }, [runs.data, rev])
  return (
    <ul className="flex flex-col gap-2" data-tour="scenarios">
      {SCENARIOS.map((s) => {
        const score = latest.get(s)
        return (
          <li key={s} className="flex items-center gap-2.5">
            <RunButton scenario={s} small />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] leading-tight text-ink-100">{t(`scenario.${s}.name`)}</div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-cyan/8">
                {score !== undefined && (
                  <div className="h-full origin-left rounded-full transition-transform duration-700"
                    style={{ transform: `scaleX(${score / 100})`, background: 'linear-gradient(90deg, #c084fc, #22d3ee)', boxShadow: '0 0 8px #22d3ee' }} />
                )}
              </div>
            </div>
            <span className={`num w-12 shrink-0 text-right text-[16px] ${score === undefined ? 'text-ink-400' : scoreClass(score)}`}
              title={score === undefined ? t('ui.overview.notRun') : undefined}>
              {score === undefined ? '—' : fmtScore(lang, score)}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

function Hardening() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as Lang
  const model = useModel()
  const groups = hardeningByGroup(model.data)
  const colors: Record<string, [string, string]> = { servers: ['#22d3ee', '#67e8f9'], endpoints: ['#c084fc', '#e879f9'], network: ['#e879f9', '#22d3ee'] }
  return (
    <ul className="flex flex-col gap-2.5">
      {(['servers', 'endpoints', 'network'] as const).map((g) => {
        const v = groups[g]
        return (
          <li key={g} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[13px] text-ink-200">{t(`ui.overview.hg.${g}`)}</div>
              <div className="num text-[22px] leading-none text-ink-100">{v === null ? '—' : fmtPct(lang, v)}</div>
            </div>
            <RingGauge value={v ?? 0} size={52} stroke={5} color={colors[g]?.[0]} color2={colors[g]?.[1]} label={`${t(`ui.overview.hg.${g}`)} ${v === null ? '' : fmtPct(lang, v)}`}>
              <span className="num text-[12px] text-ink-200">{v === null ? '—' : fmtPct(lang, v)}</span>
            </RingGauge>
          </li>
        )
      })}
    </ul>
  )
}

function AiBrief({ run }: { run: Run }) {
  const { t, i18n } = useTranslation()
  const ex = useExplanation(run.id, i18n.language)
  if (ex.status === 'error') return <ErrorState error={ex.error} />
  if (ex.status === 'loading' && !ex.summary.length) return <Loading rows={3} />
  return (
    <div className="flex flex-col gap-2 text-[13.5px] leading-relaxed text-ink-200" data-testid="ai-brief">
      <span className="chip w-fit border-violet/40 bg-violet/10 text-violet">{t('ui.overview.aiMode', { mode: t(`ai.mode.${ex.mode ?? 'template'}`) })}</span>
      {ex.summary.map((s, i) => <p key={i}>{s}</p>)}
    </div>
  )
}

export function Overview() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as Lang
  const model = useModel()
  const latest = useLatestRun(null)
  const runs = useRuns()
  const [zone, setZone] = useState<Zone | null>(null)
  const run = latest.data ?? null
  const names = useMemo(() => assetNames(model.data), [model.data])
  const history = useMemo(() => {
    const list = (runs.data ?? []).slice(0, 14).reverse()
    return list.map((r) => ({
      label: `r${r.revision}`, value: r.score,
      title: `#${r.id} · r${r.revision} · ${t(`scenario.${r.scenario}.name`)} · ${fmtScore(lang, r.score)}`,
    }))
  }, [runs.data, lang, t])

  return (
    <div className="grid min-h-full grid-cols-12 gap-3 pb-2" data-testid="page-overview">
      {/* topology */}
      <GlassPanel title={t('ui.overview.topology')} to="/map" index={0} className="col-span-12 min-h-[520px] xl:col-span-8 xl:row-span-3"
        bodyClassName="flex flex-col" testId="panel-topology"
        actions={run && <span className="chip hidden truncate text-ink-200 sm:inline-flex">{t(`scenario.${run.scenario}.name`)} · r{run.revision}</span>}>
        <div className="relative min-h-[400px] flex-1 overflow-hidden rounded-xl" data-tour="map">
          {model.isLoading && <Loading rows={6} />}
          {model.isError && <ErrorState error={model.error} onRetry={() => void model.refetch()} />}
          {model.data && (
            <TopologyMap model={model.data} result={run?.result} pathId={run?.result.primary_path} zone={zone}
              ariaLabel={t('ui.overview.topology')} />
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="max-w-xl text-[12px] text-ink-400">{t('ui.overview.topologyHint')}</p>
          <div className="flex items-center gap-2" role="radiogroup" aria-label={t('ui.overview.zoneAll')}>
            <button type="button" role="radio" aria-checked={zone === null} aria-label={t('ui.overview.zoneAll')} title={t('ui.overview.zoneAll')}
              onClick={() => setZone(null)}
              className={`h-2.5 w-2.5 rounded-full transition-transform hover:scale-125 ${zone === null ? 'bg-cyan shadow-[0_0_8px_#22d3ee]' : 'bg-ink-400'}`} />
            {ZONES.map((z) => (
              <button key={z} type="button" role="radio" aria-checked={zone === z} title={t(`zone.${z}`)}
                aria-label={t('ui.overview.zoneDot', { zone: t(`zone.${z}`) })} data-testid={`zone-${z}`}
                onClick={() => setZone(z)}
                className={`h-2.5 w-2.5 rounded-full transition-transform hover:scale-125 ${zone === z ? 'bg-cyan shadow-[0_0_8px_#22d3ee]' : 'bg-ink-400'}`} />
            ))}
            <span className="ml-1 min-w-[5rem] text-[12px] text-ink-300">{zone ? t(`zone.${zone}`) : t('ui.overview.zoneAll')}</span>
          </div>
        </div>
      </GlassPanel>

      {/* right column */}
      <GlassPanel title={t('ui.overview.criticalFindings')} to="/vulnerabilities" index={1} variant="violet" className="col-span-12 md:col-span-6 xl:col-span-4" testId="panel-critical">
        {latest.isLoading ? <Loading /> : latest.isError ? <ErrorState error={latest.error} onRetry={() => void latest.refetch()} /> : run ? <CriticalFindings run={run} names={names} /> : <Empty action={<RunButton scenario="sensitive_data_exposure" />}>{t('ui.overview.noRun')}</Empty>}
      </GlassPanel>
      <GlassPanel title={t('ui.overview.posture')} to="/reports" index={2} variant="violet" className="col-span-12 md:col-span-6 xl:col-span-4" testId="panel-posture">
        {run ? (
          <div className="flex flex-col gap-2">
            <div className="text-[20px] font-display font-semibold text-ink-100">
              {t('ui.overview.postureOverall')}{' '}
              <CountUp value={run.score} format={(v) => fmtScore(lang, v)} className={`num ${scoreClass(run.score)}`} testId="overview-score" />
              <span className="ml-1 text-[14px] text-ink-400">{t('ui.common.outOf100')}</span>
            </div>
            <div className="h-[92px]">
              {history.length > 1
                ? <AreaChart points={history} ariaLabel={t('ui.overview.postureHistory')} />
                : <p className="pt-6 text-[12.5px] text-ink-400">{t('ui.overview.postureOne')}</p>}
            </div>
            {history.length > 1 && (
              <div className="flex justify-between gap-1 text-[11px] text-ink-400">
                <span>{t('ui.overview.postureHistory')}</span>
                <span className="mono">{history[0]?.label} → {history[history.length - 1]?.label}</span>
              </div>
            )}
          </div>
        ) : latest.isLoading ? <Loading /> : <Empty>{t('ui.overview.postureEmpty')}</Empty>}
      </GlassPanel>
      <GlassPanel title={t('ui.overview.blastRadius')} to="/attack" index={3} className="col-span-12 md:col-span-6 xl:col-span-4" testId="panel-blast">
        {run ? (
          <div className="flex items-center gap-4">
            <RingGauge value={run.result.compromised_pct} size={92} stroke={8} color="#f43f5e" color2="#e879f9"
              label={`${fmtPct(lang, run.result.compromised_pct)} ${t('ui.overview.blastCompromised')}`}>
              <span className="num text-[22px] neon-text-critical">{fmtPct(lang, run.result.compromised_pct)}</span>
            </RingGauge>
            <div className="min-w-0 text-[13px] text-ink-200">
              <div><span className="num text-[22px] text-ink-100">{run.result.compromised_assets.length}</span> {t('ui.overview.blastCompromised')}</div>
              <div><span className="num text-[18px] text-ink-100">{run.result.reachable_assets.length}</span> {t('ui.overview.blastReachable')}</div>
            </div>
          </div>
        ) : latest.isLoading ? <Loading /> : <Empty>{t('ui.overview.noRun')}</Empty>}
      </GlassPanel>

      {/* bottom row */}
      <GlassPanel title={t('ui.overview.findingsBySeverity')} to="/vulnerabilities" index={4} className="col-span-12 md:col-span-6 xl:col-span-3" testId="panel-severity">
        {run ? <SeverityPanel run={run} /> : latest.isLoading ? <Loading /> : <Empty>{t('ui.overview.noRun')}</Empty>}
      </GlassPanel>
      <GlassPanel title={t('ui.overview.scenarioCoverage')} to="/attack" index={5} className="col-span-12 md:col-span-6 xl:col-span-3" testId="panel-scenarios">
        <ScenarioCoverage />
      </GlassPanel>
      <GlassPanel title={t('ui.overview.hardening')} to="/assets" index={6} className="col-span-12 md:col-span-6 xl:col-span-3" testId="panel-hardening">
        <Hardening />
      </GlassPanel>
      <GlassPanel title={t('ui.overview.aiBrief')} to="/assistant" index={7} variant="violet" className="col-span-12 md:col-span-6 xl:col-span-3" testId="panel-ai">
        {run ? <AiBrief run={run} /> : latest.isLoading ? <Loading /> : <Empty>{t('ui.overview.noRun')}</Empty>}
      </GlassPanel>
      <GlassPanel title={t('ui.overview.residual')} to="/remediation" index={8} className="col-span-12" testId="panel-residual">
        {run ? (
          run.result.residual_exposure.length ? (
            <ul className="grid gap-x-6 gap-y-1.5 text-[13px] text-ink-200 md:grid-cols-2">
              {run.result.residual_exposure.map((id) => {
                const f = run.result.findings.find((x) => x.id === id)
                return f ? (
                  <li key={id} className="flex items-start gap-2">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: SEV_BAR[f.severity], boxShadow: `0 0 6px ${SEV_BAR[f.severity]}` }} />
                    <span>{renderMessage(t, lang, f.message, names)}</span>
                  </li>
                ) : null
              })}
            </ul>
          ) : <p className="text-sm text-ink-300">{t('ai.residual_none')}</p>
        ) : <Empty>{t('ui.overview.noRun')}</Empty>}
      </GlassPanel>
    </div>
  )
}
