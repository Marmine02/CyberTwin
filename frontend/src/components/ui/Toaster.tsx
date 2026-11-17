import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useToasts, type Toast } from '../../store/toast'

function Item({ t: item }: { t: Toast }) {
  const { t } = useTranslation()
  const dismiss = useToasts((s) => s.dismiss)
  useEffect(() => {
    if (!item.ttl) return
    const h = window.setTimeout(() => dismiss(item.id), item.ttl)
    return () => window.clearTimeout(h)
  }, [item, dismiss])
  const Icon = item.kind === 'success' ? CheckCircle2 : item.kind === 'error' ? AlertTriangle : Info
  const color = item.kind === 'success' ? 'text-secure' : item.kind === 'error' ? 'text-critical' : 'text-cyan'
  return (
    <div className={`glass ${item.kind === 'error' ? 'glass-critical' : 'glass-violet'} w-[360px] max-w-[calc(100vw-24px)]`} role={item.kind === 'error' ? 'alert' : 'status'} data-testid={item.testId ?? 'toast'}>
      <div className="relative z-[2] flex gap-3 p-4">
        <Icon size={20} className={`mt-0.5 shrink-0 ${color}`} />
        <div className="min-w-0 flex-1">
          <div className="font-display text-[17px] font-semibold leading-tight text-ink-100">{item.title}</div>
          {item.body && <p className="mt-1 text-[13px] leading-snug text-ink-300">{item.body}</p>}
          {item.action && (
            <button type="button" className="btn-neon mt-3 w-full" onClick={() => { item.action?.onClick(); dismiss(item.id) }} data-testid="toast-action">
              {item.action.label}
            </button>
          )}
        </div>
        <button type="button" className="h-6 w-6 shrink-0 text-ink-400 hover:text-ink-100" onClick={() => dismiss(item.id)} aria-label={t('ui.common.close')}>
          <X size={16} />
        </button>
      </div>
    </div>
  )
}

export function Toaster() {
  const toasts = useToasts((s) => s.toasts)
  const reduce = useReducedMotion()
  return (
    <div className="pointer-events-none fixed bottom-4 left-4 z-[120] flex flex-col gap-2" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div key={t.id} className="pointer-events-auto" initial={reduce ? false : { opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            <Item t={t} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
