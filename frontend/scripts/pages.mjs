// Screenshots of all 8 pages in one language (real backend + Edge).
//   node scripts/pages.mjs <baseUrl> <outDir> <lang> [width] [height]
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const [base, outDir, lang = 'en', width = '1440', height = '900'] = process.argv.slice(2)
const PAGES = [['overview', '/'], ['map', '/map'], ['assets', '/assets'], ['attack', '/attack'], ['vulnerabilities', '/vulnerabilities'],
  ['assistant', '/assistant'], ['remediation', '/remediation'], ['reports', '/reports']]
mkdirSync(outDir, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge' })
const ctx = await browser.newContext({ viewport: { width: Number(width), height: Number(height) } })
await ctx.addInitScript((l) => {
  localStorage.setItem('cybertwin.lang', l)
  localStorage.setItem('cybertwin.tour', 'done')
}, lang)
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror ${e}`))
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console ${m.text()}`) })
for (const [name, path] of PAGES) {
  await page.goto(base + path, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1800)
  await page.screenshot({ path: `${outDir}/${name}-${lang}.png`, fullPage: false })
}
await browser.close()
console.log(`saved ${PAGES.length} pages for ${lang}`)
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'))
