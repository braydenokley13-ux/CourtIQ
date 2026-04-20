'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import type { Position, SkillLevel } from '@courtiq/core'
import { AgeScreen } from './screens/AgeScreen'
import { PositionScreen } from './screens/PositionScreen'
import { SkillScreen } from './screens/SkillScreen'
import { GoalScreen } from './screens/GoalScreen'
import { CalibrationScreen, type CalibrationAttempt } from './screens/CalibrationScreen'
import { IQResultScreen } from './screens/IQResultScreen'
import { trackOnboardingCompleted } from './analytics'

type Step = 'age' | 'position' | 'skill' | 'goal' | 'calibration' | 'result'

const STEP_ORDER: Step[] = ['age', 'position', 'skill', 'goal', 'calibration', 'result']

interface OnboardingState {
  age: number | 'hidden' | null
  position: Position | null
  skill: SkillLevel | null
  goal: string | null
  calibrationAttempts: CalibrationAttempt[]
}

export function OnboardingWizard() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('age')
  const [saving, setSaving] = useState(false)
  const [state, setState] = useState<OnboardingState>({
    age: null,
    position: null,
    skill: null,
    goal: null,
    calibrationAttempts: [],
  })

  const stepIndex = STEP_ORDER.indexOf(step)

  function setAge(age: number | 'hidden') {
    setState((s) => ({ ...s, age }))
    setStep('position')
  }

  function setPosition(position: Position) {
    setState((s) => ({ ...s, position }))
    setStep('skill')
  }

  function setSkill(skill: SkillLevel) {
    setState((s) => ({ ...s, skill }))
    setStep('goal')
  }

  function setGoal(goal: string) {
    setState((s) => ({ ...s, goal }))
    setStep('calibration')
  }

  function setCalibrationDone(attempts: CalibrationAttempt[]) {
    setState((s) => ({ ...s, calibrationAttempts: attempts }))
    setStep('result')
  }

  async function handleComplete(startingIQ: number) {
    setSaving(true)
    try {
      const res = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          age: state.age,
          position: state.position,
          skill_level: state.skill,
          goal: state.goal,
          starting_iq: startingIQ,
          calibration_attempts: state.calibrationAttempts,
        }),
      })

      if (!res.ok) throw new Error('Failed to save onboarding data')

      trackOnboardingCompleted({
        age: state.age ?? 'hidden',
        position: state.position!,
        skill: state.skill!,
        goal: state.goal!,
        starting_iq: startingIQ,
      })

      router.push('/home')
    } catch {
      setSaving(false)
    }
  }

  function handleBack() {
    const prevIdx = stepIndex - 1
    if (prevIdx >= 0) setStep(STEP_ORDER[prevIdx])
  }

  return (
    <div className="min-h-dvh bg-bg-0 flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 pt-6 pb-4">
        {/* Back button */}
        <button
          onClick={handleBack}
          className={[
            'w-9 h-9 rounded-xl border border-hairline flex items-center justify-center',
            'text-foreground-mute hover:text-foreground hover:border-hairline-2 transition-all',
            stepIndex === 0 ? 'invisible' : '',
          ].join(' ')}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M11 4L6 9l5 5"/>
          </svg>
        </button>

        {/* Wordmark */}
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-brand flex items-center justify-center">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M6.5 1.5L10 3.5V7.5C10 9.8 8.3 11.8 6.5 12.5C4.7 11.8 3 9.8 3 7.5V3.5L6.5 1.5Z" fill="#021810"/>
            </svg>
          </div>
          <span className="font-display font-bold text-[16px] text-foreground">CourtIQ</span>
        </div>

        {/* Step indicator dots */}
        <div className="flex items-center gap-1.5">
          {STEP_ORDER.slice(0, -1).map((s, i) => (
            <div
              key={s}
              className={[
                'rounded-full transition-all duration-200',
                i < stepIndex ? 'w-2 h-2 bg-brand' :
                i === stepIndex ? 'w-3 h-2 bg-brand' :
                'w-2 h-2 bg-bg-3',
              ].join(' ')}
            />
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[430px] mx-auto px-4 py-4 pb-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
            >
              {step === 'age' && <AgeScreen onNext={setAge} />}
              {step === 'position' && <PositionScreen onNext={setPosition} />}
              {step === 'skill' && <SkillScreen onNext={setSkill} />}
              {step === 'goal' && <GoalScreen onNext={setGoal} />}
              {step === 'calibration' && <CalibrationScreen onComplete={setCalibrationDone} />}
              {step === 'result' && (
                <IQResultScreen
                  attempts={state.calibrationAttempts}
                  onContinue={handleComplete}
                  loading={saving}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
