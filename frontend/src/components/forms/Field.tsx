import { Plus, Trash2 } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

export const ID_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/
export const IPV4_RE = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/

export type Errors = Record<string, string>

interface FieldProps {
  label: string
  error?: string
  hint?: string
  children: (p: { id: string; invalid: boolean; describedBy?: string }) => ReactNode
  className?: string
}

export function Field({ label, error, hint, children, className = '' }: FieldProps) {
  const id = useId()
  const descId = `${id}-d`
  return (
    <div className={`flex min-w-0 flex-col gap-1 text-[13px] ${className}`}>
      <label htmlFor={id} className="text-ink-300">{label}</label>
      {children({ id, invalid: !!error, describedBy: error || hint ? descId : undefined })}
      {error ? <span id={descId} className="text-[12px] text-rose-300" role="alert">{error}</span>
        : hint ? <span id={descId} className="text-[12px] text-ink-400">{hint}</span> : null}
    </div>
  )
}

export function TextInput({ label, value, onChange, error, hint, disabled, mono, maxLength = 120, testId, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; error?: string; hint?: string; disabled?: boolean; mono?: boolean
  maxLength?: number; testId?: string; type?: string
}) {
  return (
    <Field label={label} error={error} hint={hint}>
      {({ id, invalid, describedBy }) => (
        <input id={id} type={type} className={`field ${mono ? 'font-mono' : ''}`} value={value} disabled={disabled} maxLength={maxLength}
          aria-invalid={invalid} aria-describedby={describedBy} onChange={(e) => onChange(e.target.value)} data-testid={testId} />
      )}
    </Field>
  )
}

export function NumberInput({ label, value, onChange, min, max, step = 1, error, testId, allowEmpty }: {
  label: string; value: number | null; onChange: (v: number | null) => void; min?: number; max?: number; step?: number
  error?: string; testId?: string; allowEmpty?: boolean
}) {
  return (
    <Field label={label} error={error}>
      {({ id, invalid, describedBy }) => (
        <input id={id} type="number" className="field" value={value ?? ''} min={min} max={max} step={step}
          aria-invalid={invalid} aria-describedby={describedBy} data-testid={testId}
          onChange={(e) => onChange(e.target.value === '' ? (allowEmpty ? null : 0) : Number(e.target.value))} />
      )}
    </Field>
  )
}

export function SelectInput<T extends string>({ label, value, onChange, options, error, testId }: {
  label: string; value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; error?: string; testId?: string
}) {
  return (
    <Field label={label} error={error}>
      {({ id, invalid, describedBy }) => (
        <select id={id} className="field" value={value} aria-invalid={invalid} aria-describedby={describedBy} data-testid={testId}
          onChange={(e) => onChange(e.target.value as T)}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}
    </Field>
  )
}

export function Checkbox({ label, checked, onChange, testId }: { label: string; checked: boolean; onChange: (v: boolean) => void; testId?: string }) {
  return (
    <label className="flex items-center gap-2 text-[13px] text-ink-200">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} data-testid={testId} className="h-4 w-4 accent-cyan-400" />
      {label}
    </label>
  )
}

export function MultiSelect({ label, options, value, onChange }: {
  label: string; options: { value: string; label: string }[]; value: string[]; onChange: (v: string[]) => void
}) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-1 text-[13px]">
      <legend className="mb-1 text-ink-300">{label}</legend>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => {
          const on = value.includes(o.value)
          return (
            <button key={o.value} type="button" aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== o.value) : [...value, o.value])}
              className={`chip ${on ? 'border-cyan bg-cyan/20 text-cyan' : 'text-ink-300'}`}>{o.label}</button>
          )
        })}
      </div>
    </fieldset>
  )
}

/** Editable list of rows (ports, software, permissions). */
export function ListEditor<T>({ label, items, onChange, empty, render, addLabel, newItem, error }: {
  label: string; items: T[]; onChange: (items: T[]) => void; empty: string; addLabel: string; newItem: () => T
  render: (item: T, set: (v: T) => void, index: number) => ReactNode; error?: string
}) {
  const { t } = useTranslation()
  return (
    <fieldset className="flex flex-col gap-2 rounded-xl border border-cyan/12 p-3 text-[13px]">
      <legend className="px-1 text-ink-300">{label}</legend>
      {items.length === 0 && <p className="text-ink-400">{empty}</p>}
      {items.map((item, i) => (
        <div key={i} className="flex items-end gap-2">
          <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 md:grid-cols-4">{render(item, (v) => onChange(items.map((x, j) => (j === i ? v : x))), i)}</div>
          <button type="button" className="mb-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-critical/30 text-rose-300 hover:bg-critical/10"
            onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label={t('ui.common.removeRow', { n: i + 1 })}>
            <Trash2 size={15} />
          </button>
        </div>
      ))}
      {error && <span className="text-[12px] text-rose-300" role="alert">{error}</span>}
      <button type="button" className="btn-ghost w-fit" onClick={() => onChange([...items, newItem()])}><Plus size={14} /> {addLabel}</button>
    </fieldset>
  )
}
