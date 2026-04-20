'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { PrimaryButton } from '@/components/ui/Button'
import { Icon, type IconName } from '@/components/ui/Icon'

const GOALS: { value: string; label: string; icon: IconName }[] = [
  { value: 'Get more minutes', label: 'Get more minutes', icon: 'play' },
  { value: 'Understand the game', label: 'Understand the game', icon: 'brain' },
  { value: 'Be a better teammate', label: 'Be a better teammate', icon: 'shield' },
  { value: 'Just for fun', label: 'Just for fun', icon: 'bolt' },
]

interface GoalScreenProps {
  onNext: (goal: string) => void
}

export function GoalScreen({ onNext }: GoalScreenProps) {
  const [selected, setSelected] = useState<string | null>(null)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-6"
    >
      <div>
        <h2 className="font-display font-bold text-[26px] tracking-[-0.4px] text-foreground">
          What's your main goal?
        </h2>
        <p className="mt-2 font-ui text-[15px] text-foreground-dim">
          We'll focus your sessions around what matters to you.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {GOALS.map((goal) => {
          const isActive = selected === goal.value
          return (
            <motion.button
              key={goal.value}
              onClick={() => setSelected(goal.value)}
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.08 }}
              className={[
                'p-4 rounded-2xl border text-left transition-all duration-100 aspect-square flex flex-col justify-between',
                isActive
                  ? 'bg-brand/10 border-brand shadow-brand-sm'
                  : 'bg-bg-1 border-hairline hover:border-hairline-2 hover:bg-bg-2',
              ].join(' ')}
            >
              <Icon
                name={goal.icon}
                size={24}
                color={isActive ? 'var(--brand)' : 'var(--foreground-dim)'}
              />
              <span className={[
                'block font-display font-semibold text-[15px] leading-snug mt-3',
                isActive ? 'text-foreground' : 'text-foreground-dim',
              ].join(' ')}>
                {goal.label}
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
        Start Calibration
      </PrimaryButton>
    </motion.div>
  )
}
