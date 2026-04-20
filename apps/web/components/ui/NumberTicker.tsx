'use client'

import { useEffect, useRef } from 'react'
import { animate, motion, useMotionValue, useTransform } from 'framer-motion'

function defaultFormat(n: number): string {
  return Math.round(n).toLocaleString()
}

interface NumberTickerProps {
  value: number
  /** Animation duration in seconds */
  duration?: number
  /** Custom formatter; defaults to toLocaleString with rounding */
  format?: (n: number) => string
  className?: string
}

/**
 * Animates a numeric value from its previous value to the new one.
 * Used for IQ Score and XP counters in the UI.
 */
export function NumberTicker({
  value,
  duration = 0.6,
  format = defaultFormat,
  className = '',
}: NumberTickerProps) {
  const motionVal = useMotionValue(value)
  const display = useTransform(motionVal, format)
  const isFirst = useRef(true)

  useEffect(() => {
    if (isFirst.current) {
      // On mount, set immediately without animation
      motionVal.set(value)
      isFirst.current = false
      return
    }
    const controls = animate(motionVal, value, {
      duration,
      ease: [0.2, 0.8, 0.2, 1],
    })
    return () => controls.stop()
  }, [value, duration, motionVal])

  return <motion.span className={className}>{display}</motion.span>
}
