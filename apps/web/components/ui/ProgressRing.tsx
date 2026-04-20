'use client'

import { motion } from 'framer-motion'

interface ProgressRingProps {
  value: number
  max?: number
  size?: number
  stroke?: number
  color?: string
  trackColor?: string
  children?: React.ReactNode
}

export function ProgressRing({
  value,
  max = 100,
  size = 80,
  stroke = 6,
  color = '#3BE383',
  trackColor = 'rgba(255,255,255,0.06)',
  children,
}: ProgressRingProps) {
  const radius = (size - stroke) / 2
  const circumference = radius * 2 * Math.PI
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  const offset = circumference - (pct / 100) * circumference

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={stroke}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
        />
      </svg>
      {children && (
        <div className="absolute inset-0 flex items-center justify-center">
          {children}
        </div>
      )}
    </div>
  )
}
