/**
 * Phase 9 — Session Composition.
 *
 * A CourtIQ session is not a feed. It has a beginning, a middle, and an
 * end. This module derives the *shape* of a single ~12-minute session:
 *   - the opening beat the user sees in the first ~5 seconds,
 *   - the middle rhythm (rep count, decoder rotation, pacing cushions),
 *   - the closing beat (final rep + a single quiet summary line),
 *   - the session length, which adapts to time-of-day, mastery, and
 *     observed fatigue from prior reps.
 *
 * Pure data, deterministic, dependency-free. No THREE, no React, no
 * notifications, no streak shaming, no "one more rep?" prompts. Reuses
 * `PathwayTrainingMode` and `MasteryTier` from existing config; never
 * replaces the scenario rotation already done by `trainingContext`.
 *
 * The output is a *plan*, not a controller. The /train page reads the
 * plan to render the cold-open card, the rep cadence, and the closing
 * line. If the plan is missing or malformed, /train falls back to its
 * existing behavior unchanged.
 */

import type { DecoderTag, PathwayTrainingMode } from './types'

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** Coarse mastery tier mirrored from the existing IQ banding. The plan
 *  only branches on three tiers — finer granularity belongs in the
 *  rotation, not in the session shape. */
export type MasteryTier = 'onboarding' | 'mid-mastery' | 'post-mastery'

/** Rough time-of-day band. Derived from the local hour at session
 *  start; the plan uses it to nudge length and tone, not to gate
 *  anything. */
export type TimeOfDayBand = 'morning' | 'midday' | 'evening' | 'late-night'

/** Observed fatigue from prior reps in the same calendar day. Computed
 *  upstream by summing rep latencies + answer flips; surfaced here as
 *  three coarse buckets so the plan can shorten without nagging. */
export type FatigueBand = 'fresh' | 'warm' | 'tired'

export interface SessionComposeInput {
  /** Local hour at session start, 0..23. Used only for time-of-day
   *  banding; never persisted. */
  localHour: number
  tier: MasteryTier
  fatigue: FatigueBand
  /** Training mode the rotation will run. Boss / mixed-reads sessions
   *  override the normal cadence — they get a quieter open and a
   *  results-shaped close. */
  trainingMode: PathwayTrainingMode | null
  /** Decoders the rotation will touch, in the order they will appear.
   *  The plan re-orders the *visible* sequence to keep the user from
   *  hitting the same decoder back-to-back, but never drops one. */
  decoderQueue: readonly DecoderTag[]
  /** Whether this is the user's first session ever. Cold-start sessions
   *  open differently — quieter, no decoder name, no progress chip. */
  isFirstSession: boolean
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

export interface OpeningBeat {
  /** One short line, ≤ ~48 chars, the user sees first. Plain English,
   *  basketball voice, never gamified. */
  headline: string
  /** Optional second line; null in onboarding so the cold open stays
   *  uncluttered. */
  sub: string | null
  /** How many seconds the opening card holds before the first rep
   *  appears. Capped to keep the user from feeling stalled. */
  holdMs: number
  /** True when the open should suppress the decoder pill / progress
   *  chip / IQ count. The cold start sets this so the first thing the
   *  user sees is a play, not a UI. */
  quietChrome: boolean
}

export interface MiddleRhythm {
  /** Total reps in the session. Adapts to tier + fatigue. */
  repCount: number
  /** Visible order of decoder tags, length === repCount. Re-orders the
   *  input queue so the same decoder never appears twice in a row when
   *  the queue contains more than one distinct decoder. */
  decoderOrder: DecoderTag[]
  /** Milliseconds of cushion between reps. Longer in onboarding so the
   *  user has time to breathe; shorter post-mastery so the rhythm
   *  feels like a workout, not a tutorial. */
  interRepCushionMs: number
  /** Index (0-based) of reps after which the brain may *whisper* a
   *  single observation. Empty when whispers are disabled (cold start,
   *  boss/mixed). The brain itself decides whether to actually emit;
   *  this is just the allowed checkpoints. */
  whisperCheckpoints: number[]
}

export interface ClosingBeat {
  /** True when the closing card should land before the summary route.
   *  Cold start + boss/mixed both want the close inline. */
  inline: boolean
  /** One short line that ends the session. Never asks for another rep,
   *  never references streaks. */
  headline: string
  /** Optional second line. Null when the user just finished a graded
   *  challenge — the pass/fail copy belongs to the summary page, not
   *  the closing beat. */
  sub: string | null
  /** Milliseconds the closing card holds before transitioning. Long
   *  enough to land, short enough not to feel stalled. */
  holdMs: number
}

export interface SessionPlan {
  opening: OpeningBeat
  middle: MiddleRhythm
  closing: ClosingBeat
  /** Coarse "shape" label, useful for telemetry + tests so a layout
   *  regression can't silently flip onboarding into post-mastery. */
  shape: SessionShape
}

export type SessionShape =
  | 'cold-start'
  | 'onboarding'
  | 'standard'
  | 'short-and-sharp'
  | 'post-mastery-light'
  | 'graded-challenge'

// ---------------------------------------------------------------------------
// Constants — every threshold lives here so a copy edit can't shift
// behavior. Keep these conservative; restraint > engagement.
// ---------------------------------------------------------------------------

const REP_COUNT_BY_SHAPE: Record<SessionShape, number> = {
  'cold-start': 3,
  onboarding: 5,
  standard: 8,
  'short-and-sharp': 5,
  'post-mastery-light': 6,
  'graded-challenge': 10,
}

const CUSHION_MS_BY_SHAPE: Record<SessionShape, number> = {
  'cold-start': 1400,
  onboarding: 1200,
  standard: 900,
  'short-and-sharp': 700,
  'post-mastery-light': 800,
  'graded-challenge': 600,
}

const OPEN_HOLD_MS_BY_SHAPE: Record<SessionShape, number> = {
  'cold-start': 2400,
  onboarding: 1800,
  standard: 1200,
  'short-and-sharp': 900,
  'post-mastery-light': 1000,
  'graded-challenge': 1400,
}

const CLOSE_HOLD_MS_BY_SHAPE: Record<SessionShape, number> = {
  'cold-start': 2200,
  onboarding: 1800,
  standard: 1600,
  'short-and-sharp': 1400,
  'post-mastery-light': 1500,
  'graded-challenge': 2000,
}

/** Minimum reps before a brain whisper is allowed to land. Earlier
 *  whispers feel like nagging, not coaching. */
const FIRST_WHISPER_AT_REP = 2

/** Maximum whispers per session — the brain itself caps to 1 most
 *  sessions, but the plan refuses to even *offer* more than 2 slots
 *  so a future change can't accidentally turn the session into a
 *  feed of observations. */
const MAX_WHISPER_SLOTS = 2

// ---------------------------------------------------------------------------
// Time-of-day banding
// ---------------------------------------------------------------------------

export function bandTimeOfDay(localHour: number): TimeOfDayBand {
  const h = clampHour(localHour)
  if (h >= 5 && h < 11) return 'morning'
  if (h >= 11 && h < 17) return 'midday'
  if (h >= 17 && h < 22) return 'evening'
  return 'late-night'
}

function clampHour(h: number): number {
  if (!Number.isFinite(h)) return 12
  const i = Math.floor(h)
  if (i < 0) return 0
  if (i > 23) return 23
  return i
}

// ---------------------------------------------------------------------------
// Shape selection
// ---------------------------------------------------------------------------

function pickShape(input: SessionComposeInput): SessionShape {
  if (input.trainingMode === 'boss-challenge' || input.trainingMode === 'mixed-reads') {
    return 'graded-challenge'
  }
  if (input.isFirstSession) return 'cold-start'
  if (input.tier === 'onboarding') return 'onboarding'
  if (input.fatigue === 'tired') return 'short-and-sharp'
  if (input.tier === 'post-mastery') return 'post-mastery-light'
  return 'standard'
}

// ---------------------------------------------------------------------------
// Decoder rotation — never drops a decoder, never reorders a single-tag
// queue. Only goal: avoid back-to-back repeats when the queue has more
// than one distinct tag.
// ---------------------------------------------------------------------------

export function spaceDecoders(queue: readonly DecoderTag[]): DecoderTag[] {
  const out: DecoderTag[] = []
  const remaining = [...queue]
  let lastEmitted: DecoderTag | null = null
  while (remaining.length > 0) {
    const idx = remaining.findIndex((tag) => tag !== lastEmitted)
    const pick = idx >= 0 ? idx : 0
    const [tag] = remaining.splice(pick, 1)
    out.push(tag)
    lastEmitted = tag
  }
  return out
}

// ---------------------------------------------------------------------------
// Whisper checkpoints
// ---------------------------------------------------------------------------

function pickWhisperCheckpoints(shape: SessionShape, repCount: number): number[] {
  if (shape === 'cold-start' || shape === 'graded-challenge') return []
  if (repCount <= FIRST_WHISPER_AT_REP) return []
  // Single whisper near the middle for short sessions; two evenly
  // spaced for longer ones, but never more than MAX_WHISPER_SLOTS.
  if (repCount <= 5) {
    return [Math.max(FIRST_WHISPER_AT_REP, Math.floor(repCount / 2))]
  }
  const slots = Math.min(MAX_WHISPER_SLOTS, 2)
  const step = Math.floor(repCount / (slots + 1))
  const checkpoints: number[] = []
  for (let i = 1; i <= slots; i += 1) {
    const idx = Math.max(FIRST_WHISPER_AT_REP, i * step)
    if (!checkpoints.includes(idx) && idx < repCount) checkpoints.push(idx)
  }
  return checkpoints
}

// ---------------------------------------------------------------------------
// Copy — kept tiny + restrained. The brain owns interesting language;
// the session shape only owns the bookends.
// ---------------------------------------------------------------------------

function pickOpeningCopy(
  shape: SessionShape,
  band: TimeOfDayBand,
): { headline: string; sub: string | null } {
  switch (shape) {
    case 'cold-start':
      return { headline: 'Watch the play.', sub: null }
    case 'onboarding':
      return { headline: 'Read the cue. Pick the play.', sub: 'Take your time.' }
    case 'graded-challenge':
      return { headline: 'No hints this round.', sub: 'Trust the read.' }
    case 'short-and-sharp':
      return { headline: 'Quick set. Sharp reads.', sub: null }
    case 'post-mastery-light':
      return { headline: 'Keep the reads honest.', sub: timeOfDayWhisper(band) }
    case 'standard':
    default:
      return { headline: 'Back to the floor.', sub: timeOfDayWhisper(band) }
  }
}

function timeOfDayWhisper(band: TimeOfDayBand): string | null {
  // Subtle, not gimmicky. Returns null for late-night so the app
  // doesn't moralize about when the user trains.
  switch (band) {
    case 'morning':
      return 'Eyes fresh.'
    case 'midday':
      return null
    case 'evening':
      return 'Settle in.'
    case 'late-night':
      return null
  }
}

function pickClosingCopy(shape: SessionShape): {
  headline: string
  sub: string | null
} {
  switch (shape) {
    case 'cold-start':
      return { headline: 'That was the read.', sub: 'Come back when you want another.' }
    case 'onboarding':
      return { headline: 'Set complete.', sub: 'You are starting to see it.' }
    case 'graded-challenge':
      // The summary page owns the verdict — close stays neutral.
      return { headline: 'Run scored.', sub: null }
    case 'short-and-sharp':
      return { headline: 'Sharp work.', sub: 'Short set. Real reps.' }
    case 'post-mastery-light':
      return { headline: 'Reads stayed honest.', sub: 'That is the maintenance dose.' }
    case 'standard':
    default:
      return { headline: 'Set complete.', sub: 'Reads landed.' }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a deterministic session plan from the inputs. Same input →
 * byte-identical output. Never throws — degenerate inputs (empty
 * decoder queue, NaN hour) collapse to the safest shape.
 */
export function composeSession(input: SessionComposeInput): SessionPlan {
  const shape = pickShape(input)
  const band = bandTimeOfDay(input.localHour)
  const baseRepCount = REP_COUNT_BY_SHAPE[shape]

  // Tired users get one rep less, never more — never extend a session
  // because the user is performing well; that is engagement bait.
  const tiredAdjust = input.fatigue === 'tired' && shape !== 'graded-challenge' ? -1 : 0
  const baselineReps = Math.max(1, baseRepCount + tiredAdjust)

  const spaced = spaceDecoders(input.decoderQueue)
  // Empty decoder queue means the rotation has nothing to render. The
  // planner refuses to invent reps in that case so middle.repCount and
  // middle.decoderOrder.length never diverge — consumers that loop by
  // repCount can index decoderOrder safely.
  const repCount = spaced.length === 0 ? 0 : baselineReps
  const decoderOrder = sliceOrPad(spaced, repCount)

  const opening: OpeningBeat = {
    ...pickOpeningCopy(shape, band),
    holdMs: OPEN_HOLD_MS_BY_SHAPE[shape],
    quietChrome: shape === 'cold-start',
  }

  const closing: ClosingBeat = {
    inline: shape === 'cold-start' || shape === 'graded-challenge',
    ...pickClosingCopy(shape),
    holdMs: CLOSE_HOLD_MS_BY_SHAPE[shape],
  }

  const middle: MiddleRhythm = {
    repCount,
    decoderOrder,
    interRepCushionMs: CUSHION_MS_BY_SHAPE[shape],
    whisperCheckpoints: pickWhisperCheckpoints(shape, repCount),
  }

  return { opening, middle, closing, shape }
}

/** Trim or pad a spaced decoder list so it matches the planned rep
 *  count. Padding cycles through the spaced sequence (modulo) so the
 *  decoder mix the rotation requested is preserved when the queue is
 *  shorter than the session — repeating only the last tag would
 *  collapse a multi-decoder session into a long back-to-back streak. */
function sliceOrPad(spaced: DecoderTag[], repCount: number): DecoderTag[] {
  if (repCount <= 0 || spaced.length === 0) return []
  if (spaced.length === repCount) return [...spaced]
  if (spaced.length > repCount) return spaced.slice(0, repCount)
  const out: DecoderTag[] = []
  for (let i = 0; i < repCount; i += 1) {
    out.push(spaced[i % spaced.length]!)
  }
  return out
}

/** Stable list of every shape the planner can emit. Surfaces so tests
 *  + UI exhaustively map each shape to copy / styling without a
 *  default-case fallback that would silently swallow a new shape. */
export const ALL_SESSION_SHAPES: readonly SessionShape[] = [
  'cold-start',
  'onboarding',
  'standard',
  'short-and-sharp',
  'post-mastery-light',
  'graded-challenge',
] as const
