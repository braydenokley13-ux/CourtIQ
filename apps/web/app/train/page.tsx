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
import { DecoderLessonPanel } from './DecoderLessonPanel'
import { SelfReviewChecklist } from './SelfReviewChecklist'
import { PhaseTracker, type LearnPhase } from './PhaseTracker'
import { ChoiceCard, type ChoiceState } from './ChoiceCard'
import { FeedbackPanel } from './FeedbackPanel'
import { WinBurst } from './WinBurst'

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

/**
 * Phase I — per-decoder lesson hand-off + self-review copy. Mirrors
 * Section 7.10 / 7.12 of the planning doc for `BACKDOOR_WINDOW`; the
 * other three are placeholders that ship alongside their pack content
 * in Phase K so the lesson panel works the moment a scenario is added.
 *
 * `lessonSlug` must match a `module_slug` in `packages/db/seed/lessons/`
 * — Phase I seeds all four (`backdoor-window`, `empty-space-cut`,
 * `skip-the-rotation`, `advantage-or-reset`).
 */
const DECODER_HANDOFF: Record<
  DecoderTag,
  {
    teachingPoint: string
    lessonConnection: string
    lessonSlug: string
    selfReviewChecklist: readonly string[]
  }
> = {
  BACKDOOR_WINDOW: {
    teachingPoint:
      'When your defender sits in the passing lane, the basket is open behind them.',
    lessonConnection: 'Read the defender, not the spot.',
    lessonSlug: 'backdoor-window',
    selfReviewChecklist: [
      'Did I see the hand-and-foot denial?',
      'Did I plant and go behind, not in front?',
      'Did I cut hard enough to make it a scoring cut?',
      'Did I show target hands at the rim?',
    ],
  },
  EMPTY_SPACE_CUT: {
    teachingPoint:
      'When your teammate drives, your job is to fill the space their defender just abandoned.',
    lessonConnection: 'Cut into the space your teammate just created.',
    lessonSlug: 'empty-space-cut',
    selfReviewChecklist: [
      'Did I see the helper commit before I cut?',
      'Did I cut along the baseline, not up to the wing?',
      'Did I show target hands for a baseline drop-off?',
    ],
  },
  SKIP_THE_ROTATION: {
    teachingPoint:
      'When the defense is rotating, throw the ball to the spot they can’t get to in time.',
    lessonConnection: 'Beat the rotation with the cross-court pass.',
    lessonSlug: 'skip-the-rotation',
    selfReviewChecklist: [
      'Did I see the help commit before I skipped?',
      'Did I throw it on a line, not a rainbow?',
      'Did I trust my teammate to make the next read?',
    ],
  },
  ADVANTAGE_OR_RESET: {
    teachingPoint:
      'The first move on the catch is the read: either there is an advantage to take, or there isn’t.',
    lessonConnection: 'If the advantage is there, take it. If not, reset.',
    lessonSlug: 'advantage-or-reset',
    selfReviewChecklist: [
      'Did I read the closeout’s feet before I moved?',
      'If I attacked, did I commit fully?',
      'If I reset, did I move the ball quickly?',
    ],
  },
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

const PRAISE = ['Great read.', 'Locked in.', 'Smart move.', 'You saw it.', 'Big brain.']
const RECOVER = ['Almost.', 'So close.', 'Not quite.', 'Try the next one.', 'Reset.']

/** Per-decoder micro-praise — names the cue the kid noticed. */
const WIN_MICRO_PRAISE: Record<DecoderTag, string> = {
  BACKDOOR_WINDOW: 'You saw the help defender.',
  EMPTY_SPACE_CUT: 'You filled the empty space.',
  SKIP_THE_ROTATION: 'You beat the rotation.',
  ADVANTAGE_OR_RESET: 'You read the closeout.',
}

/** Per-decoder coaching micro-note shown under a wrong-answer headline. */
const MISS_MICRO_NOTE: Record<DecoderTag, string> = {
  BACKDOOR_WINDOW: 'Read the defender, not the spot.',
  EMPTY_SPACE_CUT: 'Cut into the space, not the wing.',
  SKIP_THE_ROTATION: 'Find the help that already left.',
  ADVANTAGE_OR_RESET: 'Decide on the catch — attack or reset.',
}

function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length]!
}

/**
 * Compute the visual state of an answer card given the user's pick and
 * the server feedback. Lives near the page so the wiring is obvious
 * when the choice column is rewritten in a follow-up patch.
 */
export function deriveChoiceState(input: {
  choiceId: string
  selected: string | null
  feedback: { is_correct: boolean; correct_choice_id: string } | null
  submitting: boolean
}): ChoiceState {
  const { choiceId, selected, feedback, submitting } = input
  if (!feedback) {
    if (submitting && selected === choiceId) return 'selected'
    return 'idle'
  }
  if (feedback.is_correct && selected === choiceId) return 'correct'
  if (!feedback.is_correct && selected === choiceId) return 'wrong'
  if (feedback.correct_choice_id === choiceId) return 'reveal-correct'
  return 'dimmed'
}

// Defensive runtime guard for the decoder tag returned by the API. Unknown
// values fall through to legacy behaviour (no decoder UI) and emit a
// console breadcrumb — Sentry's nextjs integration auto-collects
// console.warn/error calls into its breadcrumb trail.
function resolveDecoderTag(
  scenarioId: string | undefined,
  raw: DecoderTag | string | null,
): DecoderTag | null {
  if (!raw) return null
  if (raw in DECODER_LABELS) return raw as DecoderTag
  if (typeof console !== 'undefined') {
    console.warn('[train] unknown decoder_tag — treating as legacy', {
      scenarioId,
      decoderTag: raw,
    })
  }
  return null
}

export default function TrainPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-dvh items-center justify-center bg-bg-0 text-text-dim">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-hairline-2 border-t-brand" />
            <p className="text-sm">Setting the play…</p>
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
  const scenarioParam = searchParams.get('scenario')
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
  // Phase tracker — high-level state of the current rep so the
  // top-of-page tracker and pacing logic can react. Driven by the
  // replay controller's `ReplayPhase` and the local UI state.
  const [scenePhase, setScenePhase] = useState<ReplayPhase>('idle')

  const current = scenarios[idx]
  const phase = feedback ? 'feedback' : 'prompt'
  const decoderTag = resolveDecoderTag(current?.id, current?.decoder_tag ?? null)
  const isDecoder = !!decoderTag
  const decoderLabel = decoderTag ? DECODER_LABELS[decoderTag] : null
  // Phase H — decoder scenarios stay on `mode='intro'` for the full
  // session; the JSX `ScenarioReplayController` drives the freeze →
  // (consequence →) replaying → done legs internally off `pickedChoiceId`
  // and the freeze snapshot. Legacy scenarios keep their pre-decoder
  // intro/answer toggle so existing 2D content plays unchanged.
  const replayMode: 'intro' | 'answer' | 'static' = isDecoder
    ? 'intro'
    : feedback
      ? 'answer'
      : 'intro'
  const pickedChoiceId = isDecoder ? selected : null
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
          body: JSON.stringify({
            n: scenarioParam ? 1 : 5,
            concept: conceptParam ?? undefined,
            scenarioId: scenarioParam ?? undefined,
          }),
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
  }, [router, conceptParam, scenarioParam])

  // Settle delay between the freeze beat firing and the timer starting
  // ticking — gives the kid ~700ms to register the question before the
  // clock kicks in. Reset alongside the per-scenario UI state.
  const [timerArmed, setTimerArmed] = useState(false)

  useEffect(() => {
    if (!questionReady) return
    const t = setTimeout(() => setTimerArmed(true), 700)
    return () => clearTimeout(t)
  }, [questionReady])

  useEffect(() => {
    if (phase !== 'prompt') return
    // Phase G — for decoder scenarios, hold the timer until the scene
    // reaches its freeze marker AND the post-freeze settle window
    // expires. The pre-freeze playback + settle are part of the read,
    // not the response window.
    if (!questionReady) return
    if (!timerArmed) return
    if (timeLeft <= 0) return
    const t = setTimeout(() => setTimeLeft((v) => Math.max(0, Number((v - 0.1).toFixed(1)))), 100)
    return () => clearTimeout(t)
  }, [phase, timeLeft, questionReady, timerArmed])

  useEffect(() => {
    setTimeLeft(8)
    setSelected(null)
    setFeedback(null)
    setSceneCaption(undefined)
    setReplayCounter(0)
    setFrozen(false)
    setTimerArmed(false)
    setScenePhase('idle')
  }, [idx])

  // Phase G — react to phase events emitted by the JSX
  // ScenarioReplayController (mounted only when the canvas is on the
  // full path, i.e. for decoder scenarios). 'frozen' fires once the
  // playhead reaches `scene.freezeAtMs`; we flip `frozen` so the
  // question UI mounts. Legacy scenarios on the imperative simple path
  // never emit this event and stay on their existing flow.
  const onScenePhase = useMemo(
    () => (next: ReplayPhase) => {
      setScenePhase(next)
      if (next === 'frozen') setFrozen(true)
    },
    [],
  )

  // Derived phase for the top-of-page learning tracker. The page-level
  // states map cleanly onto Phase A-E:
  //   intro / playing → 'watch'
  //   frozen, no pick → 'read'
  //   submitting      → 'choose'
  //   consequence     → 'consequence'
  //   replaying       → 'replay'
  //   feedback + done → 'win'
  const learnPhase: LearnPhase = (() => {
    if (feedback) {
      if (scenePhase === 'consequence') return 'consequence'
      if (scenePhase === 'replaying') return 'replay'
      return 'win'
    }
    if (selected) return 'choose'
    if (frozen) return 'read'
    return 'watch'
  })()

  const orderedChoices = useMemo(() => [...(current?.choices ?? [])].sort((a, b) => a.order - b.order), [current])
  const scene = useScenarioSceneData(current ?? null)

  if (loading) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-bg-0 text-text-dim">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-hairline-2 border-t-brand" />
          <p className="text-sm">Setting the play…</p>
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
        {/* Header — clear at-a-glance status. XP + IQ live as soft chips
            so the eye doesn't have to parse three different colors when
            the streak is hot. */}
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/home"
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[1.4px] text-text-dim transition-colors hover:text-text"
          >
            <span aria-hidden>✕</span>
            Quit
          </Link>
          <div className="flex items-center gap-1.5 text-[11px] font-bold tabular-nums">
            <span className="inline-flex items-center gap-1 rounded-full border border-hairline-2 bg-bg-2 px-2.5 py-1 text-xp">
              <span aria-hidden>✦</span>
              {xp}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-hairline-2 bg-bg-2 px-2.5 py-1 text-iq">
              IQ {iq}
            </span>
            {streak > 0 ? (
              <motion.span
                key={`streak-${streak}`}
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.35, ease: [0.34, 1.56, 0.64, 1] }}
                className="inline-flex items-center gap-1 rounded-full border border-heat/40 bg-heat/10 px-2.5 py-1 text-heat"
              >
                <span aria-hidden>🔥</span>
                {streak}
              </motion.span>
            ) : null}
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

        {/* Combo flame — only shows during the active prompt so it does
            not compete with the win burst on feedback. */}
        {combo >= 2 && phase === 'prompt' ? (
          <motion.div
            key={`combo-${combo}`}
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.25, ease: [0.34, 1.56, 0.64, 1] }}
            className="inline-flex items-center justify-center gap-1.5 rounded-full border border-xp/40 bg-xp/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[1.2px] text-xp"
          >
            <span aria-hidden>🔥</span>
            {combo} in a row
          </motion.div>
        ) : null}

        {/* Timer / phase line. Difficulty stays on the left as a quiet
            anchor; the right side surfaces a status line that adapts to
            what the user should be paying attention to right now. */}
        <div className="flex items-center justify-between text-[11px] uppercase tracking-[1.5px] text-text-dim">
          <span>Difficulty {current.difficulty}</span>
          {phase === 'prompt' && questionReady ? (
            <motion.span
              key="timer"
              initial={{ opacity: 0, y: -2 }}
              animate={{ opacity: 1, y: 0 }}
              className={timeLeft < 2 ? 'font-bold text-heat' : 'font-bold text-text'}
            >
              {timeLeft.toFixed(1)}s
            </motion.span>
          ) : phase === 'prompt' && !questionReady ? (
            <span className="inline-flex items-center gap-1.5 font-bold text-text-dim">
              <span aria-hidden className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand/60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand" />
              </span>
              Watch the play
            </span>
          ) : null}
        </div>

        {/* Decoder chip + Phase A-E tracker. The chip frames the read with
            the decoder name; the tracker shows where the user is in the
            Watch → Read → Choose → Learn loop. Tracker only renders for
            decoder scenarios — legacy fixtures don't have a freeze beat. */}
        {decoderLabel ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-brand/40 bg-brand/15 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[1.6px] text-brand shadow-[0_2px_8px_rgba(59,255,157,0.15)]">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-brand shadow-[0_0_8px_currentColor]" />
                Decoder · {decoderLabel}
              </span>
            </div>
            {isDecoder ? <PhaseTracker phase={learnPhase} /> : null}
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
            pickedChoiceId={pickedChoiceId}
            fallback={
              <Court
                width={360}
                height={280}
                courtState={current.court_state}
                you="you"
              />
            }
          />
          {sceneCaption &&
          (replayMode === 'answer' ||
            scenePhase === 'replaying' ||
            scenePhase === 'consequence') ? (
            <motion.div
              key={`caption-${sceneCaption}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
              className={[
                'pointer-events-none absolute inset-x-0 bottom-3 mx-auto w-fit max-w-[92%] rounded-2xl border px-4 py-2 text-center text-[13px] font-semibold leading-tight shadow-[0_8px_24px_rgba(0,0,0,0.55)] backdrop-blur-md',
                scenePhase === 'consequence'
                  ? 'border-heat/40 bg-bg-0/90 text-heat'
                  : 'border-brand/30 bg-bg-0/90 text-brand',
              ].join(' ')}
            >
              {sceneCaption}
            </motion.div>
          ) : null}
        </div>

        {/* Prompt — held back until the scene reaches its freeze marker
            for decoder scenarios so the user reads the play before
            reading the question. Animated in so it lands on the freeze
            beat instead of jumping. */}
        <AnimatePresence>
          {questionReady ? (
            <motion.div
              key="prompt"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
            >
              <p className="text-[12px] font-semibold leading-snug text-text-dim">
                {current.prompt}
              </p>
              <p className="mt-1 font-display text-[22px] font-bold leading-tight text-text">
                What do you do?
              </p>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* Choices — premium cards with letter pill, hover/tap states,
            and confidence-colored states after submit. */}
        <div className="space-y-2">
          {questionReady
            ? orderedChoices.map((choice, index) => {
                const letter = String.fromCharCode(65 + index)
                const state = deriveChoiceState({
                  choiceId: choice.id,
                  selected,
                  feedback,
                  submitting,
                })
                return (
                  <ChoiceCard
                    key={choice.id}
                    letter={letter}
                    label={choice.label}
                    state={state}
                    disabled={!!feedback || submitting}
                    onSelect={() => void submitChoice(choice.id)}
                  />
                )
              })
            : null}
        </div>

        {/* Win burst — premium celebration when the user nails the read.
            Surfaces XP / IQ / streak with a quick scale-in. */}
        <AnimatePresence>
          {feedback?.is_correct ? (
            <WinBurst
              key={`win-${current.id}-${feedback.choice_id}`}
              triggerKey={feedback.iq_after}
              xpDelta={feedback.xp_delta}
              iqDelta={feedback.iq_delta}
              streak={feedback.streak ?? streak}
              headline={praise}
              microPraise={WIN_MICRO_PRAISE[decoderTag ?? 'BACKDOOR_WINDOW']}
            />
          ) : null}
        </AnimatePresence>

        {/* Feedback panel — premium card with "Why" body + dual replay
            CTAs. Shown for every answer, with the consequence replay
            available on misses for context. */}
        <AnimatePresence>
          {feedback ? (
            <FeedbackPanel
              isCorrect={feedback.is_correct}
              headline={feedback.is_correct ? praise : praise}
              microNote={feedback.is_correct ? undefined : MISS_MICRO_NOTE[decoderTag ?? 'BACKDOOR_WINDOW']}
              whyText={feedback.feedback_text}
              hasReplay={!!scene && scene.answerDemo.length > 0}
              onReplay={() => setReplayCounter((n) => n + 1)}
              onShowMistake={undefined}
            />
          ) : null}

          {feedback?.badges_awarded && feedback.badges_awarded.length > 0 ? (
            <motion.div
              key="badge"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="rounded-xl border border-brand/40 bg-brand/5 p-3 text-center text-[13px] font-bold text-brand"
            >
              New badge unlocked
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* Phase I — decoder lesson hand-off + self-review surface after the
            best-read replay. Both panels render only for decoder scenarios
            (legacy fixtures have no decoder_tag and are unchanged). */}
        {feedback && isDecoder && decoderTag ? (
          <>
            <DecoderLessonPanel
              decoderName={DECODER_LABELS[decoderTag]}
              teachingPoint={DECODER_HANDOFF[decoderTag].teachingPoint}
              lessonConnection={DECODER_HANDOFF[decoderTag].lessonConnection}
              lessonSlug={DECODER_HANDOFF[decoderTag].lessonSlug}
            />
            <SelfReviewChecklist
              scenarioId={current.id}
              items={DECODER_HANDOFF[decoderTag].selfReviewChecklist}
            />
          </>
        ) : null}

        {/* Next-play button surfaces below the lesson hand-off so users
            see the teaching surface before advancing. Bigger tap target
            + brand glow so the win moment leads directly into the next
            rep. */}
        {feedback ? (
          <motion.button
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.25 }}
            whileTap={{ scale: 0.99 }}
            onClick={() => void next()}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand py-4 font-display text-[15px] font-bold uppercase tracking-[1px] text-brand-ink shadow-brand"
          >
            {idx === scenarios.length - 1 ? 'See your results' : 'Next rep'}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 5l7 7-7 7" />
            </svg>
          </motion.button>
        ) : null}
      </div>

      {/* Floating "keep going" toast — fires only on a miss now that
          the WinBurst handles the success celebration. Keeps a quick
          recovery beat without doubling up XP / IQ chrome. */}
      <AnimatePresence>
        {reward && !reward.correct ? (
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
            <div className="flex items-center gap-2 rounded-full border border-heat/40 bg-heat/10 px-4 py-2 font-display text-[13px] font-bold uppercase tracking-[1px] text-heat shadow-heat">
              Keep going
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </main>
  )
}
