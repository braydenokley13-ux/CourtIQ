'use client'

import { useEffect, useRef } from 'react'
import { useMotionValue, useTransform, animate, motion } from 'framer-motion'

interface NumberTickerProps {
  value: number
  duration?: number
  format?: (n: number) => string
  className?: string
}

export function NumberTicker({
  value,
  duration = 0.6,
  format = (n) => Math.round(n).toString(),
  className = '',
}: NumberTickerProps) {
  const motionVal = useMotionValue(value)
  const display = useTransform(motionVal, format)
  const isFirst = useRef(true)

  useEffect(() => {
    if (isFirst.current) {
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
