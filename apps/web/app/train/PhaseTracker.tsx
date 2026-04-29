'use client'

import { motion } from 'framer-motion'

export type LearnPhase = 'watch' | 'read' | 'choose' | 'consequence' | 'replay' | 'win'

interface PhaseTrackerProps {
  /** The active phase of the BDW learning loop. */
  phase: LearnPhase
}

interface PhaseStep {
  id: LearnPhase | LearnPhase[]
  label: string
  shortLabel: string
}

/**
 * Surfaces the four-phase learning loop above the court so kids see
 * where they are: Watch → Read → Choose → Learn. Steps light up in
 * order, the active step pulses, and completed steps stay filled. The
 * tracker only shows for decoder scenarios — legacy fixtures hide it
 * because they don't have a freeze beat.
 */
const STEPS: PhaseStep[] = [
  { id: 'watch', label: 'Watch', shortLabel: 'Watch' },
  { id: 'read', label: 'Read', shortLabel: 'Read' },
  { id: 'choose', label: 'Choose', shortLabel: 'Pick' },
  { id: ['consequence', 'replay', 'win'], label: 'Learn', shortLabel: 'Learn' },
]

const ORDER: LearnPhase[] = ['watch', 'read', 'choose', 'consequence', 'replay', 'win']

function isComplete(step: PhaseStep, phase: LearnPhase): boolean {
  const stepIds = Array.isArray(step.id) ? step.id : [step.id]
  const lastIdx = Math.max(...stepIds.map((id) => ORDER.indexOf(id)))
  return ORDER.indexOf(phase) > lastIdx
}

function isActive(step: PhaseStep, phase: LearnPhase): boolean {
  const stepIds = Array.isArray(step.id) ? step.id : [step.id]
  return stepIds.includes(phase)
}

export function PhaseTracker({ phase }: PhaseTrackerProps) {
  return (
    <div
      role="progressbar"
      aria-label="Learning loop progress"
      aria-valuetext={STEPS.find((s) => isActive(s, phase))?.label ?? 'Watch'}
      className="flex items-center gap-1.5"
    >
      {STEPS.map((step, idx) => {
        const active = isActive(step, phase)
        const done = isComplete(step, phase)
        const reached = active || done
        return (
          <div key={step.label} className="flex flex-1 items-center gap-1.5">
            <motion.div
              animate={
                active
                  ? { boxShadow: ['0 0 0 0 rgba(59,227,131,0)', '0 0 0 6px rgba(59,227,131,0.15)', '0 0 0 0 rgba(59,227,131,0)'] }
                  : { boxShadow: '0 0 0 0 rgba(59,227,131,0)' }
              }
              transition={
                active
                  ? { duration: 1.6, repeat: Infinity, ease: 'easeOut' }
                  : { duration: 0 }
              }
              className={[
                'flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold uppercase tracking-[1px] transition-colors',
                done
                  ? 'bg-brand text-brand-ink'
                  : active
                    ? 'bg-brand/20 text-brand ring-1 ring-brand/60'
                    : 'bg-bg-2 text-text-mute ring-1 ring-hairline-2',
              ].join(' ')}
            >
              {done ? '✓' : idx + 1}
            </motion.div>
            <span
              className={[
                'text-[10px] font-bold uppercase tracking-[1.2px] transition-colors',
                reached ? 'text-text' : 'text-text-mute',
              ].join(' ')}
            >
              {step.shortLabel}
            </span>
            {idx < STEPS.length - 1 ? (
              <div
                aria-hidden
                className={[
                  'h-px flex-1 transition-colors',
                  done ? 'bg-brand/60' : 'bg-hairline-2',
                ].join(' ')}
              />
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
