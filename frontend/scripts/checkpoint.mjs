// Visual checkpoint images (real backend + built frontend + installed Edge).
//   node scripts/checkpoint.mjs <baseUrl> <outDir> <referenceImage>
import { chromium } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'

const [base, outDir, reference] = process.argv.slice(2)
mkdirSync(outDir, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge' })

async function open(lang, width = 1440, height = 900) {
  const ctx = await browser.newContext({ viewport: { width, height } })
  await ctx.addInitScript((l) => {
    localStorage.setItem('cybertwin.lang', l)
    localStorage.setItem('cybertwin.tour', 'done')
  }, lang)
  const page = await ctx.newPage()
  await page.goto(base + '/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(2500)
  return { ctx, page }
}

for (const lang of ['en', 'tr', 'az']) {
  const { ctx, page } = await open(lang)
  await page.screenshot({ path: `${outDir}/checkpoint-shell-${lang}.png` })
  if (lang === 'en') {
    await page.getByTestId('panel-critical').screenshot({ path: `${outDir}/checkpoint-panel-en.png` })
    await page.getByTestId('panel-topology').screenshot({ path: `${outDir}/checkpoint-map-en.png` })
  }
  await ctx.close()
}

// Side by side: owner's reference vs. the real app.
const toData = (p) => `data:image/${p.endsWith('.png') ? 'png' : 'jpeg'};base64,${readFileSync(p).toString('base64')}`
const ours = toData(`${outDir}/checkpoint-shell-en.png`)
const ref = toData(reference)
const ctx = await browser.newContext({ viewport: { width: 2400, height: 1000 } })
const page = await ctx.newPage()
await page.setContent(`<!doctype html><html><body style="margin:0;background:#04070f;color:#dfe6f3;font:16px 'Segoe UI',sans-serif;display:flex;gap:24px;padding:24px;align-items:flex-start">
  <figure style="margin:0;flex:0 0 auto"><figcaption style="margin-bottom:8px">Reference (docs/design)</figcaption><img src="${ref}" style="height:900px;border-radius:12px"></figure>
  <figure style="margin:0;flex:0 0 auto"><figcaption style="margin-bottom:8px">CyberTwin (real backend, Edge, 1440x900)</figcaption><img src="${ours}" style="height:900px;border-radius:12px"></figure>
</body></html>`)
await page.waitForTimeout(300)
await page.screenshot({ path: `${outDir}/checkpoint-compare.png`, fullPage: true })
await browser.close()
console.log('checkpoint images written to', outDir)
