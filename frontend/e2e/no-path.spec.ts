import { API, SDE, applyTop3, expect, openApp, resetDemo, test } from './fixtures'

test.describe('no-path state', () => {
  let twinId = 0
  test.beforeAll(async ({ request }) => {
    twinId = await resetDemo(request)
    await applyTop3(request, twinId) // creates r2 where nothing reaches a goal
  })

  test('explains why and offers run on r1, compare, reset', async ({ page, request }) => {
    await openApp(page, '/attack')
    await page.getByTestId('run-simulation').click()
    const panel = page.getByTestId('no-path')
    await expect(panel).toBeVisible()
    await expect(panel).toContainText('No attack path')
    await expect(panel).toContainText('these fixes were applied in r2')
    await expect(panel).toContainText('Restrict port 22 on Public Web Server')

    // Compare r1 vs r2
    await panel.getByTestId('compare-r1').click()
    await expect(page).toHaveURL(/compare=1,2/)
    await expect(page.getByTestId('compare-result')).toBeVisible()
    await expect(page.getByTestId('score-after')).toHaveText('100.0')

    // Run on r1
    await page.goto('/attack')
    await page.getByTestId('attack-revision').selectOption('2')
    await expect(page.getByTestId('no-path')).toBeVisible()
    await page.getByTestId('run-on-r1').click()
    await expect(page.getByTestId('revision-select')).toHaveValue('1')
    await expect(page.getByTestId('narration')).toBeVisible()
    const r1 = await (await request.get(`${API}/twins/${twinId}/simulations/latest?scenario=${SDE}&revision=1`)).json()
    expect(r1.score).toBeLessThan(26)

    // Reset demo (with confirmation)
    await page.getByTestId('attack-revision').selectOption('2')
    await page.getByTestId('reset-demo').click()
    await expect(page.getByTestId('reset-dialog')).toContainText('Northwind Logistics')
    await page.getByTestId('reset-dialog').getByTestId('confirm-button').click()
    await expect(page.getByTestId('revision-select')).toContainText('r1 · latest')
    const twins = await (await request.get(`${API}/twins`)).json()
    expect(twins[0].head_revision).toBe(1)
  })
})
