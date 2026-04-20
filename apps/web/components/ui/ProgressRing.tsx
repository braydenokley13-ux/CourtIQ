'use client'

import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { progressFill } from '@/lib/motion'

interface ProgressRingProps {
  value: number
  max?: number
  size?: number
  strokeWidth?: number
  color?: string
  trackColor?: string
  children?: ReactNode
  className?: string
}

export function ProgressRing({
  value,
  max = 100,
  size = 84,
  strokeWidth = 2.5,
  color = '#3BE383',
  trackColor = 'rgba(255,255,255,0.06)',
  children,
  className = '',
}: ProgressRingProps) {
  const r = (size - strokeWidth * 2) / 2
  const circumference = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  const dashOffset = circumference * (1 - pct / 100)

  return (
    <div
      className={['relative inline-flex items-center justify-center', className]
        .filter(Boolean)
        .join(' ')}
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ transform: 'rotate(-90deg)' }}
        aria-hidden="true"
      >
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
        />
        {/* Fill */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: dashOffset }}
          transition={progressFill}
        />
      </svg>

      {/* Children render centred inside the ring */}
      {children && (
        <div className="absolute inset-0 flex items-center justify-center">
          {children}
        </div>
      )}
    </div>
  )
}
