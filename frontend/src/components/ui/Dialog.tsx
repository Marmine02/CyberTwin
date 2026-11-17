import { X } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

interface Props {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: number
  testId?: string
  variant?: 'default' | 'critical'
}

/** Modal dialog: focus moves inside, Escape closes, focus returns to the opener. */
export function Dialog({ open, title, onClose, children, footer, width = 560, testId, variant = 'default' }: Props) {
  const { t } = useTranslation()
  const reduce = useReducedMotion()
  const id = useId()
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const opener = document.activeElement as HTMLElement | null
    const first = box.current?.querySelector<HTMLElement>('input,select,textarea,button:not([data-close])')
    ;(first ?? box.current)?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Tab' && box.current) {
        const items = [...box.current.querySelectorAll<HTMLElement>('button,input,select,textarea,a[href],[tabindex]:not([tabindex="-1"])')]
          .filter((el) => !el.hasAttribute('disabled'))
        const firstEl = items[0]
        const lastEl = items[items.length - 1]
        if (!firstEl || !lastEl) return
        if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus() }
        else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      opener?.focus?.()
    }
  }, [open, onClose])
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-[100] grid place-items-center bg-ink-950/70 p-4 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <motion.div ref={box} role="dialog" aria-modal="true" aria-labelledby={id} tabIndex={-1} data-testid={testId}
        className={`glass ${variant === 'critical' ? 'glass-critical' : ''} flex max-h-[88vh] w-full flex-col outline-none`} style={{ maxWidth: width }}
        initial={reduce ? false : { opacity: 0, scale: 0.97, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.2 }}>
        <header className="relative z-[2] flex items-center gap-2 px-5 pt-4 pb-2">
          <h2 id={id} className="panel-title flex-1 text-balance">{title}</h2>
          <button type="button" data-close className="grid h-8 w-8 place-items-center rounded-lg text-ink-300 hover:text-ink-100" onClick={onClose} aria-label={t('ui.common.close')}>
            <X size={18} />
          </button>
        </header>
        <div className="relative z-[2] min-h-0 flex-1 overflow-y-auto px-5 pb-4">{children}</div>
        {footer && <footer className="relative z-[2] flex flex-wrap justify-end gap-2 border-t border-cyan/10 px-5 py-3">{footer}</footer>}
      </motion.div>
    </div>,
    document.body,
  )
}

interface ConfirmProps {
  open: boolean
  title: string
  children: ReactNode
  confirmLabel: string
  danger?: boolean
  busy?: boolean
  onConfirm: () => void
  onClose: () => void
  testId?: string
}

export function ConfirmDialog({ open, title, children, confirmLabel, danger, busy, onConfirm, onClose, testId }: ConfirmProps) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} title={title} onClose={onClose} width={480} testId={testId} variant={danger ? 'critical' : 'default'}
      footer={<>
        <button type="button" className="btn-ghost" onClick={onClose}>{t('ui.common.cancel')}</button>
        <button type="button" className={danger ? 'btn-ghost btn-danger' : 'btn-neon'} disabled={busy} onClick={onConfirm} data-testid="confirm-button">
          {confirmLabel}
        </button>
      </>}>
      <div className="text-sm leading-relaxed text-ink-200">{children}</div>
    </Dialog>
  )
}
