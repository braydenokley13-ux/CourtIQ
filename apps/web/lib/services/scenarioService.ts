import { prisma } from '@/lib/db/prisma'

interface SanitizedChoice {
  id: string
  label: string
  order: number
}

export interface SessionScenario {
  id: string
  difficulty: number
  prompt: string
  court_state: Record<string, unknown>
  concept_tags: string[]
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

type ScenarioWithChoices = {
  id: string
  difficulty: number
  prompt: string
  court_state: Record<string, unknown>
  concept_tags: string[]
  render_tier: number
  choices: Array<{ id: string; label: string; order: number }>
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
    concept_tags: s.concept_tags,
    render_tier: s.render_tier,
    choices: [...s.choices]
      .sort((a, b) => a.order - b.order)
      .map((choice) => ({ id: choice.id, label: choice.label, order: choice.order })),
  }
}

export async function generateSessionBundle(userId: string, n = 5): Promise<SessionBundle> {
  const size = Math.max(1, n)
  const [profile, rawScenarios, weakestConcepts, recentAttempts, dueIncorrect] = await Promise.all([
    prisma.profile.findUnique({ where: { user_id: userId } }),
    prisma.scenario.findMany({
      where: { status: 'LIVE' },
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
        created_at: { lte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      include: { scenario: true },
      orderBy: { created_at: 'asc' },
      take: 30,
    }),
  ])

  const allLiveScenarios = rawScenarios as ScenarioWithChoices[]

  const weakestConceptIds = new Set(weakestConcepts.map((m: { concept_id: string }) => m.concept_id))
  const weakestPool = allLiveScenarios.filter((s: ScenarioWithChoices) => s.concept_tags.some((tag: string) => weakestConceptIds.has(tag)))

  const conceptFrequency = new Map<string, number>()
  for (const attempt of recentAttempts as Array<{ scenario: { concept_tags: string[] } }>) {
    for (const tag of attempt.scenario.concept_tags) {
      conceptFrequency.set(tag, (conceptFrequency.get(tag) ?? 0) + 1)
    }
  }
  const currentConcept = [...conceptFrequency.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  const modulePool = currentConcept
    ? allLiveScenarios.filter((s: ScenarioWithChoices) => s.concept_tags.includes(currentConcept))
    : []

  const dueIds = new Set(dueIncorrect.map((a: { scenario_id: string }) => a.scenario_id))
  const spacedRepPool = allLiveScenarios.filter((s: ScenarioWithChoices) => dueIds.has(s.id))

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
    const fallback = pickRandom<ScenarioWithChoices>(allLiveScenarios, size - selected.length, used)
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
