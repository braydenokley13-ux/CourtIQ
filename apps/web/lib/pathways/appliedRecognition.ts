/**
 * Phase 8 (seed)
 * Applied Recognition Layer — real-game transfer becomes the
 * strongest mastery signal.
 *
 * Pure-data, deterministic module that consumes per-decoder
 * `transferEvents` from the Off-Screen Bridge (Phase 7) and
 * produces:
 *
 *   1. A new Observation kind (`applied_recognition`) with three
 *      tiers (emerging, consistent, dominant). Same shape as
 *      Living Brain observations; same restraint contract.
 *
 *   2. A small per-decoder routing-weight reduction, so adaptive
 *      routing schedules less of decoders the user is already
 *      recognizing in real games. The reduction is small (≤ 15%)
 *      and additive — routing remains the source of truth.
 *
 * Architecture lock — read once, never violate:
 *   - Pure data + types. No DOM. No clocks. No analytics. No
 *     network. No Math.random. Same inputs → same outputs.
 *   - This module never WRITES `transferEvents`. The Off-Screen
 *     Bridge is the sole writer. Phase 8 only reads.
 *   - Routing contribution is a REDUCTION, not an increase. A
 *     decoder being recognized in real games is the signal the
 *     user needs LESS of it.
 *   - Cooldowns are long: 21d (emerging), 60d (consistent), 180d
 *     (dominant). The dominant observation is the rarest in the
 *     product — many users will never earn it.
 *   - User-facing copy is a fixed table. No numbers, no
 *     percentages, no templating.
 *
 * Companion to:
 *   - apps/web/lib/pathways/livingBrain.ts (Phase 6)
 *   - apps/web/lib/retention/offScreenBridge.ts (Phase 7)
 *
 * Consumers (none yet wired — landed file-only as the seed):
 *   - Daily snapshot job: call `deriveAppliedObservations` after
 *     `deriveBrainObservations`, merge user-facing arrays under
 *     the same MAX_USER_FACING_PER_WEEK gate.
 *   - Adaptive routing: call `getAppliedRoutingDeltas(snapshot)`
 *     and apply the per-decoder reduction to the existing
 *     priority computation.
 */

import type { DecoderTag, PathwayArchetype } from './types'
import type { Observation, ObservationHistory } from './livingBrain'
import {
  MAX_USER_FACING_PER_WEEK,
  MIN_SESSIONS_FOR_USER_FACING,
  observationKey,
} from './livingBrain'

// --- input shape -----------------------------------------------------------

/** Per-decoder applied-recognition signal. Sourced from the
 *  Off-Screen Bridge's reflection-yes counter. */
export interface AppliedDecoderSignal {
  decoder: DecoderTag
  /** Lifetime count of `yes` reflections on this decoder. */
  transferEventsLifetime: number
  /** Count of `yes` reflections in the last 14 days. */
  transferEvents14d: number
  /** Count of `yes` reflections in the last 21 days. */
  transferEvents21d: number
  /** Count of `yes` reflections in the last 30 days. */
  transferEvents30d: number
  /** Days since the most recent `yes`. Infinity if never. */
  daysSinceLastTransfer: number
}

export interface AppliedRecognitionSnapshot {
  asOf: string
  totalSessions: number
  decoders: ReadonlyArray<AppliedDecoderSignal>
  earnedArchetype?: PathwayArchetype
}

// --- output shape ----------------------------------------------------------

export type AppliedTier = 'none' | 'emerging' | 'consistent' | 'dominant'

/** Same Observation shape Living Brain uses, with a constrained
 *  ObservationKind. Phase 8 introduces ONE new ObservationKind
 *  variant via the union below. */
export type AppliedObservationKind = 'applied_recognition'

export interface AppliedObservation extends Observation {
  kind: 'applied_recognition' & Observation['kind']
  /** Which tier triggered this observation. Internal-only context;
   *  not surfaced to the user. */
  tier: Exclude<AppliedTier, 'none'>
}

/** Routing-weight delta the adaptive recommender can additively
 *  apply to per-decoder priority. Values are non-positive — applied
 *  recognition only REDUCES routing weight, never increases. */
export interface AppliedRoutingDelta {
  decoder: DecoderTag
  /** Delta in [-0.15, 0]. Caller adds to its existing priority
   *  scalar; clamps the final priority to its own valid range. */
  priorityDelta: number
  tier: AppliedTier
}

// --- thresholds ------------------------------------------------------------

/** Tier thresholds — see Phase 8 strategy doc § The Three Applied Tiers. */
export const TIER_THRESHOLDS = {
  emerging: {
    minTransferEvents14d: 3,
  },
  consistent: {
    minTransferEvents21d: 5,
    minDecodersWithTransfer: 2,
  },
  dominant: {
    minTransferEvents30d: 10,
    minDecodersWithTransfer: 3,
  },
} as const

/** Per-tier user-facing observation cooldowns (days). Override
 *  Living Brain's default `applied_recognition` cooldown which is
 *  not in the COOLDOWN_DAYS table — Phase 8 owns these constants. */
export const APPLIED_COOLDOWN_DAYS = {
  emerging: 21,
  consistent: 60,
  dominant: 180,
} as const

/** Routing-weight reductions. Non-positive. */
export const ROUTING_PRIORITY_DELTAS = {
  none: 0,
  emerging: -0.05,
  consistent: -0.10,
  dominant: -0.15,
} as const

// --- copy vocabulary -------------------------------------------------------

const EMERGING_COPY: Record<DecoderTag, string> = {
  BACKDOOR_WINDOW: 'You’re catching backdoor reads in real games.',
  EMPTY_SPACE_CUT: 'You’re seeing empty-space cuts in real games.',
  SKIP_THE_ROTATION: 'You’re catching skip reads in real games.',
  ADVANTAGE_OR_RESET: 'You’re reading closeouts in real games.',
}

const CONSISTENT_COPY = 'Real-game reads are showing up across decoders.'

const DOMINANT_COPY = 'You’re watching basketball with new eyes now.'

// --- tier classification ---------------------------------------------------

/**
 * Classifies a per-decoder signal into an emerging tier (or none).
 * Pure: same input → same tier. The dominant + consistent tiers are
 * cross-decoder and are evaluated separately by `classifyOverallTier`.
 */
export function classifyDecoderTier(d: AppliedDecoderSignal): 'none' | 'emerging' {
  if (d.transferEvents14d >= TIER_THRESHOLDS.emerging.minTransferEvents14d) {
    return 'emerging'
  }
  return 'none'
}

/**
 * Classifies the snapshot's overall (cross-decoder) tier. Pure.
 *
 * Resolution order:
 *   - dominant if ≥ 10 events in 30d AND ≥ 3 distinct decoders
 *   - consistent if ≥ 5 events in 21d AND ≥ 2 distinct decoders
 *   - else: none (per-decoder `emerging` is handled separately)
 */
export function classifyOverallTier(snapshot: AppliedRecognitionSnapshot): AppliedTier {
  let total30d = 0
  let total21d = 0
  let decodersWithTransfer30d = 0
  let decodersWithTransfer21d = 0
  for (const d of snapshot.decoders) {
    total30d += d.transferEvents30d
    total21d += d.transferEvents21d
    if (d.transferEvents30d > 0) decodersWithTransfer30d++
    if (d.transferEvents21d > 0) decodersWithTransfer21d++
  }
  if (
    total30d >= TIER_THRESHOLDS.dominant.minTransferEvents30d &&
    decodersWithTransfer30d >= TIER_THRESHOLDS.dominant.minDecodersWithTransfer
  ) {
    return 'dominant'
  }
  if (
    total21d >= TIER_THRESHOLDS.consistent.minTransferEvents21d &&
    decodersWithTransfer21d >= TIER_THRESHOLDS.consistent.minDecodersWithTransfer
  ) {
    return 'consistent'
  }
  return 'none'
}

// --- helpers ---------------------------------------------------------------

function daysBetween(asOfIso: string, lastIso: string): number {
  const a = Date.parse(asOfIso)
  const b = Date.parse(lastIso)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Infinity
  return Math.floor((a - b) / (24 * 60 * 60 * 1000))
}

function appliedCooldownActive(
  history: ObservationHistory,
  tier: 'emerging' | 'consistent' | 'dominant',
  decoder: DecoderTag | undefined,
  asOf: string,
): boolean {
  // We piggyback on Living Brain's history map but use Phase 8's
  // cooldown durations. The composite key uses the standard
  // observationKey format with a tier-aware decoder slot for
  // emerging (per-decoder) vs. cross-decoder (consistent/dominant).
  const key = observationKey('applied_recognition' as Observation['kind'], decoder)
  const last = history.lastSurfacedByKey[key]
  if (!last) return false
  return daysBetween(asOf, last) < APPLIED_COOLDOWN_DAYS[tier]
}

// --- public API ------------------------------------------------------------

/**
 * Returns the applied-recognition observations the snapshot
 * qualifies for. Cross-decoder tiers (consistent, dominant) win
 * over per-decoder emerging when both qualify in the same snapshot
 * — earning consistent obviates the smaller emerging surface.
 *
 * Per Living Brain's contract, the caller MERGES the returned
 * `userFacing` array with Brain observations under the shared
 * MAX_USER_FACING_PER_WEEK cap. Phase 8 surfaces at most ONE
 * applied observation per snapshot.
 *
 * Returns null candidates when:
 *   - totalSessions < MIN_SESSIONS_FOR_USER_FACING
 *   - no tier qualifies
 *   - the qualifying tier is on cooldown
 */
export function deriveAppliedObservations(
  snapshot: AppliedRecognitionSnapshot,
  history: ObservationHistory,
): { userFacing: AppliedObservation[]; internal: AppliedObservation[] } {
  const internal: AppliedObservation[] = []
  const userFacing: AppliedObservation[] = []

  // Internal: every decoder's per-decoder tier is reported, regardless
  // of cooldown — internal callers (routing) read this directly.
  for (const d of snapshot.decoders) {
    const tier = classifyDecoderTier(d)
    if (tier === 'emerging') {
      internal.push({
        kind: 'applied_recognition' as Observation['kind'],
        decoder: d.decoder,
        copy: EMERGING_COPY[d.decoder],
        surface: 'silent',
        tier: 'emerging',
      })
    }
  }
  const overall = classifyOverallTier(snapshot)
  if (overall === 'consistent' || overall === 'dominant') {
    internal.push({
      kind: 'applied_recognition' as Observation['kind'],
      copy: overall === 'dominant' ? DOMINANT_COPY : CONSISTENT_COPY,
      surface: 'silent',
      tier: overall,
    })
  }

  // User-facing: gated by onboarding, weekly cap, and per-tier cooldown.
  if (snapshot.totalSessions < MIN_SESSIONS_FOR_USER_FACING) {
    return { userFacing, internal }
  }
  if (history.surfacedThisWeek >= MAX_USER_FACING_PER_WEEK) {
    return { userFacing, internal }
  }

  // Precedence: dominant > consistent > emerging (warmest first).
  if (overall === 'dominant' && !appliedCooldownActive(history, 'dominant', undefined, snapshot.asOf)) {
    userFacing.push({
      kind: 'applied_recognition' as Observation['kind'],
      copy: DOMINANT_COPY,
      surface: 'home_card',
      tier: 'dominant',
    })
    return { userFacing, internal }
  }
  if (overall === 'consistent' && !appliedCooldownActive(history, 'consistent', undefined, snapshot.asOf)) {
    userFacing.push({
      kind: 'applied_recognition' as Observation['kind'],
      copy: CONSISTENT_COPY,
      surface: 'home_card',
      tier: 'consistent',
    })
    return { userFacing, internal }
  }

  // Per-decoder emerging — surface the most recently active decoder
  // (smallest daysSinceLastTransfer) that qualifies and isn't on
  // cooldown. Determinism: ties broken by decoder tag alphabetical
  // order, since same-day signals are common.
  const candidates = snapshot.decoders
    .filter((d) => classifyDecoderTier(d) === 'emerging')
    .filter((d) => !appliedCooldownActive(history, 'emerging', d.decoder, snapshot.asOf))
    .sort((a, b) => {
      if (a.daysSinceLastTransfer !== b.daysSinceLastTransfer) {
        return a.daysSinceLastTransfer - b.daysSinceLastTransfer
      }
      return a.decoder < b.decoder ? -1 : 1
    })
  if (candidates[0]) {
    userFacing.push({
      kind: 'applied_recognition' as Observation['kind'],
      decoder: candidates[0].decoder,
      copy: EMERGING_COPY[candidates[0].decoder],
      surface: 'home_card',
      tier: 'emerging',
    })
  }

  return { userFacing, internal }
}

/**
 * Returns per-decoder routing-weight deltas the adaptive recommender
 * additively applies. Pure. All deltas are ≤ 0 — applied recognition
 * REDUCES routing weight, never increases.
 *
 * The dominant tier reduces every decoder uniformly; the consistent
 * tier reduces per-decoder by membership; the emerging tier is
 * decoder-scoped.
 */
export function getAppliedRoutingDeltas(
  snapshot: AppliedRecognitionSnapshot,
): AppliedRoutingDelta[] {
  const overall = classifyOverallTier(snapshot)
  return snapshot.decoders.map((d) => {
    const perDecoder = classifyDecoderTier(d)
    let tier: AppliedTier = 'none'
    if (overall === 'dominant') tier = 'dominant'
    else if (overall === 'consistent' && d.transferEvents21d > 0) tier = 'consistent'
    else if (perDecoder === 'emerging') tier = 'emerging'
    return {
      decoder: d.decoder,
      priorityDelta: ROUTING_PRIORITY_DELTAS[tier],
      tier,
    }
  })
}

/** Test/debug — composite key the caller persists for cooldowns. */
export function _appliedKeyForTest(
  tier: 'emerging' | 'consistent' | 'dominant',
  decoder?: DecoderTag,
): string {
  // Emerging is per-decoder; consistent/dominant are cross-decoder.
  const d = tier === 'emerging' ? decoder : undefined
  return observationKey('applied_recognition' as Observation['kind'], d)
}
