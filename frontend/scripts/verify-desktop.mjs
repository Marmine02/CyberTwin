// Drives the REAL desktop window (opened from the Desktop shortcut) over CDP and runs the demo:
// simulate -> replay -> top 3 fixes -> score 100 -> revert -> close the window.
//   node scripts/verify-desktop.mjs <cdpPort> <outJson>
import { chromium } from '@playwright/test'
import { writeFileSync } from 'node:fs'

const [cdpPort = '9333', out = '../logs/desktop-verify.json'] = process.argv.slice(2)
const report = { steps: [], ok: false }
const step = (name, data = {}) => { report.steps.push({ name, ...data }); console.log('✔', name, JSON.stringify(data)) }

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`)
try {
  const page = browser.contexts()[0].pages().find((p) => p.url().startsWith('http://127.0.0.1:')) ?? browser.contexts()[0].pages()[0]
  await page.waitForLoadState('networkidle')
  step('window', { url: page.url(), title: await page.title(), size: await page.evaluate(() => [innerWidth, innerHeight]) })

  if (await page.getByTestId('guided-tour').isVisible().catch(() => false)) {
    await page.getByTestId('tour-skip').click()
    step('guided tour shown on first start and skipped')
  }
  const base = new URL(page.url()).origin
  const twins = await (await page.request.get(`${base}/api/v1/twins`)).json()
  step('twin', { name: twins[0].name, head: twins[0].head_revision })

  await page.getByTestId('nav-attack').click()
  await page.getByTestId('attack-revision').selectOption(String(twins[0].head_revision))
  await page.getByTestId('run-simulation').click()
  await page.getByTestId('narration').waitFor()
  await page.getByTestId('replay-done').waitFor({ timeout: 30000 })
  const pos = await page.getByTestId('replay-position').textContent()
  const latest = await (await page.request.get(`${base}/api/v1/twins/${twins[0].id}/simulations/latest?scenario=sensitive_data_exposure`)).json()
  step('simulate + replay', { replay: pos, score: latest.score, path: latest.result.paths[0]?.assets.join(' -> ') })

  await page.getByTestId('nav-remediation').click()
  await page.getByTestId('select-top3').click()
  await page.getByTestId('apply-button').click()
  await page.getByTestId('apply-dialog').getByTestId('confirm-button').click()
  await page.getByTestId('score-after').filter({ hasText: '100.0' }).waitFor()
  step('top 3 fixes applied', { before: await page.getByTestId('score-before').textContent(), after: await page.getByTestId('score-after').textContent() })

  await page.getByTestId('revert-button').click()
  await page.getByTestId('revert-dialog').getByTestId('confirm-button').click()
  await page.getByTestId('reverted-chip').waitFor()
  const reverted = await (await page.request.get(`${base}/api/v1/twins/${twins[0].id}/simulations?limit=1`)).json()
  step('revert', { chip: await page.getByTestId('reverted-chip').textContent(), score: reverted[0].score, revision: reverted[0].revision })
  report.ok = true
} catch (e) {
  report.error = String(e)
  console.error(e)
} finally {
  writeFileSync(out, JSON.stringify(report, null, 2))
  // Close the real app window (Browser.close = the same as the user closing it). browser.close()
  // alone would only disconnect from a browser we attached to over CDP.
  const cdp = await browser.newBrowserCDPSession()
  await cdp.send('Browser.close').catch(() => {})
}
process.exit(report.ok ? 0 : 1)
