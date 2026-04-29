'use client'

import { motion } from 'framer-motion'

interface WinBurstProps {
  /** Re-mount key. Bumping this re-fires the animation. */
  triggerKey: number
  xpDelta: number
  iqDelta: number
  streak: number
  /** Praise headline ("Great Read", "Locked In"). */
  headline: string
  /** Optional micro-praise — the cue the kid noticed. */
  microPraise?: string
}

/**
 * Win celebration that pops over the court when the user picks the
 * best read. XP / IQ / streak each get a quick scale-in so the reward
 * feels earned, and a confetti-style spark ring fires once. Lives at
 * the page level so it can render above the canvas without affecting
 * scenario layout.
 */
export function WinBurst({
  triggerKey,
  xpDelta,
  iqDelta,
  streak,
  headline,
  microPraise,
}: WinBurstProps) {
  return (
    <motion.div
      key={triggerKey}
      initial={{ opacity: 0, y: 16, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
      className="relative overflow-hidden rounded-2xl border-2 border-brand/60 bg-gradient-to-br from-brand/15 via-bg-1 to-bg-1 p-4 shadow-brand"
    >
      <SparkRing />
      <div className="relative flex items-center gap-3">
        <motion.div
          initial={{ rotate: -10, scale: 0.6 }}
          animate={{ rotate: 0, scale: 1 }}
          transition={{ delay: 0.05, duration: 0.35, ease: [0.34, 1.56, 0.64, 1] }}
          className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-brand text-brand-ink shadow-brand"
          aria-hidden
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 13l4 4L19 7" />
          </svg>
        </motion.div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[18px] font-bold leading-tight text-brand">
            {headline}
          </p>
          {microPraise ? (
            <p className="mt-0.5 truncate text-[12px] text-text-dim">{microPraise}</p>
          ) : null}
        </div>
      </div>
      <div className="relative mt-3 grid grid-cols-3 gap-2">
        <RewardChip
          label="XP"
          value={`+${xpDelta}`}
          color="var(--xp)"
          delay={0.15}
        />
        <RewardChip
          label="IQ"
          value={iqDelta > 0 ? `+${iqDelta}` : `${iqDelta}`}
          color="var(--iq)"
          delay={0.25}
        />
        <RewardChip
          label="Streak"
          value={streak > 0 ? `${streak} 🔥` : '—'}
          color="var(--heat)"
          delay={0.35}
          dim={streak === 0}
        />
      </div>
    </motion.div>
  )
}

function RewardChip({
  label,
  value,
  color,
  delay,
  dim,
}: {
  label: string
  value: string
  color: string
  delay: number
  dim?: boolean
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.9 }}
      animate={{ opacity: dim ? 0.55 : 1, y: 0, scale: 1 }}
      transition={{ delay, duration: 0.32, ease: [0.34, 1.56, 0.64, 1] }}
      className="rounded-xl border border-hairline-2 bg-bg-1/80 px-3 py-2 text-center"
    >
      <p
        className="font-display text-[18px] font-bold leading-tight tabular-nums"
        style={{ color }}
      >
        {value}
      </p>
      <p className="text-[9px] font-bold uppercase tracking-[1.2px] text-text-mute">
        {label}
      </p>
    </motion.div>
  )
}

function SparkRing() {
  // Pure SVG burst — eight short rays that scale-fade once. Cheap to
  // render, no canvas/three deps, stays in-flow with the brand glow.
  const rays = Array.from({ length: 8 })
  return (
    <motion.svg
      aria-hidden
      className="pointer-events-none absolute -left-2 -top-2 h-16 w-16"
      viewBox="0 0 100 100"
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: [0, 0.9, 0], scale: [0.6, 1.3, 1.6] }}
      transition={{ duration: 0.8, ease: 'easeOut' }}
    >
      {rays.map((_, i) => {
        const angle = (360 / rays.length) * i
        return (
          <line
            key={i}
            x1="50"
            y1="50"
            x2="50"
            y2="20"
            stroke="rgba(59,227,131,0.7)"
            strokeWidth="2.5"
            strokeLinecap="round"
            transform={`rotate(${angle} 50 50)`}
          />
        )
      })}
    </motion.svg>
  )
}
