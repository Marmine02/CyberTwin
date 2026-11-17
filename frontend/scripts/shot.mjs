// Screenshot helper (real browser: installed Microsoft Edge via Playwright).
//   node scripts/shot.mjs <baseUrl> <outDir> <lang> <path> [width] [height] [name]
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const [base, outDir, lang = 'en', path = '/', width = '1440', height = '900', name] = process.argv.slice(2)
mkdirSync(outDir, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge' })
const ctx = await browser.newContext({ viewport: { width: Number(width), height: Number(height) }, deviceScaleFactor: 1 })
await ctx.addInitScript((l) => {
  localStorage.setItem('cybertwin.lang', l)
  localStorage.setItem('cybertwin.tour', 'done')
}, lang)
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
await page.goto(base + path, { waitUntil: 'networkidle' })
await page.waitForTimeout(2200)
const file = `${outDir}/${name ?? `${(path.replace(/\//g, '_') || '_').replace(/^_$/, 'overview')}-${lang}-${width}`}.png`
await page.screenshot({ path: file, fullPage: false })
console.log('saved', file)
if (errors.length) console.log('PAGE ERRORS:\n' + errors.join('\n'))
await browser.close()
