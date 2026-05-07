/**
 * livingBrain — bug-fix regression tests.
 *
 * Pin the P2 fix: deriveBrainObservations must never emit more than
 * one user-facing observation per call. Before the fix, a snapshot
 * that qualified for both a home_card candidate AND a hesitation
 * candidate produced two — bypassing the documented 1/session cap
 * AND letting the surfacedThisWeek=2 case slip a third weekly.
 */

import { describe, expect, it } from 'vitest'

import {
  EMPTY_HISTORY,
  MAX_USER_FACING_PER_WEEK,
  MIN_SESSIONS_FOR_USER_FACING,
  deriveBrainObservations,
  type BrainSignalSnapshot,
  type DecoderSignal,
} from './livingBrain'

const decoder = (over: Partial<DecoderSignal>): DecoderSignal => ({
  decoder: 'BACKDOOR_WINDOW',
  accuracy: 0.6,
  attempts: 12,
  anticipationRate: 0.2,
  medianHesitationMs: 600,
  uniqueScenarioCount: 5,
  growthSlopePerDay: 0,
  daysSinceLastRep: 1,
  ...over,
})

describe('deriveBrainObservations — one user-facing per session (P2 fix)', () => {
  it('emits at most one user-facing observation when both home + hesitation candidates qualify', () => {
    // BDW snapshot that triggers BOTH growth (home_card) and
    // hesitation (post_session). Pre-fix this returned two
    // user-facing items in the same call.
    const snapshot: BrainSignalSnapshot = {
      asOf: '2026-05-07',
      totalSessions: MIN_SESSIONS_FOR_USER_FACING + 5,
      decoders: [
        decoder({
          decoder: 'BACKDOOR_WINDOW',
          growthSlopePerDay: 0.05, // > GROWTH_SLOPE_THRESHOLD
          medianHesitationMs: 1500, // > HESITATION_MS_THRESHOLD
          attempts: 20,
        }),
      ],
    }
    const { userFacing } = deriveBrainObservations(snapshot, EMPTY_HISTORY)
    expect(userFacing.length).toBeLessThanOrEqual(1)
  })

  it('prefers the home_card candidate over hesitation when both qualify', () => {
    const snapshot: BrainSignalSnapshot = {
      asOf: '2026-05-07',
      totalSessions: MIN_SESSIONS_FOR_USER_FACING + 5,
      decoders: [
        decoder({
          growthSlopePerDay: 0.05,
          medianHesitationMs: 1500,
          attempts: 20,
        }),
      ],
    }
    const { userFacing } = deriveBrainObservations(snapshot, EMPTY_HISTORY)
    expect(userFacing[0]?.kind).not.toBe('hesitation')
  })

  it('still emits hesitation when no home_card candidate qualifies', () => {
    const snapshot: BrainSignalSnapshot = {
      asOf: '2026-05-07',
      totalSessions: MIN_SESSIONS_FOR_USER_FACING + 5,
      decoders: [
        decoder({
          growthSlopePerDay: 0,
          anticipationRate: 0,
          daysSinceLastRep: 1,
          medianHesitationMs: 1500,
          attempts: 10,
        }),
      ],
    }
    const { userFacing } = deriveBrainObservations(snapshot, EMPTY_HISTORY)
    expect(userFacing).toHaveLength(1)
    expect(userFacing[0]?.kind).toBe('hesitation')
  })

  it('cannot bypass the weekly budget by stacking home + hesitation in one call', () => {
    const snapshot: BrainSignalSnapshot = {
      asOf: '2026-05-07',
      totalSessions: MIN_SESSIONS_FOR_USER_FACING + 5,
      decoders: [
        decoder({
          growthSlopePerDay: 0.05,
          medianHesitationMs: 1500,
          attempts: 20,
        }),
      ],
    }
    // Simulate the user already at the weekly cap minus 1.
    const nearCapHistory = {
      lastSurfacedByKey: {},
      surfacedThisWeek: MAX_USER_FACING_PER_WEEK - 1,
    }
    const { userFacing } = deriveBrainObservations(snapshot, nearCapHistory)
    // Pre-fix: 2 returned would let surfacedThisWeek jump past
    // the cap. Post-fix: at most 1.
    expect(userFacing.length).toBeLessThanOrEqual(1)
  })
})
