/**
 * Phase 10 P1 — session plan input adapter.
 *
 * Pure helpers that map the existing /train page state (attempts count,
 * training mode, scenario decoder tags, local clock) into the
 * `SessionComposeInput` that `composeSession` consumes. No React, no
 * Prisma, no DOM. The /train page picks these up to opt into the
 * Phase 9 session shape without re-implementing the derivation rules.
 *
 * Restraint properties carried from Phase 9:
 *   - tier is coarse, not adaptive — three buckets keyed on attempts.
 *   - fatigue defaults to 'fresh' until /train surfaces a real signal.
 *     The planner will never extend a session because the user is
 *     performing well, so a missing signal is safe.
 *   - first-session detection mirrors `lib/onboarding/firstRep` so the
 *     cold-open behavior stays in sync.
 */

import {
  composeSession,
  type FatigueBand,
  type MasteryTier,
  type SessionPlan,
} from './sessionComposition'
import type { DecoderTag, PathwayTrainingMode } from './types'

/** Attempts ceiling that still reads as "onboarding". Below this the
 *  planner uses the calmer cushion + 5-rep shape. */
export const ONBOARDING_ATTEMPTS_MAX = 25

/** Attempts floor that flips into "post-mastery". The planner uses the
 *  6-rep light shape so the session feels like maintenance, not a
 *  tutorial. */
export const POST_MASTERY_ATTEMPTS_MIN = 200

export interface DeriveTierInput {
  attemptsCount: number | null
  /** Optional override — when the upstream system already knows the
   *  tier (e.g. from a profile flag) it wins. */
  override?: MasteryTier | null
}

export function deriveTier({ attemptsCount, override }: DeriveTierInput): MasteryTier {
  if (override) return override
  if (attemptsCount == null || attemptsCount <= 0) return 'onboarding'
  if (attemptsCount < ONBOARDING_ATTEMPTS_MAX) return 'onboarding'
  if (attemptsCount >= POST_MASTERY_ATTEMPTS_MIN) return 'post-mastery'
  return 'mid-mastery'
}

export interface DeriveDecoderQueueInput {
  /** Scenario rows in the order they will run. Only `decoder_tag` is
   *  inspected; null tags are skipped (the rotation handles them but
   *  the planner has nothing to space). */
  scenarios: ReadonlyArray<{ decoder_tag?: DecoderTag | null }>
}

export function deriveDecoderQueue({ scenarios }: DeriveDecoderQueueInput): DecoderTag[] {
  const out: DecoderTag[] = []
  for (const s of scenarios) {
    if (s.decoder_tag) out.push(s.decoder_tag)
  }
  return out
}

export interface BuildPlanInput {
  attemptsCount: number | null
  trainingMode: PathwayTrainingMode | string | null
  scenarios: ReadonlyArray<{ decoder_tag?: DecoderTag | null }>
  /** Local hour at session start, 0..23. Defaults to the system clock
   *  when omitted; tests pin a value to keep determinism. */
  localHour?: number
  /** Override tier when the caller already knows it. */
  tierOverride?: MasteryTier | null
  /** Real fatigue signal once /train computes one. Defaults to 'fresh'. */
  fatigue?: FatigueBand
}

const KNOWN_MODES: ReadonlySet<PathwayTrainingMode> = new Set([
  'learn-the-cue',
  'freeze-frame-read',
  'no-hint',
  'mixed-reads',
  'boss-challenge',
  'film-room',
  'pressure-test',
])

function normalizeMode(raw: string | null | undefined): PathwayTrainingMode | null {
  if (!raw) return null
  return KNOWN_MODES.has(raw as PathwayTrainingMode) ? (raw as PathwayTrainingMode) : null
}

/**
 * Top-level adapter — given the same data the /train page already has
 * on mount, return a deterministic SessionPlan. Safe to call during
 * render: pure, never throws, never reads `Date.now()` unless
 * `localHour` is omitted.
 */
export function buildSessionPlan(input: BuildPlanInput): SessionPlan {
  const tier = deriveTier({ attemptsCount: input.attemptsCount, override: input.tierOverride })
  const decoderQueue = deriveDecoderQueue({ scenarios: input.scenarios })
  const localHour = input.localHour ?? new Date().getHours()
  const trainingMode = normalizeMode(input.trainingMode)
  const isFirstSession = (input.attemptsCount ?? 0) <= 0
  return composeSession({
    localHour,
    tier,
    fatigue: input.fatigue ?? 'fresh',
    trainingMode,
    decoderQueue,
    isFirstSession,
  })
}
