import { AlertTriangle, Inbox, RotateCw } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { errorText } from '../../lib/errors'

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />
}

export function Loading({ rows = 3, label }: { rows?: number; label?: string }) {
  const { t } = useTranslation()
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-2 py-1">
      <span className="sr-only">{label ?? t('ui.common.loading')}</span>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className={i === 0 ? 'h-5 w-2/3' : 'h-4 w-full'} />
      ))}
    </div>
  )
}

export function Empty({ children, action, icon }: { children: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-5 text-center text-sm text-ink-300">
      <span className="text-cyan/70">{icon ?? <Inbox size={22} />}</span>
      <p className="max-w-sm text-pretty">{children}</p>
      {action}
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useTranslation()
  return (
    <div role="alert" className="flex flex-col items-start gap-2 rounded-xl border border-critical/40 bg-critical/8 p-3 text-sm">
      <div className="flex items-center gap-2 font-semibold text-rose-200">
        <AlertTriangle size={16} className="text-critical" /> {t('ui.error.title')}
      </div>
      <p className="text-ink-200">{errorText(t, error)}</p>
      {onRetry && (
        <button type="button" className="btn-ghost" onClick={onRetry}>
          <RotateCw size={14} /> {t('ui.common.retry')}
        </button>
      )}
    </div>
  )
}
