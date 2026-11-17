import type { Asset, Finding, Severity, TwinModel } from '../api/types'

export function assetNames(model: TwinModel | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const a of model?.assets ?? []) out[a.id] = a.name
  return out
}

export function vulnCves(model: TwinModel | undefined): Record<string, [string, string]> {
  const names = assetNames(model)
  const out: Record<string, [string, string]> = {}
  for (const v of model?.vulnerabilities ?? []) out[v.id] = [v.cve, names[v.asset_id] ?? v.asset_id]
  return out
}

export const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low']

export function severityCounts(findings: Finding[]): Record<Severity, number> {
  const c: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 }
  for (const f of findings) c[f.severity]++
  return c
}

export type HardeningGroup = 'servers' | 'endpoints' | 'network'

export function hardeningGroup(a: Asset): HardeningGroup | null {
  if (a.type === 'internet_gateway') return null
  if (a.type === 'firewall') return 'network'
  if (a.type === 'employee_ws' || a.type === 'admin_ws') return 'endpoints'
  return 'servers'
}

/**
 * Hardening of one asset (0..100) from its configuration in the model:
 * EDR, strong local password policy, MFA, no open vulnerability, no end-of-life software.
 */
export function assetHardening(a: Asset): number {
  const checks = [
    a.security_config.edr,
    a.security_config.password_policy === 'strong',
    a.security_config.mfa,
    a.vulnerability_ids.length === 0,
    a.software.every((s) => !s.eol),
  ]
  return (100 * checks.filter(Boolean).length) / checks.length
}

export function hardeningByGroup(model: TwinModel | undefined): Record<HardeningGroup, number | null> {
  const acc: Record<HardeningGroup, number[]> = { servers: [], endpoints: [], network: [] }
  for (const a of model?.assets ?? []) {
    const g = hardeningGroup(a)
    if (g) acc[g].push(assetHardening(a))
  }
  const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null)
  return { servers: avg(acc.servers), endpoints: avg(acc.endpoints), network: avg(acc.network) }
}
