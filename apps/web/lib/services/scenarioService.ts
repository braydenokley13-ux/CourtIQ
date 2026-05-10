import type { DecoderTag, Scenario, ScenarioChoice } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { isEnabled, type FeatureFlagEnv } from '@/lib/featureFlags'

// Decoder tags gated by Phase γ feature flags. Stored as strings so
// the gate compiles before the matching Prisma enum members land —
// the runtime compare against `scenario.decoder_tag` is a string
// equality either way.
const HUNT_DECODER_TAG = 'HUNT_THE_ADVANTAGE'
const DROP_DECODER_TAG = 'READ_THE_COVERAGE'

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
}

export interface SessionBundle {
  session_run_id: string
  scenarios: SessionScenario[]
  meta: {
    user_iq: number
    streak: number
    daily_goal_progress: number
  }
}

type ScenarioWithChoices = Scenario & { choices: ScenarioChoice[] }

/** Drop scenarios whose decoder_tag is gated behind a flag that is
 *  not enabled in the supplied env. Pure: no I/O, no Prisma. */
export function filterByFeatureFlags<T extends { decoder_tag: DecoderTag | null }>(
  scenarios: T[],
  env: FeatureFlagEnv = process.env,
): T[] {
  const huntOn = isEnabled('hunt_decoder_v0_live', env)
  const dropOn = isEnabled('drop_decoder_v0_live', env)
  return scenarios.filter((s) => {
    const tag = s.decoder_tag as string | null
    if (tag === HUNT_DECODER_TAG && !huntOn) return false
    if (tag === DROP_DECODER_TAG && !dropOn) return false
    return true
  })
}

function pickRandom<T>(arr: T[], n: number, exclude = new Set<string>()): T[] {
  const pool = [...arr]
    .filter((item) => {
      if (typeof item !== 'object' || item === null || !('id' in item)) return true
      return !exclude.has(String(item.id))
    })
    .sort(() => Math.random() - 0.5)

  return pool.slice(0, Math.max(0, n))
}

function sanitizeScenario(s: ScenarioWithChoices): SessionScenario {
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
  /** Env source for feature flags. Tests inject a stub; production
   *  falls back to `process.env`. */
  env?: FeatureFlagEnv
}

export async function generateSessionBundle(
  userId: string,
  n = 5,
  options: SessionBundleOptions = {},
): Promise<SessionBundle> {
  const size = Math.max(1, n)
  const now = new Date()
  const env = options.env ?? process.env

  // Pinned scenario (QA / deep-link). Skip the bucket weighting and
  // return that scenario alone if it exists and is LIVE.
  if (options.scenarioId) {
    const pinned = await prisma.scenario.findFirst({
      where: { id: options.scenarioId, status: 'LIVE' },
      include: { choices: true },
    })
    if (pinned && filterByFeatureFlags([pinned], env).length === 1) {
      const profile = await prisma.profile.findUnique({ where: { user_id: userId } })
      const session = await prisma.sessionRun.create({
        data: { user_id: userId, scenario_ids: [pinned.id] },
      })
      return {
        session_run_id: session.id,
        scenarios: [sanitizeScenario(pinned)],
        meta: {
          user_iq: profile?.iq_score ?? 500,
          streak: profile?.current_streak ?? 0,
          daily_goal_progress: 0,
        },
      }
    }
    // Fallthrough — id not LIVE / not found / gated by an off
    // feature flag; falls through to the normal pool below so the
    // user still gets a session.
  }

  const [profile, allLiveScenariosRaw, weakestConcepts, recentAttempts, dueIncorrect, dueMasteries] = await Promise.all([
    prisma.profile.findUnique({ where: { user_id: userId } }),
    prisma.scenario.findMany({
      where: {
        status: 'LIVE',
        ...(options.concept ? { concept_tags: { has: options.concept } } : {}),
      },
      include: { choices: true },
    }),
    prisma.mastery.findMany({
      where: { user_id: userId },
      orderBy: { rolling_accuracy: 'asc' },
      take: 5,
    }),
    prisma.attempt.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      take: 20,
      include: { scenario: true },
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

  // Phase γ — top-level decoder feature-flag gate. Scenarios tagged
  // with a not-yet-LIVE decoder are excluded from every downstream
  // pool (weakest, module, spaced-rep, fallback).
  const allLiveScenarios = filterByFeatureFlags(allLiveScenariosRaw, env)

  const weakestConceptIds = new Set(weakestConcepts.map((m) => m.concept_id))
  const weakestPool = allLiveScenarios.filter((s) => s.concept_tags.some((tag) => weakestConceptIds.has(tag)))

  const conceptFrequency = new Map<string, number>()
  for (const attempt of recentAttempts) {
    for (const tag of attempt.scenario.concept_tags) {
      conceptFrequency.set(tag, (conceptFrequency.get(tag) ?? 0) + 1)
    }
  }
  const currentConcept = [...conceptFrequency.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  const modulePool = currentConcept
    ? allLiveScenarios.filter((s) => s.concept_tags.includes(currentConcept))
    : []

  // Spaced-rep pool combines two signals:
  // 1) Concepts whose Mastery.spaced_rep_due_at has elapsed (primary).
  // 2) Specific incorrect attempts >24h old (fallback until the mastery signal warms up).
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

  const scenarios = selected.slice(0, size).map(sanitizeScenario)

  const session = await prisma.sessionRun.create({
    data: {
      user_id: userId,
      scenario_ids: scenarios.map((s) => s.id),
    },
  })

  return {
    session_run_id: session.id,
    scenarios,
    meta: {
      user_iq: profile?.iq_score ?? 500,
      streak: profile?.current_streak ?? 0,
      daily_goal_progress: 0,
    },
  }
}
