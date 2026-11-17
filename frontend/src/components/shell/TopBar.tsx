import { Bell, CircleHelp, FlaskConical, Languages } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '../../api/client'
import { qk, useCurrentTwin, useEvents, useRevisions, useTwins } from '../../api/hooks'
import { LANGS, type Lang } from '../../i18n'
import { fmtDateTime } from '../../i18n/format'
import { noteText } from '../../lib/notes'
import { useApp } from '../../store/app'
import { useTour } from '../../store/tour'
import { Popover } from '../ui/Popover'
import { LogoMark } from './Logo'

function TwinRevisionSelect() {
  const { t } = useTranslation()
  const { data: twins } = useTwins()
  const twin = useCurrentTwin()
  const { data: revisions } = useRevisions()
  const revision = useApp((s) => s.revision)
  const setRevision = useApp((s) => s.setRevision)
  const setTwin = useApp((s) => s.setTwin)
  const head = twin?.head_revision
  return (
    <div className="flex min-w-0 items-center gap-2" data-tour="twin">
      <label className="sr-only" htmlFor="twin-select">{t('ui.top.twin')}</label>
      <select id="twin-select" className="field w-auto max-w-[220px] truncate py-1.5" value={twin?.id ?? ''}
        onChange={(e) => setTwin(Number(e.target.value))} data-testid="twin-select">
        {twins?.map((tw) => <option key={tw.id} value={tw.id}>{tw.name}</option>)}
      </select>
      <label className="sr-only" htmlFor="rev-select">{t('ui.top.revision')}</label>
      <select id="rev-select" className="field w-auto py-1.5 font-mono" data-testid="revision-select"
        value={revision ?? 'head'} onChange={(e) => setRevision(e.target.value === 'head' ? null : Number(e.target.value))}>
        <option value="head">{head ? t('ui.top.head', { n: head }) : '…'}</option>
        {revisions?.filter((r) => r.number !== head).map((r) => (
          <option key={r.number} value={r.number}>{t('ui.top.rev', { n: r.number })}</option>
        ))}
      </select>
    </div>
  )
}

function Notifications() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as Lang
  const { data } = useEvents()
  const qc = useQueryClient()
  const markRead = useMutation({
    mutationFn: () => api.post('/events/read'),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.events }),
  })
  const unread = data?.unread ?? 0
  return (
    <Popover id="notif-pop" width={380} button={({ open, toggle, id }) => (
      <button type="button" className="relative grid h-10 w-10 place-items-center rounded-xl text-ink-200 hover:text-cyan"
        aria-expanded={open} aria-controls={id} onClick={toggle} data-testid="notifications-button">
        {/* The accessible name comes from the content, so it always includes the visible count. */}
        <Bell size={21} aria-hidden="true" />
        <span className="sr-only">{t('ui.top.notifications')}</span>
        {unread > 0 && (
          <span className="absolute right-1 top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-magenta px-1 text-[11px] font-bold text-ink-950 shadow-[0_0_10px_#e879f9]"
            data-testid="notifications-badge">{unread}</span>
        )}
        {unread > 0 && <span className="sr-only">{t('ui.top.notificationsUnread', { count: unread })}</span>}
      </button>
    )}>
      {() => (
        <div className="flex max-h-[60vh] flex-col">
          <div className="flex items-center justify-between gap-2 px-2 py-1.5">
            <span className="panel-title text-[13px]">{t('ui.top.notifications')}</span>
            <button type="button" className="text-xs text-cyan hover:underline disabled:opacity-40" disabled={unread === 0}
              onClick={() => markRead.mutate()}>{t('ui.top.markRead')}</button>
          </div>
          <ul className="flex flex-col gap-1 overflow-y-auto pr-1">
            {data?.items.length ? data.items.map((e) => (
              <li key={e.id} className={`rounded-lg px-2 py-1.5 text-sm ${e.read ? 'text-ink-300' : 'bg-cyan/6 text-ink-100'}`}>
                <div>{noteText(t, { code: e.code, params: e.params })}</div>
                <div className="text-[11px] text-ink-400">{fmtDateTime(lang, e.created_at)}</div>
              </li>
            )) : <li className="px-2 py-3 text-sm text-ink-300">{t('ui.top.noNotifications')}</li>}
          </ul>
        </div>
      )}
    </Popover>
  )
}

function HelpMenu() {
  const { t } = useTranslation()
  const restart = useTour((s) => s.restart)
  return (
    <Popover id="help-pop" width={260} button={({ open, toggle, id }) => (
      <button type="button" className="grid h-10 w-10 place-items-center rounded-xl text-ink-200 hover:text-cyan"
        aria-label={t('ui.top.help')} aria-expanded={open} aria-controls={id} onClick={toggle} data-testid="help-button">
        <CircleHelp size={21} />
      </button>
    )}>
      {(close) => (
        <div className="flex flex-col gap-1">
          <button type="button" className="rounded-lg px-3 py-2 text-left text-sm hover:bg-cyan/10" data-testid="restart-tour"
            onClick={() => { restart(); close() }}>{t('ui.top.restartTour')}</button>
          <a className="rounded-lg px-3 py-2 text-sm hover:bg-cyan/10" href="/api/v1/docs" target="_blank" rel="noreferrer">
            {t('ui.top.apiDocs')}
          </a>
        </div>
      )}
    </Popover>
  )
}

function LanguageSwitch() {
  const { t } = useTranslation()
  const lang = useApp((s) => s.lang)
  const setLang = useApp((s) => s.setLang)
  return (
    <div role="radiogroup" aria-label={t('ui.top.language')} className="flex items-center gap-0.5 rounded-xl border border-cyan/25 bg-ink-950/50 p-0.5">
      <Languages size={15} className="mx-1 text-ink-300" aria-hidden="true" />
      {LANGS.map((l) => (
        <button key={l} type="button" role="radio" aria-checked={lang === l} title={t(`ui.lang.${l}`)} data-testid={`lang-${l}`}
          onClick={() => setLang(l)}
          className={`rounded-lg px-2 py-1 text-xs font-semibold uppercase tracking-wider ${lang === l ? 'bg-cyan/20 text-cyan shadow-[0_0_10px_rgb(34_211_238/0.35)]' : 'text-ink-300 hover:text-ink-100'}`}>
          {l}
        </button>
      ))}
    </div>
  )
}

export function TopBar() {
  const { t } = useTranslation()
  return (
    <header className="glass z-20 flex min-h-[64px] shrink-0 flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
      <div className="relative z-[2] flex min-w-0 items-center gap-3">
        <LogoMark />
        <div className="min-w-0">
          {/* lang=en keeps the brand from Turkish/Azerbaijani uppercase rules (i -> İ) */}
          <div lang="en" translate="no" className="font-display text-[22px] font-bold uppercase leading-none tracking-[0.08em] text-ink-100">{t('ui.app.name')}</div>
          <div className="truncate text-[12.5px] text-ink-300">{t('ui.app.tagline')}</div>
        </div>
      </div>
      <div className="relative z-[2] hidden h-8 w-px bg-cyan/20 md:block" />
      <div className="relative z-[2] min-w-0"><TwinRevisionSelect /></div>
      <div className="relative z-[2] ml-auto flex flex-wrap items-center gap-2">
        <span className="chip border-secure/40 bg-secure/10 text-emerald-200" data-testid="sim-badge" title={t('ui.app.simOnlyDetail')}>
          <FlaskConical size={14} className="text-secure" /> {t('ui.app.simOnly')}
        </span>
        <HelpMenu />
        <Notifications />
        <LanguageSwitch />
      </div>
    </header>
  )
}
