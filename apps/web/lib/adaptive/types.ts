/**
 * Phase 4 — Adaptive Training Intelligence types.
 *
 * Pure types. No I/O, no DB. Consumers (scenarioService, /train summary,
 * pathway progress) hydrate the inputs from existing Prisma rows and
 * read back interpretable outputs.
 *
 * Design rule: every adaptive output must be expressible as a single
 * sentence a coach would agree with. If it can't, it doesn't ship.
 */

/**
 * Local decoder-tag union mirroring the four LIVE values on the Prisma
 * `DecoderTag` enum. Duplicated here (rather than imported from
 * `@prisma/client`) so this types module stays runtime-free and can be
 * consumed by client components. Must stay aligned with `enum DecoderTag`
 * in `packages/db/prisma/schema.prisma`.
 */
export type DecoderTag =
  | 'BACKDOOR_WINDOW'
  | 'EMPTY_SPACE_CUT'
  | 'ADVANTAGE_OR_RESET'
  | 'SKIP_THE_ROTATION'

export type ChoiceQuality = 'best' | 'acceptable' | 'wrong'

export interface AdaptiveAttempt {
  /** Decoder this attempt landed on. Maps to Scenario.decoder_tag. */
  decoderTag: string
  /** Template id pulled from sub_concepts (`tpl:<id>`). May be null for
   *  founder-v0 scenarios that pre-date the template system. */
  templateId: string | null
  /** Variation signature pulled from sub_concepts (`sig:<...>`). May be
   *  null for the same reason. */
  signature: string | null
  /** Disguise level lifted from the signature; 'none' if absent. */
  disguise: 'none' | 'light' | 'moderate' | 'heavy'
  /** Scenario difficulty 1..5 at the time of the attempt. */
  difficulty: number
  isCorrect: boolean
  choiceQuality: ChoiceQuality
  /** Latency in ms from scenario presentation to choice submission. */
  timeMs: number
  /** Server-side scenario presentation timestamp. Used for decay
   *  weighting; not stored separately, derived from Attempt.created_at. */
  createdAt: Date
}

/**
 * Per-attempt classification. Five categories, no in-betweens.
 * `inadmissible` flags an attempt that should NOT contribute to band
 * promotion (e.g. a lucky guess on a brand-new decoder).
 */
export type AttemptClass =
  | 'recognized' // correct + fast (within difficulty-scaled threshold)
  | 'resolved' // correct + slow (figured it out, didn't see it)
  | 'missed_acceptable' // chose acceptable (kept play alive)
  | 'missed_wrong' // chose wrong + fast (impulsive)
  | 'stuck' // chose wrong + slow (genuinely confused)
  | 'guessing' // correct, instantaneous, first encounter — inadmissible

export interface ClassifiedAttempt {
  class: AttemptClass
  /** True when this attempt should NOT count toward decoder band
   *  promotion. Today only `guessing` is inadmissible; the field is
   *  surfaced separately so future signals (replay-abuse, mystery-mode
   *  vs. tutored) can flag without changing the class taxonomy. */
  inadmissibleForPromotion: boolean
}

export type DecoderBand = 'untested' | 'recognizing' | 'reflexive' | 'mastered'

export type NextProbe =
  | 'first-rep' // no attempts yet — surface the cleanest intro
  | 'disguise-up' // 3-in-a-row at current disguise; raise the floor
  | 'transfer-probe' // recognized one template only — try another
  | 'lesson-refresh' // 2 wrongs in a row — re-read the lesson
  | 'mystery-mode' // replay abuse — force first-watch read
  | 'boss-ready' // ready for the boss rep
  | 'maintain' // mastered + recent — leave alone

export interface DecoderConfidence {
  decoderTag: string
  band: DecoderBand
  evidence: {
    attempts: number
    accuracyLastN: number
    p50LatencyMs: number | null
    transferTemplates: number
    hardestDisguiseRecognized: 'none' | 'light' | 'moderate' | 'heavy' | null
    /** Inadmissible attempts excluded from `attempts` for band logic. */
    inadmissibleCount: number
  }
  nextProbe: NextProbe
}

/**
 * Latency thresholds used to separate "recognized" (saw it) from
 * "resolved" (figured it out). Tuned at the difficulty band the
 * scenario was presented at — a slow correct answer on D5 still
 * counts as recognition.
 */
export const RECOGNITION_LATENCY_MS_BY_DIFFICULTY: Record<number, number> = {
  1: 4500,
  2: 5500,
  3: 6500,
  4: 7500,
  5: 8500,
}

export const HESITATION_FACTOR = 1.4
export const GUESS_FACTOR = 0.4

/** Window over which adaptive heuristics inspect the player's history.
 *  10 attempts is enough signal without making the routing feel sticky. */
export const RECOGNITION_WINDOW = 10

/** Minimum attempts before a decoder can be flagged "weakest" — kills
 *  the punitive 1-attempt 0%-accuracy spiral the founder bundle has. */
export const CONFIDENCE_FLOOR_ATTEMPTS = 6
