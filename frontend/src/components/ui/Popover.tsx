import { useEffect, useRef, useState, type ReactNode } from 'react'

interface Props {
  button: (p: { open: boolean; toggle: () => void; id: string }) => ReactNode
  children: (close: () => void) => ReactNode
  align?: 'left' | 'right'
  id: string
  width?: number
}

/** Small accessible popover: closes on outside click and Escape. */
export function Popover({ button, children, align = 'right', id, width = 320 }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  return (
    <div ref={ref} className="relative">
      {button({ open, toggle: () => setOpen((v) => !v), id })}
      {open && (
        <div id={id} role="dialog" className={`glass absolute top-[calc(100%+8px)] z-50 ${align === 'right' ? 'right-0' : 'left-0'}`}
          style={{ width, maxWidth: 'calc(100vw - 24px)' }}>
          <div className="relative z-[2] p-2">{children(() => setOpen(false))}</div>
        </div>
      )}
    </div>
  )
}
