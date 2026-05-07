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
import { pickFilmRoomMode } from '@/lib/scenario3d/filmRoomMode'
import type { PathwayTrainingMode } from '@/lib/pathways/types'
import { createClient } from '@/lib/supabase/client'
import { friendlyError } from '@/lib/errors'
import { DecoderLessonPanel } from './DecoderLessonPanel'
import { SelfReviewChecklist } from './SelfReviewChecklist'
import { PhaseTracker, type LearnPhase } from './PhaseTracker'
import { ChoiceCard, deriveChoiceState } from './ChoiceCard'
import { FullscreenChoicesOverlay } from './FullscreenChoicesOverlay'
import { FeedbackPanel } from './FeedbackPanel'
import { WinBurst } from './WinBurst'
import {
  recordChallengeAttempt,
  type ChallengeMode,
} from '@/lib/pathways/localChallengeProgress'
import { getDecoderOneLiner } from '@/lib/decoders/explanations'
import { getCoachNudge, shouldShowCoachNudge } from '@/lib/decoders/coachNudges'
import { getFirstRepCues, isFirstRep } from '@/lib/onboarding/firstRep'
import { shouldShowStreakChip } from '@/lib/rewards/visibility'

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
  /** Phase 8 — single-line eyebrow shown above this rep, sourced
   *  from the spine composer (firstSession / returnLoop / adaptive). */
  recognition_reason?: string | null
}

type SessionMeta = {
  user_iq?: number
  banner?: string | null
  mode?: 'training' | 'first_session' | 'return_loop' | 'daily_challenge'
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
      'When the defender denies the pass, the rim is behind him. That space is yours.',
    lessonConnection: 'His hand goes into the lane — you go behind him.',
    lessonSlug: 'backdoor-window',
    selfReviewChecklist: [
      'Did I see his hand drop into the lane?',
      'Did I cut behind him, not in front?',
      'Did I cut hard, like I wanted the layup?',
      'Did I show my hands at the rim?',
    ],
  },
  EMPTY_SPACE_CUT: {
    teachingPoint:
      'When help steps to the ball, the spot they leave is wide open. Fill it.',
    lessonConnection: 'Helper commits — you take his spot.',
    lessonSlug: 'empty-space-cut',
    selfReviewChecklist: [
      'Did I see the helper commit before I cut?',
      'Did I cut along the baseline, not up to the wing?',
      'Did I show target hands for a baseline drop-off?',
    ],
  },
  SKIP_THE_ROTATION: {
    teachingPoint:
      'When two defenders go to the ball, the shooter they left is the one you skip to.',
    lessonConnection: 'Two on the ball — find the open shooter and skip it.',
    lessonSlug: 'skip-the-rotation',
    selfReviewChecklist: [
      'Did I see the help commit before I skipped?',
      'Did I throw it on a line, not a rainbow?',
      'Did I trust my teammate to make the next read?',
    ],
  },
  ADVANTAGE_OR_RESET: {
    teachingPoint:
      'On the catch you decide: take the advantage, or move the ball. Holding it is the worst read.',
    lessonConnection: 'Out of control = drive. Balanced = swing it.',
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

const PRAISE = ['Good read.', 'Nice cut.', 'You got it.', 'You saw it.', 'Smart move.']
const RECOVER = ['Almost.', 'So close.', 'Not yet.', 'Reset and watch.', 'Reset.']

/** Per-decoder micro-praise — names what shifted on the floor, not
 *  the player's action. The point is "ohh, THAT'S why the space
 *  opened" — basketball cause-and-effect, not a pat on the head. */
const WIN_MICRO_PRAISE: Record<DecoderTag, string> = {
  BACKDOOR_WINDOW: 'His hand cut off the pass — the rim opened up behind him.',
  EMPTY_SPACE_CUT: 'The helper stepped to the ball — his spot was yours.',
  SKIP_THE_ROTATION: 'Two went to the ball — the weak side was wide open.',
  ADVANTAGE_OR_RESET: 'He flew at you — you beat his momentum.',
}

/** Per-decoder coaching micro-note shown under a wrong-answer headline.
 *  Tells the player what to watch for next rep — the cue, not the
 *  prescription. */
const MISS_MICRO_NOTE: Record<DecoderTag, string> = {
  BACKDOOR_WINDOW: 'When his hand drops into the lane, the rim is behind him.',
  EMPTY_SPACE_CUT: 'Watch the helper. The spot he leaves is the one to fill.',
  SKIP_THE_ROTATION: 'The defender who left a shooter is the one you skip past.',
  ADVANTAGE_OR_RESET: 'Read his feet on the catch. Out of control = drive. Balanced = swing it.',
}

function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length]!
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

/** Subset of ResolvedPathwayTrainingContext that /train consumes.
 *  Shape matches the API response so we don't need a runtime decoder. */
type PathwayContext = {
  pathwaySlug: string
  pathwayTitle: string
  chapterSlug: string | null
  chapterTitle: string | null
  nodeSlug: string | null
  nodeTitle: string | null
  scenarioIds: string[]
  trainingMode: string | null
  returnHref: string
  summaryParams: { pathway: string; chapter?: string; node?: string; mode?: string }
  source: string
  error:
    | 'pathway-not-found'
    | 'pathway-coming-soon'
    | 'chapter-not-found'
    | 'node-not-found'
    | 'no-trainable-scenarios'
    | 'boss-not-configured'
    | null
  // PTH-3 challenge metadata.
  hideDecoderPill?: boolean
  suppressCueHints?: boolean
  isChallenge?: boolean
  challengeTitle?: string | null
  passCriteria?: {
    minBest?: number
    minDecoderAccuracy?: number
    minDecoderAttempts?: number
    bossBestRatio?: number
    bossMinAttempts?: number
  } | null
  challengeScenarioIds?: string[] | null
}

const PATHWAY_ERROR_COPY: Record<NonNullable<PathwayContext['error']>, string> = {
  'pathway-not-found': "That Pathway isn't here yet — running a quick set instead.",
  'pathway-coming-soon': 'That Pathway is on the way — running a quick set instead.',
  'chapter-not-found': "Can't find that chapter — running a quick set instead.",
  'node-not-found': "Can't find that step — running a quick set instead.",
  'no-trainable-scenarios': 'No reps wired up there yet — running a quick set instead.',
  'boss-not-configured':
    "The Boss isn't set for that chapter yet — running a quick set instead.",
}

function TrainPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const conceptParam = searchParams.get('concept')
  const scenarioParam = searchParams.get('scenario')
  // PTH-1: support pinned scenario lists for Pathway-driven sessions.
  // CSV in the URL ("BDW-01,BDW-02,..."); when present, /train forwards
  // it to /api/session/start, which validates against LIVE scenarios
  // and returns them in order.
  const scenarioIdsParamRaw = searchParams.get('scenarioIds')
  const scenarioIdsParam = useMemo(
    () =>
      scenarioIdsParamRaw
        ? scenarioIdsParamRaw
            .split(',')
            .map((s) => s.trim())
            .filter((s) => s.length > 0)
        : null,
    [scenarioIdsParamRaw],
  )
  // PTH-2: Pathway context params. The resolver lives server-side at
  // /api/pathways/training-context — /train just forwards the URL
  // params and reads back the resolved scenarioIds + display titles.
  const pathwayParam = searchParams.get('pathway')
  const chapterParam = searchParams.get('chapter')
  const nodeParam = searchParams.get('node')
  // PTH-3: mode=boss-challenge | mode=mixed-reads switch /train into
  // a no-hint "test" view (decoder pill hidden, lesson panel + self-
  // review checklist suppressed, win micro-praise muted).
  const modeParam = searchParams.get('mode')
  const [userId, setUserId] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [pathwayContext, setPathwayContext] = useState<PathwayContext | null>(null)
  const [scenarios, setScenarios] = useState<SessionScenario[]>([])
  // V3 P9 — total prior attempts. Drives "first rep" cold-start mode
  // so the player's very first read happens without the dashboard
  // chrome (decoder pill, one-liner, phase tracker, XP/IQ chips,
  // difficulty, timer). Stays `null` while loading so we never flash
  // the chrome and snap it away.
  const [attemptsCount, setAttemptsCount] = useState<number | null>(null)
  // Phase 8 — meta returned by /api/session/start. Drives the
  // return-loop banner + lets the page know which composer ran.
  const [sessionMeta, setSessionMeta] = useState<SessionMeta | null>(null)
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

  // V1 UX completion — mirror Scenario3DView's fullscreen state so the
  // page can hide its in-page choice copy while the fullscreen overlay
  // version is showing. Avoids two competing card stacks fighting for
  // the user's eye when the canvas occupies the entire viewport.
  const [filmRoomFullscreen, setFilmRoomFullscreen] = useState(false)

  const current = scenarios[idx]
  const phase = feedback ? 'feedback' : 'prompt'
  const decoderTag = resolveDecoderTag(current?.id, current?.decoder_tag ?? null)
  const isDecoder = !!decoderTag
  // PTH-3: in challenge modes (boss-challenge / mixed-reads) we hide
  // the decoder pill + label so the player has to identify the cue
  // themselves, and we drop the lesson hand-off + self-review panels
  // since those broadcast the answer. The renderer / scenario data
  // are unchanged — we only suppress the *page-layer* decoder chrome.
  const isChallengeMode = pathwayContext?.isChallenge === true
  const hideDecoderPill =
    pathwayContext?.hideDecoderPill === true ||
    pathwayContext?.trainingMode === 'boss-challenge' ||
    pathwayContext?.trainingMode === 'mixed-reads'
  const suppressCueHints = pathwayContext?.suppressCueHints === true || isChallengeMode
  const decoderLabel = !hideDecoderPill && decoderTag ? DECODER_LABELS[decoderTag] : null
  // FR-7 — translate the Pathway training mode into the renderer-level
  // overlayLevel + cameraAssist pair. Memoised on the trainingMode
  // identity so every scenario swap inside the same chapter reuses
  // the same object reference (the canvas's effects depend on these
  // by value, but a stable reference avoids unnecessary controller
  // rebuilds during pathway-internal navigations). When no Pathway
  // is driving the session (`pathwayContext == null`), the helper
  // returns `FILM_ROOM_DEFAULT`, which matches the canvas's own
  // prop defaults — so the legacy /train flow is unchanged.
  const filmRoomMode = useMemo(
    () =>
      pickFilmRoomMode(
        // The API responds with `trainingMode: string | null`; the
        // helper itself is forward-compat (unknown strings fall back
        // to the default), so a runtime guard isn't strictly needed —
        // but a cast through the canonical union keeps the call site
        // honest about what it expects.
        (pathwayContext?.trainingMode ?? null) as PathwayTrainingMode | null,
      ),
    [pathwayContext?.trainingMode],
  )
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
  // V3 P9 — cold-start "first rep" mode. Strips chrome that telegraphs
  // the answer (decoder pill, "Read · ..." line, phase tracker) and
  // chrome that competes with the canvas for attention (XP/IQ/streak
  // chips, difficulty number, response timer). Active only on the
  // player's very first scenario of their very first session.
  const firstRep = isFirstRep({
    attemptsCount,
    scenarioIndex: idx,
    isChallengeMode,
  })
  const firstRepCues = getFirstRepCues()

  useEffect(() => {
    void (async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }

      setUserId(user.id)
      // V3 P9 — fire profile fetch in parallel with the session start
      // so the page knows whether this is the player's first ever rep
      // before the canvas mounts. Soft-fail: if the request fails we
      // fall back to "not first" (the safer assumption — keep the
      // dashboard chrome in case we're wrong).
      void (async () => {
        try {
          const profileRes = await fetch(`/api/profile?userId=${user.id}`)
          if (profileRes.ok) {
            const body = (await profileRes.json()) as { attemptsCount?: number }
            setAttemptsCount(typeof body.attemptsCount === 'number' ? body.attemptsCount : 0)
          } else {
            // Fail safe to "returning user" mode so transient fetch errors
            // don't activate cold-start chrome for existing players.
            setAttemptsCount(Number.MAX_SAFE_INTEGER)
          }
        } catch {
          setAttemptsCount(Number.MAX_SAFE_INTEGER)
        }
      })()
      try {
        // PTH-2: when any pathway/chapter/node param is present,
        // resolve the Pathway training context first. The resolver
        // returns the canonical scenarioIds + the titles we surface
        // in the Pathway strip. Errors are soft-warnings — we still
        // run the session if the resolver returned scenarios, and
        // fall back to the URL/concept selection otherwise.
        let resolvedContext: PathwayContext | null = null
        if (pathwayParam) {
          try {
            const ctxRes = await fetch(
              `/api/pathways/training-context?${new URLSearchParams({
                pathway: pathwayParam,
                ...(chapterParam ? { chapter: chapterParam } : {}),
                ...(nodeParam ? { node: nodeParam } : {}),
                ...(scenarioIdsParamRaw ? { scenarioIds: scenarioIdsParamRaw } : {}),
                ...(modeParam ? { mode: modeParam } : {}),
              }).toString()}`,
            )
            if (ctxRes.ok) {
              const ctxBody = (await ctxRes.json()) as { context: PathwayContext | null }
              resolvedContext = ctxBody.context ?? null
              if (resolvedContext) setPathwayContext(resolvedContext)
            }
          } catch {
            // Soft-fail: the strip just doesn't render. The session
            // still starts off whatever URL params are present.
          }
        }

        // Pinned-list (scenarioIds) wins over the singular scenario
        // pin and over the concept filter — Pathways pages always pass
        // a concrete ordered set, and the API matches that ordering.
        // When the context resolver returned scenarios (e.g. user came
        // in via ?pathway=...&chapter=...) we prefer those over a
        // potentially-empty URL list.
        const sessionScenarioIds =
          scenarioIdsParam && scenarioIdsParam.length > 0
            ? scenarioIdsParam
            : resolvedContext?.scenarioIds && resolvedContext.scenarioIds.length > 0
              ? resolvedContext.scenarioIds
              : null
        const requestedSize = sessionScenarioIds
          ? sessionScenarioIds.length
          : scenarioParam
            ? 1
            : 5
        const res = await fetch('/api/session/start', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            n: requestedSize,
            concept: conceptParam ?? undefined,
            scenarioId: scenarioParam ?? undefined,
            scenarioIds: sessionScenarioIds ?? undefined,
          }),
        })
        const body = await res.json().catch(() => ({})) as {
          error?: string
          message?: string
          session_run_id?: string
          scenarios?: SessionScenario[]
          meta?: SessionMeta
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
        setSessionMeta(body.meta ?? null)
      } catch {
        setLoadError({ code: 'NETWORK_ERROR' })
      } finally {
        setLoading(false)
      }
    })()
  }, [
    router,
    conceptParam,
    scenarioParam,
    scenarioIdsParam,
    scenarioIdsParamRaw,
    pathwayParam,
    chapterParam,
    nodeParam,
    modeParam,
  ])

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

    // PTH-2: when the session ran inside a Pathway, thread the
    // pathway/chapter/node back to the summary page so its CTAs can
    // route the player back into the Pathway flow.
    // PTH-3: also forward `mode` so /train/summary can render boss/
    // mixed pass-fail copy.
    const appendPathwayParams = (qs: URLSearchParams) => {
      if (pathwayContext) {
        qs.set('pathway', pathwayContext.pathwaySlug)
        if (pathwayContext.chapterSlug) qs.set('chapter', pathwayContext.chapterSlug)
        if (pathwayContext.nodeSlug) qs.set('node', pathwayContext.nodeSlug)
        if (pathwayContext.summaryParams.mode) {
          qs.set('mode', pathwayContext.summaryParams.mode)
        }
      } else if (pathwayParam) {
        // Resolver failed but the user did come from a Pathway link —
        // preserve the slug so the summary page can at least offer a
        // "Back to Pathways" link.
        qs.set('pathway', pathwayParam)
        if (chapterParam) qs.set('chapter', chapterParam)
        if (nodeParam) qs.set('node', nodeParam)
        if (modeParam) qs.set('mode', modeParam)
      }
    }

    const persistChallengeAttempt = (correctCount: number, totalCount: number) => {
      if (!pathwayContext?.isChallenge) return
      const mode = pathwayContext.trainingMode
      if (mode !== 'boss-challenge' && mode !== 'mixed-reads') return
      if (!pathwayContext.chapterSlug) return
      const challengeSlug =
        mode === 'boss-challenge'
          ? pathwayContext.nodeSlug ??
            pathwayContext.chapterSlug + '-boss'
          : pathwayContext.nodeSlug ?? pathwayContext.chapterSlug
      const passRatio = pathwayContext.passCriteria?.bossBestRatio ?? 0.8
      try {
        recordChallengeAttempt({
          pathwaySlug: pathwayContext.pathwaySlug,
          chapterSlug: pathwayContext.chapterSlug,
          mode: mode as ChallengeMode,
          challengeSlug,
          bestCount: correctCount,
          total: totalCount,
          scenarioIds:
            pathwayContext.challengeScenarioIds ?? pathwayContext.scenarioIds ?? [],
          passRatio,
        })
      } catch {
        // localStorage may be disabled — summary page falls back to
        // computing pass/fail from the URL correct/total params.
      }

      // PTH-4: dual-write to the server so a cleared boss survives
      // refresh / login on another device. Best-effort — a failure
      // here never breaks the user flow because localStorage above
      // already persisted the result for the current session.
      void (async () => {
        try {
          await fetch('/api/pathways/challenge-attempt', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              pathwaySlug: pathwayContext.pathwaySlug,
              chapterSlug: pathwayContext.chapterSlug,
              mode,
              challengeSlug,
              sessionRunId: sessionId,
              scenarioIds:
                pathwayContext.challengeScenarioIds ?? pathwayContext.scenarioIds ?? [],
              total: totalCount,
            }),
          })
        } catch (err) {
          // Soft-fail: localStorage already covers the immediate UI
          // and the user is about to navigate to /train/summary,
          // which can recompute pass/fail from URL params.
          console.warn('[pathways/challenge-attempt] server write failed', err)
        }
      })()
    }

    try {
      const res = await fetch(`/api/session/${sessionId}/complete`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      const data = await res.json()
      persistChallengeAttempt(Number(data.correct_count) || 0, Number(data.total) || scenarios.length)
      const qs = new URLSearchParams({
        sessionId,
        correct: String(data.correct_count),
        total: String(data.total),
        xp: String(data.xp_earned),
        iq: String(data.iq_delta),
        duration: String(data.duration_ms),
        concept: conceptParam ?? '',
      })
      appendPathwayParams(qs)
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
      appendPathwayParams(qs)
      router.push(`/train/summary?${qs.toString()}`)
    }
  }

  const praiseSeed = (current.id.charCodeAt(0) ?? 0) + idx
  const praise = feedback?.is_correct ? pick(PRAISE, praiseSeed) : pick(RECOVER, praiseSeed)
  const sessionProgressPct = ((idx + (feedback ? 1 : 0)) / scenarios.length) * 100

  return (
    <main className="min-h-dvh bg-bg-0 text-text pb-8">
      <div className="mx-auto max-w-md space-y-3 px-4 pt-6">
        {/* PTH-2: Pathway context strip — only shows when /train was
            entered via a Pathway link. Compact 2-line breadcrumb +
            back-link so it doesn't compete with the training UI.
            PTH-3: challenge variant swaps to a heat-toned strip with
            "Boss Challenge" / "Mixed Reads" eyebrow + pass criteria. */}
        {pathwayContext && pathwayContext.error === null ? (
          isChallengeMode ? (
            <div
              className={[
                'flex items-center justify-between gap-3 rounded-2xl border px-3 py-2',
                pathwayContext.trainingMode === 'mixed-reads'
                  ? 'border-iq/40 bg-iq/10'
                  : 'border-heat/40 bg-heat/10',
              ].join(' ')}
            >
              <div className="min-w-0 flex-1">
                <p
                  className={[
                    'text-[10px] font-bold uppercase tracking-[1.8px]',
                    pathwayContext.trainingMode === 'mixed-reads' ? 'text-iq' : 'text-heat',
                  ].join(' ')}
                >
                  {pathwayContext.trainingMode === 'mixed-reads'
                    ? 'Mixed Reads'
                    : 'Boss Challenge'}
                  {pathwayContext.challengeTitle ? (
                    <span className="text-text-mute"> · </span>
                  ) : null}
                  {pathwayContext.challengeTitle ? (
                    <span className="text-text">
                      {pathwayContext.challengeTitle.replace(/^Boss\s*[—-]\s*/, '')}
                    </span>
                  ) : null}
                </p>
                <p className="truncate text-[11px] font-semibold leading-tight text-text-dim">
                  {pathwayContext.pathwayTitle}
                  {pathwayContext.chapterTitle ? (
                    <>
                      <span className="text-text-mute"> · </span>
                      {pathwayContext.chapterTitle}
                    </>
                  ) : null}
                  {pathwayContext.passCriteria?.bossBestRatio ? (
                    <>
                      <span className="text-text-mute"> · </span>
                      <span className="text-text">
                        {Math.round(pathwayContext.passCriteria.bossBestRatio * 100)}% to pass
                      </span>
                    </>
                  ) : null}
                </p>
                {/* V3 P5 — explicit "hints off" subline. Otherwise the
                    missing decoder pill on a Boss / Final Mix run reads
                    as broken rather than intentional. Player learns
                    they're being asked to identify the cue themselves. */}
                <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[1.2px] text-text-mute">
                  Hints off — read the cue yourself.
                </p>
              </div>
              <Link
                href={pathwayContext.returnHref}
                className="rounded-full border border-hairline-2 bg-bg-2 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[1px] text-text-dim transition-colors hover:text-text"
              >
                Back
              </Link>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-brand/30 bg-brand/5 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-[1.5px] text-brand">
                  Pathway · {pathwayContext.pathwayTitle}
                </p>
                <p className="truncate text-[12px] font-semibold leading-tight text-text">
                  {pathwayContext.chapterTitle ?? 'Chapter'}
                  {pathwayContext.nodeTitle ? (
                    <>
                      <span className="text-text-mute"> · </span>
                      <span className="text-text-dim">{pathwayContext.nodeTitle}</span>
                    </>
                  ) : null}
                </p>
              </div>
              <Link
                href={pathwayContext.returnHref}
                className="rounded-full border border-hairline-2 bg-bg-2 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[1px] text-text-dim transition-colors hover:text-text"
              >
                Back
              </Link>
            </div>
          )
        ) : null}
        {pathwayContext?.error ? (
          <div className="rounded-2xl border border-heat/30 bg-heat/5 px-3 py-2 text-[12px] text-heat">
            {PATHWAY_ERROR_COPY[pathwayContext.error]}
          </div>
        ) : null}

        {/* Phase 8 — return-loop banner. Sourced from the spine
            composer's `meta.banner` (e.g. "Picking up where you left
            off." for next-day, "Welcome back." for lapsed). Only
            renders when the spine composer chose to surface one —
            cold-start arc + dormant context skip the banner so the
            decoder reveal carries the framing instead. */}
        {sessionMeta?.banner && !pathwayContext ? (
          <div
            data-testid="train-return-banner"
            className="rounded-2xl border border-brand/30 bg-brand/5 px-3 py-2 text-center text-[12px] font-semibold leading-snug text-brand"
          >
            {sessionMeta.banner}
          </div>
        ) : null}

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
          {/* V3 P9 — hide XP/IQ/streak chips on the player's first ever
              rep. They're zeros (or near-zero) and pull the eye away
              from the canvas. The first read should feel like film
              study, not a dashboard. */}
          {firstRep ? (
            <div aria-hidden />
          ) : (
            // V3 P11 P4 — toned status chips. Was three colored
            // (gold-XP, purple-IQ, heat-streak) chips that read as a
            // gamified HUD; now a single muted status row so the
            // canvas stays the loudest object on the page. The
            // streak chip still warms when alive, but only past 1.
            <div className="flex items-center gap-1.5 text-[11px] font-semibold tabular-nums text-text-dim">
              <span className="inline-flex items-center gap-1 text-text-mute">
                <span className="text-[9px] uppercase tracking-[1.2px]">IQ</span>
                <span className="text-text-dim">{iq}</span>
              </span>
              <span aria-hidden className="h-3 w-px bg-hairline-2" />
              <span className="inline-flex items-center gap-1 text-text-mute">
                <span className="text-[9px] uppercase tracking-[1.2px]">XP</span>
                <span className="text-text-dim">{xp}</span>
              </span>
              {shouldShowStreakChip(streak) ? (
                <motion.span
                  key={`streak-${streak}`}
                  initial={{ scale: 0.92, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.35, ease: [0.34, 1.56, 0.64, 1] }}
                  className="ml-1 inline-flex items-center gap-1 rounded-full border border-heat/30 bg-heat/5 px-2 py-0.5 text-[10px] font-bold text-heat"
                >
                  <span aria-hidden>🔥</span>
                  {streak}
                </motion.span>
              ) : null}
            </div>
          )}
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
            what the user should be paying attention to right now.
            V3 P9 — on the player's first ever rep we drop the
            difficulty + timer entirely; only the "Watch the play"
            cue remains during pre-freeze, and the choice cards take
            over from the freeze beat onward. Zero pressure, no math. */}
        {firstRep ? (
          phase === 'prompt' && !questionReady ? (
            <div className="flex items-center justify-end text-[11px] uppercase tracking-[1.5px] text-text-dim">
              <span className="inline-flex items-center gap-1.5 font-bold text-text-dim">
                <span aria-hidden className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand/60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand" />
                </span>
                Watch the play
              </span>
            </div>
          ) : null
        ) : (
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
        )}

        {/* Phase 6 — module shell panel. Decoder pill, step row, and
            canvas live inside a single glass surface so the canvas reads
            as the inset jewel rather than a misfit rectangle next to its
            chrome. Decoder scenarios get the full pill+tracker stack;
            legacy scenarios still get the panel + canvas. */}
        <div className="ciq-module-panel space-y-3 p-3">
          {firstRep ? (
            // V3 P9 — first-rep eyebrow. NAMING the decoder before the
            // freeze would skip past the recognition moment we're
            // trying to build, so the player only sees a soft "Watch
            // the play" cue here. The decoder noun is revealed in the
            // WinBurst / FeedbackPanel after the rep.
            <div data-testid="train-first-rep-eyebrow" className="space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-[1.8px] text-brand/80">
                {firstRepCues.eyebrow}
              </p>
              <p className="text-[13px] font-semibold leading-snug text-text">
                {firstRepCues.framing}
              </p>
            </div>
          ) : decoderLabel ? (
            <div className="space-y-2.5">
              <div className="flex items-center gap-2">
                {/* Coach's-clipboard label: small DECODER eyebrow over the
                    scenario name; subtle warm-mint gradient + brand
                    pulse dot. Reads as a TV graphic, not a UI badge. */}
                <span className="relative inline-flex items-center gap-2.5 overflow-hidden rounded-full border border-brand/35 bg-gradient-to-br from-brand/20 via-brand/10 to-transparent px-3 py-1.5 text-brand shadow-[0_2px_10px_-2px_rgba(59,227,131,0.25),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-md">
                  <span aria-hidden className="relative flex h-1.5 w-1.5 shrink-0">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand/60" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand shadow-[0_0_6px_currentColor]" />
                  </span>
                  <span className="flex items-baseline gap-1.5">
                    <span className="text-[9px] font-bold uppercase tracking-[1.8px] text-brand/70">
                      Decoder
                    </span>
                    <span className="text-[12px] font-bold tracking-[0.2px] text-text">
                      {decoderLabel}
                    </span>
                  </span>
                </span>
              </div>
              {/* V3 P5 — read-it-in-five-words coach line. Anchors the
                  decoder pill to a plain-language cue so the player
                  knows what they're training before the freeze fires. */}
              {decoderTag ? (
                <p
                  data-testid="train-decoder-oneliner"
                  className="text-[12px] leading-snug text-text-dim"
                >
                  <span className="font-bold uppercase tracking-[1.4px] text-text-mute">
                    Read ·
                  </span>{' '}
                  {getDecoderOneLiner(decoderTag)}
                </p>
              ) : null}
              {/* Phase 8 — recognition reason eyebrow.
                  One sentence per rep, sourced from
                  recognitionSurface.recognitionReason() via the
                  scenarioService composer. Tells the player WHY this
                  particular rep is in front of them ("Same read, new
                  shape", "Quick re-read before the next try"). Only
                  shown for non-cold-start, non-challenge reps —
                  challenges intentionally hide this so the player has
                  to read the cue without help; first-rep already has
                  its own framing. */}
              {!firstRep && !suppressCueHints && current?.recognition_reason ? (
                <p
                  data-testid="train-recognition-reason"
                  className="text-[11px] font-semibold leading-snug text-brand/80"
                >
                  {current.recognition_reason}
                </p>
              ) : null}
              {isDecoder ? <PhaseTracker phase={learnPhase} /> : null}
            </div>
          ) : null}

          {/* Court — brand ring lights up on the freeze beat so the eye
              anchors on the play surface during the read window. */}
          <div
            className="ciq-canvas-inset relative overflow-hidden bg-bg-0 transition-[box-shadow,border-color] duration-300"
            data-attention={learnPhase === 'read' || learnPhase === 'choose' ? 'on' : 'off'}
          >
            <Scenario3DView
              height={280}
              scene={scene}
              concept={isDecoder ? undefined : current.concept_tags.join(', ')}
              replayMode={replayMode}
              resetCounter={replayCounter}
              showPaths={replayMode === 'answer'}
              onCaption={setSceneCaption}
              onPhase={isDecoder ? onScenePhase : undefined}
              forceFullPath={isDecoder}
              pickedChoiceId={pickedChoiceId}
              overlayLevel={filmRoomMode.overlayLevel}
              cameraAssist={filmRoomMode.cameraAssist}
              onFullscreenChange={setFilmRoomFullscreen}
              renderFullscreenOverlay={({ isFullscreen }) =>
                isFullscreen ? (
                  <FullscreenChoicesOverlay
                    choices={orderedChoices}
                    selected={selected}
                    feedback={
                      feedback
                        ? {
                            is_correct: feedback.is_correct,
                            correct_choice_id: feedback.correct_choice_id,
                          }
                        : null
                    }
                    submitting={submitting}
                    questionReady={questionReady}
                    onSelect={(id) => void submitChoice(id)}
                    prompt={
                      isDecoder ? current.prompt : undefined
                    }
                  />
                ) : null
              }
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
        </div>

        {/* V3 P10 P5 — coach attention nudge. ONE short cue surfaced
            during the pre-freeze watch phase on the first rep of the
            session (only). Points at WHERE TO LOOK, never the read.
            Fades the moment the scene freezes so the read is the
            player's. Hidden in cold-start and challenge modes. */}
        <AnimatePresence>
          {shouldShowCoachNudge({
            decoderTag,
            scenarioIndex: idx,
            isFirstRep: firstRep,
            isChallengeMode,
            frozen,
          }) ? (
            <motion.p
              key="coach-nudge"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -2 }}
              transition={{ duration: 0.32, ease: [0.2, 0.8, 0.2, 1] }}
              data-testid="train-coach-nudge"
              className="text-center text-[12px] font-semibold leading-snug text-text-mute"
            >
              <span className="font-bold uppercase tracking-[1.4px] text-brand/70">
                Coach ·
              </span>{' '}
              {decoderTag ? getCoachNudge(decoderTag) : null}
            </motion.p>
          ) : null}
        </AnimatePresence>

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
              {/* V3 P9 — on the first rep, drop the scenario subline so
                  the player sees a single, calm question. The decoder
                  noun gets revealed AFTER the rep, not above the
                  choices. */}
              {firstRep ? null : (
                <p className="text-[12px] font-semibold leading-snug text-text-dim">
                  {current.prompt}
                </p>
              )}
              <p className="mt-1 font-display text-[22px] font-bold leading-tight text-text">
                What do you do?
              </p>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* Choices — premium cards with letter pill, hover/tap states,
            and confidence-colored states after submit. While the user
            is in fullscreen the FullscreenChoicesOverlay (mounted
            inside Scenario3DView) owns the picker so we hide this
            in-page copy to avoid two competing stacks. The overlay
            renders the same ChoiceCard component, so visual + state
            contracts stay single-sourced. */}
        <div className="space-y-2" data-suppressed-by-fullscreen={filmRoomFullscreen ? '1' : undefined} hidden={filmRoomFullscreen}>
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
              // V3 P9 — first-rep recognition. NAMING the decoder for
              // the first time AFTER the player picked the right read
              // is the satisfaction beat in the V3 emotional arc. The
              // basketball-language one-liner doubles as the sub.
              headline={
                firstRep && decoderTag
                  ? firstRepCues.recognitionHeadline(DECODER_LABELS[decoderTag])
                  : praise
              }
              microPraise={
                firstRep && decoderTag
                  ? firstRepCues.recognitionSub(getDecoderOneLiner(decoderTag))
                  : suppressCueHints
                    ? 'Good rep.'
                    : WIN_MICRO_PRAISE[decoderTag ?? 'BACKDOOR_WINDOW']
              }
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
              // V3 P9 — on a missed first rep, name the decoder in the
              // headline so the player has a noun for the pattern they
              // just watched in the replay. (Win-case recognition is
              // owned by the WinBurst above.)
              headline={
                firstRep && !feedback.is_correct && decoderTag
                  ? firstRepCues.recoveryHeadline(DECODER_LABELS[decoderTag])
                  : praise
              }
              microNote={
                feedback.is_correct
                  ? undefined
                  : firstRep && decoderTag
                    ? getDecoderOneLiner(decoderTag)
                    : suppressCueHints
                      ? 'Reset and try again.'
                      : MISS_MICRO_NOTE[decoderTag ?? 'BACKDOOR_WINDOW']
              }
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
              Badge earned.
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* Phase I — decoder lesson hand-off + self-review surface after the
            best-read replay. Both panels render only for decoder scenarios
            (legacy fixtures have no decoder_tag and are unchanged).
            PTH-3: suppressed in boss/mixed challenge modes — those panels
            broadcast the right answer and undermine the test.
            V3 P9 — also suppressed on the player's first ever rep. The
            4-question self-review reads like school after a moment that
            should feel like a rep. The lesson hand-off card stays
            available from the next rep onward. */}
        {feedback && isDecoder && decoderTag && !suppressCueHints && !firstRep ? (
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
            // V3 P10 P6 — final beat in the post-rep cascade. Lands
            // just after the SelfReviewChecklist so the page never
            // layout-shifts under the player's tap.
            transition={{ delay: 0.55, duration: 0.25 }}
            whileTap={{ scale: 0.99 }}
            onClick={() => void next()}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand py-4 font-display text-[15px] font-bold uppercase tracking-[1px] text-brand-ink shadow-brand"
          >
            {idx === scenarios.length - 1 ? 'See how you did' : 'Next rep'}
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
              Reset. Next rep.
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </main>
  )
}
