/**
 * Pathways v1 — typed configuration shapes (PTH-1).
 *
 * The Pathways product is a config + UI layer over the existing
 * Scenario / Mastery / Attempt rows. Pathways never own scenarios or
 * persist their own per-user state in v1 — every number on a Pathway
 * page is derived from existing data via `progressService`.
 *
 * The shapes here intentionally mirror §12 of
 * `docs/courtiq-pathways-product-plan.md`. Keep this file dependency-
 * free (no Prisma client imports) so it can be consumed from both
 * server and client components without dragging the Prisma runtime
 * into client bundles.
 */

/**
 * Local decoder-tag union that mirrors the four LIVE values on the
 * Prisma `DecoderTag` enum. Defined here (instead of imported from
 * `@prisma/client`) so that this module — and the Pathway config /
 * helpers that import it — can be consumed by client components
 * without pulling Prisma's runtime in.
 *
 * Must stay aligned with `enum DecoderTag` in
 * `packages/db/prisma/schema.prisma`.
 */
export type DecoderTag =
  | 'BACKDOOR_WINDOW'
  | 'EMPTY_SPACE_CUT'
  | 'ADVANTAGE_OR_RESET'
  | 'SKIP_THE_ROTATION'

export const ALL_DECODER_TAGS: readonly DecoderTag[] = [
  'BACKDOOR_WINDOW',
  'EMPTY_SPACE_CUT',
  'ADVANTAGE_OR_RESET',
  'SKIP_THE_ROTATION',
] as const

export type PathwayTrainingMode =
  | 'learn-the-cue'
  | 'freeze-frame-read'
  | 'no-hint'
  | 'mixed-reads'
  | 'boss-challenge'
  | 'film-room'
  | 'pressure-test'

export type PathwayArchetype =
  | 'ball-watcher'
  | 'cutter'
  | 'connector'
  | 'attacker'
  | 'floor-general'
  | 'off-ball-weapon'
  | 'help-defender-punisher'

export interface UnlockCriteria {
  /** Other pathway slugs that must be mastered first (PTH-3+ usage). */
  pathwaysMastered?: string[]
  /** Minimum IQ score before this pathway is recommended. */
  minIq?: number
  /** Special-case: open from day one (Foundation). */
  alwaysAvailable?: boolean
}

export interface PassCriteria {
  /** Minimum number of `best` answers across the node's scenario set. */
  minBest?: number
  /** Minimum decoder rolling accuracy required to consider node mastered. */
  minDecoderAccuracy?: number
  /** Minimum decoder attempts required (avoid mastering on a single rep). */
  minDecoderAttempts?: number
  /** Boss-only: percentage of best answers required across the run. */
  bossBestRatio?: number
  /** Boss-only: minimum answered scenarios for the result to count. */
  bossMinAttempts?: number
}

export type SkillNodeKind = 'learn-cue' | 'scenario-set' | 'boss' | 'film-room' | 'mixed'

export interface SkillNodeConfig {
  slug: string
  order: number
  title: string
  subtitle?: string
  kind: SkillNodeKind
  trainingMode: PathwayTrainingMode
  /** Existing Scenario IDs (e.g. 'BDW-01'). Pathways never own scenarios. */
  scenarioIds: string[]
  /** Optional: Academy lesson slug to link from this node. */
  academyLessonSlug?: string
  /** Slugs of nodes within the same chapter that must be completed first. */
  prerequisiteNodeSlugs?: string[]
  passCriteria?: PassCriteria
}

export interface BossChallengeConfig {
  slug: string
  title: string
  subtitle?: string
  /** Scenario pool (mixed/random within the chapter or pathway). */
  scenarioIds: string[]
  passCriteria: PassCriteria
  /** Hide decoder pill, suppress hints, single attempt. */
  hideDecoderPill: true
}

export interface PathwayChapterConfig {
  slug: string
  order: number
  title: string
  subtitle: string
  /** The single basketball cue this chapter teaches. */
  basketballCue: string
  /** Primary decoder; null for the mixed-read capstone chapter. */
  decoderTag: DecoderTag | null
  /** All decoders touched by the chapter (Real Game Mix uses all four). */
  decoderTags?: DecoderTag[]
  skillNodes: SkillNodeConfig[]
  bossChallenge?: BossChallengeConfig
  passCriteria: PassCriteria
  masteryCriteria: PassCriteria
  /** Two voices, surfaced on the Mastery Report. */
  parentSummary: string
  coachSummary: string
  /** Internal goal copy (player-voice). */
  goal: string
}

export type PathwayAccentToken = 'brand' | 'iq' | 'xp' | 'info' | 'heat'

export interface PathwayConfig {
  slug: string
  title: string
  subtitle: string
  description: string
  /** Color-bound to the Pathway hero strip; null = use brand. */
  accentToken?: PathwayAccentToken
  decoderTags: DecoderTag[]
  chapters: PathwayChapterConfig[]
  unlockCriteria: UnlockCriteria
  passCriteria: PassCriteria
  estimatedMinutes: number
  recommendedFor: PathwayArchetype[]
  targetArchetype: PathwayArchetype
  comingSoon: boolean
  parentSummary: string
  coachSummary: string
  /** One-line basketball problem this Pathway solves; surfaced on cards. */
  basketballProblem: string
  /** Min/max scenario difficulty this Pathway draws from (for marketing). */
  difficultyRange: [number, number]
}

export type PathwayChapterState =
  | 'locked'
  | 'unlocked'
  | 'in_progress'
  | 'completed'
  | 'mastered'

export type SkillNodeState = PathwayChapterState

export interface PathwaySkillNodeProgress {
  slug: string
  state: SkillNodeState
  /** 0..1 — share of scenarios in the set with at least one attempt. */
  progress: number
  attemptedCount: number
  bestCount: number
  totalScenarios: number
}

/**
 * PTH-5: per-chapter snapshot of the server-persisted boss / mixed
 * challenge state. Surfaces the result the UI needs to render boss
 * "Cleared / Run it back / Boss Challenge" copy AND the summary
 * scoring without re-walking `challengeAttempts`.
 *
 *  - `kind: 'boss'`     — normal decoder chapter; tracks the boss.
 *  - `kind: 'capstone'` — Real Game Mix; tracks the mixed-reads run.
 *  - `kind: 'none'`     — chapter has no challenge configured.
 *
 * `state` is a small enum the UI can branch on directly:
 *  - 'not_started' — no server attempt recorded yet.
 *  - 'attempted'   — at least one server attempt, latest best is fail.
 *  - 'cleared'     — best server attempt has `passed === true`.
 */
export type ChapterChallengeKind = 'boss' | 'capstone' | 'none'
export type ChapterChallengeState = 'not_started' | 'attempted' | 'cleared'

export interface PathwayChapterChallengeState {
  kind: ChapterChallengeKind
  state: ChapterChallengeState
  /** Best server bestCount on this challenge (fail or pass). 0 when
   *  no attempts. */
  bestCount: number
  /** Total reps the challenge was scored against. 0 when no attempts. */
  total: number
  /** True when the best attempt is a server-passed clear. */
  passed: boolean
  /** ISO timestamp of the best attempt; null when no attempts. */
  attemptedAt: string | null
  /** challengeSlug of the matched attempt — useful for UI deep links
   *  back into the same challenge. Null when no attempts. */
  challengeSlug: string | null
}

export interface PathwayChapterProgress {
  slug: string
  state: PathwayChapterState
  /** 0..1 — average node progress across non-boss skill nodes. */
  progress: number
  bestCount: number
  attemptedCount: number
  totalScenarios: number
  decoderAccuracy: number | null
  decoderAttempts: number
  skillNodes: PathwaySkillNodeProgress[]
  /** PTH-5: server-persisted challenge state for this chapter (boss
   *  for normal chapters, mixed-reads for the capstone). Always
   *  present so the UI can branch on `state` without an undefined
   *  guard; `kind: 'none'` for chapters that don't configure either. */
  challengeState: PathwayChapterChallengeState
}

export interface PathwayRecommendedNext {
  chapterSlug: string
  skillNodeSlug: string
  /** Built /train URL (with scenarioIds + mode params). */
  trainHref: string
  /** Player-voice CTA label, e.g. "Continue Beat the Closeout". */
  label: string
  /** Why this was picked — surfaces on the recommended-next card. */
  reason: 'cold-start' | 'resume' | 'sequence' | 'weakness' | 'capstone'
}

/**
 * PTH-4: server-persisted boss / mixed-reads challenge result, surfaced
 * on the progress summary so the UI can render "Cleared" tags from
 * authoritative state (with localStorage as a fallback).
 *
 * `mode` mirrors `ServerChallengeMode` in `challengeAttemptService.ts`;
 * we keep the union local to avoid pulling that module into the type
 * surface that client components import.
 */
export interface PathwayChallengeAttemptSummary {
  chapterSlug: string
  mode: 'boss-challenge' | 'mixed-reads'
  challengeSlug: string
  passed: boolean
  bestCount: number
  total: number
  attemptedAt: string
}

export interface PathwayProgressSummary {
  slug: string
  /** 0..1 — average chapter progress. */
  pathwayProgress: number
  pathwayMastered: boolean
  chapters: PathwayChapterProgress[]
  recommendedNext: PathwayRecommendedNext | null
  weakestDecoder: DecoderTag | null
  /** PTH-4: best server-persisted boss / mixed-reads attempt per
   *  challenge for this user. Empty when the user has no recorded
   *  challenge attempts yet. */
  challengeAttempts: PathwayChallengeAttemptSummary[]
}
