import { useMutation } from '@tanstack/react-query'
import {
  Bot, ChevronLeft, ChevronRight, ClipboardList, GitCompare, Pause, Play, RotateCcw, ShieldCheck, Swords, Wrench,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { api } from '../api/client'
import {
  useCurrentTwin, useInvalidateAll, useLatestRun, useModel, useRemediations, useRevisions, useRunSimulation, useViewedRevision,
} from '../api/hooks'
import { ASSET_TYPES, SCENARIOS, type AssetType, type Run, type ScenarioId, type Twin } from '../api/types'
import { TopologyMap } from '../components/map/TopologyMap'
import { ConfirmDialog } from '../components/ui/Dialog'
import { GlassPanel } from '../components/ui/GlassPanel'
import { RingGauge } from '../components/ui/RingGauge'
import { Empty, ErrorState, Loading } from '../components/ui/States'
import type { Lang } from '../i18n'
import { fmtPct, fmtProb, fmtScore } from '../i18n/format'
import { renderAction, renderMessage } from '../i18n/messages'
import { errorText } from '../lib/errors'
import { assetNames, vulnCves } from '../lib/model'
import { discoveryFrames, primaryFrames, stepMs, type Frame } from '../lib/replay'
import { useApp } from '../store/app'
import { toast } from '../store/toast'

const FOOTHOLD = new Set<ScenarioId>(['lateral_movement', 'privilege_escalation'])
const SPEEDS = [1, 2, 4] as const

function NoPath({ run, twin }: { run: Run; twin: Twin }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as Lang
  const navigate = useNavigate()
  const model = useModel()
  const remediations = useRemediations()
  const setRevision = useApp((s) => s.setRevision)
  const setTwin = useApp((s) => s.setTwin)
  const invalidate = useInvalidateAll()
  const runSim = useRunSimulation()
  const [confirmReset, setConfirmReset] = useState(false)
  const reset = useMutation({
    mutationFn: () => api.post<Twin>('/demo/reset'),
    onSuccess: (tw) => { setTwin(tw.id); void invalidate(); setConfirmReset(false); toast.success(t('ui.attack.resetDone')) },
    onError: (e) => toast.error(t('ui.crud.failed'), errorText(t, e)),
  })
  const names = assetNames(model.data)
  const cves = vulnCves(model.data)
  // Fixes that lead to this revision and are not reverted.
  const fixes = (remediations.data ?? []).filter((r) => r.to_revision <= run.revision && r.reverted_by_revision === null)
  const latestFix = fixes[0]
  // Patched vulnerabilities no longer exist in the fixed revision: name them from the revision before the fix.
  const beforeFix = useModel(latestFix?.from_revision ?? null)
  const fixCves = vulnCves(beforeFix.data)
  const params = run.result.no_path?.params ?? {}
  return (
    <div className="flex flex-col gap-3 text-[14px] text-ink-200" data-testid="no-path">
      <div className="flex items-start gap-3">
        <ShieldCheck size={34} className="shrink-0 text-secure" style={{ filter: 'drop-shadow(0 0 8px #34d399)' }} />
        <div>
          <h3 className="font-display text-[22px] font-bold text-ink-100">{t('ui.attack.noPathTitle')}</h3>
          <p>{t('no_path.unreachable', { entry: names[String(params.entry)] ?? String(params.entry ?? '') })}</p>
          <p className="mt-1 text-ink-300">{t('ui.attack.noPathScore', { score: fmtScore(lang, run.result.score), rev: run.revision })}</p>
        </div>
      </div>
      {latestFix ? (
        <div className="rounded-xl border border-secure/30 bg-secure/6 p-3">
          <div className="mb-1 font-semibold text-emerald-200">{t('ui.attack.becauseFixes', { rev: latestFix.to_revision })}</div>
          <ul className="list-disc pl-5">
            {latestFix.actions.map((a, i) => <li key={i}>{renderAction(t, lang, a, { ...cves, ...fixCves }, names)}</li>)}
          </ul>
        </div>
      ) : <p className="text-ink-300">{t('ui.attack.noPathNoFixes')}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-neon" data-testid="run-on-r1" disabled={runSim.isPending}
          onClick={() => { setRevision(1); runSim.mutate({ scenario: run.scenario, revision: 1, foothold: run.params.foothold ?? null }) }}>
          <Play size={15} /> {t('ui.attack.runOn', { rev: 1 })}
        </button>
        <button type="button" className="btn-ghost" data-testid="compare-r1" disabled={run.revision <= 1}
          onClick={() => navigate(`/remediation?compare=1,${run.revision}&scenario=${run.scenario}`)}>
          <GitCompare size={15} /> {t('ui.attack.compareRevs', { a: 1, b: run.revision })}
        </button>
        <button type="button" className="btn-ghost btn-danger" data-testid="reset-demo" onClick={() => setConfirmReset(true)}>
          <RotateCcw size={15} /> {t('ui.attack.resetDemo')}
        </button>
      </div>
      <ConfirmDialog open={confirmReset} danger title={t('ui.attack.resetDemo')} confirmLabel={t('ui.attack.resetConfirm')}
        busy={reset.isPending} onClose={() => setConfirmReset(false)} onConfirm={() => reset.mutate()} testId="reset-dialog">
        {t('ui.attack.resetBody', { twin: twin.name })}
      </ConfirmDialog>
    </div>
  )
}

function Narration({ frame, run, names }: { frame: Frame; run: Run; names: Record<string, string> }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as Lang
  const findings = new Map(run.result.findings.map((f) => [f.id, f]))
  if (frame.step) {
    const s = frame.step
    const who = names[frame.attackerAt] ?? frame.attackerAt
    const vulnCve = s.vuln_id ? run.result.findings.find((f) => f.id === `vuln:${s.vuln_id}`)?.message.params.cve : null
    const vuln = typeof vulnCve === 'string' ? vulnCve : null
    const why = s.finding_ids.map((f) => findings.get(f)).filter((f) => !!f)
    return (
      <div className="flex flex-col gap-1.5 text-[13px]" data-testid="narration">
        <div className="flex flex-wrap items-center gap-2">
          <span className="chip border-critical/40 bg-critical/10 text-rose-200 mono">{s.id}</span>
          <span className="font-display text-[17px] font-semibold text-ink-100">{t(`technique.${s.technique}`)}</span>
          <span className="ml-auto num text-[18px] neon-text-critical" title={t('ui.attack.p')}>{fmtProb(lang, s.p)}</span>
        </div>
        <p className="text-[14px] leading-snug text-ink-100">{renderMessage(t, lang, s.message, names)}</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-ink-300">
          <dt>{t('ui.attack.who')}</dt><dd className="text-ink-200">{t('ui.attack.attackerAt', { asset: who })}</dd>
          {(s.port || vuln) && <><dt>{t('ui.attack.portVuln')}</dt><dd className="mono text-ink-200">{[s.port ? `${t('ui.form.port')} ${s.port}` : null, vuln].filter(Boolean).join(' · ')}</dd></>}
          <dt>{t('ui.attack.why')}</dt>
          <dd className="text-ink-200">{why.length ? why.map((f) => renderMessage(t, lang, f.message, names)).join('; ') : t('ui.attack.whyStructural')}</dd>
          <dt>ATT&CK</dt><dd className="mono text-ink-200">{s.attack_ids.join(', ') || '—'}</dd>
        </dl>
      </div>
    )
  }
  const e = frame.event
  if (!e) return null
  return (
    <div className="flex flex-col gap-1 text-[13px]" data-testid="narration">
      <div className="flex items-center gap-2">
        <span className="chip mono">#{e.order}</span>
        <span className="font-display text-[17px] font-semibold text-ink-100">{e.technique ? t(`technique.${e.technique}`) : '—'}</span>
        <span className="ml-auto num text-[16px] neon-text-cyan">{fmtProb(lang, e.likelihood)}</span>
      </div>
      <p className="text-ink-100">{t(`ui.attack.state.${e.kind}`, { asset: names[e.asset_id ?? ''] ?? e.asset_id ?? '', state: e.state })}</p>
    </div>
  )
}

export function Attack() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as Lang
  const navigate = useNavigate()
  const twin = useCurrentTwin()
  const viewed = useViewedRevision()
  const setRevision = useApp((s) => s.setRevision)
  const scenario = useApp((s) => s.scenario)
  const setScenario = useApp((s) => s.setScenario)
  const foothold = useApp((s) => s.foothold)
  const setFoothold = useApp((s) => s.setFoothold)
  const revisions = useRevisions()
  const model = useModel()
  const latest = useLatestRun(scenario)
  const runSim = useRunSimulation()
  const [justRan, setJustRan] = useState<Run | null>(null)
  const run = justRan && justRan.scenario === scenario && justRan.revision === viewed ? justRan : latest.data ?? null
  const result = run?.result ?? null
  const names = useMemo(() => assetNames(model.data), [model.data])
  const hosts = useMemo(() => (model.data?.assets ?? []).filter((a) => a.type !== 'firewall' && a.type !== 'internet_gateway'), [model.data])

  const [full, setFull] = useState(false)
  const frames = useMemo(() => (result ? (full ? discoveryFrames(result) : primaryFrames(result)) : []), [result, full])
  const [pos, setPos] = useState<number>(-1) // -1 = before start; frames.length-1 = end
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1)
  const [types, setTypes] = useState<AssetType[]>([])
  const logRef = useRef<HTMLOListElement>(null)
  const runKey = `${run?.id ?? 'none'}:${full ? 'd' : 'p'}`
  const [seenKey, setSeenKey] = useState(runKey)
  if (seenKey !== runKey) {
    // New run or mode: jump to the end (finished state) unless the run was just started by the user.
    setSeenKey(runKey)
    setPos(frames.length - 1)
    setPlaying(false)
  }

  const finished = useCallback(() => {
    setPlaying(false)
    toast.success(t('ui.attack.done'), t('ui.attack.doneBody', { score: fmtScore(lang, result?.score ?? 0), pct: fmtPct(lang, result?.compromised_pct ?? 0) }), {
      ttl: 0, testId: 'replay-done', action: { label: t('ui.attack.inspect'), onClick: () => navigate('/vulnerabilities') },
    })
  }, [t, lang, result, navigate])

  useEffect(() => {
    if (!playing) return
    const atEnd = pos >= frames.length - 1
    const h = window.setTimeout(() => {
      if (atEnd) finished()
      else setPos((p) => p + 1)
    }, atEnd ? 250 : stepMs(speed))
    return () => window.clearTimeout(h)
  }, [playing, pos, frames.length, speed, finished])

  useEffect(() => {
    // Scroll only the log's own container (scrollIntoView would also scroll the page).
    const list = logRef.current
    const box = list?.parentElement
    const el = list?.querySelector<HTMLElement>('[aria-current="step"]')
    if (!box || !el) return
    const top = el.offsetTop - list.offsetTop
    if (top < box.scrollTop || top + el.offsetHeight > box.scrollTop + box.clientHeight) {
      box.scrollTop = Math.max(0, top - box.clientHeight / 2)
    }
  }, [pos])

  const start = () => {
    if (!viewed) return
    runSim.mutate({ scenario, revision: viewed, foothold: FOOTHOLD.has(scenario) ? foothold ?? hosts.find((h) => h.type === 'employee_ws')?.id ?? null : null }, {
      onSuccess: (r) => {
        setJustRan(r)
        setFull(false)
        setSeenKey(`${r.id}:p`)
        setPos(-1)
        setPlaying(r.result.paths.length > 0)
      },
      onError: (e) => toast.error(t('ui.attack.runFailed'), errorText(t, e)),
    })
  }

  const frame = pos >= 0 ? frames[pos] : undefined
  const hostCount = hosts.length || 1
  const compromisedNow = frame ? frame.compromised.filter((a) => hosts.some((h) => h.id === a)).length : 0
  const pct = pos < 0 ? 0 : (100 * compromisedNow) / hostCount
  const halo = pos >= 0 && compromisedNow > 0

  return (
    <div className="grid min-h-full grid-cols-12 gap-3 pb-2" data-testid="page-attack">
      {/* controls */}
      <div className="col-span-12 flex flex-col gap-3 lg:col-span-3">
        <GlassPanel title={t('ui.attack.setup')} index={0}>
          <div className="flex flex-col gap-3 text-[13px]" data-tour="run">
            <label className="flex flex-col gap-1">
              <span className="text-ink-300">{t('ui.attack.scenario')}</span>
              <select className="field" value={scenario} onChange={(e) => setScenario(e.target.value as ScenarioId)} data-testid="scenario-select">
                {SCENARIOS.map((s) => <option key={s} value={s}>{t(`scenario.${s}.name`)}</option>)}
              </select>
              <span className="text-[12px] text-ink-400">{t(`scenario.${scenario}.desc`)}</span>
            </label>
            {FOOTHOLD.has(scenario) && (
              <label className="flex flex-col gap-1">
                <span className="text-ink-300">{t('ui.attack.foothold')}</span>
                <select className="field" value={foothold ?? hosts.find((h) => h.type === 'employee_ws')?.id ?? ''} onChange={(e) => setFoothold(e.target.value)} data-testid="foothold-select">
                  {hosts.map((h) => <option key={h.id} value={h.id}>{h.name} ({h.id})</option>)}
                </select>
              </label>
            )}
            <label className="flex flex-col gap-1">
              <span className="text-ink-300">{t('ui.top.revision')}</span>
              <select className="field font-mono" value={viewed ?? ''} onChange={(e) => setRevision(Number(e.target.value) === twin?.head_revision ? null : Number(e.target.value))} data-testid="attack-revision">
                {revisions.data?.map((r) => <option key={r.number} value={r.number}>{r.number === twin?.head_revision ? t('ui.top.head', { n: r.number }) : t('ui.top.rev', { n: r.number })}</option>)}
              </select>
            </label>
            <button type="button" className="btn-neon w-full" onClick={start} disabled={runSim.isPending || !viewed} data-testid="run-simulation">
              <Swords size={16} /> {runSim.isPending ? t('ui.attack.running') : t('ui.attack.run')}
            </button>
          </div>
        </GlassPanel>
        <GlassPanel title={t('ui.attack.compromised')} index={1} variant="critical">
          <div className="flex items-center gap-4">
            <RingGauge value={pct} size={96} stroke={8} color="#f43f5e" color2="#e879f9" label={`${fmtPct(lang, pct)} ${t('ui.attack.compromised')}`}>
              <span className="num text-[24px] neon-text-critical" data-testid="compromised-pct">{fmtPct(lang, pct)}</span>
            </RingGauge>
            <div className="text-[13px] text-ink-300">
              <div><span className="num text-[20px] text-ink-100">{compromisedNow}</span> / {hostCount} {t('ui.attack.hosts')}</div>
              {result && <div>{t('ui.common.score')}: <span className="num text-[18px] text-ink-100">{fmtScore(lang, result.score)}</span></div>}
            </div>
          </div>
        </GlassPanel>
        <GlassPanel title={t('ui.attack.log')} index={2} className="max-h-[420px] min-h-[200px]" bodyClassName="overflow-y-auto">
          {!frames.length ? <Empty>{result && result.paths.length === 0 ? t('ui.attack.logNoPath') : t('ui.attack.logEmpty')}</Empty> : (
            <ol ref={logRef} className="flex flex-col gap-1" data-testid="event-log">
              {frames.map((f) => {
                const current = f.index === pos
                const text = f.step ? renderMessage(t, lang, f.step.message, names)
                  : f.event ? t(`ui.attack.state.${f.event.kind}`, { asset: names[f.event.asset_id ?? ''] ?? f.event.asset_id ?? '', state: f.event.state }) : ''
                return (
                  <li key={f.index}>
                    <button type="button" aria-current={current ? 'step' : undefined} onClick={() => { setPlaying(false); setPos(f.index) }}
                      className={`w-full rounded-lg px-2 py-1.5 text-left text-[12.5px] leading-snug transition-colors ${current ? 'bg-critical/15 text-ink-100 ring-1 ring-critical/50' : f.index < pos ? 'text-ink-200 hover:bg-cyan/6' : 'text-ink-400 hover:bg-cyan/6'}`}>
                      <span className="mono mr-1.5 text-ink-400">{f.step ? f.step.id : `#${f.event?.order}`}</span>
                      {f.step && <span className="mr-1 font-semibold text-ink-200">{t(`technique.${f.step.technique}`)}:</span>}
                      {text}
                    </button>
                  </li>
                )
              })}
            </ol>
          )}
        </GlassPanel>
      </div>

      {/* map + timeline */}
      <div className="col-span-12 flex min-h-[640px] flex-col gap-3 lg:col-span-9">
        <GlassPanel title={result ? `${t(`scenario.${scenario}.name`)} · r${run?.revision}` : t('ui.nav.attack')} index={1} className="min-h-0 flex-1" bodyClassName="flex flex-col">
          <div className="mb-2 flex flex-wrap items-center gap-2" role="toolbar" aria-label={t('ui.attack.actions')}>
            <button type="button" className="btn-ghost" disabled={!run} onClick={() => navigate('/remediation')} data-testid="action-fix"><Wrench size={15} /> {t('ui.attack.toRemediation')}</button>
            <button type="button" className="btn-ghost" disabled={!run} onClick={() => navigate('/assistant')} data-testid="action-ai"><Bot size={15} /> {t('ui.attack.toAssistant')}</button>
            <button type="button" className="btn-ghost" disabled={!run} onClick={() => navigate(`/reports?run=${run?.id ?? ''}`)} data-testid="action-report"><ClipboardList size={15} /> {t('ui.attack.toReport')}</button>
            <div className="ml-auto flex flex-wrap items-center gap-1" role="group" aria-label={t('ui.attack.filter')}>
              <span className="mr-1 text-[12px] text-ink-400">{t('ui.attack.filter')}:</span>
              {ASSET_TYPES.map((ty) => (
                <button key={ty} type="button" aria-pressed={types.includes(ty)} onClick={() => setTypes((c) => (c.includes(ty) ? c.filter((x) => x !== ty) : [...c, ty]))}
                  className={`chip ${types.includes(ty) ? 'border-cyan bg-cyan/20 text-cyan' : 'text-ink-300'}`}>{t(`assetType.${ty}`)}</button>
              ))}
            </div>
          </div>
          <div className="relative min-h-[460px] flex-1 overflow-hidden rounded-xl" data-tour="replay">
            {halo && <div className="pointer-events-none absolute inset-0 z-[5] rounded-xl anim-halo" data-testid="blast-halo"
              style={{ boxShadow: 'inset 0 0 60px 10px rgb(244 63 94 / 0.45), inset 0 0 140px 30px rgb(244 63 94 / 0.18)' }} />}
            {(model.isLoading || latest.isLoading) && <Loading rows={6} />}
            {model.isError && <ErrorState error={model.error} onRetry={() => void model.refetch()} />}
            {model.data && result && result.paths.length > 0 && (
              <TopologyMap model={model.data} result={result} types={types}
                pathAssets={frame ? frame.path : full ? [] : null} pathId={result.primary_path}
                compromised={frame ? frame.compromised : pos < 0 ? [] : null} activeAsset={frame?.assetId ?? null}
                focus={playing && frame ? frame.focus : null} ariaLabel={t('ui.nav.attack')} />
            )}
            {model.data && !result && !latest.isLoading && (
              <Empty action={<button type="button" className="btn-neon" onClick={start} disabled={runSim.isPending}><Play size={15} /> {t('ui.attack.run')}</button>}>
                {t('ui.attack.empty')}
              </Empty>
            )}
            {result && result.paths.length === 0 && twin && run && <div className="p-2"><NoPath run={run} twin={twin} /></div>}
            {frame && (
              <div className="glass absolute bottom-3 left-3 z-10 w-[min(440px,calc(100%-24px))]">
                <div className="relative z-[2] p-3"><Narration frame={frame} run={run as Run} names={names} /></div>
              </div>
            )}
          </div>
          {result && result.paths.length > 0 && (
            <div className="mt-3 flex flex-col gap-2" data-testid="timeline">
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className="grid h-9 w-9 place-items-center rounded-lg border border-cyan/30 text-cyan" onClick={() => { setPlaying(false); setPos((p) => Math.max(-1, p - 1)) }} aria-label={t('ui.attack.prev')} data-testid="step-back"><ChevronLeft size={18} /></button>
                <button type="button" className="btn-neon h-9 w-9 !p-0" onClick={() => { if (pos >= frames.length - 1) setPos(-1); setPlaying((v) => !v) }}
                  aria-label={playing ? t('ui.attack.pause') : t('ui.attack.play')} data-testid="play-pause">{playing ? <Pause size={18} /> : <Play size={18} />}</button>
                <button type="button" className="grid h-9 w-9 place-items-center rounded-lg border border-cyan/30 text-cyan" onClick={() => { setPlaying(false); setPos((p) => Math.min(frames.length - 1, p + 1)) }} aria-label={t('ui.attack.next')} data-testid="step-forward"><ChevronRight size={18} /></button>
                <div className="flex rounded-lg border border-cyan/25 p-0.5" role="radiogroup" aria-label={t('ui.attack.speed')}>
                  {SPEEDS.map((s) => (
                    <button key={s} type="button" role="radio" aria-checked={speed === s} onClick={() => setSpeed(s)} data-testid={`speed-${s}`}
                      className={`rounded-md px-2 py-1 text-[12px] font-semibold ${speed === s ? 'bg-cyan/20 text-cyan' : 'text-ink-300'}`}>{s}x</button>
                  ))}
                </div>
                <span className="num text-[15px] text-ink-200" data-testid="replay-position">{Math.max(0, pos + 1)} / {frames.length}</span>
                <label className="ml-auto flex items-center gap-2 text-[13px] text-ink-200">
                  <input type="checkbox" checked={full} onChange={(e) => setFull(e.target.checked)} data-testid="toggle-discovery" /> {t('ui.attack.fullDiscovery')}
                </label>
              </div>
              <input type="range" min={-1} max={frames.length - 1} value={pos} aria-label={t('ui.attack.scrubber')} data-testid="scrubber"
                onChange={(e) => { setPlaying(false); setPos(Number(e.target.value)) }} className="w-full accent-cyan-400" />
            </div>
          )}
        </GlassPanel>
      </div>
    </div>
  )
}
