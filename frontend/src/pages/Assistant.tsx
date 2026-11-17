import { AlertTriangle, BadgeCheck, Bot, Send, User } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useExplanation } from '../api/ai'
import { postSse } from '../api/client'
import { useRuns, useViewedRevision } from '../api/hooks'
import { GlassPanel } from '../components/ui/GlassPanel'
import { Empty, ErrorState, Loading } from '../components/ui/States'
import type { Lang } from '../i18n'
import { fmtDateTime } from '../i18n/format'
import { errorText } from '../lib/errors'
import { useApp } from '../store/app'

interface Turn { role: 'user' | 'assistant'; content: string; mode?: string; verified?: boolean }

function Unverified() {
  const { t } = useTranslation()
  return <span className="chip ml-1 border-warning/50 bg-warning/10 text-orange-200" data-testid="unverified"><AlertTriangle size={12} /> {t('ui.ai.unverified')}</span>
}

export function Assistant() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as Lang
  const twinId = useApp((s) => s.twinId)
  const viewed = useViewedRevision()
  const runs = useRuns()
  const [runId, setRunId] = useState<number | null>(null)
  const forRevision = useMemo(() => (runs.data ?? []).filter((r) => r.revision === viewed), [runs.data, viewed])
  const selected = runId ?? forRevision[0]?.id ?? runs.data?.[0]?.id ?? null
  const ex = useExplanation(selected, lang)

  const [turns, setTurns] = useState<Turn[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const chatEnd = useRef<HTMLDivElement>(null)
  useEffect(() => chatEnd.current?.scrollIntoView({ block: 'nearest' }), [turns])

  const ask = async (message: string) => {
    if (!message.trim() || !twinId || busy) return
    const history = turns.map(({ role, content }) => ({ role, content }))
    setTurns((x) => [...x, { role: 'user', content: message }, { role: 'assistant', content: '' }])
    setInput('')
    setBusy(true)
    try {
      await postSse('/ai/chat', { twin_id: twinId, run_id: selected ?? undefined, message, history, lang }, (e) => {
        const d = e.data as Record<string, unknown>
        if (e.event === 'token') setTurns((x) => x.map((tu, i) => (i === x.length - 1 ? { ...tu, content: tu.content + String(d.text) } : tu)))
        if (e.event === 'answer') setTurns((x) => x.map((tu, i) => (i === x.length - 1 ? { ...tu, content: String(d.answer), mode: String(d.mode), verified: d.verified !== false } : tu)))
      })
    } catch (err) {
      setTurns((x) => x.map((tu, i) => (i === x.length - 1 ? { ...tu, content: errorText(t, err), mode: 'error' } : tu)))
    } finally {
      setBusy(false)
    }
  }

  const flagged = new Set(ex.flags.map((f) => `${f.section}:${f.index ?? ''}`))
  const suggestions = [t('ui.ai.s.why'), t('ui.ai.s.fix'), t('ui.ai.s.score'), t('ui.ai.s.asset')]

  return (
    <div className="grid min-h-full grid-cols-12 gap-3 pb-2" data-testid="page-assistant">
      <GlassPanel title={t('ui.ai.explanation')} index={0} variant="violet" className="col-span-12 xl:col-span-7"
        actions={ex.mode && (
          <span className={`chip ${ex.mode === 'llm' ? 'border-violet/50 bg-violet/15 text-violet' : 'text-ink-200'}`} data-testid="ai-mode">
            {t('ui.overview.aiMode', { mode: t(`ai.mode.${ex.mode}`) })}{ex.provider ? ` · ${ex.provider}` : ''}{ex.cached ? ` · ${t('ui.ai.cached')}` : ''}
          </span>
        )}>
        <div className="flex flex-col gap-4">
          <label className="flex flex-wrap items-center gap-2 text-[13px]">
            <span className="text-ink-300">{t('ui.ai.run')}</span>
            <select className="field w-auto max-w-full" value={selected ?? ''} onChange={(e) => setRunId(Number(e.target.value))} data-testid="ai-run-select">
              {(runs.data ?? []).map((r) => (
                <option key={r.id} value={r.id}>#{r.id} · r{r.revision} · {t(`scenario.${r.scenario}.name`)} · {fmtDateTime(lang, r.created_at)}</option>
              ))}
            </select>
          </label>
          {runs.isLoading && <Loading />}
          {!runs.isLoading && !runs.data?.length && <Empty>{t('ui.ai.noRun')}</Empty>}
          {ex.notice && <p className="rounded-lg border border-cyan/20 bg-cyan/5 px-3 py-2 text-[12.5px] text-ink-300" data-testid="ai-notice">{t(ex.notice.code, ex.notice.params)}</p>}
          {ex.status === 'error' && <ErrorState error={ex.error} />}
          {ex.status === 'loading' && !ex.summary.length && <Loading rows={5} label={t('ui.ai.generating')} />}
          {ex.summary.length > 0 && (
            <section>
              <h3 className="panel-title mb-1 text-[13px]">{t('ai.section.summary')}{!ex.summaryVerified && <Unverified />}</h3>
              {ex.summary.map((s, i) => <p key={i} className="text-[14px] leading-relaxed text-ink-100">{s}</p>)}
            </section>
          )}
          {ex.key_risks.length > 0 && (
            <section>
              <h3 className="panel-title mb-1 text-[13px]">{t('ai.section.key_risks')}</h3>
              <ul className="flex flex-col gap-2">
                {ex.key_risks.map((r, i) => (
                  <li key={i} className="rounded-lg border border-critical/20 bg-critical/5 p-2 text-[13.5px] leading-relaxed text-ink-100">
                    {r.text}{(!r.verified || flagged.has(`key_risks:${i}`)) && <Unverified />}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {ex.attack_steps.length > 0 && (
            <section>
              <h3 className="panel-title mb-1 text-[13px]">{t('ai.section.attack_steps')}</h3>
              <ol className="flex flex-col gap-1.5">
                {ex.attack_steps.map((s) => (
                  <li key={s.step_id} className="grid grid-cols-[auto_1fr_auto] items-start gap-2 text-[13px]">
                    <span className="mono text-critical">{s.step_id}</span>
                    <span className="text-ink-100">{s.text}{s.why.length > 0 && <span className="block text-[12px] text-ink-400">{s.why.join('; ')}</span>}</span>
                    <span className="num text-[14px] text-ink-200">{s.p_text}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
          {ex.remediation_plan.length > 0 && (
            <section>
              <h3 className="panel-title mb-1 text-[13px]">{t('ai.section.remediation_plan')}</h3>
              <ol className="flex list-decimal flex-col gap-1 pl-5 text-[13.5px] text-ink-100">
                {ex.remediation_plan.map((p, i) => <li key={i}>{p.text}{(!p.verified || flagged.has(`remediation_plan:${i}`)) && <Unverified />}</li>)}
              </ol>
            </section>
          )}
          {ex.residual.length > 0 && (
            <section>
              <h3 className="panel-title mb-1 text-[13px]">{t('ai.section.residual')}{!ex.residualVerified && <Unverified />}</h3>
              {ex.residual.map((s, i) => <p key={i} className="text-[13.5px] text-ink-200">{s}</p>)}
            </section>
          )}
        </div>
      </GlassPanel>

      <div className="col-span-12 flex flex-col gap-3 xl:col-span-5">
        <GlassPanel title={t('ui.ai.integrity')} index={1} testId="integrity-panel">
          {ex.status !== 'done' ? <Loading rows={2} /> : ex.flags.length === 0 ? (
            <div className="flex items-start gap-2 text-[13px] text-ink-200" data-testid="integrity-ok">
              <BadgeCheck size={18} className="mt-0.5 shrink-0 text-secure" />
              <p>{ex.mode === 'llm' ? t('ui.ai.checksPassed') : t('ui.ai.checksTemplate')}</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-1.5 text-[13px]" data-testid="integrity-flags">
              {ex.flags.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-orange-200"><AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <span>{t(f.message.code, f.message.params)} <span className="text-ink-400">({t(`ai.section.${f.section === 'answer' ? 'summary' : f.section}`)})</span></span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-[12px] text-ink-400">{t('ui.ai.checksExplain')}</p>
        </GlassPanel>

        <GlassPanel title={t('ui.ai.chat')} index={2} className="min-h-[420px] flex-1" bodyClassName="flex flex-col gap-2">
          <div className="min-h-[220px] flex-1 overflow-y-auto pr-1" data-testid="chat-log" aria-live="polite">
            {turns.length === 0 && <p className="text-[13px] text-ink-300">{t('ai.chat.intro')}</p>}
            {turns.map((tu, i) => (
              <div key={i} className={`mb-2 flex gap-2 ${tu.role === 'user' ? 'justify-end' : ''}`}>
                {tu.role === 'assistant' && <Bot size={18} className="mt-1 shrink-0 text-violet" />}
                <div className={`max-w-[85%] rounded-xl px-3 py-2 text-[13.5px] leading-relaxed ${tu.role === 'user' ? 'bg-cyan/12 text-ink-100' : 'bg-violet/10 text-ink-100'}`}
                  data-testid={tu.role === 'assistant' ? 'chat-answer' : 'chat-question'}>
                  {tu.content || <span className="text-ink-400">{t('ui.ai.thinking')}</span>}
                  {tu.mode && tu.mode !== 'error' && <div className="mt-1 text-[11px] text-ink-400">{t(`ai.mode.${tu.mode}`)}{tu.verified === false && <Unverified />}</div>}
                </div>
                {tu.role === 'user' && <User size={18} className="mt-1 shrink-0 text-cyan" />}
              </div>
            ))}
            <div ref={chatEnd} />
          </div>
          <div className="flex flex-wrap gap-1">
            {suggestions.map((s) => <button key={s} type="button" className="chip text-ink-200 hover:text-cyan" onClick={() => void ask(s)} disabled={busy}>{s}</button>)}
          </div>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void ask(input) }}>
            <label className="sr-only" htmlFor="chat-input">{t('ui.ai.ask')}</label>
            <input id="chat-input" className="field" value={input} maxLength={2000} placeholder={t('ui.ai.ask')} onChange={(e) => setInput(e.target.value)} data-testid="chat-input" />
            <button type="submit" className="btn-neon" disabled={busy || !input.trim()} aria-label={t('ui.ai.send')} data-testid="chat-send"><Send size={16} /></button>
          </form>
        </GlassPanel>
      </div>
    </div>
  )
}
