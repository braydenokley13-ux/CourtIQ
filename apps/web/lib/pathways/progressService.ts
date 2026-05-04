/**
 * Pathway progress derivation (PTH-1).
 *
 * Pathways v1 stores nothing in its own tables. Every number on a
 * Pathway page derives from rows that already exist:
 *
 *   - `Attempt`            — per-rep history (most recent attempt per
 *                            scenario gives the current best/quality
 *                            signal).
 *   - `ScenarioChoice`     — `quality: best | acceptable | wrong`
 *                            tells us whether the latest attempt was
 *                            the best answer or just a passable one.
 *   - `Mastery (decoder)`  — rolling accuracy / attempt count keyed by
 *                            decoder tag (already populated by
 *                            masteryService.update on every attempt).
 *
 * The pure derivation lives in `derivePathwayProgress` so it can be
 * unit-tested without a database. The Prisma-backed wrapper
 * `getPathwayProgress` only does the data fetch and feeds the pure
 * function.
 *
 * Mirrors §9 of `docs/courtiq-pathways-product-plan.md`.
 */

import { MasteryDimension } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import {
  buildPathwayTrainHref,
  countChapterScenarios,
  getAllScenarioIdsForPathway,
  getPathwayBySlug,
} from './helpers'
import type {
  DecoderTag,
  PathwayChapterConfig,
  PathwayChapterProgress,
  PathwayChapterState,
  PathwayConfig,
  PathwayProgressSummary,
  PathwayRecommendedNext,
  PathwaySkillNodeProgress,
  SkillNodeConfig,
  SkillNodeState,
} from './types'

/** Quality of the user's most recent attempt on a single scenario. */
export type LatestAttemptQuality = 'best' | 'acceptable' | 'wrong'

export interface DecoderMasteryStat {
  attempts: number
  rollingAccuracy: number
}

/** Pure-function input shape so derivation is testable without Prisma. */
export interface PathwayProgressInput {
  /** Quality of the most recent attempt per scenario, keyed by scenario ID. */
  latestQualityByScenarioId: Map<string, LatestAttemptQuality>
  /** Decoder mastery rows keyed by decoder tag. Missing entries imply
   *  zero attempts. */
  decoderMasteryByTag: Map<DecoderTag, DecoderMasteryStat>
}

const ZERO_DECODER: DecoderMasteryStat = { attempts: 0, rollingAccuracy: 0 }

/** Bottom-up state computation for a single skill node. Pure. */
function deriveSkillNodeState(
  node: SkillNodeConfig,
  attemptedCount: number,
  bestCount: number,
  prerequisiteNodes: PathwaySkillNodeProgress[],
): SkillNodeState {
  const total = node.scenarioIds.length
  const allPrereqsClear = prerequisiteNodes.every(
    (p) => p.state === 'completed' || p.state === 'mastered',
  )

  if (total === 0) return allPrereqsClear ? 'unlocked' : 'locked'
  if (bestCount >= total) return 'mastered'
  if (attemptedCount >= total) return 'completed'
  if (attemptedCount > 0) return 'in_progress'
  return allPrereqsClear ? 'unlocked' : 'locked'
}

function deriveSkillNodeProgress(
  node: SkillNodeConfig,
  input: PathwayProgressInput,
  prerequisiteNodes: PathwaySkillNodeProgress[],
): PathwaySkillNodeProgress {
  const total = node.scenarioIds.length
  let attemptedCount = 0
  let bestCount = 0

  for (const scenarioId of node.scenarioIds) {
    const quality = input.latestQualityByScenarioId.get(scenarioId)
    if (!quality) continue
    attemptedCount += 1
    if (quality === 'best') bestCount += 1
  }

  const state = deriveSkillNodeState(node, attemptedCount, bestCount, prerequisiteNodes)
  const progress = total === 0 ? 0 : attemptedCount / total

  return {
    slug: node.slug,
    state,
    progress,
    attemptedCount,
    bestCount,
    totalScenarios: total,
  }
}

function deriveChapterState(skillNodeProgress: PathwaySkillNodeProgress[]): PathwayChapterState {
  if (skillNodeProgress.length === 0) return 'unlocked'
  const allMastered = skillNodeProgress.every((n) => n.state === 'mastered')
  if (allMastered) return 'mastered'
  const allCompleted = skillNodeProgress.every(
    (n) => n.state === 'completed' || n.state === 'mastered',
  )
  if (allCompleted) return 'completed'
  const anyInProgress = skillNodeProgress.some(
    (n) => n.state === 'in_progress' || n.state === 'completed' || n.state === 'mastered',
  )
  if (anyInProgress) return 'in_progress'
  return 'unlocked'
}

function chapterDecoderStats(
  chapter: PathwayChapterConfig,
  input: PathwayProgressInput,
): { tags: DecoderTag[]; decoderAccuracy: number | null; decoderAttempts: number } {
  const tags =
    chapter.decoderTags && chapter.decoderTags.length > 0
      ? chapter.decoderTags
      : chapter.decoderTag
        ? [chapter.decoderTag]
        : []

  if (tags.length === 0) {
    return { tags, decoderAccuracy: null, decoderAttempts: 0 }
  }

  const stats = tags.map((t) => input.decoderMasteryByTag.get(t) ?? ZERO_DECODER)
  const totalAttempts = stats.reduce((acc, s) => acc + s.attempts, 0)
  if (totalAttempts === 0) return { tags, decoderAccuracy: null, decoderAttempts: 0 }
  // Weight by attempts so a single high-accuracy decoder doesn't
  // dominate when the player has barely touched it.
  const weighted =
    stats.reduce((acc, s) => acc + s.rollingAccuracy * s.attempts, 0) / totalAttempts
  return { tags, decoderAccuracy: weighted, decoderAttempts: totalAttempts }
}

function deriveChapterProgress(
  chapter: PathwayChapterConfig,
  input: PathwayProgressInput,
  /** Whether all prior chapters are mastered (sequence-unlock). */
  prevChaptersMastered: boolean,
): PathwayChapterProgress {
  const isCapstone = chapter.decoderTag === null

  // The capstone chapter (Real Game Mix) reuses scenario IDs from the
  // four primary chapters. v1 doesn't track capstone-mode attempts, so
  // we cannot tell the difference between "user attempted BDW-01 in
  // chapter 1" and "user attempted BDW-01 in the capstone". To avoid
  // the capstone ring auto-filling from incidental ch1–4 attempts:
  //   - locked while prior chapters aren't all mastered;
  //   - mastered when prior chapters are all mastered (we trust the
  //     per-chapter mastery as a proxy for capstone readiness);
  //   - all skill nodes inherit the chapter state, attemptedCount /
  //     bestCount stay at zero.
  // Real boss / mixed-read tracking is PTH-3.
  if (isCapstone) {
    const { decoderAccuracy, decoderAttempts } = chapterDecoderStats(chapter, input)
    const state: PathwayChapterState = prevChaptersMastered ? 'mastered' : 'locked'
    const progress = state === 'mastered' ? 1 : 0
    const totalScenarios = countChapterScenarios(chapter)
    return {
      slug: chapter.slug,
      state,
      progress,
      bestCount: 0,
      attemptedCount: 0,
      totalScenarios,
      decoderAccuracy,
      decoderAttempts,
      skillNodes: chapter.skillNodes.map((n) => ({
        slug: n.slug,
        state,
        progress,
        attemptedCount: 0,
        bestCount: 0,
        totalScenarios: n.scenarioIds.length,
      })),
    }
  }

  const skillNodes: PathwaySkillNodeProgress[] = []
  const bySlug = new Map<string, PathwaySkillNodeProgress>()

  for (const node of chapter.skillNodes) {
    const prereqNodes = (node.prerequisiteNodeSlugs ?? [])
      .map((slug) => bySlug.get(slug))
      .filter((n): n is PathwaySkillNodeProgress => Boolean(n))
    const progress = deriveSkillNodeProgress(node, input, prereqNodes)
    skillNodes.push(progress)
    bySlug.set(node.slug, progress)
  }

  // Sum of unique scenarios attempted/best across the chapter (not the
  // sum of skill-node counts, since skill nodes can share scenario IDs
  // — the "Learn the Cue" node shares its rep with "First Reps").
  const seen = new Set<string>()
  let attemptedCount = 0
  let bestCount = 0
  let totalScenarios = 0
  for (const node of chapter.skillNodes) {
    for (const id of node.scenarioIds) {
      if (seen.has(id)) continue
      seen.add(id)
      totalScenarios += 1
      const quality = input.latestQualityByScenarioId.get(id)
      if (!quality) continue
      attemptedCount += 1
      if (quality === 'best') bestCount += 1
    }
  }

  let chapterState = deriveChapterState(skillNodes)
  if (!prevChaptersMastered && chapterState === 'unlocked' && totalScenarios > 0) {
    // Sequence-lock: future chapters with no progress stay locked until
    // the prior chapter is mastered. Once the player has any attempts
    // we never re-lock — that would be jarring.
    if (attemptedCount === 0) chapterState = 'locked'
  }

  // Average progress across non-boss skill nodes; falls back to the
  // chapter-wide attemptedCount/totalScenarios ratio if the chapter has
  // no skill nodes (defensive).
  const skillNodeProgressAvg =
    skillNodes.length === 0
      ? totalScenarios === 0
        ? 0
        : attemptedCount / totalScenarios
      : skillNodes.reduce((acc, n) => acc + n.progress, 0) / skillNodes.length

  const { decoderAccuracy, decoderAttempts } = chapterDecoderStats(chapter, input)

  return {
    slug: chapter.slug,
    state: chapterState,
    progress: skillNodeProgressAvg,
    bestCount,
    attemptedCount,
    totalScenarios,
    decoderAccuracy,
    decoderAttempts,
    skillNodes,
  }
}

function pickRecommendedNext(
  pathway: PathwayConfig,
  chapters: PathwayChapterProgress[],
): PathwayRecommendedNext | null {
  if (chapters.length === 0) return null

  const findFirstUnmasteredNode = (
    chapter: PathwayChapterConfig,
    progress: PathwayChapterProgress,
  ) => {
    for (const node of chapter.skillNodes) {
      const np = progress.skillNodes.find((n) => n.slug === node.slug)
      if (!np) continue
      if (np.state === 'mastered') continue
      return { chapter, node }
    }
    // Already mastered — fall back to first node so the CTA still
    // points somewhere coherent.
    const firstNode = chapter.skillNodes[0]
    return firstNode ? { chapter, node: firstNode } : null
  }

  const labelFor = (chapter: PathwayChapterConfig, node: SkillNodeConfig, verb: string) =>
    `${verb} ${chapter.title}${node.kind === 'learn-cue' ? ' — Learn the Cue' : ''}`

  // Priority 1: Resume — lowest-order in-progress chapter. Linear
  // pacing matches how youth players actually move through curriculum;
  // jumping ahead to a higher chapter would feel disorienting even if
  // the higher chapter has more recent attempts.
  const inProgress = pathway.chapters
    .map((c, i) => ({ chapter: c, progress: chapters[i]! }))
    .find((row) => row.progress.state === 'in_progress')
  if (inProgress) {
    const next = findFirstUnmasteredNode(inProgress.chapter, inProgress.progress)
    if (next) {
      return {
        chapterSlug: next.chapter.slug,
        skillNodeSlug: next.node.slug,
        trainHref: buildPathwayTrainHref({ scenarioIds: next.node.scenarioIds }),
        label: labelFor(next.chapter, next.node, 'Continue'),
        reason: 'resume',
      }
    }
  }

  // Priority 2: Sequence — first non-mastered, non-locked chapter.
  // The "cold-start" reason only fires when the *entire* pathway has
  // never been touched; once the player has any history, advancing to
  // a fresh chapter is `sequence`, not `cold-start`.
  const pathwayHasAnyAttempts = chapters.some((c) => c.attemptedCount > 0)
  for (let i = 0; i < pathway.chapters.length; i += 1) {
    const chapter = pathway.chapters[i]!
    const progress = chapters[i]!
    if (progress.state === 'mastered') continue
    if (progress.state === 'locked') continue
    const next = findFirstUnmasteredNode(chapter, progress)
    if (next) {
      const isColdStart = !pathwayHasAnyAttempts
      return {
        chapterSlug: next.chapter.slug,
        skillNodeSlug: next.node.slug,
        trainHref: buildPathwayTrainHref({ scenarioIds: next.node.scenarioIds }),
        label: labelFor(next.chapter, next.node, isColdStart ? 'Start' : 'Continue'),
        reason: isColdStart ? 'cold-start' : 'sequence',
      }
    }
  }

  // Priority 3: Weakness — every chapter mastered except one with low
  // decoder accuracy. We surface that chapter's first un-mastered node.
  const unmastered = chapters
    .map((c, i) => ({ chapter: pathway.chapters[i]!, progress: c }))
    .filter((row) => row.progress.state !== 'mastered')
  if (unmastered.length === 1) {
    const target = unmastered[0]!
    if (
      target.progress.decoderAccuracy !== null &&
      target.progress.decoderAccuracy < 0.6 &&
      target.progress.decoderAttempts >= 3
    ) {
      const next = findFirstUnmasteredNode(target.chapter, target.progress)
      if (next) {
        return {
          chapterSlug: next.chapter.slug,
          skillNodeSlug: next.node.slug,
          trainHref: buildPathwayTrainHref({ scenarioIds: next.node.scenarioIds }),
          label: `Shore up ${target.chapter.title}`,
          reason: 'weakness',
        }
      }
    }
  }

  // Everything mastered. No recommendation; the page can show the
  // mastery report card.
  return null
}

function pickWeakestDecoder(
  pathway: PathwayConfig,
  input: PathwayProgressInput,
): DecoderTag | null {
  let weakest: { tag: DecoderTag; accuracy: number } | null = null
  for (const tag of pathway.decoderTags) {
    const stat = input.decoderMasteryByTag.get(tag)
    if (!stat || stat.attempts < 3) continue
    if (!weakest || stat.rollingAccuracy < weakest.accuracy) {
      weakest = { tag, accuracy: stat.rollingAccuracy }
    }
  }
  return weakest?.tag ?? null
}

/**
 * Pure derivation of a `PathwayProgressSummary` from already-fetched
 * Attempt + Mastery snapshots. Exported for unit tests.
 */
export function derivePathwayProgress(
  pathway: PathwayConfig,
  input: PathwayProgressInput,
): PathwayProgressSummary {
  const chapters: PathwayChapterProgress[] = []
  let prevMastered = true
  for (const chapter of pathway.chapters) {
    const progress = deriveChapterProgress(chapter, input, prevMastered)
    chapters.push(progress)
    prevMastered = progress.state === 'mastered'
  }

  const pathwayProgress =
    chapters.length === 0
      ? 0
      : chapters.reduce((acc, c) => acc + c.progress, 0) / chapters.length
  const pathwayMastered = chapters.length > 0 && chapters.every((c) => c.state === 'mastered')

  return {
    slug: pathway.slug,
    pathwayProgress,
    pathwayMastered,
    chapters,
    recommendedNext: pickRecommendedNext(pathway, chapters),
    weakestDecoder: pickWeakestDecoder(pathway, input),
  }
}

/**
 * Server-only entry point: fetch the user's most recent attempts on
 * the Pathway's scenarios + the user's decoder masteries, then derive
 * the progress summary.
 *
 * Returns a "cold start" summary (everything zeroed) when the pathway
 * has no chapters yet (coming-soon).
 */
export async function getPathwayProgress(
  userId: string | null,
  slug: string,
): Promise<PathwayProgressSummary | null> {
  const pathway = getPathwayBySlug(slug)
  if (!pathway) return null

  // Coming-soon pathways with no chapters: nothing to derive.
  if (pathway.chapters.length === 0 || !userId) {
    return derivePathwayProgress(pathway, {
      latestQualityByScenarioId: new Map(),
      decoderMasteryByTag: new Map(),
    })
  }

  const scenarioIds = getAllScenarioIdsForPathway(pathway)

  const [attempts, masteries] = await Promise.all([
    scenarioIds.length === 0
      ? Promise.resolve([] as Awaited<ReturnType<typeof prisma.attempt.findMany>>)
      : prisma.attempt.findMany({
          where: { user_id: userId, scenario_id: { in: scenarioIds } },
          orderBy: { created_at: 'desc' },
          select: { scenario_id: true, choice_id: true, created_at: true },
        }),
    prisma.mastery.findMany({
      where: {
        user_id: userId,
        dimension: MasteryDimension.decoder,
        concept_id: { in: pathway.decoderTags },
      },
      select: { concept_id: true, attempts_count: true, rolling_accuracy: true },
    }),
  ])

  const latestByScenario = new Map<string, { choice_id: string }>()
  for (const attempt of attempts) {
    if (!latestByScenario.has(attempt.scenario_id)) {
      latestByScenario.set(attempt.scenario_id, { choice_id: attempt.choice_id })
    }
  }

  const choiceIds = [...latestByScenario.values()].map((a) => a.choice_id)
  const choices =
    choiceIds.length === 0
      ? []
      : await prisma.scenarioChoice.findMany({
          where: { id: { in: choiceIds } },
          select: { id: true, quality: true },
        })
  const qualityByChoiceId = new Map<string, LatestAttemptQuality>()
  for (const c of choices) qualityByChoiceId.set(c.id, c.quality as LatestAttemptQuality)

  const latestQualityByScenarioId = new Map<string, LatestAttemptQuality>()
  for (const [scenarioId, attempt] of latestByScenario) {
    const quality = qualityByChoiceId.get(attempt.choice_id)
    if (quality) latestQualityByScenarioId.set(scenarioId, quality)
  }

  const decoderMasteryByTag = new Map<DecoderTag, DecoderMasteryStat>()
  for (const m of masteries) {
    decoderMasteryByTag.set(m.concept_id as DecoderTag, {
      attempts: m.attempts_count,
      rollingAccuracy: m.rolling_accuracy,
    })
  }

  return derivePathwayProgress(pathway, {
    latestQualityByScenarioId,
    decoderMasteryByTag,
  })
}

/**
 * A coarser per-pathway summary used by the hub catalog cards: just
 * the headline progress percentage and the recommended-next label.
 * Cheap to call for many pathways at once.
 */
export interface PathwayHubCardSummary {
  slug: string
  pathwayProgress: number
  recommendedLabel: string | null
  recommendedHref: string | null
  state: 'cold-start' | 'in-progress' | 'mastered'
}

export function summarizeForHub(
  summary: PathwayProgressSummary,
): PathwayHubCardSummary {
  let state: PathwayHubCardSummary['state']
  if (summary.pathwayMastered) state = 'mastered'
  else if (summary.chapters.some((c) => c.attemptedCount > 0)) state = 'in-progress'
  else state = 'cold-start'

  return {
    slug: summary.slug,
    pathwayProgress: summary.pathwayProgress,
    recommendedLabel: summary.recommendedNext?.label ?? null,
    recommendedHref: summary.recommendedNext?.trainHref ?? null,
    state,
  }
}

// Helper for chapter scenario count rendering on the detail page,
// re-exported here so the page can pull a single import surface.
export { countChapterScenarios }
