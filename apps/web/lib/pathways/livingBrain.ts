/**
 * Phase 6 (seed)
 * The Living Basketball Brain — observation engine.
 *
 * Pure-data, deterministic, restraint-first module that turns
 * aggregate decoder telemetry into a sparse list of coach-shaped
 * observations. The brain THINKS on every snapshot; it SPEAKS rarely.
 *
 * Architecture lock — read once, never violate:
 *   - Pure data + types. No DOM. No clocks. No analytics calls. No
 *     network. No Math.random. Same inputs → same outputs.
 *   - User-facing observation cap: 1 per session, 3 per week.
 *     Cooldowns are enforced via the `history` input — the caller
 *     persists it and feeds it back; this module never reads
 *     storage.
 *   - Observation copy is a small fixed vocabulary. Numbers,
 *     percentages, and time durations NEVER appear in user-facing
 *     strings.
 *   - Identity (archetype) is never asked, never assigned at signup.
 *     It is recognized after sustained evidence and held for ≥ 90d.
 *   - The default branch is silence. Most snapshots produce zero
 *     user-facing observations.
 *   - No "AI" framing, no "I" voice, no emojis in copy.
 *
 * Not in scope of this module:
 *   - Persistence (caller owns it).
 *   - Adaptive routing (consumes archetype as a hint elsewhere).
 *   - Rendering (caller maps Observation → UI surface).
 *   - Latency / anticipation instrumentation (caller measures it).
 */

import type { DecoderTag, PathwayArchetype } from './types'

// --- input shape -----------------------------------------------------------

export interface DecoderSignal {
  decoder: DecoderTag
  /** Rolling best-rate over the recent window, 0..1, or null if
   *  attempts < threshold. */
  accuracy: number | null
  /** Rep count over the recent window. */
  attempts: number
  /** Anticipation rate — fraction of reps where the user picked in
   *  the pre-freeze early-answer window. 0..1; null when the
   *  early-answer feature was disabled for this decoder window. */
  anticipationRate: number | null
  /** Median pick latency after freezeAtMs in ms. Negative values
   *  indicate the median pick was BEFORE freeze (recognition
   *  ahead). null when too few reps. */
  medianHesitationMs: number | null
  /** Number of unique scenario IDs the user has read on this
   *  decoder. Variety is the transfer signal. */
  uniqueScenarioCount: number
  /** Trailing-window slope of accuracy over the last 14d (Δ best
   *  rate per day). Positive = climbing. Null when too sparse. */
  growthSlopePerDay: number | null
  /** Days since the last rep on this decoder. */
  daysSinceLastRep: number
}

export interface BrainSignalSnapshot {
  /** ISO date the snapshot was computed (caller's responsibility). */
  asOf: string
  /** Total session count to date. Drives onboarding silence
   *  (< MIN_SESSIONS_FOR_USER_FACING). */
  totalSessions: number
  /** Per-decoder rolling signals. Missing decoders treated as
   *  untested. */
  decoders: ReadonlyArray<DecoderSignal>
  /** Identity earned to date. `undefined` while none earned. Once
   *  earned, persists for ≥ ARCHETYPE_PERSISTENCE_DAYS. */
  earnedArchetype?: PathwayArchetype
  /** ISO date the earned archetype was awarded. */
  earnedArchetypeAt?: string
}

/** Tracks when each observation kind was last surfaced to the user.
 *  Used to enforce cooldowns. The caller persists this and feeds it
 *  back on the next derive call. */
export interface ObservationHistory {
  /** ISO date of last user-facing observation by `(kind, decoder?)`
   *  composite key. The composite key is `${kind}:${decoder ?? 'any'}`. */
  lastSurfacedByKey: Readonly<Record<string, string>>
  /** Count of user-facing observations surfaced this rolling 7d
   *  window. Caller increments + GC. */
  surfacedThisWeek: number
}

export const EMPTY_HISTORY: ObservationHistory = Object.freeze({
  lastSurfacedByKey: Object.freeze({}),
  surfacedThisWeek: 0,
})

// --- output shape ----------------------------------------------------------

export type ObservationKind =
  | 'growth'
  | 'tendency'
  | 'hesitation'
  | 'anticipation_streak'
  | 'archetype_emerging'
  | 'dormant_decoder'

export type ObservationSurface =
  /** Home card; user-facing. */
  | 'home_card'
  /** Post-session screen; user-facing. */
  | 'post_session'
  /** Post-rep flash on a streak; user-facing. */
  | 'post_rep'
  /** Profile page only; user navigates to see it. */
  | 'profile_only'
  /** Routing hint, never rendered. */
  | 'silent'

export interface Observation {
  kind: ObservationKind
  /** Decoder the observation is about. Undefined for cross-decoder
   *  observations (archetype, floor-general). */
  decoder?: DecoderTag
  /** Plain-English coach copy. Numbers / percentages NEVER appear. */
  copy: string
  surface: ObservationSurface
}

// --- thresholds + cooldowns ------------------------------------------------

/** Below this session count, the brain stays silent (onboarding). */
export const MIN_SESSIONS_FOR_USER_FACING = 6

/** Per-week user-facing observation cap. Above this, surface=silent. */
export const MAX_USER_FACING_PER_WEEK = 3

/** Cooldown days per observation kind. Composite key = kind+decoder. */
export const COOLDOWN_DAYS: Record<ObservationKind, number> = {
  growth: 14,
  tendency: 21,
  hesitation: 21,
  anticipation_streak: 7,
  archetype_emerging: 30,
  dormant_decoder: 14,
}

/** Once an archetype has been earned, hold it for ≥ this many days
 *  before re-evaluation. Stickiness is part of the trust model. */
export const ARCHETYPE_PERSISTENCE_DAYS = 90

// --- archetype recognition -------------------------------------------------

/** Minimum aggregate evidence before any archetype can be awarded. */
const ARCHETYPE_MIN_TOTAL_REPS = 30
const ARCHETYPE_MIN_UNIQUE_SCENARIOS_PER_DECODER = 3
const ARCHETYPE_STRONG_ACCURACY = 0.7
const ARCHETYPE_STRONG_ANTICIPATION = 0.4

/**
 * Returns the archetype the snapshot is currently expressing, or
 * undefined if evidence is insufficient. Pure: same snapshot → same
 * archetype.
 *
 * Pattern matching is decoder-pair-driven and conservative — multiple
 * decoders must qualify before an archetype is named.
 */
export function recognizeArchetype(
  snapshot: BrainSignalSnapshot,
): PathwayArchetype | undefined {
  const totalReps = snapshot.decoders.reduce((s, d) => s + d.attempts, 0)
  if (totalReps < ARCHETYPE_MIN_TOTAL_REPS) return undefined

  const byDecoder = new Map<DecoderTag, DecoderSignal>()
  for (const d of snapshot.decoders) byDecoder.set(d.decoder, d)

  const isStrong = (tag: DecoderTag): boolean => {
    const d = byDecoder.get(tag)
    if (!d) return false
    if (d.accuracy === null || d.accuracy < ARCHETYPE_STRONG_ACCURACY) return false
    if (d.uniqueScenarioCount < ARCHETYPE_MIN_UNIQUE_SCENARIOS_PER_DECODER) return false
    return true
  }
  const isAnticipating = (tag: DecoderTag): boolean => {
    const d = byDecoder.get(tag)
    return !!d && d.anticipationRate !== null && d.anticipationRate >= ARCHETYPE_STRONG_ANTICIPATION
  }

  const strongCount =
    (isStrong('BACKDOOR_WINDOW') ? 1 : 0) +
    (isStrong('EMPTY_SPACE_CUT') ? 1 : 0) +
    (isStrong('SKIP_THE_ROTATION') ? 1 : 0) +
    (isStrong('ADVANTAGE_OR_RESET') ? 1 : 0)

  // Floor General — strong on all four. Highest bar; check first.
  if (strongCount === 4) return 'floor-general'

  // Cutter — BDW + ESC, both with anticipation.
  if (
    isStrong('BACKDOOR_WINDOW') &&
    isStrong('EMPTY_SPACE_CUT') &&
    isAnticipating('BACKDOOR_WINDOW') &&
    isAnticipating('EMPTY_SPACE_CUT')
  ) {
    return 'cutter'
  }

  // Connector — SKR + AOR.
  if (isStrong('SKIP_THE_ROTATION') && isStrong('ADVANTAGE_OR_RESET')) {
    return 'connector'
  }

  // Help-Defender Punisher — ESC + SKR with anticipation.
  if (
    isStrong('EMPTY_SPACE_CUT') &&
    isStrong('SKIP_THE_ROTATION') &&
    (isAnticipating('EMPTY_SPACE_CUT') || isAnticipating('SKIP_THE_ROTATION'))
  ) {
    return 'help-defender-punisher'
  }

  // Off-Ball Weapon — BDW + AOR with AOR anticipation specifically.
  if (
    isStrong('BACKDOOR_WINDOW') &&
    isStrong('ADVANTAGE_OR_RESET') &&
    isAnticipating('ADVANTAGE_OR_RESET')
  ) {
    return 'off-ball-weapon'
  }

  // Attacker — AOR + ESC with low hesitation on AOR.
  if (
    isStrong('ADVANTAGE_OR_RESET') &&
    isStrong('EMPTY_SPACE_CUT') &&
    (byDecoder.get('ADVANTAGE_OR_RESET')?.medianHesitationMs ?? Infinity) < 600
  ) {
    return 'attacker'
  }

  return undefined
}

// --- copy vocabulary -------------------------------------------------------

const DECODER_LABEL_BY_TAG: Record<DecoderTag, string> = {
  BACKDOOR_WINDOW: 'BDW',
  EMPTY_SPACE_CUT: 'ESC',
  SKIP_THE_ROTATION: 'SKR',
  ADVANTAGE_OR_RESET: 'AOR',
}

const GROWTH_COPY: Record<DecoderTag, string> = {
  BACKDOOR_WINDOW: 'Reading BDW earlier than two weeks ago.',
  EMPTY_SPACE_CUT: 'Catching ESC reads quicker than before.',
  SKIP_THE_ROTATION: 'Skip reads are sharpening up.',
  ADVANTAGE_OR_RESET: 'Closeout reads are climbing.',
}

const TENDENCY_COPY: Record<DecoderTag, string> = {
  BACKDOOR_WINDOW: 'You catch denial defenders early.',
  EMPTY_SPACE_CUT: 'You see help defenders move before most.',
  SKIP_THE_ROTATION: 'You read over-rotations cleanly.',
  ADVANTAGE_OR_RESET: 'You read closeout balance well.',
}

const HESITATION_COPY: Record<DecoderTag, string> = {
  BACKDOOR_WINDOW: 'BDW is taking you a beat longer right now.',
  EMPTY_SPACE_CUT: 'ESC is settling slower lately.',
  SKIP_THE_ROTATION: 'Skip reads are taking longer to land.',
  ADVANTAGE_OR_RESET: 'AOR is taking you a beat longer right now.',
}

const DORMANT_COPY: Record<DecoderTag, string> = {
  BACKDOOR_WINDOW: 'BDW hasn’t come up in a while.',
  EMPTY_SPACE_CUT: 'ESC reads have been quiet lately.',
  SKIP_THE_ROTATION: 'Skip reads have been on the shelf.',
  ADVANTAGE_OR_RESET: 'AOR hasn’t come up in a while.',
}

const ARCHETYPE_COPY: Record<PathwayArchetype, string> = {
  'cutter': 'You’re playing like a Cutter.',
  'connector': 'You’re playing like a Connector.',
  'attacker': 'You’re playing like an Attacker.',
  'floor-general': 'You’re playing like a Floor General.',
  'off-ball-weapon': 'You’re playing like an Off-Ball Weapon.',
  'help-defender-punisher': 'You’re playing like a Help-Defender Punisher.',
  'ball-watcher': '', // never surfaced
}

const ANTICIPATION_STREAK_COPY = 'Three early reads in a row.'

// --- triggers --------------------------------------------------------------

/** Slope threshold for a `growth` observation. Δaccuracy/day. */
const GROWTH_SLOPE_THRESHOLD = 0.012 // ~1.2% per day, sustained

/** Hesitation threshold (ms) — surfaces hesitation observation when
 *  median pick latency after freeze exceeds this. */
const HESITATION_MS_THRESHOLD = 1100

/** Anticipation rate threshold for a tendency observation. */
const TENDENCY_ANTICIPATION_THRESHOLD = 0.45

/** Days since last rep that triggers dormant_decoder. */
const DORMANT_DAYS_THRESHOLD = 14

// --- public API ------------------------------------------------------------

/** Composite cooldown key — same shape the caller persists in
 *  `history.lastSurfacedByKey`. Exported so tests + the persistence
 *  layer agree on the format. */
export function observationKey(
  kind: ObservationKind,
  decoder?: DecoderTag,
): string {
  return `${kind}:${decoder ?? 'any'}`
}

function daysBetween(asOfIso: string, lastIso: string): number {
  const a = Date.parse(asOfIso)
  const b = Date.parse(lastIso)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Infinity
  return Math.floor((a - b) / (24 * 60 * 60 * 1000))
}

function cooldownActive(
  history: ObservationHistory,
  kind: ObservationKind,
  decoder: DecoderTag | undefined,
  asOf: string,
): boolean {
  const key = observationKey(kind, decoder)
  const last = history.lastSurfacedByKey[key]
  if (!last) return false
  return daysBetween(asOf, last) < COOLDOWN_DAYS[kind]
}

/**
 * Internal-only candidate generator. Produces every candidate
 * observation the snapshot would qualify for, regardless of cooldowns
 * or per-week caps. Tests assert on this; the public API filters it.
 */
export function _internalCandidates(snapshot: BrainSignalSnapshot): Observation[] {
  const out: Observation[] = []
  for (const d of snapshot.decoders) {
    // dormant_decoder
    if (d.daysSinceLastRep >= DORMANT_DAYS_THRESHOLD) {
      out.push({
        kind: 'dormant_decoder',
        decoder: d.decoder,
        copy: DORMANT_COPY[d.decoder],
        surface: 'home_card',
      })
    }
    // growth
    if (d.growthSlopePerDay !== null && d.growthSlopePerDay >= GROWTH_SLOPE_THRESHOLD) {
      out.push({
        kind: 'growth',
        decoder: d.decoder,
        copy: GROWTH_COPY[d.decoder],
        surface: 'home_card',
      })
    }
    // tendency
    if (
      d.anticipationRate !== null &&
      d.anticipationRate >= TENDENCY_ANTICIPATION_THRESHOLD &&
      d.attempts >= 10
    ) {
      out.push({
        kind: 'tendency',
        decoder: d.decoder,
        copy: TENDENCY_COPY[d.decoder],
        surface: 'home_card',
      })
    }
    // hesitation — post-session only, never home
    if (
      d.medianHesitationMs !== null &&
      d.medianHesitationMs >= HESITATION_MS_THRESHOLD &&
      d.attempts >= 5
    ) {
      out.push({
        kind: 'hesitation',
        decoder: d.decoder,
        copy: HESITATION_COPY[d.decoder],
        surface: 'post_session',
      })
    }
  }

  // archetype_emerging — at most one
  const recognized = recognizeArchetype(snapshot)
  const alreadyEarned = !!snapshot.earnedArchetype
  if (recognized && !alreadyEarned) {
    const copy = ARCHETYPE_COPY[recognized]
    if (copy) {
      out.push({
        kind: 'archetype_emerging',
        copy,
        surface: 'home_card',
      })
    }
  }

  return out
}

/**
 * Returns the user-facing observations the brain is allowed to
 * surface this snapshot, plus the silent (internal-only) candidates.
 *
 * Per-session user-facing cap: 1.
 * Per-week user-facing cap: MAX_USER_FACING_PER_WEEK.
 *
 * Order of precedence when multiple candidates qualify and only one
 * may surface:
 *   1. archetype_emerging (rarest, sticky reward)
 *   2. growth
 *   3. tendency
 *   4. dormant_decoder
 *   5. hesitation                  (always post_session, never blocks
 *                                   the home_card slot)
 *   6. anticipation_streak         (caller flags, see below)
 *
 * Anticipation streaks are emitted by the caller's per-rep counter,
 * not from the snapshot — the snapshot is too coarse. Callers
 * compose them via `recordAnticipationStreak` below.
 */
export function deriveBrainObservations(
  snapshot: BrainSignalSnapshot,
  history: ObservationHistory,
): { userFacing: Observation[]; internal: Observation[] } {
  const all = _internalCandidates(snapshot)

  // Onboarding silence + per-week cap.
  if (snapshot.totalSessions < MIN_SESSIONS_FOR_USER_FACING) {
    return { userFacing: [], internal: all }
  }
  if (history.surfacedThisWeek >= MAX_USER_FACING_PER_WEEK) {
    return { userFacing: [], internal: all }
  }

  const PRECEDENCE: ObservationKind[] = [
    'archetype_emerging',
    'growth',
    'tendency',
    'dormant_decoder',
    'hesitation',
  ]

  // hesitation surfaces independently (post_session, doesn't fight
  // for the home_card slot). Pull it out first.
  const hesitation = all.find(
    (o) => o.kind === 'hesitation' && !cooldownActive(history, o.kind, o.decoder, snapshot.asOf),
  )
  const homeCandidate = PRECEDENCE
    .filter((k) => k !== 'hesitation')
    .map((k) => all.find((o) => o.kind === k && !cooldownActive(history, o.kind, o.decoder, snapshot.asOf)))
    .find(Boolean)

  // One user-facing observation per session, max. The home_card
  // slot wins precedence; hesitation only surfaces when no home
  // candidate fired. Pushing both would also let the weekly budget
  // be bypassed (surfacedThisWeek === MAX still emits two).
  const userFacing: Observation[] = []
  if (homeCandidate) {
    userFacing.push(homeCandidate)
  } else if (hesitation) {
    userFacing.push(hesitation)
  }

  // Internal includes everything the brain noticed, including
  // candidates the caps suppressed. Routing reads this.
  return { userFacing, internal: all }
}

/**
 * Per-rep helper for anticipation streaks. The session controller
 * tracks consecutive `anticipated` outcomes; when it hits 3 (or any
 * multiple of 3 if cooldown allows), this fn returns the
 * post-rep observation. Otherwise null.
 */
export function recordAnticipationStreak(args: {
  consecutiveAnticipated: number
  asOf: string
  history: ObservationHistory
}): Observation | null {
  if (args.consecutiveAnticipated < 3 || args.consecutiveAnticipated % 3 !== 0) {
    return null
  }
  const key = observationKey('anticipation_streak')
  const last = args.history.lastSurfacedByKey[key]
  if (last && daysBetween(args.asOf, last) < COOLDOWN_DAYS.anticipation_streak) {
    return null
  }
  return {
    kind: 'anticipation_streak',
    copy: ANTICIPATION_STREAK_COPY,
    surface: 'post_rep',
  }
}

/** Test/debug — exposes the decoder-label table for assertions. */
export function _decoderLabel(tag: DecoderTag): string {
  return DECODER_LABEL_BY_TAG[tag]
}
