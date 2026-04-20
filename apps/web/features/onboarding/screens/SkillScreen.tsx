'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import type { SkillLevel } from '@courtiq/core'
import { PrimaryButton } from '@/components/ui/Button'

const SKILL_LEVELS: { value: SkillLevel; label: string; desc: string; color: string }[] = [
  {
    value: 'ROOKIE',
    label: 'ROOKIE',
    desc: "I'm learning the fundamentals. Still figuring out rotations and reads.",
    color: 'var(--info)',
  },
  {
    value: 'VARSITY',
    label: 'VARSITY',
    desc: 'I know the game. I understand positioning and can read most situations.',
    color: 'var(--xp)',
  },
  {
    value: 'ELITE',
    label: 'ELITE',
    desc: 'Advanced IQ. I see the game at a high level and make quick, correct reads.',
    color: 'var(--brand)',
  },
]

interface SkillScreenProps {
  onNext: (skill: SkillLevel) => void
}

export function SkillScreen({ onNext }: SkillScreenProps) {
  const [selected, setSelected] = useState<SkillLevel | null>(null)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-6"
    >
      <div>
        <h2 className="font-display font-bold text-[26px] tracking-[-0.4px] text-foreground">
          How's your basketball IQ?
        </h2>
        <p className="mt-2 font-ui text-[15px] text-foreground-dim">
          Be honest — this helps us calibrate your starting point.
        </p>
      </div>

      <div className="space-y-3">
        {SKILL_LEVELS.map((skill) => {
          const isActive = selected === skill.value
          return (
            <motion.button
              key={skill.value}
              onClick={() => setSelected(skill.value)}
              whileTap={{ scale: 0.98 }}
              transition={{ duration: 0.08 }}
              style={isActive ? { borderColor: skill.color, boxShadow: `0 0 0 1px ${skill.color}20` } : {}}
              className={[
                'w-full p-4 rounded-2xl border text-left transition-all duration-100',
                isActive ? 'bg-bg-2' : 'bg-bg-1 border-hairline hover:border-hairline-2 hover:bg-bg-2',
              ].join(' ')}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <span
                    className="block font-mono font-bold text-[13px] tracking-[1px] mb-1"
                    style={{ color: skill.color }}
                  >
                    {skill.label}
                  </span>
                  <span className="block font-ui text-[14px] text-foreground leading-snug">
                    {skill.desc}
                  </span>
                </div>
                {isActive && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5"
                    style={{ background: skill.color }}
                  >
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4l3 3 5-6" stroke="#021810" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </motion.div>
                )}
              </div>
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
