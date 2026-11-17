import { test as base, expect, type APIRequestContext, type Page } from '@playwright/test'

export const API = 'http://127.0.0.1:8765/api/v1'
export const SDE = 'sensitive_data_exposure'
export const PRIMARY_PATH = ['inet', 'fw-edge', 'web-01', 'fw-int', 'idp-01', 'customer-db']
export const LANGS = ['en', 'tr', 'az'] as const
export type Lang = (typeof LANGS)[number]

export const PAGES: [string, string][] = [
  ['overview', '/'], ['map', '/map'], ['assets', '/assets'], ['attack', '/attack'],
  ['vulns', '/vulnerabilities'], ['assistant', '/assistant'], ['remediation', '/remediation'], ['reports', '/reports'],
]

export async function resetDemo(request: APIRequestContext): Promise<number> {
  const r = await request.post(`${API}/demo/reset`)
  expect(r.status()).toBe(201)
  return (await r.json()).id as number
}

export async function runScenario(request: APIRequestContext, twinId: number, scenario = SDE, revision?: number) {
  const r = await request.post(`${API}/twins/${twinId}/simulations`, { data: { scenario, revision } })
  expect(r.status()).toBe(201)
  return r.json()
}

export async function applyTop3(request: APIRequestContext, twinId: number) {
  const recs = await (await request.get(`${API}/twins/${twinId}/recommendations?scenario=${SDE}`)).json()
  const actions = recs.recommendations.slice(0, 3).map((r: { action: unknown }) => r.action)
  const r = await request.post(`${API}/twins/${twinId}/remediations/apply`, { data: { actions, scenario: SDE } })
  expect(r.status()).toBe(201)
  return r.json()
}

/** Open the app with a language and the guided demo marked as done (unless tour=true). */
export async function openApp(page: Page, path = '/', lang: Lang = 'en', tour = false) {
  await page.addInitScript(([l, tr]) => {
    try {
      if (!sessionStorage.getItem('e2e-init')) {
        localStorage.setItem('cybertwin.lang', l as string)
        if (tr) localStorage.removeItem('cybertwin.tour')
        else localStorage.setItem('cybertwin.tour', 'done')
        sessionStorage.setItem('e2e-init', '1')
      }
    } catch { /* ignore */ }
  }, [lang, tour] as const)
  await page.goto(path)
  await expect(page.getByTestId('sim-badge')).toBeVisible()
}

export const test = base
export { expect }
