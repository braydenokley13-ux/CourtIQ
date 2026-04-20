'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import type { Position } from '@courtiq/core'
import { PrimaryButton } from '@/components/ui/Button'

const POSITIONS: { value: Position; label: string; abbr: string; desc: string }[] = [
  { value: 'PG', abbr: 'PG', label: 'Point Guard', desc: 'Lead the offense, set the table' },
  { value: 'SG', abbr: 'SG', label: 'Shooting Guard', desc: 'Score and create off the dribble' },
  { value: 'SF', abbr: 'SF', label: 'Small Forward', desc: 'Versatile defender and scorer' },
  { value: 'PF', abbr: 'PF', label: 'Power Forward', desc: 'Strength in the paint, stretch the floor' },
  { value: 'C', abbr: 'C', label: 'Center', desc: 'Anchor the defense, control the paint' },
  { value: 'ALL', abbr: '∞', label: 'I play everywhere', desc: 'No specific position' },
]

interface PositionScreenProps {
  onNext: (position: Position) => void
}

export function PositionScreen({ onNext }: PositionScreenProps) {
  const [selected, setSelected] = useState<Position | null>(null)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-6"
    >
      <div>
        <h2 className="font-display font-bold text-[26px] tracking-[-0.4px] text-foreground">
          What's your position?
        </h2>
        <p className="mt-2 font-ui text-[15px] text-foreground-dim">
          We'll tailor scenarios to your role on the court.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {POSITIONS.map((pos) => {
          const isActive = selected === pos.value
          return (
            <motion.button
              key={pos.value}
              onClick={() => setSelected(pos.value)}
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.08 }}
              className={[
                'relative p-4 rounded-2xl border text-left transition-all duration-100',
                isActive
                  ? 'bg-brand/10 border-brand shadow-brand-sm'
                  : 'bg-bg-1 border-hairline hover:border-hairline-2 hover:bg-bg-2',
                pos.value === 'ALL' ? 'col-span-2' : '',
              ].join(' ')}
            >
              {isActive && (
                <motion.div
                  layoutId="pos-check"
                  className="absolute top-3 right-3 w-5 h-5 rounded-full bg-brand flex items-center justify-center"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                >
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                    <path d="M1 4l3 3 5-6" stroke="#021810" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </motion.div>
              )}
              <span className={[
                'block font-mono text-[22px] font-bold mb-1',
                isActive ? 'text-brand' : 'text-foreground-dim',
              ].join(' ')}>
                {pos.abbr}
              </span>
              <span className="block font-display font-semibold text-[15px] text-foreground">
                {pos.label}
              </span>
              <span className="block font-ui text-[12px] text-foreground-mute mt-0.5 leading-snug">
                {pos.desc}
              </span>
            </motion.button>
          )
        })}
      </div>

      <PrimaryButton
        onClick={() => selected && onNext(selected)}
        disabled={!selected}
        icon="arrow-right"
      >
        Continue
      </PrimaryButton>
    </motion.div>
  )
}
