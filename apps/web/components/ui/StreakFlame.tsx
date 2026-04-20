'use client'

import { motion } from 'framer-motion'
import { Icon } from './Icon'

interface StreakFlameProps {
  count: number
  /** Whether the streak is currently alive and should pulse */
  active?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizeMap = {
  sm: { icon: 12, text: 'text-sm',  gap: 'gap-1',   pad: 'py-1 px-2' },
  md: { icon: 14, text: 'text-sm',  gap: 'gap-1.5', pad: 'py-[6px] px-[10px]' },
  lg: { icon: 18, text: 'text-base', gap: 'gap-2',  pad: 'py-2 px-3' },
} as const

export function StreakFlame({
  count,
  active = true,
  size = 'md',
  className = '',
}: StreakFlameProps) {
  const { icon, text, gap, pad } = sizeMap[size]
  const alive = active && count > 0

  return (
    <motion.div
      animate={alive ? { scale: [1, 1.04, 1] } : { scale: 1 }}
      transition={{
        duration: 1.6,
        ease: 'easeInOut',
        repeat: alive ? Infinity : 0,
      }}
      className={[
        'inline-flex items-center rounded-full',
        'border border-heat/30 bg-heat/[0.12]',
        gap,
        pad,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <Icon name="flame" size={icon} color="#FF4D6D" />
      <span
        className={['font-display font-bold text-heat', text].join(' ')}
        aria-label={`${count}-day streak`}
      >
        {count}
      </span>
    </motion.div>
  )
}
