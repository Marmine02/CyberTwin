import { animate, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'

interface Props {
  value: number
  format: (v: number) => string
  duration?: number
  className?: string
  testId?: string
}

/** Animated number. The final text is always the exact formatted value. */
export function CountUp({ value, format, duration = 0.9, className, testId }: Props) {
  const reduce = useReducedMotion()
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  useEffect(() => {
    if (reduce) return
    const controls = animate(from.current, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setShown(v),
      onComplete: () => setShown(value),
    })
    from.current = value
    return () => controls.stop()
  }, [value, duration, reduce])
  return (
    <span className={className} data-testid={testId} data-value={value}>
      {format(reduce ? value : shown)}
    </span>
  )
}
