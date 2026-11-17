import { API, PRIMARY_PATH, SDE, expect, openApp, resetDemo, test } from './fixtures'

test.describe('demo flow: simulate -> replay -> apply top 3 -> score 100 -> revert', () => {
  let twinId = 0
  test.beforeAll(async ({ request }) => {
    twinId = await resetDemo(request)
  })

  test('full flow on the real backend', async ({ page, request }) => {
    await openApp(page, '/attack')
    await expect(page.getByTestId('scenario-select')).toHaveValue(SDE)
    await page.getByTestId('run-simulation').click()

    // Replay auto-plays the primary path with narration.
    await expect(page.getByTestId('narration')).toBeVisible()
    await expect(page.getByTestId('blast-halo')).toBeVisible()
    const done = page.getByTestId('replay-done')
    await expect(done).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('replay-position')).toHaveText('6 / 6')
    await expect(page.getByTestId('event-log').locator('li')).toHaveCount(6)
    await expect(page.getByTestId('narration')).toContainText('Customer Database')

    // Exact primary path is highlighted on the map, nothing else.
    for (const id of PRIMARY_PATH) await expect(page.getByTestId(`node-${id}`)).toHaveAttribute('data-on-path', 'true')
    for (const id of ['app-01', 'ws-01', 'adm-ws']) await expect(page.getByTestId(`node-${id}`)).toHaveAttribute('data-on-path', 'false')
    const latest = await (await request.get(`${API}/twins/${twinId}/simulations/latest?scenario=${SDE}`)).json()
    expect(latest.result.paths[0].assets).toEqual(PRIMARY_PATH)
    expect(latest.score).toBeGreaterThan(24)
    expect(latest.score).toBeLessThan(26)

    // Replay controls really work.
    await page.getByTestId('step-back').click()
    await expect(page.getByTestId('replay-position')).toHaveText('5 / 6')
    await page.getByTestId('event-log').locator('li').first().locator('button').click()
    await expect(page.getByTestId('replay-position')).toHaveText('1 / 6')
    await expect(page.getByTestId('narration')).toContainText('P1.S1')

    await done.getByTestId('toast-action').click()
    await expect(page).toHaveURL(/\/vulnerabilities/)
    await expect(page.getByTestId('vuln-table')).toContainText('CVE-2023-38408')

    // Apply the top 3 recommendations.
    await page.getByTestId('nav-remediation').click()
    await page.getByTestId('select-top3').click()
    await page.getByTestId('apply-button').click()
    await page.getByTestId('apply-dialog').getByTestId('confirm-button').click()
    await expect(page.getByTestId('score-after')).toHaveAttribute('data-value', '100')
    await expect(page.getByTestId('score-after')).toHaveText('100.0')
    await expect(page.getByTestId('score-before')).toHaveText('25.0')
    await expect(page.getByTestId('blocked-paths').locator('s').first()).toBeVisible()
    await expect(page.getByTestId('residual-list')).toContainText('Service account svc-web has admin rights on Customer Database')
    await expect(page.getByTestId('revision-select')).toContainText('r2')

    // Revert restores the score.
    await page.getByTestId('revert-button').click()
    await page.getByTestId('revert-dialog').getByTestId('confirm-button').click()
    await expect(page.getByTestId('reverted-chip')).toContainText('r3')
    const after = await (await request.get(`${API}/twins/${twinId}/simulations/latest?scenario=${SDE}&revision=3`)).json()
    expect(after.score).toBe(latest.score)
    await page.getByTestId('nav-overview').click()
    await expect(page.getByTestId('overview-score')).toHaveText('25.0')
  })
})
