import { useEffect, useState } from 'react'
import type { Message } from '../i18n/messages'
import { postSse } from './client'

export interface AttackStepText {
  step_id: string
  asset_id: string
  technique: string
  technique_label: string
  text: string
  p: number
  p_text: string
  attack_ids: string[]
  why: string[]
}

export interface RiskItem { text: string; path_id: string | null; step_ids: string[]; finding_ids: string[]; verified: boolean }
export interface PlanItem { text: string; recommendation_id: string | null; rank: number | null; kind: string; verified: boolean }

export interface Flag { code: string; section: string; index: number | null; params: Record<string, unknown>; message: Message }

export interface Explanation {
  status: 'idle' | 'loading' | 'done' | 'error'
  mode: 'llm' | 'template' | null
  provider: string | null
  model: string | null
  cached: boolean
  notice: Message | null
  summary: string[]
  summaryVerified: boolean
  key_risks: RiskItem[]
  attack_steps: AttackStepText[]
  remediation_plan: PlanItem[]
  residual: string[]
  residualVerified: boolean
  flags: Flag[]
  error: unknown
}

const EMPTY: Explanation = {
  status: 'idle', mode: null, provider: null, model: null, cached: false, notice: null, summary: [], summaryVerified: true,
  key_risks: [], attack_steps: [], remediation_plan: [], residual: [], residualVerified: true, flags: [], error: null,
}

/** Streams /ai/explain for a run in the given language. */
export function useExplanation(runId: number | null, lang: string): Explanation {
  const key = runId === null ? null : `${runId}:${lang}`
  const [state, setState] = useState<Explanation & { key: string | null }>({ ...EMPTY, key: null })
  useEffect(() => {
    if (runId === null || key === null) return
    const ctrl = new AbortController()
    postSse('/ai/explain', { run_id: runId, lang }, (e) => {
      const d = e.data as Record<string, unknown>
      setState((prev) => {
        const s = prev.key === key ? prev : { ...EMPTY, status: 'loading' as const, key }
        if (e.event === 'mode') {
          return { ...s, mode: d.mode as Explanation['mode'], provider: (d.provider as string) ?? null,
            model: (d.model as string) ?? null, cached: !!d.cached, notice: (d.notice as Message) ?? null }
        }
        if (e.event === 'section') {
          const name = d.name as string
          const items = d.items as never
          if (name === 'summary') return { ...s, summary: items, summaryVerified: d.verified !== false }
          if (name === 'residual') return { ...s, residual: items, residualVerified: d.verified !== false }
          return { ...s, [name]: items }
        }
        if (e.event === 'checks') return { ...s, flags: d.flags as Flag[] }
        if (e.event === 'done') return { ...s, status: 'done' }
        return s
      })
    }, ctrl.signal).catch((err: unknown) => {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setState((prev) => ({ ...(prev.key === key ? prev : { ...EMPTY, key }), status: 'error', error: err }))
    })
    return () => ctrl.abort()
  }, [runId, lang, key])
  if (key === null) return EMPTY
  if (state.key !== key) return { ...EMPTY, status: 'loading' }
  return state
}
