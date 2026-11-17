import { Play, Wrench } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { useLatestRun, useModel, useRunSimulation, useViewedRevision } from '../api/hooks'
import type { Chokepoint, Finding, Severity } from '../api/types'
import { GlassPanel } from '../components/ui/GlassPanel'
import { Empty, ErrorState, Loading } from '../components/ui/States'
import type { Lang } from '../i18n'
import { fmtDelta, fmtNumber } from '../i18n/format'
import { renderMessage } from '../i18n/messages'
import { assetNames } from '../lib/model'
import { useApp } from '../store/app'

const SEV: Record<Severity, string> = { critical: 'text-critical', high: 'text-warning', medium: 'text-medium', low: 'text-cyan' }

function deltaFor(f: Finding, chokepoints: Chokepoint[]): Chokepoint | undefined {
  return chokepoints.find((c) => c.finding_ids.includes(f.id))
}

export function Vulnerabilities() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as Lang
  const navigate = useNavigate()
  const scenario = useApp((s) => s.scenario)
  const viewed = useViewedRevision()
  const model = useModel()
  const latest = useLatestRun(null)
  const runSim = useRunSimulation()
  const run = latest.data
  const names = useMemo(() => assetNames(model.data), [model.data])

  const rows = useMemo(() => {
    if (!run) return { vulns: [], other: [] }
    const cps = run.result.chokepoints
    const all = run.result.findings.map((f) => ({ f, cp: deltaFor(f, cps) }))
    const sort = (a: { f: Finding; cp?: Chokepoint }, b: { f: Finding; cp?: Chokepoint }) =>
      (b.cp?.delta_score ?? 0) - (a.cp?.delta_score ?? 0) || b.f.paths.length - a.f.paths.length || a.f.id.localeCompare(b.f.id)
    return { vulns: all.filter((x) => x.f.kind === 'vulnerability').sort(sort), other: all.filter((x) => x.f.kind !== 'vulnerability').sort(sort) }
  }, [run])

  const fix = (cp: Chokepoint) => navigate(`/remediation?select=${encodeURIComponent(cp.id)}&scenario=${run?.scenario ?? scenario}`)

  const table = (items: { f: Finding; cp?: Chokepoint }[], withCvss: boolean, testId: string) => (
    <div className="overflow-x-auto rounded-xl border border-cyan/12">
      <table className="w-full min-w-[760px] text-[13px]" data-testid={testId}>
        <thead>
          <tr className="bg-ink-950/50 text-left text-ink-300">
            <th scope="col" className="px-3 py-2 font-medium">{t('ui.vulns.finding')}</th>
            {withCvss && <th scope="col" className="px-3 py-2 font-medium">CVSS</th>}
            <th scope="col" className="px-3 py-2 font-medium">{t('report.severity')}</th>
            <th scope="col" className="px-3 py-2 font-medium">{t('ui.vulns.paths')}</th>
            <th scope="col" className="px-3 py-2 font-medium">{t('ui.vulns.delta')}</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">{t('ui.table.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {items.map(({ f, cp }) => (
            <tr key={f.id} className="border-t border-cyan/8 hover:bg-cyan/4" data-testid={`finding-${f.id}`}>
              <td className="px-3 py-2 text-ink-100">
                {renderMessage(t, lang, f.message, names)}
                {!f.used && <span className="ml-2 chip text-ink-400">{t('ui.vulns.residual')}</span>}
              </td>
              {withCvss && <td className="px-3 py-2 num text-[15px]">{fmtNumber(lang, Number(f.message.params.cvss ?? 0), 1)}</td>}
              <td className={`px-3 py-2 font-semibold ${SEV[f.severity]}`}>{t(`severity.${f.severity}`)}</td>
              <td className="px-3 py-2 mono text-ink-200">{f.paths.length ? f.paths.join(', ') : '—'}</td>
              <td className="px-3 py-2 num text-[15px] text-secure">{cp ? fmtDelta(lang, cp.delta_score) : '—'}</td>
              <td className="px-3 py-1.5 text-right">
                {cp ? (
                  <button type="button" className="btn-ghost" onClick={() => fix(cp)} data-testid={`fix-${f.id}`}><Wrench size={14} /> {t('ui.vulns.fix')}</button>
                ) : <span className="text-[12px] text-ink-400">{f.fix ? t('ui.vulns.noGain') : t('ui.vulns.noAction')}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  return (
    <div className="flex flex-col gap-3" data-testid="page-vulns">
      <GlassPanel title={t('ui.nav.vulns')} index={0}
        actions={run && <span className="chip text-ink-200">{t(`scenario.${run.scenario}.name`)} · r{run.revision}</span>}>
        {(latest.isLoading || model.isLoading) && <Loading rows={5} />}
        {latest.isError && <ErrorState error={latest.error} onRetry={() => void latest.refetch()} />}
        {!latest.isLoading && !run && (
          <Empty action={<button type="button" className="btn-neon" disabled={runSim.isPending || !viewed} onClick={() => runSim.mutate({ scenario, revision: viewed })}>
            <Play size={15} /> {t('ui.overview.runScenario', { scenario: t(`scenario.${scenario}.name`) })}</button>}>
            {t('ui.vulns.noRun')}
          </Empty>
        )}
        {run && (
          <div className="flex flex-col gap-2">
            <p className="text-[12.5px] text-ink-400">{t('ui.vulns.intro')}</p>
            {rows.vulns.length ? table(rows.vulns, true, 'vuln-table') : <Empty>{t('ui.vulns.none')}</Empty>}
          </div>
        )}
      </GlassPanel>
      {run && (
        <GlassPanel title={t('ui.vulns.misconfigs')} index={1}>
          {rows.other.length ? table(rows.other, false, 'misconfig-table') : <Empty>{t('ui.vulns.noneOther')}</Empty>}
        </GlassPanel>
      )}
    </div>
  )
}
