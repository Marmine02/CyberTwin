import { expect, openApp, resetDemo, test } from './fixtures'

test.describe('guided demo', () => {
  test.beforeAll(async ({ request }) => {
    await resetDemo(request)
  })

  test('5 steps on the real UI, never blocks clicks, remembered once done', async ({ page }) => {
    await openApp(page, '/', 'en', true)
    const tour = page.getByTestId('guided-tour')
    await expect(tour).toBeVisible()
    await expect(tour).toContainText('1 of 5')
    await expect(page.getByTestId('tour-highlight')).toBeVisible()

    // The rest of the app stays clickable while the tour is open.
    await page.getByTestId('nav-assets').click()
    await expect(page.getByTestId('page-assets')).toBeVisible()
    await expect(tour).toBeVisible()
    await tour.getByTestId('tour-go').click()
    await expect(page.getByTestId('page-overview')).toBeVisible()

    const expected = [['2 of 5', /\/attack$/], ['3 of 5', /\/attack$/], ['4 of 5', /\/remediation$/], ['5 of 5', /\/remediation$/]] as const
    for (const [label, url] of expected) {
      await tour.getByTestId('tour-next').click()
      await expect(tour).toContainText(label)
      await expect(page).toHaveURL(url)
    }
    await tour.getByTestId('tour-back').click()
    await expect(tour).toContainText('4 of 5')
    await tour.getByTestId('tour-next').click()
    await tour.getByTestId('tour-next').click() // Finish
    await expect(tour).toBeHidden()
    expect(await page.evaluate(() => localStorage.getItem('cybertwin.tour'))).toBe('done')
    await page.reload()
    await expect(page.getByTestId('sim-badge')).toBeVisible()
    await expect(page.getByTestId('guided-tour')).toBeHidden()

    // Restart from the help menu, then skip: also remembered.
    await page.getByTestId('help-button').click()
    await page.getByTestId('restart-tour').click()
    await expect(page.getByTestId('guided-tour')).toContainText('1 of 5')
    await page.getByTestId('tour-skip').click()
    await expect(page.getByTestId('guided-tour')).toBeHidden()
    await page.reload()
    await expect(page.getByTestId('sim-badge')).toBeVisible()
    await expect(page.getByTestId('guided-tour')).toBeHidden()
  })
})
