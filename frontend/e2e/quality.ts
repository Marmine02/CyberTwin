// Shared checks for i18n fragments, clipping and layout (run inside the page).
import type { APIRequestContext, Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { API } from './fixtures'

const shared = resolve(import.meta.dirname, '..', '..', 'shared', 'i18n')
const load = (f: string) => JSON.parse(readFileSync(resolve(shared, f), 'utf8')) as Record<string, unknown>

function strings(o: unknown, out: string[] = []): string[] {
  if (typeof o === 'string') out.push(o)
  else if (o && typeof o === 'object') for (const v of Object.values(o)) strings(v, out)
  return out
}

const WORD = /[A-Za-zÇĞİÖŞÜçğıöşüƏə]{4,}/g
// Technical terms and names used verbatim in every language.
const ALLOW = new Set(['cybertwin', 'kerberoasting', 'kerberoastable', 'mitre', 'json', 'ipv4', 'cvss', 'northwind', 'logistics',
  'tcp', 'udp', 'firewall', 'internet', 'admin', 'domain', 'http', 'https'])

/** English UI words that never appear in the TR/AZ catalogs: seeing one on a TR/AZ page is a leak. */
export function englishOnlyWords(): Set<string> {
  const en = [...strings(load('en.json')), ...strings(load('ui.en.json'))].join(' ')
  const other = [...strings(load('tr.json')), ...strings(load('ui.tr.json')), ...strings(load('az.json')), ...strings(load('ui.az.json'))]
    .join(' ').toLowerCase()
  const otherWords = new Set(other.match(WORD) ?? [])
  const out = new Set<string>()
  for (const w of en.replace(/\{\{[^}]+\}\}/g, ' ').match(WORD) ?? []) {
    const lw = w.toLowerCase()
    if (!otherWords.has(lw) && !ALLOW.has(lw)) out.add(lw)
  }
  return out
}

/** Strings that are user data (asset names, CVE titles, ...) and legitimately stay as entered. */
export async function dataStrings(request: APIRequestContext): Promise<string[]> {
  const twins = await (await request.get(`${API}/twins`)).json()
  const m = await (await request.get(`${API}/twins/${twins[0].id}/model`)).json()
  const out: string[] = [twins[0].name]
  for (const a of m.assets) {
    out.push(a.name, a.os)
    for (const s of a.software) out.push(`${s.name} ${s.version}`, s.name)
    for (const p of a.open_ports) out.push(p.version, p.service)
  }
  for (const p of m.principals) out.push(p.name)
  for (const v of m.vulnerabilities) out.push(v.title)
  for (const r of m.firewall_rules) out.push(r.description)
  for (const c of m.connections) out.push(c.label)
  const cat = await (await request.get(`${API}/vulns/catalog`)).json()
  for (const c of cat) out.push(c.title)
  return out.filter((s) => s && s.length > 2).sort((a, b) => b.length - a.length)
}

export async function visibleText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const parts: string[] = []
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    let n: Node | null
    while ((n = walker.nextNode())) {
      const el = n.parentElement
      if (!el || !n.textContent?.trim()) continue
      if (el.closest('[translate="no"], .mono, script, style, svg, .sr-only, code, [aria-hidden="true"]')) continue
      const st = getComputedStyle(el)
      if (st.visibility === 'hidden' || st.display === 'none' || el.getClientRects().length === 0) continue
      parts.push(n.textContent)
    }
    return parts.join(' \n ')
  })
}

export function findLeaks(text: string, english: Set<string>, data: string[]): string[] {
  let t = text
  for (const d of data) t = t.split(d).join(' ')
  const hits = new Set<string>()
  for (const w of t.match(/[A-Za-zÇĞİÖŞÜçğıöşüƏə]{4,}/g) ?? []) {
    if (english.has(w.toLowerCase())) {
      const i = t.indexOf(w)
      hits.add(`${w} … "${t.slice(Math.max(0, i - 30), i + w.length + 30).replace(/\s+/g, ' ')}"`)
    }
  }
  return [...hits]
}

/** Elements whose text is cut: content wider/taller than the box with overflow hidden/clip. */
export async function clippedElements(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = []
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      if (el.closest('.react-flow, iframe, svg, .sr-only, .skeleton, [role="application"]')) continue
      if (el.querySelector('.react-flow, [role="application"]')) continue
      const st = getComputedStyle(el)
      if (st.display === 'none' || st.visibility === 'hidden' || el.getClientRects().length === 0) continue
      const hiddenX = st.overflowX === 'hidden' || st.overflowX === 'clip'
      const hiddenY = st.overflowY === 'hidden' || st.overflowY === 'clip'
      const text = (el.innerText || '').trim()
      if (!text) continue
      const cutX = hiddenX && el.scrollWidth > el.clientWidth + 1
      const cutY = hiddenY && el.scrollHeight > el.clientHeight + 2 && st.webkitLineClamp !== 'none'
      const ellipsis = st.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1
      if (cutX || cutY || ellipsis) {
        const id = el.getAttribute('data-testid') ?? el.className.toString().slice(0, 60)
        out.push(`<${el.tagName.toLowerCase()} ${id}> "${text.slice(0, 60)}" (${el.scrollWidth}x${el.scrollHeight} > ${el.clientWidth}x${el.clientHeight})`)
      }
    }
    return out
  })
}

export async function horizontalOverflow(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = []
    const w = document.documentElement.clientWidth
    if (document.documentElement.scrollWidth > w + 1) out.push(`page scrollWidth ${document.documentElement.scrollWidth} > ${w}`)
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('header *, nav *, main *'))) {
      if (el.closest('.react-flow, [role="application"], .overflow-x-auto, table')) continue
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      if (r.right > w + 1) out.push(`<${el.tagName.toLowerCase()} ${el.getAttribute('data-testid') ?? el.className.toString().slice(0, 50)}> right=${Math.round(r.right)} > ${w}`)
    }
    return out.slice(0, 10)
  })
}
