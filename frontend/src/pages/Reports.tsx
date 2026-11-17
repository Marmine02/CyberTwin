import { useQuery } from '@tanstack/react-query'
import { Download, ExternalLink, Printer } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { API, api } from '../api/client'
import { useRevisions, useRuns } from '../api/hooks'
import type { Diff } from '../api/types'
import { GlassPanel } from '../components/ui/GlassPanel'
import { Empty, ErrorState, Loading } from '../components/ui/States'
import type { Lang } from '../i18n'
import { fmtDateTime, fmtScore } from '../i18n/format'
import { noteText } from '../lib/notes'
import { useApp } from '../store/app'

const COLLS = ['assets', 'connections', 'principals', 'firewall_rules', 'vulnerabilities'] as const

function short(v: unknown): string {
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  return s.length > 140 ? `${s.slice(0, 137)}…` : s
}

function DiffView({ twinId, number }: { twinId: number; number: number }) {
  const { t } = useTranslation()
  const q = useQuery({
    queryKey: ['diff', twinId, number],
    queryFn: () => api.get<{ from: number | null; to: number; diff: Diff }>(`/twins/${twinId}/revisions/${number}/diff`),
  })
  if (q.isLoading) return <Loading rows={3} />
  if (q.isError) return <ErrorState error={q.error} />
  const d = q.data
  if (!d || d.from === null) return <p className="text-[13px] text-ink-300">{t('ui.reports.initial')}</p>
  const parts = COLLS.filter((c) => d.diff[c])
  return (
    <div className="flex flex-col gap-3 text-[13px]" data-testid="diff-view">
      <p className="text-ink-300">{t('ui.reports.diffIntro', { a: d.from, b: d.to, count: d.diff.summary.changes })}</p>
      {parts.map((c) => {
        const cd = d.diff[c]
        if (!cd) return null
        return (
          <section key={c}>
            <h4 className="mb-1 font-semibold text-ink-100">{t(`ui.assetsPage.${c === 'firewall_rules' ? 'rules' : c === 'vulnerabilities' ? 'vulns' : c}`)}</h4>
            <ul className="flex flex-col gap-1">
              {cd.added.map((id) => <li key={`a${id}`} className="text-secure">+ <span className="mono">{id}</span></li>)}
              {cd.removed.map((id) => <li key={`r${id}`} className="text-critical">− <span className="mono">{id}</span></li>)}
              {Object.entries(cd.changed).map(([id, fields]) => (
                <li key={`c${id}`} className="text-ink-200">~ <span className="mono">{id}</span>
                  <ul className="ml-5">
                    {fields.map((f) => (
                      <li key={f.field} className="break-words">
                        <span className="text-ink-400">{t(`ui.field.${f.field}`)}:</span>{' '}
                        {/* values are model data, shown as stored */}
                        <s className="mono text-rose-300" translate="no">{short(f.before)}</s> → <span className="mono text-emerald-300" translate="no">{short(f.after)}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
      {d.diff.policy && <p className="text-ink-200">{t('ui.reports.policyChanged')}</p>}
    </div>
  )
}

export function Reports() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as Lang
  const twinId = useApp((s) => s.twinId)
  const runs = useRuns()
  const revisions = useRevisions()
  const [params] = useSearchParams()
  const [runId, setRunId] = useState<number | null>(params.get('run') ? Number(params.get('run')) : null)
  const [rev, setRev] = useState<number | null>(null)
  const frame = useRef<HTMLIFrameElement>(null)
  const selected = runId ?? runs.data?.[0]?.id ?? null
  const selectedRev = rev ?? revisions.data?.[0]?.number ?? null
  const htmlUrl = selected ? `${API}/reports/runs/${selected}/html?lang=${lang}` : null
  const jsonUrl = selected ? `${API}/reports/runs/${selected}?lang=${lang}` : null

  return (
    <div className="grid min-h-full grid-cols-12 gap-3 pb-2" data-testid="page-reports">
      <GlassPanel title={t('ui.reports.runs')} index={0} className="col-span-12 xl:col-span-4" bodyClassName="max-h-[520px] overflow-y-auto">
        {runs.isLoading && <Loading rows={5} />}
        {runs.isError && <ErrorState error={runs.error} onRetry={() => void runs.refetch()} />}
        {runs.data && !runs.data.length && <Empty>{t('ui.reports.noRuns')}</Empty>}
        <ul className="flex flex-col gap-1" data-testid="run-history">
          {runs.data?.map((r) => (
            <li key={r.id}>
              <button type="button" aria-pressed={selected === r.id} onClick={() => setRunId(r.id)}
                className={`grid w-full grid-cols-[auto_1fr_auto] items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] ${selected === r.id ? 'bg-cyan/12 ring-1 ring-cyan/40' : 'hover:bg-cyan/6'}`}>
                <span className="mono text-ink-400">#{r.id}</span>
                <span className="min-w-0"><span className="block truncate text-ink-100">{t(`scenario.${r.scenario}.name`)}</span>
                  <span className="text-[11.5px] text-ink-400">r{r.revision} · {fmtDateTime(lang, r.created_at)}</span></span>
                <span className="num text-[16px] text-ink-100">{fmtScore(lang, r.score)}</span>
              </button>
            </li>
          ))}
        </ul>
      </GlassPanel>

      <GlassPanel title={t('ui.reports.report')} index={1} className="col-span-12 xl:col-span-8"
        actions={htmlUrl && (
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className="btn-ghost" onClick={() => frame.current?.contentWindow?.print()} data-testid="print-report"><Printer size={15} /> {t('ui.reports.print')}</button>
            <a className="btn-ghost" href={htmlUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} /> {t('ui.reports.open')}</a>
            {jsonUrl && <a className="btn-ghost" href={jsonUrl} download={`cybertwin-run-${selected}-${lang}.json`}><Download size={15} /> JSON</a>}
          </div>
        )}>
        {htmlUrl ? (
          <iframe ref={frame} key={htmlUrl} src={htmlUrl} title={t('ui.reports.report')} data-testid="report-frame"
            className="h-[520px] w-full rounded-xl border border-cyan/15 bg-white" />
        ) : <Empty>{t('ui.reports.noRuns')}</Empty>}
      </GlassPanel>

      <GlassPanel title={t('ui.reports.revisions')} index={2} className="col-span-12">
        {revisions.isLoading ? <Loading /> : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,320px)_1fr]">
            <ul className="flex flex-col gap-1" data-testid="revision-list">
              {revisions.data?.map((r) => (
                <li key={r.number}>
                  <button type="button" aria-pressed={selectedRev === r.number} onClick={() => setRev(r.number)}
                    className={`w-full rounded-lg px-2 py-1.5 text-left text-[13px] ${selectedRev === r.number ? 'bg-cyan/12 ring-1 ring-cyan/40' : 'hover:bg-cyan/6'}`}>
                    <span className="mono mr-2 text-cyan">r{r.number}</span>
                    <span className="text-ink-100">{noteText(t, r.note)}</span>
                    <span className="block text-[11.5px] text-ink-400">{t(`ui.reports.kind.${r.kind}`)} · {t('ui.reports.changes', { count: r.changes })} · {fmtDateTime(lang, r.created_at)}</span>
                  </button>
                </li>
              ))}
            </ul>
            {twinId && selectedRev !== null && <DiffView twinId={twinId} number={selectedRev} />}
          </div>
        )}
      </GlassPanel>
    </div>
  )
}
