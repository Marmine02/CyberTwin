// Screenshots taken mid-flow (replay in progress, compare view, forms, tour) on the real backend.
//   node scripts/flow-shots.mjs <baseUrl> <outDir> <lang>
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const [base, outDir, lang = 'en'] = process.argv.slice(2)
mkdirSync(outDir, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge' })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
await ctx.addInitScript((l) => { localStorage.setItem('cybertwin.lang', l); localStorage.setItem('cybertwin.tour', 'done') }, lang)
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

await page.goto(base + '/attack', { waitUntil: 'networkidle' })
await page.getByTestId('attack-revision').selectOption('1')
await page.getByTestId('run-simulation').click()
await page.waitForTimeout(4200)
await page.screenshot({ path: `${outDir}/flow-replay-${lang}.png` })
await page.waitForTimeout(5000)
await page.screenshot({ path: `${outDir}/flow-replay-done-${lang}.png` })

await page.goto(base + '/remediation', { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
await page.screenshot({ path: `${outDir}/flow-compare-${lang}.png` })

await page.goto(base + '/assets', { waitUntil: 'networkidle' })
await page.getByTestId('create-button').click()
await page.getByTestId('entity-save').click()
await page.waitForTimeout(400)
await page.screenshot({ path: `${outDir}/flow-form-${lang}.png` })
await page.keyboard.press('Escape')

await page.evaluate(() => localStorage.removeItem('cybertwin.tour'))
await page.goto(base + '/', { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
await page.screenshot({ path: `${outDir}/flow-tour-${lang}.png` })
await browser.close()
console.log('flow shots saved', lang)
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'))
