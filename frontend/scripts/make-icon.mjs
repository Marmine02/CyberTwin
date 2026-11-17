// Renders the CyberTwin logo (public/favicon.svg) at several sizes with Edge and packs them into a
// multi-size Windows .ico (PNG-compressed entries, supported since Windows Vista).
//   node scripts/make-icon.mjs ../assets/cybertwin.ico
import { chromium } from '@playwright/test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const out = resolve(process.argv[2] ?? '../assets/cybertwin.ico')
const svg = readFileSync(new URL('../public/favicon.svg', import.meta.url), 'utf8')
const SIZES = [16, 24, 32, 48, 64, 128, 256]

const browser = await chromium.launch({ channel: 'msedge' })
const page = await browser.newPage()
const pngs = []
for (const size of SIZES) {
  await page.setViewportSize({ width: size, height: size })
  // Small sizes get a solid rounded backdrop so the mark stays visible on any taskbar.
  await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">
    <div style="width:${size}px;height:${size}px;border-radius:${Math.round(size * 0.22)}px;background:radial-gradient(circle at 30% 25%,#13233f,#04070f);display:grid;place-items:center">
      <div style="width:${Math.round(size * 0.86)}px;height:${Math.round(size * 0.86)}px">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div>
    </div></body></html>`)
  pngs.push(await page.screenshot({ omitBackground: true, type: 'png' }))
}
await browser.close()

const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(SIZES.length, 4)
const entries = []
let offset = 6 + 16 * SIZES.length
SIZES.forEach((size, i) => {
  const e = Buffer.alloc(16)
  e.writeUInt8(size >= 256 ? 0 : size, 0)
  e.writeUInt8(size >= 256 ? 0 : size, 1)
  e.writeUInt8(0, 2)
  e.writeUInt8(0, 3)
  e.writeUInt16LE(1, 4)
  e.writeUInt16LE(32, 6)
  e.writeUInt32LE(pngs[i].length, 8)
  e.writeUInt32LE(offset, 12)
  offset += pngs[i].length
  entries.push(e)
})
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, Buffer.concat([header, ...entries, ...pngs]))
writeFileSync(resolve(dirname(out), 'cybertwin-256.png'), pngs[pngs.length - 1])
console.log(`wrote ${out} (${SIZES.join(', ')} px)`)
