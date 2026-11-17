import { create } from 'zustand'
import type { ScenarioId } from '../api/types'
import i18n, { type Lang, persistLang, storedLang } from '../i18n'

interface AppState {
  lang: Lang
  twinId: number | null
  /** null = follow the latest revision */
  revision: number | null
  scenario: ScenarioId
  foothold: string | null
  setLang: (lang: Lang) => void
  setTwin: (id: number) => void
  setRevision: (rev: number | null) => void
  setScenario: (s: ScenarioId) => void
  setFoothold: (id: string | null) => void
}

export const useApp = create<AppState>((set) => ({
  lang: storedLang(),
  twinId: null,
  revision: null,
  scenario: 'sensitive_data_exposure',
  foothold: null,
  setLang: (lang) => {
    persistLang(lang)
    void i18n.changeLanguage(lang)
    set({ lang })
  },
  setTwin: (twinId) => set({ twinId, revision: null }),
  setRevision: (revision) => set({ revision }),
  setScenario: (scenario) => set({ scenario }),
  setFoothold: (foothold) => set({ foothold }),
}))
