import { useTranslation } from 'react-i18next'
import { NavLink } from 'react-router'
import { NAV } from './nav'

export function IconRail() {
  const { t } = useTranslation()
  return (
    <nav aria-label={t('ui.nav.label')} className="glass z-10 flex w-[92px] shrink-0 flex-col items-stretch gap-1 overflow-y-auto py-3">
      {NAV.map(({ key, path, icon: Icon }) => (
        <NavLink
          key={key}
          to={path}
          end={path === '/'}
          data-testid={`nav-${key}`}
          className={({ isActive }) =>
            `group relative z-[2] mx-2 flex flex-col items-center gap-1 rounded-xl px-1 py-2.5 text-center transition-transform hover:-translate-y-0.5 ${
              isActive ? 'bg-cyan/10 text-cyan' : 'text-ink-300 hover:text-ink-100'
            }`
          }
        >
          {({ isActive }) => (
            <>
              {isActive && <span className="absolute left-[-8px] top-2 bottom-2 w-[3px] rounded-full bg-cyan shadow-[0_0_10px_#22d3ee]" />}
              <Icon size={24} strokeWidth={1.7} style={isActive ? { filter: 'drop-shadow(0 0 6px #22d3ee)' } : undefined} />
              <span className="text-[12px] leading-tight text-balance hyphens-auto">{t(`ui.nav.${key}`)}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
