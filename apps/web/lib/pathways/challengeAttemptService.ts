/**
 * Server-persisted boss / mixed-reads challenge attempts (PTH-4).
 *
 * PTH-3 captured boss/mixed pass-fail in localStorage so summary copy
 * + the "Cleared" tag on /pathways/[slug] could reflect a recent run.
 * PTH-4 promotes that result to account-level state so a cleared boss
 * survives refresh, login on another device, and (later) coach
 * reporting.
 *
 * The module exposes two surfaces:
 *   - pure helpers (best-attempt selection, key derivation,
 *     pass-criteria computation) so they can be unit-tested without a
 *     database;
 *   - Prisma-backed wrappers used by the route handlers + the pathway
 *     progress endpoint.
 *
 * `bestCount` is computed server-side from
 * `Attempt -> ScenarioChoice.quality === 'best'` for the scenarios in
 * the challenge run, so a client cannot inflate their score. `passed`
 * comes from the chapter's pass criteria (`bossBestRatio` for boss,
 * a fallback ratio for mixed-reads).
 *
 * Mirrors §10 of `docs/courtiq-pathways-product-plan.md`.
 */

import { prisma } from '@/lib/db/prisma'
import type { BossChallengeAttempt } from '@prisma/client'
import {
  getChapterBySlug,
  getPathwayBySlug,
} from './helpers'
import type {
  BossChallengeConfig,
  PathwayChapterConfig,
  PathwayConfig,
} from './types'

/** The challenge modes PTH-4 persists. Mirrors the localStorage type
 *  so client + server share the same vocabulary. */
export type ServerChallengeMode = 'boss-challenge' | 'mixed-reads'

export interface ChallengeAttemptKey {
  pathwaySlug: string
  chapterSlug: string
  mode: ServerChallengeMode
  challengeSlug: string
}

/** A serializable view of a `BossChallengeAttempt` row. We never expose
 *  raw Prisma rows past the API boundary so internal columns can change
 *  without breaking clients. */
export interface ChallengeAttemptDTO {
  id: string
  pathwaySlug: string
  chapterSlug: string
  mode: ServerChallengeMode
  challengeSlug: string
  sessionRunId: string | null
  bestCount: number
  total: number
  passed: boolean
  scenarioIds: string[]
  attemptedAt: string
}

/** Mixed-reads pass ratio fallback when the chapter doesn't pin a
 *  `bossBestRatio`. Matches the v1 summary-page constant so server +
 *  client agree on what "passed mixed-reads" means. */
export const DEFAULT_MIXED_PASS_RATIO = 0.7

/** Default boss pass ratio when the boss config omits one. Matches the
 *  pass criteria the four bosses ship with (0.8). */
export const DEFAULT_BOSS_PASS_RATIO = 0.8

export function toChallengeAttemptDTO(row: BossChallengeAttempt): ChallengeAttemptDTO {
  return {
    id: row.id,
    pathwaySlug: row.pathway_slug,
    chapterSlug: row.chapter_slug,
    mode: row.mode as ServerChallengeMode,
    challengeSlug: row.challenge_slug,
    sessionRunId: row.session_run_id,
    bestCount: row.best_count,
    total: row.total,
    passed: row.passed,
    scenarioIds: [...row.scenario_ids],
    attemptedAt: row.attempted_at.toISOString(),
  }
}

/**
 * Pick the "best" attempt out of a list. Sort order mirrors the spec:
 *  1. Passed attempts outrank failed attempts.
 *  2. Higher `bestCount` wins on ties.
 *  3. Newer `attemptedAt` breaks remaining ties (keeps fresh wins).
 *
 * Pure — exported so tests can exercise the rule without a database.
 */
export function selectBestAttempt<
  T extends {
    passed: boolean
    bestCount: number
    attemptedAt: string | Date
  },
>(attempts: readonly T[]): T | null {
  if (attempts.length === 0) return null
  const toMs = (v: string | Date) => (v instanceof Date ? v.getTime() : new Date(v).getTime())
  let best: T | null = null
  for (const candidate of attempts) {
    if (!best) {
      best = candidate
      continue
    }
    if (candidate.passed && !best.passed) {
      best = candidate
      continue
    }
    if (candidate.passed === best.passed) {
      if (candidate.bestCount > best.bestCount) {
        best = candidate
        continue
      }
      if (
        candidate.bestCount === best.bestCount &&
        toMs(candidate.attemptedAt) > toMs(best.attemptedAt)
      ) {
        best = candidate
      }
    }
  }
  return best
}

/** Derive the canonical pass ratio for a chapter / mode. Boss mode
 *  reads from the chapter's boss config; mixed-reads falls back to the
 *  PTH-3 v1 default. */
export function passRatioFor(
  chapter: PathwayChapterConfig,
  mode: ServerChallengeMode,
): number {
  if (mode === 'boss-challenge') {
    return chapter.bossChallenge?.passCriteria.bossBestRatio ?? DEFAULT_BOSS_PASS_RATIO
  }
  return chapter.passCriteria.bossBestRatio ?? DEFAULT_MIXED_PASS_RATIO
}

/** Compute pass/fail given bestCount + total + chapter/mode. Centralized
 *  so the POST endpoint and any future re-derivation use the same rule. */
export function isPassingChallenge(
  chapter: PathwayChapterConfig,
  mode: ServerChallengeMode,
  bestCount: number,
  total: number,
): boolean {
  if (total <= 0) return false
  const ratio = passRatioFor(chapter, mode)
  return bestCount / total >= ratio
}

/** Resolve the canonical scenarioIds + canonical challenge slug for a
 *  challenge/mode in config. Returns null when the chapter doesn't
 *  configure that mode (e.g. no bossChallenge defined). */
export function resolveChallengeConfig(
  _pathway: PathwayConfig,
  chapter: PathwayChapterConfig,
  mode: ServerChallengeMode,
  /** Optional explicit challengeSlug from the client. We accept it but
   *  validate it matches the chapter's configured boss/mixed slug. */
  challengeSlug?: string | null,
): { challengeSlug: string; scenarioIds: string[]; bossConfig: BossChallengeConfig | null } | null {
  if (mode === 'boss-challenge') {
    const boss = chapter.bossChallenge
    if (!boss || boss.scenarioIds.length === 0) return null
    if (challengeSlug && challengeSlug !== boss.slug) return null
    return {
      challengeSlug: boss.slug,
      scenarioIds: [...boss.scenarioIds],
      bossConfig: boss,
    }
  }
  // mixed-reads
  const mixedNode =
    chapter.skillNodes.find((n) => n.trainingMode === 'mixed-reads') ??
    chapter.skillNodes.find((n) => n.slug === challengeSlug) ??
    chapter.skillNodes[0] ??
    null
  if (!mixedNode || mixedNode.scenarioIds.length === 0) return null
  // For mixed reads we accept the node slug or the chapter slug as the
  // challenge identifier. Anything else is rejected so we don't write
  // junk rows for free-form keys.
  const acceptableSlugs = new Set<string>([mixedNode.slug, chapter.slug])
  const resolvedSlug = challengeSlug && acceptableSlugs.has(challengeSlug) ? challengeSlug : mixedNode.slug
  return {
    challengeSlug: resolvedSlug,
    scenarioIds: [...mixedNode.scenarioIds],
    bossConfig: null,
  }
}

/** Look up pathway + chapter from config and refuse anything that
 *  isn't a real, non-coming-soon, configured chapter. Returns null on
 *  any miss so callers can surface a 400. */
export function lookupPathwayChapter(
  pathwaySlug: string,
  chapterSlug: string,
): { pathway: PathwayConfig; chapter: PathwayChapterConfig } | null {
  const pathway = getPathwayBySlug(pathwaySlug)
  if (!pathway || pathway.comingSoon) return null
  const chapter = getChapterBySlug(pathway, chapterSlug)
  if (!chapter) return null
  return { pathway, chapter }
}

/** Compute `bestCount` for a single user/session/scenarios run from the
 *  authoritative `Attempt -> ScenarioChoice.quality` data.
 *
 * Server truth: a scenario contributes to bestCount when the user's
 * attempt for it (during this session, when sessionRunId is supplied;
 * otherwise the latest attempt) maps to a `ScenarioChoice.quality === 'best'`.
 */
export async function computeServerBestCount(args: {
  userId: string
  scenarioIds: readonly string[]
  sessionRunId?: string | null
}): Promise<number> {
  const { userId, scenarioIds } = args
  if (scenarioIds.length === 0) return 0

  const attempts = await prisma.attempt.findMany({
    where: {
      user_id: userId,
      scenario_id: { in: [...scenarioIds] },
      ...(args.sessionRunId ? { session_run_id: args.sessionRunId } : {}),
    },
    orderBy: { created_at: 'desc' },
    select: { scenario_id: true, choice_id: true, created_at: true },
  })

  // Latest attempt per scenario wins. Within a single session the
  // first attempt is normally the only one, but we still take the
  // latest by created_at to be safe against retries.
  const latestByScenario = new Map<string, { choice_id: string }>()
  for (const a of attempts) {
    if (!latestByScenario.has(a.scenario_id)) {
      latestByScenario.set(a.scenario_id, { choice_id: a.choice_id })
    }
  }
  const choiceIds = [...latestByScenario.values()].map((v) => v.choice_id)
  if (choiceIds.length === 0) return 0

  const choices = await prisma.scenarioChoice.findMany({
    where: { id: { in: choiceIds } },
    select: { id: true, quality: true },
  })
  const bestChoiceIds = new Set(choices.filter((c) => c.quality === 'best').map((c) => c.id))

  let bestCount = 0
  for (const { choice_id } of latestByScenario.values()) {
    if (bestChoiceIds.has(choice_id)) bestCount += 1
  }
  return bestCount
}

export interface RecordChallengeAttemptInput {
  userId: string
  pathwaySlug: string
  chapterSlug: string
  mode: ServerChallengeMode
  challengeSlug?: string | null
  sessionRunId?: string | null
  /** Scenario IDs the run actually ran (URL/client-supplied). The
   *  server picks scenarioIds from config when these are missing or
   *  inconsistent — config wins for `bestCount` computation. */
  scenarioIds?: readonly string[] | null
  /** Total reps the run was supposed to count. Server clamps this to
   *  the canonical scenarioIds length. */
  total?: number | null
}

export interface RecordChallengeAttemptResult {
  ok: true
  attempt: ChallengeAttemptDTO
}

export interface RecordChallengeAttemptError {
  ok: false
  reason:
    | 'pathway-not-found'
    | 'chapter-not-found'
    | 'challenge-not-configured'
    | 'mode-not-supported'
}

/** Server-side write path. Validates pathway/chapter/challenge against
 *  config, computes `bestCount` from authoritative attempts, decides
 *  pass/fail using config-derived pass criteria, and persists the row. */
export async function recordServerChallengeAttempt(
  input: RecordChallengeAttemptInput,
): Promise<RecordChallengeAttemptResult | RecordChallengeAttemptError> {
  if (input.mode !== 'boss-challenge' && input.mode !== 'mixed-reads') {
    return { ok: false, reason: 'mode-not-supported' }
  }

  const lookup = lookupPathwayChapter(input.pathwaySlug, input.chapterSlug)
  if (!lookup) {
    // We can't tell pathway-not-found from chapter-not-found without a
    // double lookup; the route handler can re-derive that nuance if it
    // cares. We return chapter-not-found as the broader bucket since
    // that's what fails most often.
    if (!getPathwayBySlug(input.pathwaySlug)) return { ok: false, reason: 'pathway-not-found' }
    return { ok: false, reason: 'chapter-not-found' }
  }
  const { pathway, chapter } = lookup

  const config = resolveChallengeConfig(pathway, chapter, input.mode, input.challengeSlug ?? null)
  if (!config) return { ok: false, reason: 'challenge-not-configured' }

  // Server truth: scenarioIds + total come from config, not from the
  // client. We accept the client list as a hint for `bestCount`
  // computation (e.g. session_run_id-restricted look-up) but always
  // fall back to the canonical config list so a partial / shuffled
  // client list can't shrink the denominator.
  const canonicalScenarioIds = config.scenarioIds
  const total = canonicalScenarioIds.length
  const scenarioIdsForBestCount =
    input.scenarioIds && input.scenarioIds.length > 0
      ? [...new Set([...input.scenarioIds, ...canonicalScenarioIds])]
      : canonicalScenarioIds

  const bestCount = await computeServerBestCount({
    userId: input.userId,
    scenarioIds: scenarioIdsForBestCount,
    sessionRunId: input.sessionRunId ?? null,
  })

  const passed = isPassingChallenge(chapter, input.mode, bestCount, total)

  const row = await prisma.bossChallengeAttempt.create({
    data: {
      user_id: input.userId,
      pathway_slug: pathway.slug,
      chapter_slug: chapter.slug,
      mode: input.mode,
      challenge_slug: config.challengeSlug,
      session_run_id: input.sessionRunId ?? null,
      best_count: bestCount,
      total,
      passed,
      scenario_ids: canonicalScenarioIds,
    },
  })

  return { ok: true, attempt: toChallengeAttemptDTO(row) }
}

// ---------------------------------------------------------------------------
// Read paths
// ---------------------------------------------------------------------------

/** Best-of-all attempts for a single challenge key. */
export async function getBestChallengeAttempt(
  userId: string,
  key: ChallengeAttemptKey,
): Promise<ChallengeAttemptDTO | null> {
  const rows = await prisma.bossChallengeAttempt.findMany({
    where: {
      user_id: userId,
      pathway_slug: key.pathwaySlug,
      chapter_slug: key.chapterSlug,
      mode: key.mode,
      challenge_slug: key.challengeSlug,
    },
    orderBy: { attempted_at: 'desc' },
  })
  const dtos = rows.map(toChallengeAttemptDTO)
  return selectBestAttempt(dtos)
}

/** All best-attempts for a pathway, keyed by challenge identity, used
 *  by the progress endpoint + the pathway detail page. The map key is
 *  `${chapterSlug}|${mode}|${challengeSlug}` so the consumer can index
 *  each chapter row without a per-row lookup. */
export async function getChallengeAttemptsForPathway(
  userId: string,
  pathwaySlug: string,
): Promise<Map<string, ChallengeAttemptDTO>> {
  const rows = await prisma.bossChallengeAttempt.findMany({
    where: { user_id: userId, pathway_slug: pathwaySlug },
    orderBy: { attempted_at: 'desc' },
  })
  const buckets = new Map<string, ChallengeAttemptDTO[]>()
  for (const row of rows) {
    const dto = toChallengeAttemptDTO(row)
    const k = `${dto.chapterSlug}|${dto.mode}|${dto.challengeSlug}`
    const arr = buckets.get(k) ?? []
    arr.push(dto)
    buckets.set(k, arr)
  }
  const out = new Map<string, ChallengeAttemptDTO>()
  for (const [k, arr] of buckets) {
    const best = selectBestAttempt(arr)
    if (best) out.set(k, best)
  }
  return out
}

/** Compact summary shape used by the progress endpoint. One row per
 *  cleared/attempted challenge — the UI only needs cleared + best
 *  score + attemptedAt to render. */
export interface ChallengeAttemptSummaryRow {
  chapterSlug: string
  mode: ServerChallengeMode
  challengeSlug: string
  passed: boolean
  bestCount: number
  total: number
  attemptedAt: string
}

export function buildPathwayChallengeSummary(
  best: Map<string, ChallengeAttemptDTO>,
): ChallengeAttemptSummaryRow[] {
  return [...best.values()].map((a) => ({
    chapterSlug: a.chapterSlug,
    mode: a.mode,
    challengeSlug: a.challengeSlug,
    passed: a.passed,
    bestCount: a.bestCount,
    total: a.total,
    attemptedAt: a.attemptedAt,
  }))
}

export async function getChallengeAttemptSummary(
  userId: string,
  pathwaySlug: string,
): Promise<ChallengeAttemptSummaryRow[]> {
  const best = await getChallengeAttemptsForPathway(userId, pathwaySlug)
  return buildPathwayChallengeSummary(best)
}

/** Convenience for callers that only care whether a single challenge
 *  has been cleared. */
export async function hasClearedServerChallenge(
  userId: string,
  key: ChallengeAttemptKey,
): Promise<boolean> {
  const best = await getBestChallengeAttempt(userId, key)
  return best?.passed === true
}

/** Convenience for the future "reset progress" affordance + tests. */
export function challengeBucketKey(
  chapterSlug: string,
  mode: ServerChallengeMode,
  challengeSlug: string,
): string {
  return `${chapterSlug}|${mode}|${challengeSlug}`
}
