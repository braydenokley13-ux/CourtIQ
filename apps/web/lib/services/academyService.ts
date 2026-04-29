import type { Module, Lesson, Mastery } from '@prisma/client'
import { DecoderTag, MasteryDimension } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'

/**
 * Mastery thresholds for Academy unlock + state.
 * A module is "mastered" when its concept's rolling accuracy is >= MASTERED
 * with at least MIN_ATTEMPTS attempts. "In progress" once the user has any
 * attempts on the concept. Otherwise it's "new" (or "locked" if a prereq
 * isn't yet mastered).
 *
 * Tunable in one place; keep these conservative for youth users.
 */
export const ACADEMY_THRESHOLDS = {
  MASTERED_ACCURACY: 0.8,
  MIN_ATTEMPTS_FOR_MASTERY: 5,
} as const

export type ModuleState = 'locked' | 'new' | 'in_progress' | 'mastered'

/** Decoders have no prerequisite chain, so the `locked` state never applies. */
export type DecoderState = Exclude<ModuleState, 'locked'>

export interface DecoderProgress {
  tag: DecoderTag
  title: string
  state: DecoderState
  attempts: number
  rolling_accuracy: number
}

const DECODER_TITLES: Record<DecoderTag, string> = {
  BACKDOOR_WINDOW: 'Backdoor Window',
  EMPTY_SPACE_CUT: 'Empty Space Cut',
  SKIP_THE_ROTATION: 'Skip the Rotation',
  ADVANTAGE_OR_RESET: 'Advantage or Reset',
}

function deriveDecoderState(attempts: number, accuracy: number): DecoderState {
  if (
    attempts >= ACADEMY_THRESHOLDS.MIN_ATTEMPTS_FOR_MASTERY &&
    accuracy >= ACADEMY_THRESHOLDS.MASTERED_ACCURACY
  ) {
    return 'mastered'
  }
  if (attempts > 0) return 'in_progress'
  return 'new'
}

export async function listDecodersForUser(userId: string | null): Promise<DecoderProgress[]> {
  const masteries = userId
    ? await prisma.mastery.findMany({
        where: { user_id: userId, dimension: MasteryDimension.decoder },
      })
    : []
  const byTag = new Map(masteries.map((m) => [m.concept_id, m]))

  return Object.values(DecoderTag).map((tag) => {
    const m = byTag.get(tag)
    const attempts = m?.attempts_count ?? 0
    const rolling_accuracy = m?.rolling_accuracy ?? 0
    return {
      tag,
      title: DECODER_TITLES[tag],
      state: deriveDecoderState(attempts, rolling_accuracy),
      attempts,
      rolling_accuracy,
    }
  })
}

export interface ModuleSummary {
  slug: string
  title: string
  concept_id: string
  order: number
  prerequisite_slugs: string[]
  state: ModuleState
  attempts: number
  rolling_accuracy: number
  scenario_count: number
  has_lesson: boolean
}

export interface ModuleDetail extends ModuleSummary {
  lesson: Pick<Lesson, 'title' | 'body_md' | 'order' | 'media_refs'> | null
  scenarios: Array<{ id: string; difficulty: number; prompt: string }>
}

function deriveState(
  module: Pick<Module, 'concept_id' | 'prerequisite_ids'>,
  masteryByConcept: Map<string, Mastery>,
  prereqMasteredBySlug: Map<string, boolean>,
): { state: ModuleState; attempts: number; rolling_accuracy: number } {
  const m = masteryByConcept.get(module.concept_id)
  const attempts = m?.attempts_count ?? 0
  const rolling_accuracy = m?.rolling_accuracy ?? 0

  const prereqs = module.prerequisite_ids
  const allPrereqsMastered = prereqs.every((slug) => prereqMasteredBySlug.get(slug) === true)

  if (!allPrereqsMastered) {
    return { state: 'locked', attempts, rolling_accuracy }
  }
  if (
    attempts >= ACADEMY_THRESHOLDS.MIN_ATTEMPTS_FOR_MASTERY &&
    rolling_accuracy >= ACADEMY_THRESHOLDS.MASTERED_ACCURACY
  ) {
    return { state: 'mastered', attempts, rolling_accuracy }
  }
  if (attempts > 0) {
    return { state: 'in_progress', attempts, rolling_accuracy }
  }
  return { state: 'new', attempts, rolling_accuracy }
}

export async function listModulesForUser(userId: string | null): Promise<ModuleSummary[]> {
  const [modules, masteries, scenarioCounts] = await Promise.all([
    prisma.module.findMany({
      orderBy: { order: 'asc' },
      include: { lessons: { select: { id: true } } },
    }),
    userId
      ? prisma.mastery.findMany({ where: { user_id: userId, dimension: MasteryDimension.concept } })
      : Promise.resolve([] as Mastery[]),
    prisma.scenario.groupBy({
      by: ['concept_tags'],
      where: { status: 'LIVE' },
      _count: { _all: true },
    }),
  ])

  const masteryByConcept = new Map(masteries.map((m) => [m.concept_id, m]))

  // scenarioCounts is grouped by the array column, so flatten by tag.
  const countsByConcept = new Map<string, number>()
  for (const row of scenarioCounts) {
    for (const tag of row.concept_tags) {
      countsByConcept.set(tag, (countsByConcept.get(tag) ?? 0) + row._count._all)
    }
  }

  // First pass: figure out which modules are mastered (needed to compute prereq locks).
  const initial = modules.map((mod) => {
    const m = masteryByConcept.get(mod.concept_id)
    const attempts = m?.attempts_count ?? 0
    const accuracy = m?.rolling_accuracy ?? 0
    const isMastered =
      attempts >= ACADEMY_THRESHOLDS.MIN_ATTEMPTS_FOR_MASTERY &&
      accuracy >= ACADEMY_THRESHOLDS.MASTERED_ACCURACY
    return { mod, isMastered }
  })
  const prereqMasteredBySlug = new Map(initial.map((row) => [row.mod.slug, row.isMastered]))

  return modules.map((mod) => {
    const { state, attempts, rolling_accuracy } = deriveState(mod, masteryByConcept, prereqMasteredBySlug)
    return {
      slug: mod.slug,
      title: mod.title,
      concept_id: mod.concept_id,
      order: mod.order,
      prerequisite_slugs: mod.prerequisite_ids,
      state,
      attempts,
      rolling_accuracy,
      scenario_count: countsByConcept.get(mod.concept_id) ?? 0,
      has_lesson: mod.lessons.length > 0,
    }
  })
}

export async function getModuleBySlug(
  slug: string,
  userId: string | null,
): Promise<ModuleDetail | null> {
  const mod = await prisma.module.findUnique({
    where: { slug },
    include: { lessons: { orderBy: { order: 'asc' } } },
  })
  if (!mod) return null

  const [masteries, scenarios] = await Promise.all([
    userId
      ? prisma.mastery.findMany({ where: { user_id: userId, dimension: MasteryDimension.concept } })
      : Promise.resolve([] as Mastery[]),
    prisma.scenario.findMany({
      where: { status: 'LIVE', concept_tags: { has: mod.concept_id } },
      select: { id: true, difficulty: true, prompt: true },
      orderBy: [{ difficulty: 'asc' }, { updated_at: 'desc' }],
      take: 30,
    }),
  ])

  const masteryByConcept = new Map(masteries.map((m) => [m.concept_id, m]))

  // Need full module list to compute prereq states accurately.
  const allModules = await prisma.module.findMany({ select: { slug: true, concept_id: true } })
  const prereqMasteredBySlug = new Map(
    allModules.map((m) => {
      const mast = masteryByConcept.get(m.concept_id)
      const attempts = mast?.attempts_count ?? 0
      const accuracy = mast?.rolling_accuracy ?? 0
      const mastered =
        attempts >= ACADEMY_THRESHOLDS.MIN_ATTEMPTS_FOR_MASTERY &&
        accuracy >= ACADEMY_THRESHOLDS.MASTERED_ACCURACY
      return [m.slug, mastered]
    }),
  )

  const { state, attempts, rolling_accuracy } = deriveState(mod, masteryByConcept, prereqMasteredBySlug)
  const lesson = mod.lessons[0] ?? null

  return {
    slug: mod.slug,
    title: mod.title,
    concept_id: mod.concept_id,
    order: mod.order,
    prerequisite_slugs: mod.prerequisite_ids,
    state,
    attempts,
    rolling_accuracy,
    scenario_count: scenarios.length,
    has_lesson: !!lesson,
    lesson: lesson
      ? {
          title: lesson.title,
          body_md: lesson.body_md,
          order: lesson.order,
          media_refs: lesson.media_refs,
        }
      : null,
    scenarios,
  }
}

export async function listValidConcepts(): Promise<Set<string>> {
  const modules = await prisma.module.findMany({ select: { concept_id: true } })
  const concepts = new Set<string>(modules.map((m) => m.concept_id))
  // Also include any concept_tag that exists on a LIVE scenario, so the session
  // filter accepts any taught concept even if it doesn't yet have a module row.
  const scenarios = await prisma.scenario.findMany({
    where: { status: 'LIVE' },
    select: { concept_tags: true },
  })
  for (const s of scenarios) for (const tag of s.concept_tags) concepts.add(tag)
  return concepts
}
