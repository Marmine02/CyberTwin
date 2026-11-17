// Renders engine messages {code, params} in the UI language. Mirrors backend i18n/catalog.py.
import type { TFunction } from 'i18next'
import type { Lang } from './index'
import { fmtNumber } from './format'

export interface Message {
  code: string
  params: Record<string, unknown>
}

const ENUM_PARAMS: Record<string, string> = { grants: 'level', level: 'level', strength: 'strength', privilege: 'privilege' }
const ZONE_PARAMS = ['src', 'dst', 'a', 'b']

export function messageKey(code: string, params: Record<string, unknown>): string {
  if (code === 'step.network_reach' && Array.isArray(params.via) && params.via.length > 0) return 'step.network_reach_via'
  if (code === 'step.brute_force' && !params.principal) return 'step.brute_force_local'
  if (code === 'step.credential_use' && params.level === 'domain_admin') return 'step.credential_use_domain'
  return code
}

function list(t: TFunction, items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} ${t('list.and')} ${items[items.length - 1]}`
}

export function localizeParams(
  t: TFunction, lang: Lang, params: Record<string, unknown>, names?: Record<string, string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...params }
  for (const [key, ns] of Object.entries(ENUM_PARAMS)) {
    const v = out[key]
    if (typeof v === 'string' && v) out[key] = t(`${ns}.${v}`)
  }
  for (const key of ZONE_PARAMS) {
    const v = out[key]
    if (typeof v === 'string' && ['internet', 'dmz', 'internal', 'data', 'mgmt'].includes(v)) out[key] = t(`zone.${v}`)
  }
  if (names) {
    for (const key of ['asset', 'src', 'source', 'target']) {
      const v = out[key]
      if (typeof v === 'string' && names[v]) out[key] = names[v]
    }
  }
  if (Array.isArray(out.via)) out.via = list(t, (out.via as string[]).map((x) => names?.[x] ?? x))
  if (typeof out.cvss === 'number') out.cvss = fmtNumber(lang, out.cvss, 1)
  return out
}

export function renderMessage(t: TFunction, lang: Lang, msg: Message, names?: Record<string, string>): string {
  return t(messageKey(msg.code, msg.params), localizeParams(t, lang, msg.params, names))
}

export interface ActionSpec {
  action: string
  [key: string]: unknown
}

export function renderAction(
  t: TFunction, lang: Lang, action: ActionSpec, cves: Record<string, [string, string]>, names?: Record<string, string>,
): string {
  const params: Record<string, unknown> = { ...action }
  delete params.action
  let key = `action.${action.action}`
  if (action.action === 'set_password_policy') key += params.principal_id ? '_principal' : '_asset'
  if (action.action === 'apply_patch') {
    const [cve, asset] = cves[String(params.vulnerability_id)] ?? [String(params.vulnerability_id), '']
    params.cve = cve
    params.asset = asset
  }
  if (action.action === 'segment_zones' && Array.isArray(params.zones)) {
    params.a = params.zones[0]
    params.b = params.zones[1]
  }
  if (params.asset === undefined) params.asset = params.asset_id
  if (params.principal === undefined) params.principal = params.principal_id
  return t(key, localizeParams(t, lang, params, names))
}
