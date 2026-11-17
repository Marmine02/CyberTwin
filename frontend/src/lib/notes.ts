import type { TFunction } from 'i18next'
import i18n, { type Lang } from '../i18n'
import { fmtScore } from '../i18n/format'
import type { Message } from '../i18n/messages'

const SCORE_PARAMS = ['score', 'score_before', 'score_after']

/** Revision notes / event messages: localize enum-like params and format scores before interpolation. */
export function noteText(t: TFunction, msg: Message): string {
  const lang = i18n.language as Lang
  const p: Record<string, unknown> = { ...msg.params }
  if (typeof p.entity === 'string') p.entity = t(`entity.${p.entity}`)
  if (Array.isArray(p.actions)) {
    if (p.count === undefined) p.count = p.actions.length
    delete p.actions
  }
  for (const k of SCORE_PARAMS) if (typeof p[k] === 'number') p[k] = fmtScore(lang, p[k])
  if (typeof p.scenario === 'string') p.scenario = t(`scenario.${p.scenario}.name`)
  return t(msg.code, p)
}
