'use client'

import { motion } from 'framer-motion'
import type { HTMLAttributes } from 'react'
import { progressFill } from '@/lib/motion'

interface ProgressProps extends HTMLAttributes<HTMLDivElement> {
  value: number
  max?: number
  color?: string
  height?: number
  glow?: boolean
}

export function Progress({
  value,
  max = 100,
  color = '#3BE383',
  height = 6,
  glow = false,
  className = '',
  style,
  ...props
}: ProgressProps) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))

  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={max}
      className={['relative overflow-hidden rounded-full', className]
        .filter(Boolean)
        .join(' ')}
      style={{ height, background: 'rgba(255,255,255,0.06)', ...style }}
      {...props}
    >
      <motion.div
        className="h-full rounded-full"
        style={{
          background: color,
          boxShadow: glow ? `0 0 12px ${color}80` : 'none',
        }}
        initial={{ width: '0%' }}
        animate={{ width: `${pct}%` }}
        transition={progressFill}
      />
    </div>
  )
}
