import { create } from 'zustand'

const KEY = 'cybertwin.tour'

function readDone(): boolean {
  try {
    return localStorage.getItem(KEY) === 'done'
  } catch {
    return false
  }
}

function writeDone(done: boolean): void {
  try {
    if (done) localStorage.setItem(KEY, 'done')
    else localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

interface TourState {
  /** index of the active step, or null when the tour is not showing */
  step: number | null
  done: boolean
  start: () => void
  restart: () => void
  next: (total: number) => void
  back: () => void
  finish: () => void
}

export const useTour = create<TourState>((set, get) => ({
  step: readDone() ? null : 0,
  done: readDone(),
  start: () => set({ step: 0 }),
  restart: () => {
    writeDone(false)
    set({ step: 0, done: false })
  },
  next: (total) => {
    const s = get().step ?? 0
    if (s + 1 >= total) get().finish()
    else set({ step: s + 1 })
  },
  back: () => set({ step: Math.max(0, (get().step ?? 0) - 1) }),
  finish: () => {
    writeDone(true)
    set({ step: null, done: true })
  },
}))
