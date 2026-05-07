import type { DecoderTag, Scenario, ScenarioChoice } from '@prisma/client'
import { SessionMode } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { composeFirstSession } from '@/lib/firstSession'
import {
  classifyReturn,
  composeReturnSession,
  returnBanner,
  type ReturnContext,
} from '@/lib/returnLoop'
import { recognitionReason } from '@/lib/recognitionSurface'
import {
  buildDecoderConfidences,
  buildFirstSessionCatalog,
  buildReturnCatalog,
  recognitionReasonForReturnSlot,
} from '@/lib/spine/glue'

interface SanitizedChoice {
  id: string
  label: string
  order: number
}

export interface SessionScenario {
  id: string
  difficulty: number
  prompt: string
  court_state: Scenario['court_state']
  scene: Scenario['scene']
  user_role: string
  concept_tags: string[]
  decoder_tag: DecoderTag | null
  choices: SanitizedChoice[]
  render_tier: number
  /** Phase 8 — single-line player-facing eyebrow shown above this rep
   *  on /train. Derived from Phase 4 `nextProbe` (or the first-session
   *  script for cold-start players). null when the upstream router
   *  declined to generate one (e.g. legacy weighted fallback). */
  recognition_reason: string | null
}

export interface SessionBundle {
  session_run_id: string
  scenarios: SessionScenario[]
  meta: {
    user_iq: number
    streak: number
    daily_goal_progress: number
    /** Phase 8 — which composer produced this bundle. UI mode flags
     *  on /train read this to decide whether to honor the cold-start
     *  chrome. */
    mode: SessionMode
    /** Optional banner shown above /train (return-loop framing). */
    banner: string | null
    /** Return context, when the return-loop composer ran. */
    return_context: ReturnContext | null
  }
}

type ScenarioWithChoices = Scenario & { choices: ScenarioChoice[] }

function pickRandom<T>(arr: T[], n: number, exclude = new Set<string>()): T[] {
  const pool = [...arr]
    .filter((item) => {
      if (typeof item !== 'object' || item === null || !('id' in item)) return true
      return !exclude.has(String(item.id))
    })
    .sort(() => Math.random() - 0.5)

  return pool.slice(0, Math.max(0, n))
}

function sanitizeScenario(
  s: ScenarioWithChoices,
  recognitionReasonText: string | null = null,
): SessionScenario {
  return {
    id: s.id,
    difficulty: s.difficulty,
    prompt: s.prompt,
    court_state: s.court_state,
    scene: s.scene,
    user_role: s.user_role,
    concept_tags: s.concept_tags,
    decoder_tag: s.decoder_tag,
    render_tier: s.render_tier,
    recognition_reason: recognitionReasonText,
    choices: [...s.choices]
      .sort((a, b) => a.order - b.order)
      .map((choice) => ({ id: choice.id, label: choice.label, order: choice.order })),
  }
}

export interface SessionBundleOptions {
  /** Restrict the session to scenarios that include this concept tag. */
  concept?: string | null
  /** Pin the session to a specific scenario id (QA / deep-link preview).
   *  When set, the session ignores the spaced-rep / weakest-concept
   *  weighting and returns a single-scenario bundle. */
  scenarioId?: string | null
  /** Pin the session to an ordered list of scenario IDs (Pathways
   *  driven sessions). When set with at least one valid LIVE id, the
   *  session ignores the weighted bundle and returns those scenarios
   *  in the requested order. Invalid IDs are silently dropped; if no
   *  IDs survive validation the session falls through to weighted
   *  selection so the user still gets reps. Mirrors the singular
   *  `scenarioId` pin path. */
  scenarioIds?: readonly string[] | null
}

/** Error code returned when the caller passes `scenarioIds` and *every*
 * id fails LIVE validation. The route handler maps this to a 400 so the
 * Pathway page can surface a useful failure instead of silently
 * downgrading to weighted reps. */
export class InvalidScenarioIdsError extends Error {
  constructor(
    public readonly invalidIds: string[],
  ) {
    super(`No LIVE scenarios found for IDs: ${invalidIds.join(', ')}`)
    this.name = 'InvalidScenarioIdsError'
  }
}

export async function generateSessionBundle(
  userId: string,
  n = 5,
  options: SessionBundleOptions = {},
): Promise<SessionBundle> {
  const size = Math.max(1, n)
  const now = new Date()

  // ---- Pinned paths (Pathway / QA deep-link). UNCHANGED from Phase 7
  // — Pathway-driven sessions must keep working unmodified through
  // Phase 8. The composer split below applies only to the default
  // weighted/adaptive selection path.
  if (options.scenarioIds && options.scenarioIds.length > 0) {
    const requested = [...options.scenarioIds]
    const live = await prisma.scenario.findMany({
      where: { id: { in: requested }, status: 'LIVE' },
      include: { choices: true },
    })
    const liveById = new Map(live.map((s) => [s.id, s]))
    const ordered: ScenarioWithChoices[] = []
    const missing: string[] = []
    for (const id of requested) {
      const found = liveById.get(id)
      if (found) ordered.push(found)
      else missing.push(id)
    }
    if (ordered.length === 0) {
      throw new InvalidScenarioIdsError(missing)
    }
    const profile = await prisma.profile.findUnique({ where: { user_id: userId } })
    const session = await prisma.sessionRun.create({
      data: {
        user_id: userId,
        scenario_ids: ordered.map((s) => s.id),
        mode: SessionMode.training,
      },
    })
    return {
      session_run_id: session.id,
      scenarios: ordered.map((s) => sanitizeScenario(s)),
      meta: {
        user_iq: profile?.iq_score ?? 500,
        streak: profile?.current_streak ?? 0,
        daily_goal_progress: 0,
        mode: SessionMode.training,
        banner: null,
        return_context: null,
      },
    }
  }

  if (options.scenarioId) {
    const pinned = await prisma.scenario.findFirst({
      where: { id: options.scenarioId, status: 'LIVE' },
      include: { choices: true },
    })
    if (pinned) {
      const profile = await prisma.profile.findUnique({ where: { user_id: userId } })
      const session = await prisma.sessionRun.create({
        data: {
          user_id: userId,
          scenario_ids: [pinned.id],
          mode: SessionMode.training,
        },
      })
      return {
        session_run_id: session.id,
        scenarios: [sanitizeScenario(pinned)],
        meta: {
          user_iq: profile?.iq_score ?? 500,
          streak: profile?.current_streak ?? 0,
          daily_goal_progress: 0,
          mode: SessionMode.training,
          banner: null,
          return_context: null,
        },
      }
    }
    // Fallthrough to default selection.
  }

  // ---- Default selection: hydrate everything once, then route into
  // the right composer.
  const [profile, allLiveScenarios, recentAttemptsDesc, lifetimeCount, lastSession] =
    await Promise.all([
      prisma.profile.findUnique({ where: { user_id: userId } }),
      prisma.scenario.findMany({
        where: {
          status: 'LIVE',
          ...(options.concept ? { concept_tags: { has: options.concept } } : {}),
        },
        include: { choices: true },
      }),
      // Phase 10 — bound the unbounded attempts query. 200 global
      // rows comfortably covers the adaptive RECOGNITION_WINDOW=10
      // per decoder (4 decoders × 10 = 40 admissible). Sort desc +
      // take, reverse to oldest-first afterwards so the glue's
      // ordering contract still holds.
      prisma.attempt.findMany({
        where: { user_id: userId },
        orderBy: { created_at: 'desc' },
        take: 200,
        include: { scenario: true },
      }),
      prisma.attempt.count({ where: { user_id: userId } }),
      prisma.sessionRun.findFirst({
        where: { user_id: userId },
        orderBy: { started_at: 'desc' },
        select: { started_at: true },
      }),
    ])

  // The bounded query came back desc; flip to oldest-first so the
  // adaptive band logic + the legacy weighted bundle's "last 20
  // concepts" math read the player's history in chronological order.
  const recentAttempts = [...recentAttemptsDesc].reverse()

  const scenarioById = new Map(allLiveScenarios.map((s) => [s.id, s]))
  const decoderConfidences = buildDecoderConfidences(recentAttempts, now)
  const decoderConfByTag = new Map(decoderConfidences.map((d) => [d.decoderTag, d]))

  const daysSinceLastSession = lastSession
    ? Math.floor(
        (now.getTime() - lastSession.started_at.getTime()) / (24 * 60 * 60 * 1000),
      )
    : null

  // Concept-filtered sessions (e.g. an Academy lesson "drill this
  // module") bypass the firstSession + returnLoop composers — those
  // composers are decoder-driven and ignore concept tags. Falling
  // through to the legacy weighted bundle preserves the existing
  // /api/session/start?concept=... behavior for both brand-new and
  // returning players.
  const useSpineComposers = !options.concept

  // Phase 5 — first session always wins for brand-new players.
  if (useSpineComposers && lifetimeCount === 0) {
    const fsCatalog = buildFirstSessionCatalog(allLiveScenarios)
    const fs = composeFirstSession(fsCatalog)
    const orderedIds = fs.steps
      .map((step) => step.scenarioId)
      .filter((id): id is string => Boolean(id) && scenarioById.has(id))

    if (orderedIds.length > 0) {
      const ordered = orderedIds.map((id) => scenarioById.get(id)!)
      const session = await prisma.sessionRun.create({
        data: {
          user_id: userId,
          scenario_ids: ordered.map((s) => s.id),
          mode: SessionMode.first_session,
        },
      })
      return {
        session_run_id: session.id,
        scenarios: ordered.map((s, i) => {
          const step = fs.steps[i]
          const reason = step
            ? // Use a static "first-rep" recognition reason for the
              // entire arc — the script's per-step recognitionLine
              // is shown AFTER the answer, not before.
              recognitionReason('first-rep')
            : null
          return sanitizeScenario(s, reason)
        }),
        meta: {
          user_iq: profile?.iq_score ?? 500,
          streak: profile?.current_streak ?? 0,
          daily_goal_progress: 0,
          mode: SessionMode.first_session,
          banner: null,
          return_context: 'fresh-cold',
        },
      }
    }
    // Catalog can't satisfy the script — fall through to weighted.
  }

  // Phase 6 — return loop classification.
  const returnCtx = classifyReturn({
    lifetimeAttempts: lifetimeCount,
    daysSinceLastSession,
  })
  if (useSpineComposers && returnCtx !== 'fresh-cold') {
    const rlCatalog = buildReturnCatalog(allLiveScenarios, lastSession?.started_at ?? null)
    const composed = composeReturnSession({
      context: returnCtx,
      banner: returnBanner(returnCtx),
      decoders: decoderConfidences,
      catalog: rlCatalog,
    })
    if (composed.reps.length > 0) {
      const ordered = composed.reps
        .map((r) => scenarioById.get(r.scenarioId))
        .filter((s): s is ScenarioWithChoices => Boolean(s))
      if (ordered.length > 0) {
        const session = await prisma.sessionRun.create({
          data: {
            user_id: userId,
            scenario_ids: ordered.map((s) => s.id),
            mode: SessionMode.return_loop,
          },
        })
        return {
          session_run_id: session.id,
          scenarios: ordered.map((s, i) => {
            const slot = composed.reps[i]?.slot ?? null
            const reason = recognitionReasonForReturnSlot(slot, decoderConfByTag.get(s.decoder_tag ?? ''))
            return sanitizeScenario(s, reason)
          }),
          meta: {
            user_iq: profile?.iq_score ?? 500,
            streak: profile?.current_streak ?? 0,
            daily_goal_progress: 0,
            mode: SessionMode.return_loop,
            banner: composed.banner,
            return_context: returnCtx,
          },
        }
      }
    }
    // Fall through — composer empty (long-lapsed/dormant) or catalog
    // couldn't fulfill. The legacy weighted bundle below is the safe
    // floor.
  }

  // ---- Legacy weighted fallback (used to be the default path).
  // Now invoked only when (a) the player has a custom `concept`
  // filter, (b) the firstSession arc couldn't compose, or (c) the
  // returnLoop composer returned no reps. Everything below is
  // identical to the pre-Phase-8 behavior so existing analytics keeps
  // working.
  const [weakestConcepts, dueIncorrect, dueMasteries] = await Promise.all([
    prisma.mastery.findMany({
      where: { user_id: userId },
      orderBy: { rolling_accuracy: 'asc' },
      take: 5,
    }),
    prisma.attempt.findMany({
      where: {
        user_id: userId,
        is_correct: false,
        created_at: { lte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
      },
      include: { scenario: true },
      orderBy: { created_at: 'asc' },
      take: 30,
    }),
    prisma.mastery.findMany({
      where: {
        user_id: userId,
        spaced_rep_due_at: { not: null, lte: now },
      },
      orderBy: { spaced_rep_due_at: 'asc' },
      take: 10,
    }),
  ])

  const weakestConceptIds = new Set(weakestConcepts.map((m) => m.concept_id))
  const weakestPool = allLiveScenarios.filter((s) => s.concept_tags.some((tag) => weakestConceptIds.has(tag)))

  const conceptFrequency = new Map<string, number>()
  const last20 = recentAttempts.slice(-20)
  for (const attempt of last20) {
    for (const tag of attempt.scenario.concept_tags) {
      conceptFrequency.set(tag, (conceptFrequency.get(tag) ?? 0) + 1)
    }
  }
  const currentConcept = [...conceptFrequency.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  const modulePool = currentConcept
    ? allLiveScenarios.filter((s) => s.concept_tags.includes(currentConcept))
    : []

  const dueConceptIds = new Set(dueMasteries.map((m) => m.concept_id))
  const dueIds = new Set(dueIncorrect.map((a) => a.scenario_id))
  const spacedRepPool = allLiveScenarios.filter(
    (s) => dueIds.has(s.id) || s.concept_tags.some((tag) => dueConceptIds.has(tag)),
  )

  const selected: ScenarioWithChoices[] = []
  const used = new Set<string>()

  const buckets: Array<{ pool: ScenarioWithChoices[]; count: number }> = [
    { pool: weakestPool, count: Math.round(size * 0.4) },
    { pool: modulePool, count: Math.round(size * 0.3) },
    { pool: spacedRepPool, count: Math.round(size * 0.2) },
    { pool: allLiveScenarios, count: Math.max(1, Math.round(size * 0.1)) },
  ]

  for (const bucket of buckets) {
    const picks = pickRandom(bucket.pool, bucket.count, used)
    for (const pick of picks) {
      selected.push(pick)
      used.add(pick.id)
    }
  }

  if (selected.length < size) {
    const fallback = pickRandom(allLiveScenarios, size - selected.length, used)
    for (const pick of fallback) {
      selected.push(pick)
      used.add(pick.id)
    }
  }

  const scenarios = selected.slice(0, size).map((s) => {
    const conf = decoderConfByTag.get(s.decoder_tag ?? '')
    const reason = conf ? recognitionReason(conf.nextProbe) : null
    return sanitizeScenario(s, reason)
  })

  const session = await prisma.sessionRun.create({
    data: {
      user_id: userId,
      scenario_ids: scenarios.map((s) => s.id),
      mode: SessionMode.training,
    },
  })

  return {
    session_run_id: session.id,
    scenarios,
    meta: {
      user_iq: profile?.iq_score ?? 500,
      streak: profile?.current_streak ?? 0,
      daily_goal_progress: 0,
      mode: SessionMode.training,
      banner: null,
      return_context: null,
    },
  }
}

