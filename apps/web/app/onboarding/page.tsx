'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Court } from '@/components/court'
import type { CourtState } from '@/components/court'
import { createClient } from '@/lib/supabase/client'
import { PrimaryButton } from '@/components/ui/Button'
import { trackOnboardingCompleted } from '@/features/onboarding/analytics'
import type { Position, SkillLevel } from '@courtiq/core'

const ease = [0.22, 1, 0.36, 1]
const TOTAL_STEPS = 5

type Step = 1 | 2 | 3 | 4 | 5

const POSITIONS: Array<{ value: Position; label: string; hint: string }> = [
  { value: 'PG', label: 'PG', hint: 'Point Guard' },
  { value: 'SG', label: 'SG', hint: 'Shooting Guard' },
  { value: 'SF', label: 'SF', hint: 'Small Forward' },
  { value: 'PF', label: 'PF', hint: 'Power Forward' },
  { value: 'C',  label: 'C',  hint: 'Center' },
  { value: 'ALL', label: 'All', hint: 'Play anywhere' },
]

const SKILL_LEVELS: Array<{ value: SkillLevel; label: string; hint: string }> = [
  { value: 'ROOKIE',  label: 'Rookie',  hint: 'New to organized ball or just love the game' },
  { value: 'VARSITY', label: 'Varsity', hint: 'High school / competitive club' },
  { value: 'ELITE',   label: 'Elite',   hint: 'Top AAU, prep, or college-level' },
]

const GOALS = [
  'Make varsity',
  'Dominate AAU',
  'Play college',
  'Play pro one day',
  'Just love the game',
] as const

type Goal = typeof GOALS[number]

type CalibrationScenario = {
  id: string
  difficulty: number
  prompt: string
  court_state: CourtState
  concept_tags: string[]
  render_tier: number
  choices: Array<{ id: string; label: string; order: number }>
}

function CourtLines() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.04]"
      viewBox="0 0 800 800"
      preserveAspectRatio="xMidYMid slice"
      fill="none"
      aria-hidden
    >
      <circle cx="400" cy="400" r="120" stroke="white" strokeWidth="1" />
      <path d="M 160 680 L 160 460 A 240 240 0 0 1 640 460 L 640 680" stroke="white" strokeWidth="1" />
      <rect x="280" y="440" width="240" height="240" stroke="white" strokeWidth="1" />
    </svg>
  )
}

function ProgressDots({ step }: { step: Step }) {
  return (
    <div className="mb-6 flex items-center justify-center gap-1.5">
      {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map(n => (
        <div
          key={n}
          className="h-1 rounded-full transition-all"
          style={{
            width: n === step ? 24 : 8,
            background: n <= step ? '#3BE383' : 'rgba(255,255,255,0.1)',
          }}
        />
      ))}
    </div>
  )
}

export default function OnboardingPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [bootLoading, setBootLoading] = useState(true)

  const [step, setStep] = useState<Step>(1)
  const [direction, setDirection] = useState<1 | -1>(1)

  const [birthYear, setBirthYear] = useState<string>('')
  const [hideAge, setHideAge] = useState(false)
  const [position, setPosition] = useState<Position | null>(null)
  const [skill, setSkill] = useState<SkillLevel | null>(null)
  const [goal, setGoal] = useState<Goal | null>(null)

  // Calibration state
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [scenarios, setScenarios] = useState<CalibrationScenario[]>([])
  const [calibrationLoading, setCalibrationLoading] = useState(false)
  const [calibrationIdx, setCalibrationIdx] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState<{ is_correct: boolean; correct_choice_id: string; feedback_text: string; iq_after: number } | null>(null)
  const [startingIq, setStartingIq] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [finishError, setFinishError] = useState<string | null>(null)
  const [calibrationError, setCalibrationError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }
      setUserId(user.id)
      setBootLoading(false)
    })()
  }, [router])

  function advance() {
    setDirection(1)
    setStep(prev => Math.min(TOTAL_STEPS, prev + 1) as Step)
  }

  function back() {
    setDirection(-1)
    setStep(prev => Math.max(1, prev - 1) as Step)
  }

  async function startCalibration() {
    if (!userId || sessionId) return
    setCalibrationLoading(true)
    setCalibrationError(null)
    try {
      const res = await fetch('/api/session/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ n: 3 }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string; message?: string }
        if (body.error === 'CONTENT_NOT_LOADED') {
          throw new Error('Training content is still loading. Please try again shortly.')
        }
        throw new Error(body.message ?? body.error ?? `Failed to start calibration (HTTP ${res.status}).`)
      }
      const data = await res.json() as { session_run_id?: string; scenarios?: CalibrationScenario[]; meta?: { user_iq: number } }
      if (!data.session_run_id || !Array.isArray(data.scenarios) || data.scenarios.length === 0) {
        throw new Error('Training content is still loading. Please try again shortly.')
      }
      setSessionId(data.session_run_id)
      setScenarios(data.scenarios)
      setStartingIq(data.meta?.user_iq ?? 500)
    } catch (err) {
      console.error('[onboarding/calibration]', err)
      setCalibrationError(err instanceof Error ? err.message : 'Could not start calibration.')
    } finally {
      setCalibrationLoading(false)
    }
  }

  function retryCalibration() {
    setSessionId(null)
    setScenarios([])
    setCalibrationIdx(0)
    setSelected(null)
    setSubmitted(null)
    setStartingIq(null)
    setCalibrationError(null)
    void startCalibration()
  }

  async function submitCalibrationChoice(choiceId: string) {
    if (!userId || !sessionId || submitted || submitting) return
    const current = scenarios[calibrationIdx]
    if (!current) return
    setSelected(choiceId)
    setSubmitting(true)
    try {
      const res = await fetch(`/api/session/${sessionId}/attempt`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userId,
          scenarioId: current.id,
          choiceId,
          timeMs: 4000,
        }),
      })
      if (!res.ok) throw new Error('attempt failed')
      const data = await res.json() as { is_correct: boolean; correct_choice_id: string; feedback_text: string; iq_after: number }
      setSubmitted(data)
      setStartingIq(data.iq_after)
    } catch (err) {
      console.error('[onboarding/attempt]', err)
      setSelected(null)
    } finally {
      setSubmitting(false)
    }
  }

  async function advanceCalibration() {
    const isLast = calibrationIdx >= scenarios.length - 1
    if (!isLast) {
      setCalibrationIdx(idx => idx + 1)
      setSelected(null)
      setSubmitted(null)
      return
    }
    await finishOnboarding()
  }

  async function finishOnboarding() {
    if (!userId || !sessionId) return
    setSubmitting(true)
    setFinishError(null)
    try {
      // End the calibration session
      await fetch(`/api/session/${sessionId}/complete`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId }),
      }).catch(() => {})

      const birthdate = !hideAge && birthYear ? `${birthYear}-01-01` : null

      const res = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          birthdate,
          position,
          skill_level: skill,
          goal,
        }),
      })
      if (!res.ok) throw new Error('complete failed')

      const supabase = createClient()
      const { error: updateError } = await supabase.auth.updateUser({
        data: {
          onboarded: true,
          position,
          skill_level: skill,
          goal,
        },
      })
      if (updateError) throw new Error(updateError.message)

      const age = hideAge || !birthYear
        ? ('hidden' as const)
        : Math.max(0, new Date().getUTCFullYear() - parseInt(birthYear, 10))

      trackOnboardingCompleted({
        age,
        position: position!,
        skill: skill!,
        goal: goal ?? 'unspecified',
        starting_iq: startingIq ?? 500,
      })

      router.push('/home')
      router.refresh()
    } catch (err) {
      console.error('[onboarding/finish]', err)
      setFinishError(err instanceof Error ? err.message : 'Something went wrong finishing onboarding.')
      setSubmitting(false)
    }
  }

  // Pre-kick the calibration session when the user reaches step 5.
  // startCalibration is stable behind the sessionId guard; re-creating
  // it each render doesn't cause a re-fire.
  useEffect(() => {
    if (step === 5 && !sessionId && userId && !calibrationLoading) {
      void startCalibration()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, sessionId, userId, calibrationLoading])

  const currentScenario = scenarios[calibrationIdx]
  const orderedChoices = useMemo(
    () => [...(currentScenario?.choices ?? [])].sort((a, b) => a.order - b.order),
    [currentScenario],
  )

  const canAdvance = useMemo(() => {
    if (step === 1) return hideAge || /^\d{4}$/.test(birthYear)
    if (step === 2) return !!position
    if (step === 3) return !!skill
    if (step === 4) return !!goal
    return false
  }, [step, birthYear, hideAge, position, skill, goal])

  if (bootLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg-0">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-hairline-2 border-t-brand" />
      </div>
    )
  }

  return (
    <main className="relative min-h-dvh overflow-hidden bg-bg-0 text-text">
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(ellipse 70% 55% at 50% 60%, rgba(59,227,131,0.08) 0%, transparent 70%)' }}
      />
      <CourtLines />

      <div className="relative z-10 mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-8 pt-10">
        <ProgressDots step={step} />
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            initial={{ opacity: 0, x: direction * 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -24 }}
            transition={{ duration: 0.3, ease }}
            className="flex flex-1 flex-col"
          >
            {step === 1 && (
              <StepContainer
                eyebrow="Step 1 of 5"
                title="When were you born?"
                subtitle="We use this to match you with age-appropriate scenarios. You can skip if you prefer."
              >
                <div className="space-y-3">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1940}
                    max={new Date().getUTCFullYear()}
                    placeholder="YYYY"
                    value={birthYear}
                    onChange={e => setBirthYear(e.target.value.slice(0, 4))}
                    disabled={hideAge}
                    className="block h-[56px] w-full rounded-xl border border-hairline-2 bg-bg-2 px-4 text-center font-display text-[24px] font-bold text-foreground placeholder:text-foreground-mute transition-colors hover:border-hairline focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25 disabled:opacity-50"
                  />
                  <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-hairline bg-bg-1 p-4">
                    <input
                      type="checkbox"
                      checked={hideAge}
                      onChange={e => setHideAge(e.target.checked)}
                      className="h-4 w-4 accent-brand"
                    />
                    <span className="text-[13px] text-text-dim">I&apos;d rather not say</span>
                  </label>
                </div>
              </StepContainer>
            )}

            {step === 2 && (
              <StepContainer
                eyebrow="Step 2 of 5"
                title="What position do you play?"
                subtitle="Your scenarios will lean into decisions that matter most for your role."
              >
                <div className="grid grid-cols-3 gap-2.5">
                  {POSITIONS.map(p => {
                    const active = position === p.value
                    return (
                      <button
                        key={p.value}
                        type="button"
                        onClick={() => setPosition(p.value)}
                        className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-4 transition-colors ${
                          active
                            ? 'border-brand bg-[rgba(59,227,131,0.08)]'
                            : 'border-hairline-2 bg-bg-1 hover:border-hairline'
                        }`}
                      >
                        <span className={`font-display text-[22px] font-black ${active ? 'text-brand' : 'text-foreground'}`}>
                          {p.label}
                        </span>
                        <span className="text-[11px] text-text-mute leading-tight text-center">{p.hint}</span>
                      </button>
                    )
                  })}
                </div>
              </StepContainer>
            )}

            {step === 3 && (
              <StepContainer
                eyebrow="Step 3 of 5"
                title="What level are you playing at?"
                subtitle="Drives the difficulty mix of your calibration and first sessions."
              >
                <div className="space-y-2.5">
                  {SKILL_LEVELS.map(s => {
                    const active = skill === s.value
                    return (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() => setSkill(s.value)}
                        className={`w-full rounded-xl border px-4 py-4 text-left transition-colors ${
                          active
                            ? 'border-brand bg-[rgba(59,227,131,0.08)]'
                            : 'border-hairline-2 bg-bg-1 hover:border-hairline'
                        }`}
                      >
                        <span className={`block font-display text-[16px] font-bold ${active ? 'text-brand' : 'text-foreground'}`}>
                          {s.label}
                        </span>
                        <span className="mt-0.5 block text-[12px] text-text-dim">{s.hint}</span>
                      </button>
                    )
                  })}
                </div>
              </StepContainer>
            )}

            {step === 4 && (
              <StepContainer
                eyebrow="Step 4 of 5"
                title="What&apos;s your goal?"
                subtitle="No wrong answer — this sets the tone of the coaching you&apos;ll get."
              >
                <div className="space-y-2.5">
                  {GOALS.map(g => {
                    const active = goal === g
                    return (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setGoal(g)}
                        className={`w-full rounded-xl border px-4 py-4 text-left transition-colors ${
                          active
                            ? 'border-brand bg-[rgba(59,227,131,0.08)]'
                            : 'border-hairline-2 bg-bg-1 hover:border-hairline'
                        }`}
                      >
                        <span className={`font-display text-[15px] font-bold ${active ? 'text-brand' : 'text-foreground'}`}>
                          {g}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </StepContainer>
            )}

            {step === 5 && (
              <StepContainer
                eyebrow="Step 5 of 5"
                title="Let&apos;s calibrate your IQ"
                subtitle="3 quick reads. No pressure — we&apos;re just finding your starting line."
              >
                {calibrationError ? (
                  <div className="flex flex-col items-stretch gap-3 py-6">
                    <div className="rounded-2xl border border-[rgba(255,77,109,0.25)] bg-[rgba(255,77,109,0.06)] p-4">
                      <p className="font-display text-[14px] font-bold text-[#FF4D6D]">Couldn&apos;t load scenarios</p>
                      <p className="mt-1 text-[13px] leading-relaxed text-text-dim">{calibrationError}</p>
                    </div>
                    <button
                      type="button"
                      onClick={retryCalibration}
                      className="w-full rounded-xl bg-brand py-3 font-display text-[14px] font-bold uppercase tracking-[0.3px] text-brand-ink"
                    >
                      Try again
                    </button>
                  </div>
                ) : calibrationLoading || !currentScenario ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-10">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-hairline-2 border-t-brand" />
                    <p className="text-[13px] text-text-dim">Loading calibration scenarios…</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-[12px] text-text-dim">
                      <span>Scenario {calibrationIdx + 1} of {scenarios.length}</span>
                      <span>IQ {startingIq ?? 500}</span>
                    </div>
                    <div className="rounded-2xl border border-hairline-2 overflow-hidden bg-bg-1">
                      <Court width={360} height={260} courtState={currentScenario.court_state} you="you" />
                    </div>
                    <p className="text-[14px] text-text-dim">{currentScenario.prompt}</p>
                    <p className="font-display text-[20px] font-bold">What do you do?</p>
                    <div className="space-y-2">
                      {orderedChoices.map((choice, index) => {
                        const letter = String.fromCharCode(65 + index)
                        const isSelected = selected === choice.id
                        const isCorrect = submitted?.correct_choice_id === choice.id
                        const wrongPick = submitted && isSelected && !submitted.is_correct
                        const disabled = !!submitted || submitting
                        return (
                          <button
                            key={choice.id}
                            type="button"
                            onClick={() => void submitCalibrationChoice(choice.id)}
                            disabled={disabled}
                            className="w-full rounded-xl border px-4 py-3 text-left bg-bg-1 disabled:cursor-default"
                            style={{
                              borderColor: isCorrect
                                ? 'var(--brand)'
                                : wrongPick
                                  ? 'var(--heat)'
                                  : 'var(--hairline-2)',
                            }}
                          >
                            <span className="mr-3 text-text-dim">{letter}</span>
                            {choice.label}
                          </button>
                        )
                      })}
                    </div>
                    {submitted && (
                      <div className="rounded-2xl border border-hairline-2 bg-bg-1 p-4 space-y-2">
                        <p className={submitted.is_correct ? 'text-brand font-semibold' : 'text-[color:var(--heat)] font-semibold'}>
                          {submitted.is_correct ? 'Nice read.' : "That's one we can work on."}
                        </p>
                        <p className="text-sm text-text-dim">{submitted.feedback_text}</p>
                        {finishError && (
                          <p className="rounded-lg border border-[rgba(255,77,109,0.25)] bg-[rgba(255,77,109,0.08)] px-3 py-2 text-[13px] text-[#FF4D6D]">
                            {finishError} — tap to retry.
                          </p>
                        )}
                        <button
                          type="button"
                          onClick={() => void advanceCalibration()}
                          disabled={submitting}
                          className="w-full rounded-xl bg-brand py-3 font-display text-[14px] font-bold uppercase tracking-[0.3px] text-brand-ink disabled:opacity-50"
                        >
                          {calibrationIdx >= scenarios.length - 1
                            ? (submitting ? 'Finishing…' : finishError ? 'Retry' : 'Finish calibration')
                            : 'Next scenario'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </StepContainer>
            )}
          </motion.div>
        </AnimatePresence>

        {step < 5 && (
          <div className="mt-6 flex items-center gap-3">
            {step > 1 && (
              <button
                type="button"
                onClick={back}
                className="rounded-xl border border-hairline-2 bg-bg-1 px-5 py-3 font-display text-[13px] font-semibold uppercase tracking-[0.3px] text-foreground-dim transition-colors hover:bg-bg-2"
              >
                Back
              </button>
            )}
            <div className="flex-1">
              <PrimaryButton
                onClick={() => canAdvance && advance()}
                disabled={!canAdvance}
              >
                {step === 4 ? 'Start calibration' : 'Continue'}
              </PrimaryButton>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}

function StepContainer({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow: string
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-1 flex-col">
      <p className="text-[11px] uppercase tracking-[1.5px] text-text-mute">{eyebrow}</p>
      <h1 className="mt-2 font-display text-[28px] font-black leading-tight tracking-tight">{title}</h1>
      {subtitle && <p className="mt-2 text-[14px] leading-relaxed text-text-dim">{subtitle}</p>}
      <div className="mt-6 flex-1">{children}</div>
    </div>
  )
}
