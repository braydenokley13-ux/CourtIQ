'use client'

import { motion } from 'framer-motion'
import { progressFill } from '@/lib/motion'

interface ProgressProps {
  value: number
  max?: number
  color?: string
  height?: number
  glow?: boolean
  className?: string
}

export function Progress({ value, max = 100, color = '#3BE383', height = 6, glow = false, className = '' }: ProgressProps) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))

  return (
    <div
      className={`rounded-full bg-white/[0.06] overflow-hidden ${className}`}
      style={{ height }}
    >
      <motion.div
        className="h-full rounded-full"
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={progressFill}
        style={{
          background: color,
          boxShadow: glow ? `0 0 12px ${color}80` : 'none',
        }}
      />
    </div>
  )
}
