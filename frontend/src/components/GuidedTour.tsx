import { ArrowLeft, ArrowRight, Compass, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router'
import { TOUR } from '../lib/tour'
import { useTour } from '../store/tour'

function useTargetRect(selector: string | null, path: string) {
  const [rect, setRect] = useState<DOMRect | null>(null)
  useEffect(() => {
    if (!selector) return
    let raf = 0
    const tick = () => {
      const el = document.querySelector(selector)
      const r = el?.getBoundingClientRect() ?? null
      setRect((prev) => (prev && r && prev.x === r.x && prev.y === r.y && prev.width === r.width && prev.height === r.height ? prev : r))
      raf = window.setTimeout(tick, 250)
    }
    tick()
    return () => window.clearTimeout(raf)
  }, [selector, path])
  return selector ? rect : null
}

/** Non-blocking: only the card takes pointer events; the highlight ring ignores them. */
export function GuidedTour() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const step = useTour((s) => s.step)
  const next = useTour((s) => s.next)
  const back = useTour((s) => s.back)
  const finish = useTour((s) => s.finish)
  const current = step !== null ? TOUR[step] : undefined
  const rect = useTargetRect(current && location.pathname === current.route ? current.target : null, location.pathname)
  if (!current || step === null) return null
  const onRoute = location.pathname === current.route
  return (
    <>
      {rect && onRoute && (
        <div className="pointer-events-none fixed z-[90] rounded-2xl anim-pulse" aria-hidden="true" data-testid="tour-highlight"
          style={{ left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12, border: '2px solid #22d3ee', boxShadow: '0 0 0 9999px rgb(4 7 15 / 0.0), 0 0 28px #22d3ee' }} />
      )}
      <aside className="glass glass-violet fixed bottom-4 right-4 z-[95] w-[360px] max-w-[calc(100vw-24px)]" role="dialog" aria-modal="false"
        aria-labelledby="tour-title" data-testid="guided-tour">
        <div className="relative z-[2] flex flex-col gap-2 p-4">
          <div className="flex items-center gap-2">
            <Compass size={18} className="text-violet" />
            <span className="text-[12px] uppercase tracking-wider text-ink-400">{t('ui.tour.progress', { n: step + 1, total: TOUR.length })}</span>
            <button type="button" className="ml-auto grid h-7 w-7 place-items-center rounded-lg text-ink-400 hover:text-ink-100" onClick={finish} aria-label={t('ui.tour.skip')} data-testid="tour-close">
              <X size={16} />
            </button>
          </div>
          <h2 id="tour-title" className="font-display text-[20px] font-bold leading-tight text-ink-100">{t(`ui.tour.${current.key}.title`)}</h2>
          <p className="text-[13.5px] leading-relaxed text-ink-200">{t(`ui.tour.${current.key}.body`)}</p>
          {!onRoute && (
            <button type="button" className="btn-ghost w-fit" onClick={() => navigate(current.route)} data-testid="tour-go">{t('ui.tour.goThere')}</button>
          )}
          <div className="mt-1 flex items-center gap-2">
            <button type="button" className="text-[13px] text-ink-400 underline hover:text-ink-200" onClick={finish} data-testid="tour-skip">{t('ui.tour.skip')}</button>
            <button type="button" className="btn-ghost ml-auto" disabled={step === 0} onClick={() => { back(); const prev = TOUR[step - 1]; if (prev) navigate(prev.route) }} data-testid="tour-back">
              <ArrowLeft size={14} /> {t('ui.tour.back')}
            </button>
            <button type="button" className="btn-neon" data-testid="tour-next"
              onClick={() => { const nxt = TOUR[step + 1]; next(TOUR.length); if (nxt) navigate(nxt.route) }}>
              {step + 1 === TOUR.length ? t('ui.tour.done') : t('ui.tour.next')} {step + 1 < TOUR.length && <ArrowRight size={14} />}
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
