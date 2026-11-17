import AxeBuilder from '@axe-core/playwright'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { API, LANGS, PAGES, SDE, applyTop3, expect, openApp, resetDemo, runScenario, test } from './fixtures'
import { clippedElements, dataStrings, englishOnlyWords, findLeaks, horizontalOverflow, visibleText } from './quality'

let data: string[] = []
const english = englishOnlyWords()

test.beforeAll(async ({ request }) => {
  // A rich state: runs on r1, a remediation (r2) and its revert (r3).
  const twinId = await resetDemo(request)
  await runScenario(request, twinId)
  const rem = await applyTop3(request, twinId)
  expect((await request.post(`${API}/remediations/${rem.id}/revert`)).status()).toBe(201)
  await runScenario(request, twinId, 'credential_compromise')
  await runScenario(request, twinId, SDE)
  data = await dataStrings(request)
})

test('english-fragment detector catches an injected English string (negative control)', async ({ page }) => {
  await openApp(page, '/', 'tr')
  expect(findLeaks(await visibleText(page), english, data)).toEqual([])
  await page.evaluate(() => {
    const s = document.createElement('span')
    s.textContent = 'Run simulation and inspect results'
    document.querySelector('main')?.prepend(s)
  })
  const leaks = findLeaks(await visibleText(page), english, data)
  expect(leaks.join(' ')).toContain('simulation')
  // Sanity: the English UI is full of words from the English-only set.
  await page.getByTestId('lang-en').click()
  expect(findLeaks(await visibleText(page), english, data).length).toBeGreaterThan(5)
})

for (const lang of LANGS) {
  for (const [key, path] of PAGES) {
    test(`${lang} ${key}: no English fragments, no clipping, axe clean`, async ({ page }) => {
      await openApp(page, path, lang)
      await expect(page.getByTestId(`page-${key}`)).toBeVisible()
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(900) // entrance animations, count-ups, SSE sections
      if (lang !== 'en') {
        const leaks = findLeaks(await visibleText(page), english, data)
        expect(leaks, `English fragments on ${lang} ${path}`).toEqual([])
      }
      expect(await clippedElements(page), `clipped text on ${lang} ${path}`).toEqual([])
      const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
      const serious = axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
      expect(serious.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`), `axe on ${lang} ${path}`).toEqual([])
    })
  }
}

for (const width of [1024, 1280, 1440]) {
  test(`layout at ${width}px: no horizontal overflow, rail and content visible`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    for (const lang of LANGS) {
      for (const [key, path] of PAGES) {
        await openApp(page, path, lang)
        await expect(page.getByTestId(`page-${key}`)).toBeVisible()
        await page.waitForTimeout(500)
        expect(await horizontalOverflow(page), `${width}px ${lang} ${path}`).toEqual([])
        await expect(page.getByTestId(`nav-${key}`)).toBeInViewport()
        expect(await clippedElements(page), `clipping at ${width}px ${lang} ${path}`).toEqual([])
      }
    }
  })
}

test('map keeps labels readable: zoom never below 11px labels', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 })
  await openApp(page, '/map')
  await page.waitForTimeout(800)
  const px = await page.getByTestId('node-web-01').locator('.font-mono').evaluate((el) => el.getBoundingClientRect().height)
  const fontPx = await page.getByTestId('node-web-01').locator('.font-mono').evaluate((el) => {
    const t = getComputedStyle(el.closest('.react-flow__viewport') as HTMLElement).transform
    const scale = t === 'none' ? 1 : new DOMMatrix(t).a
    return parseFloat(getComputedStyle(el).fontSize) * scale
  })
  expect(px).toBeGreaterThan(0)
  expect(fontPx).toBeGreaterThanOrEqual(11)
  await expect(page.locator('.react-flow__attribution')).toBeHidden()
})

test('Azerbaijani/Turkish glyphs render: ə/Ə fall back to IBM Plex Sans, the rest use Rajdhani', async ({ page }) => {
  await openApp(page, '/', 'az')
  // Subsets load lazily (unicode-range): load the Turkish/Azerbaijani glyphs explicitly first.
  await page.evaluate(async () => {
    await document.fonts.load("600 48px Rajdhani", 'ğıİöşçüĞŞÇÖÜəƏ')
    await document.fonts.load("600 48px 'IBM Plex Sans'", 'ğıİöşçüĞŞÇÖÜəƏ')
    await document.fonts.ready
  })
  const result = await page.evaluate(() => {
    const draw = (font: string, ch: string) => {
      const c = document.createElement('canvas')
      c.width = 80
      c.height = 80
      const ctx = c.getContext('2d')
      if (!ctx) throw new Error('no 2d canvas context')
      ctx.font = font
      ctx.fillText(ch, 10, 60)
      return Array.from(ctx.getImageData(0, 0, 80, 80).data).join(',')
    }
    const stack = (ch: string) => draw("600 48px Rajdhani, 'IBM Plex Sans', sans-serif", ch)
    const raj = (ch: string) => draw('600 48px Rajdhani', ch)
    const plex = (ch: string) => draw("600 48px 'IBM Plex Sans'", ch)
    const out: Record<string, string> = {}
    for (const ch of ['ə', 'Ə']) out[ch] = stack(ch) === plex(ch) && plex(ch) !== draw('600 48px monospace', ch) ? 'plex' : 'WRONG'
    for (const ch of ['ğ', 'ı', 'İ', 'ö', 'ş', 'ç', 'ü', 'Ğ', 'Ş', 'Ç', 'Ö', 'Ü']) out[ch] = stack(ch) === raj(ch) && raj(ch) !== plex(ch) ? 'rajdhani' : 'WRONG'
    return out
  })
  for (const [ch, v] of Object.entries(result)) expect(v, `glyph ${ch}`).not.toBe('WRONG')
  await expect(page.getByTestId('panel-topology').locator('h2')).toHaveText(/Şəbəkə/i)
})

test('frontend build contains no API key material', () => {
  const dist = resolve(import.meta.dirname, '..', 'dist')
  const files: string[] = []
  const walk = (d: string) => {
    for (const f of readdirSync(d, { withFileTypes: true })) {
      if (f.isDirectory()) walk(resolve(d, f.name))
      else if (/\.(js|css|html|json|map)$/.test(f.name)) files.push(resolve(d, f.name))
    }
  }
  walk(dist)
  expect(files.length).toBeGreaterThan(1)
  const patterns = [/sk-ant-[A-Za-z0-9_-]{8,}/, /\bsk-[A-Za-z0-9]{20,}/, /CYBERTWIN_AI_API_KEY/, /AI_API_KEY/, /x-api-key/i, /Bearer\s+[A-Za-z0-9._-]{12,}/]
  for (const f of files) {
    const text = readFileSync(f, 'utf8')
    for (const p of patterns) expect(p.test(text), `${p} in ${f}`).toBe(false)
  }
})
