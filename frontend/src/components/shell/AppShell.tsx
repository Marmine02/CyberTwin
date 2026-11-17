import { Outlet } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useTwins } from '../../api/hooks'
import { IconRail } from './IconRail'
import { TopBar } from './TopBar'

export function AppShell() {
  const { t } = useTranslation()
  useTwins()
  return (
    <div className="relative z-[1] flex h-full min-h-0 flex-col gap-3 p-3">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 btn-neon">
        {t('ui.app.skipToContent')}
      </a>
      <TopBar />
      <div className="flex min-h-0 flex-1 gap-3">
        <IconRail />
        <main id="main" className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden pr-1">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
