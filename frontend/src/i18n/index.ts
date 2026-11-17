import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from '../../../shared/i18n/en.json'
import tr from '../../../shared/i18n/tr.json'
import az from '../../../shared/i18n/az.json'
import uiEn from '../../../shared/i18n/ui.en.json'
import uiTr from '../../../shared/i18n/ui.tr.json'
import uiAz from '../../../shared/i18n/ui.az.json'

export const LANGS = ['en', 'tr', 'az'] as const
export type Lang = (typeof LANGS)[number]

export const resources = {
  en: { translation: { ...en, ui: uiEn } },
  tr: { translation: { ...tr, ui: uiTr } },
  az: { translation: { ...az, ui: uiAz } },
} as const

const STORAGE_KEY = 'cybertwin.lang'

export function storedLang(): Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v && (LANGS as readonly string[]).includes(v)) return v as Lang
  } catch {
    /* storage unavailable: fall through to default */
  }
  return 'en'
}

export function persistLang(lang: Lang): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    /* ignore */
  }
}

void i18n.use(initReactI18next).init({
  resources,
  lng: storedLang(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
})

i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng
})
document.documentElement.lang = i18n.language

export default i18n
