import { ChevronRight } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

interface Props {
  title?: string
  /** Route the chevron navigates to. */
  to?: string
  toLabel?: string
  actions?: ReactNode
  index?: number
  variant?: 'default' | 'violet' | 'critical'
  className?: string
  bodyClassName?: string
  children: ReactNode
  testId?: string
}

export function GlassPanel({ title, to, toLabel, actions, index = 0, variant = 'default', className = '', bodyClassName = '', children, testId }: Props) {
  const { t } = useTranslation()
  const reduce = useReducedMotion()
  const variantClass = variant === 'violet' ? 'glass-violet' : variant === 'critical' ? 'glass-critical' : ''
  return (
    <motion.section
      data-testid={testId}
      className={`glass ${variantClass} flex min-w-0 flex-col ${className}`}
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: reduce ? 0 : index * 0.07, ease: [0.22, 1, 0.36, 1] }}
      aria-label={title}
    >
      {(title || actions || to) && (
        <header className="relative z-[2] flex min-w-0 items-center gap-2 px-4 pt-3.5 pb-2">
          {title && <h2 className="panel-title min-w-0 flex-1 text-balance break-words">{title}</h2>}
          {actions}
          {to && (
            <Link
              to={to}
              aria-label={toLabel ?? t('ui.common.goTo', { page: title ?? '' })}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-ink-300 transition-transform hover:translate-x-0.5 hover:text-cyan"
            >
              <ChevronRight size={18} />
            </Link>
          )}
        </header>
      )}
      <div className={`relative z-[2] min-h-0 flex-1 px-4 pb-4 ${bodyClassName}`}>{children}</div>
    </motion.section>
  )
}
