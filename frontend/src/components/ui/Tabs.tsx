import type { ReactNode } from 'react'

interface Props<K extends string> {
  tabs: { key: K; label: string; count?: number }[]
  active: K
  onChange: (k: K) => void
  label: string
  right?: ReactNode
}

export function Tabs<K extends string>({ tabs, active, onChange, label, right }: Props<K>) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div role="tablist" aria-label={label} className="flex flex-wrap gap-1 rounded-xl border border-cyan/20 bg-ink-950/50 p-1">
        {tabs.map((tab) => (
          <button key={tab.key} type="button" role="tab" aria-selected={active === tab.key} data-testid={`tab-${tab.key}`}
            onClick={() => onChange(tab.key)}
            className={`rounded-lg px-3 py-1.5 text-[13.5px] font-medium transition-colors ${active === tab.key ? 'bg-cyan/18 text-cyan shadow-[0_0_12px_rgb(34_211_238/0.25)]' : 'text-ink-300 hover:text-ink-100'}`}>
            {tab.label}
            {tab.count !== undefined && <span className="ml-1.5 rounded-full bg-ink-700 px-1.5 text-[11px] text-ink-200">{tab.count}</span>}
          </button>
        ))}
      </div>
      {right && <div className="ml-auto flex flex-wrap items-center gap-2">{right}</div>}
    </div>
  )
}
