/**
 * Phase γ — HUNT session-gate unit tests.
 *
 * Each helper in `huntSessionGates.ts` is pure; these tests pin down
 * the main paths described in `HUNT_DECODER_DESIGN.md` §5.4–§5.8 and
 * the workstream-E spec. Behaviors locked here are referenced by the
 * scenarioService wiring, so changing them requires updating the
 * caller too.
 */

import { describe, expect, it } from 'vitest'
import type { DecoderTag } from './schema'
import {
  HUNT_CALIBRATION_DAYS,
  HUNT_IQ_FLOOR,
  HUNT_MASTERY_THRESHOLD,
  dedupeBackToBackHunt,
  enforceHuntCountCap,
  excludeSkrWhenHuntPresent,
  huntXpMultiplier,
  isHuntEligibleForUser,
} from './huntSessionGates'

const HUNT: DecoderTag = 'HUNT_THE_ADVANTAGE'
const SKR: DecoderTag = 'SKIP_THE_ROTATION'
const BDW: DecoderTag = 'BACKDOOR_WINDOW'
const ESC: DecoderTag = 'EMPTY_SPACE_CUT'

function s(id: string, decoder_tag: DecoderTag | null) {
  return { id, decoder_tag }
}

describe('isHuntEligibleForUser', () => {
  it('high-IQ user is eligible regardless of calibration age', () => {
    expect(
      isHuntEligibleForUser({ iq_score: HUNT_IQ_FLOOR, daysSinceCalibration: 0 }),
    ).toBe(true)
    expect(
      isHuntEligibleForUser({ iq_score: 900, daysSinceCalibration: 5 }),
    ).toBe(true)
  })

  it('low-IQ user within the calibration window is excluded', () => {
    expect(
      isHuntEligibleForUser({ iq_score: 600, daysSinceCalibration: 0 }),
    ).toBe(false)
    expect(
      isHuntEligibleForUser({
        iq_score: HUNT_IQ_FLOOR - 1,
        daysSinceCalibration: HUNT_CALIBRATION_DAYS - 1,
      }),
    ).toBe(false)
  })

  it('low-IQ user past the calibration window is eligible', () => {
    expect(
      isHuntEligibleForUser({
        iq_score: 500,
        daysSinceCalibration: HUNT_CALIBRATION_DAYS,
      }),
    ).toBe(true)
    expect(
      isHuntEligibleForUser({ iq_score: 500, daysSinceCalibration: 365 }),
    ).toBe(true)
  })

  it('Number.POSITIVE_INFINITY days (uncalibrated user) is eligible', () => {
    expect(
      isHuntEligibleForUser({
        iq_score: 400,
        daysSinceCalibration: Number.POSITIVE_INFINITY,
      }),
    ).toBe(true)
  })
})

describe('dedupeBackToBackHunt', () => {
  it('swaps two adjacent HUNTs with the next non-HUNT scenario', () => {
    const input = [
      s('h1', HUNT),
      s('h2', HUNT),
      s('b1', BDW),
      s('e1', ESC),
    ]
    const out = dedupeBackToBackHunt(input)
    expect(out.map((x) => x.id)).toEqual(['h1', 'b1', 'h2', 'e1'])
  })

  it('returns the original array when only HUNT scenarios are present', () => {
    const input = [s('h1', HUNT), s('h2', HUNT), s('h3', HUNT)]
    const out = dedupeBackToBackHunt(input)
    expect(out).not.toBe(input) // pure: returns a new array
    expect(out.map((x) => x.id)).toEqual(['h1', 'h2', 'h3'])
  })

  it('is a no-op when no HUNT scenarios are in the bundle', () => {
    const input = [s('b1', BDW), s('e1', ESC), s('s1', SKR)]
    const out = dedupeBackToBackHunt(input)
    expect(out.map((x) => x.id)).toEqual(['b1', 'e1', 's1'])
  })

  it('leaves a single HUNT alone', () => {
    const input = [s('b1', BDW), s('h1', HUNT), s('e1', ESC)]
    const out = dedupeBackToBackHunt(input)
    expect(out.map((x) => x.id)).toEqual(['b1', 'h1', 'e1'])
  })

  it('falls back to the original order when too few non-HUNTs to dedupe', () => {
    // Three HUNTs + one non-HUNT can't be fully de-duped (you need
    // at least n-1 non-HUNTs to interleave n HUNTs without
    // adjacency). The helper attempts a swap, then encounters a
    // second adjacency it can't fix and bails out with the original
    // ordering — the documented degenerate path.
    const input = [
      s('h1', HUNT),
      s('h2', HUNT),
      s('h3', HUNT),
      s('b1', BDW),
    ]
    const out = dedupeBackToBackHunt(input)
    expect(out.map((x) => x.id)).toEqual(['h1', 'h2', 'h3', 'b1'])
  })

  it('dedupes when there is enough room to interleave', () => {
    // Two HUNTs + two non-HUNTs is fixable.
    const input = [
      s('h1', HUNT),
      s('h2', HUNT),
      s('b1', BDW),
      s('e1', ESC),
    ]
    const out = dedupeBackToBackHunt(input)
    for (let i = 1; i < out.length; i++) {
      const prev = out[i - 1]?.decoder_tag === HUNT
      const cur = out[i]?.decoder_tag === HUNT
      expect(prev && cur).toBe(false)
    }
  })
})

describe('enforceHuntCountCap', () => {
  it('caps HUNT count at 1 when mastery is below threshold', () => {
    const input = [
      s('h1', HUNT),
      s('b1', BDW),
      s('h2', HUNT),
      s('e1', ESC),
      s('h3', HUNT),
    ]
    const out = enforceHuntCountCap(input, HUNT_MASTERY_THRESHOLD - 0.1)
    expect(out.map((x) => x.id)).toEqual(['h1', 'b1', 'e1'])
  })

  it('allows multiple HUNTs when mastery is at or above threshold', () => {
    const input = [s('h1', HUNT), s('h2', HUNT), s('h3', HUNT)]
    expect(enforceHuntCountCap(input, HUNT_MASTERY_THRESHOLD).length).toBe(3)
    expect(enforceHuntCountCap(input, 1.0).length).toBe(3)
  })

  it('preserves order when capping', () => {
    const input = [s('b1', BDW), s('h1', HUNT), s('h2', HUNT), s('e1', ESC)]
    const out = enforceHuntCountCap(input, 0)
    expect(out.map((x) => x.id)).toEqual(['b1', 'h1', 'e1'])
  })

  it('is a no-op when no HUNT is present', () => {
    const input = [s('b1', BDW), s('e1', ESC)]
    const out = enforceHuntCountCap(input, 0)
    expect(out.map((x) => x.id)).toEqual(['b1', 'e1'])
  })
})

describe('excludeSkrWhenHuntPresent', () => {
  it('drops HUNT when SKR is present at low mastery', () => {
    const input = [s('h1', HUNT), s('s1', SKR), s('b1', BDW)]
    const out = excludeSkrWhenHuntPresent(input, 0.3)
    expect(out.map((x) => x.id)).toEqual(['s1', 'b1'])
  })

  it('keeps both at or above mastery threshold', () => {
    const input = [s('h1', HUNT), s('s1', SKR)]
    expect(excludeSkrWhenHuntPresent(input, HUNT_MASTERY_THRESHOLD).length).toBe(2)
    expect(excludeSkrWhenHuntPresent(input, 0.9).length).toBe(2)
  })

  it('is a no-op when only HUNT is present (no SKR conflict)', () => {
    const input = [s('h1', HUNT), s('b1', BDW)]
    const out = excludeSkrWhenHuntPresent(input, 0)
    expect(out.map((x) => x.id)).toEqual(['h1', 'b1'])
  })

  it('is a no-op when only SKR is present (no HUNT conflict)', () => {
    const input = [s('s1', SKR), s('b1', BDW)]
    const out = excludeSkrWhenHuntPresent(input, 0)
    expect(out.map((x) => x.id)).toEqual(['s1', 'b1'])
  })
})

describe('huntXpMultiplier', () => {
  it('returns 1.0 for D1 and D2', () => {
    expect(huntXpMultiplier(1)).toBe(1.0)
    expect(huntXpMultiplier(2)).toBe(1.0)
  })

  it('matches the §5.1 ladder for D3, D4, D5', () => {
    expect(huntXpMultiplier(3)).toBe(1.4)
    expect(huntXpMultiplier(4)).toBe(1.5)
    expect(huntXpMultiplier(5)).toBe(1.7)
  })

  it('clamps difficulties below 1 to D1 (1.0×)', () => {
    expect(huntXpMultiplier(0)).toBe(1.0)
    expect(huntXpMultiplier(-3)).toBe(1.0)
  })

  it('clamps difficulties above 5 to D5 (1.7×)', () => {
    expect(huntXpMultiplier(6)).toBe(1.7)
    expect(huntXpMultiplier(99)).toBe(1.7)
  })

  it('treats non-finite inputs as D1 (the conservative floor)', () => {
    // NaN, +Infinity, -Infinity all fail Number.isFinite, so they
    // bypass the clamp and fall to the D1 default rather than
    // round-to-D5. The conservative floor avoids accidentally
    // awarding a D5 multiplier to a corrupt input.
    expect(huntXpMultiplier(Number.NaN)).toBe(1.0)
    expect(huntXpMultiplier(Number.POSITIVE_INFINITY)).toBe(1.0)
    expect(huntXpMultiplier(Number.NEGATIVE_INFINITY)).toBe(1.0)
  })

  it('rounds float difficulties to the nearest integer', () => {
    expect(huntXpMultiplier(3.4)).toBe(1.4)
    expect(huntXpMultiplier(3.6)).toBe(1.5)
  })
})
