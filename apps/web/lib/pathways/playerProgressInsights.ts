/**
 * Player Progress & Performance insights (PTH-6).
 *
 * Pure derivations on top of the existing `PathwayProgressSummary`
 * shape. PTH-6 deliberately adds NO new tables, NO new fetches, and
 * does not touch the PTH-5 progress logic — every field surfaced here
 * is a re-shaping of data that `progressService.derivePathwayProgress`
 * already computed.
 *
 * The view answers three player-facing questions:
 *   1. What am I good at?            → decoder strength buckets
 *   2. What am I struggling with?    → weakness insight (single)
 *   3. What should I do next?        → recommendedNext + reason copy
 *
 * Keep this module dependency-free (no Prisma, no Supabase) so it can
 * be unit-tested with the same pure-input pattern as `progressService`.
 */

import { isCapstoneChapter } from './challengeAttemptService'
import { getDecoderLabel } from './helpers'
import type {
  DecoderTag,
  PathwayChallengeAttemptSummary,
  PathwayChapterConfig,
  PathwayChapterProgress,
  PathwayConfig,
  PathwayProgressSummary,
  PathwayRecommendedNext,
} from './types'

/** Decoder mastery bucket. `untested` short-circuits the strong /
 *  improving / needs-work display so we never call out a decoder the
 *  player has barely touched. */
export type DecoderStrengthGroup = 'strong' | 'improving' | 'needs-work' | 'untested'

/** Minimum attempts before a decoder is judged at all. Matches the
 *  weakness-detection floor used in `pickWeakestDecoder` so the two
 *  surfaces agree on "enough reps to mean something". */
export const DECODER_MIN_ATTEMPTS_FOR_GROUPING = 3

/** Bucket boundaries — picked from the spec's "≥ ~0.7 strong, ~0.4–0.7
 *  improving, < ~0.4 needs work" guidance. */
export const DECODER_STRONG_THRESHOLD = 0.7
export const DECODER_IMPROVING_THRESHOLD = 0.4

/** Weakness insight floor: only fire below 0.6 with ≥ 3 attempts so
 *  the message doesn't trigger off a single bad rep. */
export const WEAKNESS_ACCURACY_CEILING = 0.6
export const WEAKNESS_MIN_ATTEMPTS = 3

export interface DecoderInsight {
  tag: DecoderTag
  label: string
  /** Rolling accuracy (0..1) inherited from the chapter that owns the
   *  decoder. `null` when the player has zero attempts on this decoder
   *  (or the chapter records didn't include it). */
  accuracy: number | null
  attempts: number
  group: DecoderStrengthGroup
}

export interface WeaknessInsight {
  tag: DecoderTag
  label: string
  accuracy: number
  attempts: number
  /** Player-voice short coaching line. Surfaces under the weakness
   *  callout so the message is actionable. */
  message: string
}

export type FinalMixStatus = 'not_started' | 'attempted' | 'cleared' | 'none'

export interface RecentChallengeRow {
  chapterSlug: string
  chapterTitle: string
  mode: 'boss-challenge' | 'mixed-reads'
  passed: boolean
  bestCount: number
  total: number
  attemptedAt: string
}

export interface NextActionInsight {
  /** Mirrors the `recommendedNext` already produced by progressService.
   *  Null when the pathway is fully mastered or has no chapters yet. */
  recommendation: PathwayRecommendedNext | null
  /** Player-voice short reason copy, e.g. "Pick up where you left off". */
  reasonCopy: string | null
}

export interface PlayerInsights {
  pathwaySlug: string
  pathwayProgress: number
  pathwayMastered: boolean
  chaptersMastered: number
  chaptersTotal: number
  bossesCleared: number
  bossesTotal: number
  finalMixStatus: FinalMixStatus
  /** ISO timestamp of the most recent recorded challenge attempt; null
   *  when the player has never run a boss/mixed challenge. */
  lastActivityAt: string | null
  decoders: DecoderInsight[]
  weakness: WeaknessInsight | null
  recent: RecentChallengeRow[]
  next: NextActionInsight
}

/** Placeholder pathway slug used when callers pass a null/empty
 *  summary. Surfaces nothing UI-actionable but keeps consumers
 *  branch-light. */
const EMPTY_INSIGHTS_DEFAULTS = {
  pathwayProgress: 0,
  pathwayMastered: false,
  chaptersMastered: 0,
  chaptersTotal: 0,
  bossesCleared: 0,
  bossesTotal: 0,
  finalMixStatus: 'none' as FinalMixStatus,
  lastActivityAt: null,
  decoders: [] as DecoderInsight[],
  weakness: null as WeaknessInsight | null,
  recent: [] as RecentChallengeRow[],
}

/** Bucket a decoder's rolling accuracy + attempt count. Pure and
 *  exported so unit tests can pin the thresholds. */
export function groupDecoderStrength(input: {
  accuracy: number | null
  attempts: number
}): DecoderStrengthGroup {
  if (input.accuracy === null || input.attempts < DECODER_MIN_ATTEMPTS_FOR_GROUPING) {
    return 'untested'
  }
  if (input.accuracy >= DECODER_STRONG_THRESHOLD) return 'strong'
  if (input.accuracy >= DECODER_IMPROVING_THRESHOLD) return 'improving'
  return 'needs-work'
}

const WEAKNESS_MESSAGE: Record<DecoderTag, string> = {
  BACKDOOR_WINDOW:
    'Backdoor windows are slipping past you. When the defender denies the pass, cut behind — don’t hold the spot.',
  EMPTY_SPACE_CUT:
    'Empty-space cuts need work. When your defender turns to watch the ball, sprint to the gap before help recovers.',
  ADVANTAGE_OR_RESET:
    'Advantage-or-reset reads are tough right now. Don’t force on a hard closeout — a reset keeps the possession alive.',
  SKIP_THE_ROTATION:
    'Help-rotation skips need work. When the help defender bites, trust the cross-court pass to the open shooter.',
}

/** Map a chapter's single-decoder accuracy back to a per-decoder
 *  insight. Only chapters with a single `decoderTag` qualify — the
 *  capstone covers all four and would dilute the signal. */
function decoderInsightsFromChapters(
  pathway: PathwayConfig,
  chapters: readonly PathwayChapterProgress[],
): DecoderInsight[] {
  const seen = new Set<DecoderTag>()
  const insights: DecoderInsight[] = []

  for (let i = 0; i < pathway.chapters.length; i += 1) {
    const chapter = pathway.chapters[i]
    if (!chapter) continue
    const tag = chapter.decoderTag
    if (!tag) continue
    if (seen.has(tag)) continue
    seen.add(tag)

    const progress = chapters[i]
    const accuracy = progress?.decoderAccuracy ?? null
    const attempts = progress?.decoderAttempts ?? 0
    insights.push({
      tag,
      label: getDecoderLabel(tag),
      accuracy,
      attempts,
      group: groupDecoderStrength({ accuracy, attempts }),
    })
  }

  // Pathway-level decoder tags catch any decoder not covered by a
  // single-tag chapter (defensive — Foundation has 1:1 chapter:decoder
  // mapping already).
  for (const tag of pathway.decoderTags) {
    if (seen.has(tag)) continue
    seen.add(tag)
    insights.push({
      tag,
      label: getDecoderLabel(tag),
      accuracy: null,
      attempts: 0,
      group: 'untested',
    })
  }

  return insights
}

function pickWeakness(decoders: readonly DecoderInsight[]): WeaknessInsight | null {
  let weakest: DecoderInsight | null = null
  for (const d of decoders) {
    if (d.accuracy === null) continue
    if (d.attempts < WEAKNESS_MIN_ATTEMPTS) continue
    if (d.accuracy >= WEAKNESS_ACCURACY_CEILING) continue
    if (!weakest || d.accuracy < (weakest.accuracy ?? 1)) weakest = d
  }
  if (!weakest || weakest.accuracy === null) return null
  return {
    tag: weakest.tag,
    label: weakest.label,
    accuracy: weakest.accuracy,
    attempts: weakest.attempts,
    message: WEAKNESS_MESSAGE[weakest.tag],
  }
}

function chapterTitleBySlug(pathway: PathwayConfig): Map<string, string> {
  const out = new Map<string, string>()
  for (const c of pathway.chapters) out.set(c.slug, c.title)
  return out
}

function buildRecentRows(
  pathway: PathwayConfig,
  challengeAttempts: readonly PathwayChallengeAttemptSummary[],
): RecentChallengeRow[] {
  const titles = chapterTitleBySlug(pathway)
  const sorted = [...challengeAttempts].sort((a, b) => {
    const at = new Date(b.attemptedAt).getTime() - new Date(a.attemptedAt).getTime()
    if (Number.isFinite(at) && at !== 0) return at
    return 0
  })
  return sorted.slice(0, 3).map((a) => ({
    chapterSlug: a.chapterSlug,
    chapterTitle: titles.get(a.chapterSlug) ?? a.chapterSlug,
    mode: a.mode,
    passed: a.passed,
    bestCount: a.bestCount,
    total: a.total,
    attemptedAt: a.attemptedAt,
  }))
}

function findCapstoneChapter(
  pathway: PathwayConfig,
): PathwayChapterConfig | null {
  return pathway.chapters.find(isCapstoneChapter) ?? null
}

function deriveFinalMixStatus(
  pathway: PathwayConfig,
  chapters: readonly PathwayChapterProgress[],
): FinalMixStatus {
  const capstone = findCapstoneChapter(pathway)
  if (!capstone) return 'none'
  const idx = pathway.chapters.findIndex((c) => c.slug === capstone.slug)
  const progress = chapters[idx]
  if (!progress) return 'not_started'
  const cs = progress.challengeState
  if (cs.kind !== 'capstone') return 'none'
  if (cs.state === 'cleared') return 'cleared'
  if (cs.state === 'attempted') return 'attempted'
  return 'not_started'
}

function bossCounts(
  pathway: PathwayConfig,
  chapters: readonly PathwayChapterProgress[],
): { cleared: number; total: number } {
  let cleared = 0
  let total = 0
  for (let i = 0; i < pathway.chapters.length; i += 1) {
    const ch = pathway.chapters[i]
    if (!ch || !ch.bossChallenge) continue
    total += 1
    const cs = chapters[i]?.challengeState
    if (cs?.kind === 'boss' && cs.state === 'cleared') cleared += 1
  }
  return { cleared, total }
}

function lastActivityAt(
  challengeAttempts: readonly PathwayChallengeAttemptSummary[],
): string | null {
  let latest: string | null = null
  let latestMs = -Infinity
  for (const a of challengeAttempts) {
    const ms = new Date(a.attemptedAt).getTime()
    if (!Number.isFinite(ms)) continue
    if (ms > latestMs) {
      latestMs = ms
      latest = a.attemptedAt
    }
  }
  return latest
}

const REASON_COPY: Record<PathwayRecommendedNext['reason'], string> = {
  'cold-start': 'Start your first rep — the first read is right here.',
  resume: 'Pick up where you left off.',
  sequence: 'A new chapter is ready for you.',
  weakness: 'Shore up the read you’ve been missing.',
  capstone: 'Final test: prove you can read the cue without the pill.',
}

function buildNextAction(summary: PathwayProgressSummary): NextActionInsight {
  const rec = summary.recommendedNext
  if (!rec) return { recommendation: null, reasonCopy: null }
  return { recommendation: rec, reasonCopy: REASON_COPY[rec.reason] }
}

/**
 * Pure derivation. Takes the same `PathwayProgressSummary` the detail
 * page already loads and produces a player-facing insights view.
 *
 * Defensive: when `summary` is null (e.g. pathway not found, or
 * coming-soon with no chapters), we return a zeroed insights object
 * tagged with the requested slug so the page can render a coherent
 * empty state without crashing.
 */
export function derivePlayerInsights(
  pathway: PathwayConfig,
  summary: PathwayProgressSummary | null,
): PlayerInsights {
  if (!summary) {
    return {
      pathwaySlug: pathway.slug,
      ...EMPTY_INSIGHTS_DEFAULTS,
      next: { recommendation: null, reasonCopy: null },
    }
  }

  const chapters = summary.chapters
  const decoders = decoderInsightsFromChapters(pathway, chapters)
  const weakness = pickWeakness(decoders)
  const chaptersMastered = chapters.filter((c) => c.state === 'mastered').length
  const { cleared: bossesCleared, total: bossesTotal } = bossCounts(pathway, chapters)
  const finalMixStatus = deriveFinalMixStatus(pathway, chapters)
  const recent = buildRecentRows(pathway, summary.challengeAttempts)
  const lastActivity = lastActivityAt(summary.challengeAttempts)
  const next = buildNextAction(summary)

  return {
    pathwaySlug: pathway.slug,
    pathwayProgress: summary.pathwayProgress,
    pathwayMastered: summary.pathwayMastered,
    chaptersMastered,
    chaptersTotal: chapters.length,
    bossesCleared,
    bossesTotal,
    finalMixStatus,
    lastActivityAt: lastActivity,
    decoders,
    weakness,
    recent,
    next,
  }
}
