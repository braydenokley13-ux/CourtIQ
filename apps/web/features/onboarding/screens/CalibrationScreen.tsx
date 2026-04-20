'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Court } from '@/components/court/Court'
import { PrimaryButton } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Icon } from '@/components/ui/Icon'
import { CALIBRATION_SCENARIOS, type CalibrationScenario } from '../calibration-scenarios'

export interface CalibrationAttempt {
  scenario_id: string
  choice_id: string
  is_correct: boolean
  time_ms: number
}

type Phase = 'prompt' | 'feedback'

interface CalibrationScreenProps {
  onComplete: (attempts: CalibrationAttempt[]) => void
}

const CHOICE_LABELS = ['A', 'B', 'C', 'D']

export function CalibrationScreen({ onComplete }: CalibrationScreenProps) {
  const [scenarioIdx, setScenarioIdx] = useState(0)
  const [phase, setPhase] = useState<Phase>('prompt')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [attempts, setAttempts] = useState<CalibrationAttempt[]>([])
  const [elapsed, setElapsed] = useState(0) // ms since scenario shown
  const startedAt = useRef<number>(Date.now())
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const scenario: CalibrationScenario = CALIBRATION_SCENARIOS[scenarioIdx]
  const total = CALIBRATION_SCENARIOS.length

  useEffect(() => {
    startedAt.current = Date.now()
    setElapsed(0)
    timerRef.current = setInterval(() => {
      setElapsed(Date.now() - startedAt.current)
    }, 100)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [scenarioIdx])

  function handleChoice(choiceId: string) {
    if (phase !== 'prompt') return
    if (timerRef.current) clearInterval(timerRef.current)

    const timeMs = Date.now() - startedAt.current
    const choice = scenario.choices.find((c) => c.id === choiceId)!
    const attempt: CalibrationAttempt = {
      scenario_id: scenario.id,
      choice_id: choiceId,
      is_correct: choice.is_correct,
      time_ms: timeMs,
    }

    setSelectedId(choiceId)
    setPhase('feedback')
    setAttempts((prev) => [...prev, attempt])
  }

  function handleNext() {
    const nextIdx = scenarioIdx + 1
    if (nextIdx >= total) {
      onComplete([...attempts])
    } else {
      setScenarioIdx(nextIdx)
      setPhase('prompt')
      setSelectedId(null)
    }
  }

  const selectedChoice = selectedId ? scenario.choices.find((c) => c.id === selectedId) : null
  const timerSecs = Math.max(0, 12 - elapsed / 1000)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="font-ui text-[12px] text-foreground-mute uppercase tracking-[0.5px]">
            Calibration
          </p>
          <p className="font-display font-bold text-[18px] text-foreground mt-0.5">
            Scenario {scenarioIdx + 1} of {total}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Chip color={timerSecs < 3 ? 'var(--heat)' : 'var(--info)'}>
            <Icon name="clock" size={11} />
            <span className="font-mono text-[12px]">{timerSecs.toFixed(1)}s</span>
          </Chip>
          <Chip>Diff {scenario.difficulty}</Chip>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-bg-2 rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-brand rounded-full"
          initial={{ width: `${(scenarioIdx / total) * 100}%` }}
          animate={{ width: `${((scenarioIdx + (phase === 'feedback' ? 1 : 0)) / total) * 100}%` }}
          transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}
        />
      </div>

      {/* Court visualization */}
      <div className="rounded-2xl overflow-hidden bg-court-fill border border-hairline flex justify-center py-2">
        <Court
          width={320}
          height={280}
          courtState={scenario.court_state}
          you="you"
        />
      </div>

      {/* Prompt */}
      <div className="px-1">
        <p className="font-display font-semibold text-[17px] text-foreground leading-snug">
          {scenario.prompt}
        </p>
      </div>

      {/* Choices */}
      <div className="space-y-2.5">
        {scenario.choices.map((choice, idx) => {
          const isSelected = selectedId === choice.id
          const isCorrect = choice.is_correct
          const showResult = phase === 'feedback'

          let borderColor = 'border-hairline hover:border-hairline-2'
          let bg = 'bg-bg-1 hover:bg-bg-2'

          if (showResult) {
            if (isCorrect) {
              borderColor = 'border-brand'
              bg = 'bg-brand/10'
            } else if (isSelected && !isCorrect) {
              borderColor = 'border-heat'
              bg = 'bg-heat/10'
            }
          }

          return (
            <motion.button
              key={choice.id}
              onClick={() => handleChoice(choice.id)}
              disabled={phase === 'feedback'}
              whileTap={phase === 'prompt' ? { scale: 0.98 } : {}}
              className={[
                'w-full p-3.5 rounded-xl border text-left transition-all duration-100',
                'flex items-start gap-3',
                borderColor, bg,
                phase === 'feedback' ? 'cursor-default' : 'cursor-pointer',
              ].join(' ')}
            >
              <span className={[
                'flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center',
                'font-mono text-[13px] font-bold',
                showResult && isCorrect ? 'bg-brand text-brand-ink' :
                showResult && isSelected && !isCorrect ? 'bg-heat text-white' :
                'bg-bg-2 text-foreground-dim',
              ].join(' ')}>
                {showResult && isCorrect ? (
                  <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
                    <path d="M1 5l4 4 6-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ) : showResult && isSelected && !isCorrect ? (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M2 2l6 6M8 2L2 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                ) : (
                  CHOICE_LABELS[idx]
                )}
              </span>
              <div className="flex-1 min-w-0">
                <span className="block font-ui text-[14px] text-foreground leading-snug">
                  {choice.label}
                </span>
                {showResult && (isSelected || isCorrect) && (
                  <motion.span
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.08, duration: 0.16 }}
                    className="block font-ui text-[12px] text-foreground-dim mt-1 leading-snug"
                  >
                    {choice.feedback_text}
                  </motion.span>
                )}
              </div>
            </motion.button>
          )
        })}
      </div>

      {/* Feedback panel */}
      <AnimatePresence>
        {phase === 'feedback' && selectedChoice && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
            className={[
              'rounded-2xl p-4 border',
              selectedChoice.is_correct
                ? 'bg-brand/8 border-brand/30'
                : 'bg-heat/8 border-heat/30',
            ].join(' ')}
          >
            <div className="flex items-center gap-2.5 mb-2">
              {selectedChoice.is_correct ? (
                <>
                  <Icon name="check" size={18} color="var(--brand)" />
                  <span className="font-display font-bold text-[15px] text-brand">Correct!</span>
                </>
              ) : (
                <>
                  <Icon name="x" size={18} color="var(--heat)" />
                  <span className="font-display font-bold text-[15px] text-heat">Not quite</span>
                </>
              )}
            </div>
            <p className="font-ui text-[13px] text-foreground-dim leading-relaxed">
              {scenario.explanation_md.replace(/\*\*/g, '')}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Next / Continue button — only shown in feedback phase */}
      <AnimatePresence>
        {phase === 'feedback' && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.2 }}
          >
            <PrimaryButton onClick={handleNext} icon="arrow-right">
              {scenarioIdx + 1 >= total ? 'See Your IQ' : 'Next Scenario'}
            </PrimaryButton>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
