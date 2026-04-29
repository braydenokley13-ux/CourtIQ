'use client'

import Link from 'next/link'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRouter, useSearchParams } from 'next/navigation'
import { Court } from '@/components/court'
import type { CourtState } from '@/components/court'
import { Scenario3DView } from '@/components/scenario3d/Scenario3DView'
import { useScenarioSceneData } from '@/lib/scenario3d/useScenarioSceneData'
import type { ReplayPhase } from '@/components/scenario3d/ScenarioReplayController'
import { createClient } from '@/lib/supabase/client'
import { friendlyError } from '@/lib/errors'

type DecoderTag =
  | 'BACKDOOR_WINDOW'
  | 'EMPTY_SPACE_CUT'
  | 'SKIP_THE_ROTATION'
  | 'ADVANTAGE_OR_RESET'

type SessionScenario = {
  id: string
  difficulty: number
  prompt: string
  court_state: CourtState
  concept_tags: string[]
  render_tier: number
  choices: Array<{ id: string; label: string; order: number }>
  scene?: unknown
  user_role?: string
  decoder_tag?: DecoderTag | null
}

const DECODER_LABELS: Record<DecoderTag, string> = {
  BACKDOOR_WINDOW: 'The Backdoor Window',
  EMPTY_SPACE_CUT: 'The Empty-Space Cut',
  SKIP_THE_ROTATION: 'Skip the Rotation',
  ADVANTAGE_OR_RESET: 'Advantage or Reset',
}

type AttemptFeedback = {
  scenario_id: string
  choice_id: string
  is_correct: boolean
  feedback_text: string
  explanation_md: string
  correct_choice_id: string
  iq_delta: number
  xp_delta: number
  iq_after: number
  xp_total: number
  level: number
  streak?: number
  badges_awarded?: { slug: string; family: string }[]
}

const PRAISE = ['Nice read!', 'Smart move!', 'Got it!', 'Big brain.', 'Locked in.']
const RECOVER = ['So close.', 'Not quite.', 'Almost!', 'Missed it.', 'Try the next one.']

function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length]!
}

export default function TrainPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-dvh items-center justify-center bg-bg-0 text-text-dim">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-hairline-2 border-t-brand" />
            <p className="text-sm">Getting the gym ready…</p>
          </div>
        </main>
      }
    >
      <TrainPageInner />
    </Suspense>
  )
}

function TrainPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const conceptParam = searchParams.get('concept')
  const [userId, setUserId] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [scenarios, setScenarios] = useState<SessionScenario[]>([])
  const [idx, setIdx] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<AttemptFeedback | null>(null)
  const [timeLeft, setTimeLeft] = useState(8)
  const [iq, setIq] = useState(500)
  const [xp, setXp] = useState(0)
  const [streak, setStreak] = useState(0)
  const [combo, setCombo] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<{ code?: string; message?: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [reward, setReward] = useState<{ xp: number; iq: number; correct: boolean; key: number } | null>(null)
  const [sceneCaption, setSceneCaption] = useState<string | undefined>(undefined)
  const [replayCounter, setReplayCounter] = useState(0)
  // Phase G — `frozen` flips true once the JSX ScenarioReplayController
  // emits 'frozen' for a decoder scenario. The question prompt + choice
  // buttons are gated behind it so a decoder scene plays through to its
  // freeze marker before the user is asked to read it. Legacy scenarios
  // keep the prompt visible from the start (no decoder_tag → no gate).
  const [frozen, setFrozen] = useState(false)

  const current = scenarios[idx]
  const phase = feedback ? 'feedback' : 'prompt'
  const replayMode: 'intro' | 'answer' | 'static' = feedback ? 'answer' : 'intro'
  const decoderTag = current?.decoder_tag ?? null
  const isDecoder = !!decoderTag
  const decoderLabel = decoderTag ? DECODER_LABELS[decoderTag] : null
  // Decoder scenarios hold the prompt + choices until 'frozen' fires;
  // legacy scenarios are unchanged (questionReady = true from the start).
  const questionReady = !isDecoder || frozen

  useEffect(() => {
    void (async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }

      setUserId(user.id)
      try {
        const res = await fetch('/api/session/start', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ n: 5, concept: conceptParam ?? undefined }),
        })
        const body = await res.json().catch(() => ({})) as {
          error?: string
          message?: string
          session_run_id?: string
          scenarios?: SessionScenario[]
          meta?: { user_iq?: number }
        }
        if (!res.ok) {
          setLoadError({ code: body.error, message: body.message })
          return
        }
        if (!body.session_run_id || !Array.isArray(body.scenarios) || body.scenarios.length === 0) {
          setLoadError({ code: 'CONTENT_NOT_LOADED' })
          return
        }
        setSessionId(body.session_run_id)
        setScenarios(body.scenarios)
        setIq(body.meta?.user_iq ?? 500)
      } catch {
        setLoadError({ code: 'NETWORK_ERROR' })
      } finally {
        setLoading(false)
      }
    })()
  }, [router, conceptParam])

  useEffect(() => {
    if (phase !== 'prompt') return
    // Phase G — for decoder scenarios, hold the timer at 8 until the
    // scene reaches its freeze marker. The pre-freeze playback is part
    // of the read, not part of the response window.
    if (!questionReady) return
    if (timeLeft <= 0) return
    const t = setTimeout(() => setTimeLeft((v) => Math.max(0, Number((v - 0.1).toFixed(1)))), 100)
    return () => clearTimeout(t)
  }, [phase, timeLeft, questionReady])

  useEffect(() => {
    setTimeLeft(8)
    setSelected(null)
    setFeedback(null)
    setSceneCaption(undefined)
    setReplayCounter(0)
    setFrozen(false)
  }, [idx])

  // Phase G — react to phase events emitted by the JSX
  // ScenarioReplayController (mounted only when the canvas is on the
  // full path, i.e. for decoder scenarios). 'frozen' fires once the
  // playhead reaches `scene.freezeAtMs`; we flip `frozen` so the
  // question UI mounts. Legacy scenarios on the imperative simple path
  // never emit this event and stay on their existing flow.
  const onScenePhase = useMemo(
    () => (next: ReplayPhase) => {
      if (next === 'frozen') setFrozen(true)
    },
    [],
  )

  const orderedChoices = useMemo(() => [...(current?.choices ?? [])].sort((a, b) => a.order - b.order), [current])
  const scene = useScenarioSceneData(current ?? null)

  if (loading) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-bg-0 text-text-dim">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-hairline-2 border-t-brand" />
          <p className="text-sm">Getting the gym ready…</p>
        </div>
      </main>
    )
  }

  if (loadError || !current || !sessionId) {
    const err = friendlyError(loadError?.code, loadError?.message)
    return (
      <main className="flex min-h-dvh items-center justify-center bg-bg-0 px-6 text-text">
        <div className="max-w-sm rounded-2xl border border-hairline-2 bg-bg-1 p-6 text-center">
          <h1 className="font-display text-[20px] font-bold">{err.title}</h1>
          <p className="mt-2 text-sm text-text-dim">{err.message}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 w-full rounded-xl bg-brand py-3 font-display text-[14px] font-bold uppercase tracking-[0.3px] text-brand-ink"
          >
            Try again
          </button>
          <Link
            href="/home"
            className="mt-2 block w-full rounded-xl border border-hairline bg-bg-2 py-3 font-display text-[13px] font-semibold text-text-dim"
          >
            Back to home
          </Link>
        </div>
      </main>
    )
  }

  const submitChoice = async (choiceId: string) => {
    if (!userId) return
    if (feedback) return
    if (submitting) return
    setSubmitting(true)
    setSelected(choiceId)
    const spentMs = Math.round((8 - timeLeft) * 1000)
    try {
      const res = await fetch(`/api/session/${sessionId}/attempt`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userId,
          scenarioId: current.id,
          choiceId,
          timeMs: spentMs,
        }),
      })
      const data = (await res.json()) as AttemptFeedback
      setFeedback(data)
      setIq(data.iq_after)
      setXp(data.xp_total)
      if (typeof data.streak === 'number') setStreak(data.streak)
      setCombo((prev) => (data.is_correct ? prev + 1 : 0))
      setReward({ xp: data.xp_delta, iq: data.iq_delta, correct: data.is_correct, key: Date.now() })
    } finally {
      setSubmitting(false)
    }
  }

  const next = async () => {
    if (!userId) return
    if (idx < scenarios.length - 1) {
      setIdx((v) => v + 1)
      return
    }

    try {
      const res = await fetch(`/api/session/${sessionId}/complete`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      const data = await res.json()
      const qs = new URLSearchParams({
        sessionId,
        correct: String(data.correct_count),
        total: String(data.total),
        xp: String(data.xp_earned),
        iq: String(data.iq_delta),
        duration: String(data.duration_ms),
        concept: conceptParam ?? '',
      })
      router.push(`/train/summary?${qs.toString()}`)
    } catch {
      // Soft-fail: still send them to summary with whatever we have so far.
      const qs = new URLSearchParams({
        sessionId,
        correct: String(0),
        total: String(scenarios.length),
        xp: String(xp),
        iq: '0',
        duration: '0',
        concept: conceptParam ?? '',
      })
      router.push(`/train/summary?${qs.toString()}`)
    }
  }

  const praiseSeed = (current.id.charCodeAt(0) ?? 0) + idx
  const praise = feedback?.is_correct ? pick(PRAISE, praiseSeed) : pick(RECOVER, praiseSeed)
  const sessionProgressPct = ((idx + (feedback ? 1 : 0)) / scenarios.length) * 100

  return (
    <main className="min-h-dvh bg-bg-0 text-text pb-8">
      <div className="mx-auto max-w-md space-y-3 px-4 pt-6">
        {/* Header — clear at-a-glance status */}
        <div className="flex items-center justify-between gap-3">
          <Link href="/home" className="text-[11px] font-semibold uppercase tracking-[1.5px] text-text-dim">
            ✕ Quit
          </Link>
          <div className="flex items-center gap-3 text-xs font-bold tabular-nums">
            <span className="flex items-center gap-1 text-xp">
              <span aria-hidden>✦</span>
              {xp}
            </span>
            <span className="text-iq">IQ {iq}</span>
            {streak > 0 && (
              <span className="flex items-center gap-0.5 text-xp">
                {streak}
                <span aria-hidden>🔥</span>
              </span>
            )}
          </div>
        </div>

        {/* Question progress */}
        <div className="flex items-center gap-2">
          <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-bg-2">
            <motion.div
              className="absolute inset-y-0 left-0 rounded-full bg-brand"
              initial={false}
              animate={{ width: `${sessionProgressPct}%` }}
              transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}
            />
          </div>
          <span className="text-[11px] font-bold tabular-nums text-text-dim">
            {idx + 1}/{scenarios.length}
          </span>
        </div>

        {/* Combo flame */}
        {combo >= 2 && phase === 'prompt' && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-full bg-xp/10 px-3 py-1 text-center text-[11px] font-bold uppercase tracking-[1px] text-xp"
          >
            {combo} in a row 🔥
          </motion.div>
        )}

        {/* Timer / question header */}
        <div className="flex items-center justify-between text-[11px] uppercase tracking-[1.5px] text-text-dim">
          <span>Difficulty {current.difficulty}</span>
          {phase === 'prompt' && questionReady ? (
            <span className={timeLeft < 2 ? 'font-bold text-heat' : 'font-bold text-text-dim'}>
              {timeLeft.toFixed(1)}s
            </span>
          ) : null}
        </div>

        {/* Decoder chip — surfaces the decoder name during the intro / pre-freeze
            window so the user enters the read with framing. Only present when
            the scenario carries a decoder_tag (legacy scenarios are unchanged). */}
        {decoderLabel ? (
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-brand/40 bg-brand/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[1.5px] text-brand">
              Decoder · {decoderLabel}
            </span>
            {!questionReady ? (
              <span className="text-[11px] uppercase tracking-[1.5px] text-text-dim">
                Reading…
              </span>
            ) : null}
          </div>
        ) : null}

        {/* Court */}
        <div className="relative overflow-hidden rounded-2xl border border-hairline-2 bg-bg-1">
          <Scenario3DView
            height={280}
            scene={scene}
            concept={current.concept_tags.join(', ')}
            replayMode={replayMode}
            resetCounter={replayCounter}
            showPaths={replayMode === 'answer'}
            onCaption={setSceneCaption}
            onPhase={isDecoder ? onScenePhase : undefined}
            forceFullPath={isDecoder}
            fallback={
              <Court
                width={360}
                height={280}
                courtState={current.court_state}
                you="you"
              />
            }
          />
          {sceneCaption && replayMode === 'answer' ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-2 mx-auto w-fit max-w-[90%] rounded-full bg-bg-0/85 px-3 py-1 text-center text-[12px] font-semibold text-brand">
              {sceneCaption}
            </div>
          ) : null}
        </div>

        {/* Prompt — held back until the scene reaches its freeze marker for
            decoder scenarios so the user reads the play before reading the
            question. Legacy scenarios skip the gate via questionReady=true. */}
        {questionReady ? (
          <div>
            <p className="text-sm text-text-dim">{current.prompt}</p>
            <p className="mt-1 font-display text-[22px] font-bold leading-tight">What do you do?</p>
          </div>
        ) : null}

        {/* Choices */}
        <div className="space-y-2">
          {questionReady ? orderedChoices.map((choice, index) => {
            const letter = String.fromCharCode(65 + index)
            const isSelected = selected === choice.id
            const isCorrect = feedback?.correct_choice_id === choice.id
            const wrongPick = feedback && isSelected && !feedback.is_correct
            return (
              <motion.button
                key={choice.id}
                onClick={() => void submitChoice(choice.id)}
                disabled={!!feedback || submitting}
                whileTap={{ scale: 0.98 }}
                className="w-full rounded-2xl border-2 bg-bg-1 px-4 py-3.5 text-left transition-colors active:bg-bg-2"
                style={{
                  borderColor: isCorrect
                    ? 'var(--brand)'
                    : wrongPick
                      ? 'var(--heat)'
                      : 'var(--hairline-2)',
                }}
              >
                <span className="mr-3 inline-flex h-6 w-6 items-center justify-center rounded-md bg-bg-2 text-[12px] font-bold text-text-dim">
                  {letter}
                </span>
                <span className="text-[14px] font-medium text-text">{choice.label}</span>
              </motion.button>
            )
          }) : null}
        </div>

        {/* Feedback panel */}
        <AnimatePresence>
          {feedback ? (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="space-y-3 rounded-2xl border-2 bg-bg-1 p-4"
              style={{ borderColor: feedback.is_correct ? 'var(--brand)' : 'var(--heat)' }}
            >
              <div className="flex items-center justify-between">
                <span
                  className="font-display text-[18px] font-bold"
                  style={{ color: feedback.is_correct ? 'var(--brand)' : 'var(--heat)' }}
                >
                  {praise}
                </span>
                <div className="flex items-center gap-3 text-[13px] font-bold tabular-nums">
                  <span className="text-xp">+{feedback.xp_delta} XP</span>
                  <span className="text-iq">
                    IQ {feedback.iq_delta > 0 ? '+' : ''}
                    {feedback.iq_delta}
                  </span>
                </div>
              </div>
              <p className="text-sm text-text-dim">{feedback.feedback_text}</p>
              {feedback.badges_awarded && feedback.badges_awarded.length > 0 && (
                <div className="rounded-xl border border-brand/40 bg-brand/5 p-3 text-center text-[13px] font-bold text-brand">
                  🏅 New badge unlocked!
                </div>
              )}
              {scene && scene.answerDemo.length > 0 ? (
                <button
                  onClick={() => setReplayCounter((n) => n + 1)}
                  className="w-full rounded-xl border border-hairline-2 bg-bg-2 py-2.5 font-display text-[12px] font-bold uppercase tracking-[1px] text-text-dim active:scale-[0.99]"
                  type="button"
                >
                  ▶ Show me again
                </button>
              ) : null}
              <button
                onClick={() => void next()}
                className="w-full rounded-xl bg-brand py-3.5 font-display text-[14px] font-bold uppercase tracking-[0.5px] text-brand-ink shadow-brand-sm active:scale-[0.99]"
              >
                {idx === scenarios.length - 1 ? 'See your results' : 'Next play →'}
              </button>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {/* Floating XP / IQ reward toast */}
      <AnimatePresence>
        {reward ? (
          <motion.div
            key={reward.key}
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.45, ease: [0.34, 1.56, 0.64, 1] }}
            className="pointer-events-none fixed inset-x-0 top-20 z-50 flex justify-center"
            onAnimationComplete={() =>
              setTimeout(() => setReward((cur) => (cur?.key === reward.key ? null : cur)), 900)
            }
          >
            <div
              className="flex items-center gap-2 rounded-full px-4 py-2 font-display text-[14px] font-bold shadow-xp"
              style={{
                background: reward.correct ? 'rgba(59,227,131,0.12)' : 'rgba(255,77,109,0.12)',
                color: reward.correct ? 'var(--brand)' : 'var(--heat)',
                border: reward.correct ? '1px solid rgba(59,227,131,0.4)' : '1px solid rgba(255,77,109,0.4)',
              }}
            >
              {reward.correct ? `+${reward.xp} XP` : 'Keep going'}
              {reward.correct && reward.iq !== 0 && (
                <span className="text-iq">
                  · IQ {reward.iq > 0 ? '+' : ''}
                  {reward.iq}
                </span>
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </main>
  )
}
