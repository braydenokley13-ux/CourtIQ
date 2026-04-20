'use client'

import { motion } from 'framer-motion'

interface StreakFlameProps {
  streak: number
  size?: number
  active?: boolean
}

export function StreakFlame({ streak, size = 32, active = true }: StreakFlameProps) {
  return (
    <div className="flex items-center gap-1.5">
      <motion.div
        animate={active ? { scale: [1, 1.08, 1] } : {}}
        transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
      >
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          {active ? (
            <>
              <path
                d="M12 2s5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 1-5 0 0 2 1 2 3 0-3 2-5 2-8z"
                fill="#FF4D6D"
                stroke="none"
              />
              <path
                d="M12 10s2 2 2 4a2 2 0 0 1-4 0c0-1 .5-1.5.5-2.5 0 0 .8.5.8 1.5C11.3 11.8 12 10 12 10z"
                fill="#FF8A3D"
                stroke="none"
              />
            </>
          ) : (
            <path
              d="M12 2s5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 1-5 0 0 2 1 2 3 0-3 2-5 2-8z"
              fill="#5B6170"
              stroke="none"
            />
          )}
        </svg>
      </motion.div>
      <span
        className="font-display font-bold tabular-nums"
        style={{
          fontSize: size * 0.5625,
          color: active ? '#FF4D6D' : '#5B6170',
        }}
      >
        {streak}
      </span>
    </div>
  )
}
