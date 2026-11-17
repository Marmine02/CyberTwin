import { describe, expect, it } from 'vitest'
import en from '../../shared/i18n/ui.en.json'
import tr from '../../shared/i18n/ui.tr.json'
import az from '../../shared/i18n/ui.az.json'

function flatten(o: Record<string, unknown>, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(o)) {
    if (v && typeof v === 'object') Object.assign(out, flatten(v as Record<string, unknown>, `${prefix}${k}.`))
    else out[`${prefix}${k}`] = String(v)
  }
  return out
}

describe('UI catalogs', () => {
  const fe = flatten(en)
  it.each([['tr', tr], ['az', az]] as const)('%s has exactly the English keys and placeholders', (_, cat) => {
    const fc = flatten(cat)
    expect(Object.keys(fc).sort()).toEqual(Object.keys(fe).sort())
    for (const [k, v] of Object.entries(fe)) {
      const vars = (s: string) => (s.match(/\{\{\s*\w+\s*\}\}/g) ?? []).map((x) => x.replace(/\s/g, '')).sort()
      expect(vars(fc[k] ?? ''), k).toEqual(vars(v))
      expect((fc[k] ?? '').trim().length, k).toBeGreaterThan(0)
    }
  })
})
