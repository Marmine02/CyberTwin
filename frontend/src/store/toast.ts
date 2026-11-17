import { create } from 'zustand'

export interface Toast {
  id: number
  kind: 'success' | 'error' | 'info'
  title: string
  body?: string
  action?: { label: string; onClick: () => void }
  /** ms; 0 keeps it until closed */
  ttl: number
  testId?: string
}

interface ToastState {
  toasts: Toast[]
  push: (t: Omit<Toast, 'id' | 'ttl'> & { ttl?: number }) => number
  dismiss: (id: number) => void
}

let seq = 0

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (t) => {
    const id = ++seq
    set((s) => ({ toasts: [...s.toasts.slice(-3), { ttl: 6000, ...t, id }] }))
    return id
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}))

export const toast = {
  success: (title: string, body?: string, extra?: Partial<Toast>) => useToasts.getState().push({ kind: 'success', title, body, ...extra }),
  error: (title: string, body?: string, extra?: Partial<Toast>) => useToasts.getState().push({ kind: 'error', title, body, ttl: 9000, ...extra }),
  info: (title: string, body?: string, extra?: Partial<Toast>) => useToasts.getState().push({ kind: 'info', title, body, ...extra }),
}
