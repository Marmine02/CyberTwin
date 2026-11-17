// Number/date formatting per language, consistent with the backend (i18n/catalog.py).
import type { Lang } from './index'

const LOCALE: Record<Lang, string> = { en: 'en-GB', tr: 'tr-TR', az: 'az-Latn-AZ' }

function group(lang: Lang, value: number, digits: number): string {
  const fixed = Math.abs(value).toFixed(digits)
  const [int = '0', frac] = fixed.split('.')
  const sep = lang === 'en' ? ',' : '.'
  const dec = lang === 'en' ? '.' : ','
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, sep)
  return (value < 0 ? '-' : '') + grouped + (frac ? dec + frac : '')
}

export function fmtNumber(lang: Lang, value: number, digits = 1): string {
  return group(lang, value, digits)
}

export function fmtScore(lang: Lang, value: number): string {
  return group(lang, value, 1)
}

export function fmtDelta(lang: Lang, value: number): string {
  return (value > 0 ? '+' : '') + group(lang, value, 1)
}

/** Probability (0..1) as percent: en 71.6%, tr %71,6, az 71,6% */
export function fmtProb(lang: Lang, p: number, digits = 1): string {
  const n = group(lang, p * 100, digits)
  return lang === 'tr' ? `%${n}` : `${n}%`
}

/** Percentage value (0..100) */
export function fmtPct(lang: Lang, v: number, digits = 0): string {
  const n = group(lang, v, digits)
  return lang === 'tr' ? `%${n}` : `${n}%`
}

export function fmtDateTime(lang: Lang, iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat(LOCALE[lang], {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(d)
}

export function fmtTime(lang: Lang, iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat(LOCALE[lang], { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(d)
}
