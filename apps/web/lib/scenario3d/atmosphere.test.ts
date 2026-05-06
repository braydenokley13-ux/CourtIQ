/**
 * V2-A — Atmosphere helper tests.
 *
 * Locks the rim-halo pulse contract:
 *   1. Pure / deterministic — same nowMs → same alpha multiplier.
 *   2. Output stays inside [1 - amp, 1 + amp] so the authored opacity
 *      is preserved on average and never goes negative.
 *   3. Non-finite input returns the identity multiplier (1) so the
 *      renderer never multiplies an authored opacity by NaN on a
 *      tab-focus clock skew.
 *   4. The pulse period matches the spec — one full cycle per
 *      ~5.8 seconds.
 */

import { describe, it, expect } from 'vitest'
import { getRimHaloPulseAlpha } from './atmosphere'

describe('getRimHaloPulseAlpha', () => {
  it('returns the identity multiplier on non-finite input', () => {
    expect(getRimHaloPulseAlpha(Number.NaN)).toBe(1)
    expect(getRimHaloPulseAlpha(Number.POSITIVE_INFINITY)).toBe(1)
  })

  it('is deterministic — same time → same value', () => {
    expect(getRimHaloPulseAlpha(1000)).toBe(getRimHaloPulseAlpha(1000))
    expect(getRimHaloPulseAlpha(0)).toBe(getRimHaloPulseAlpha(0))
  })

  it('stays inside the [0.9, 1.1] band for any time', () => {
    for (let t = 0; t < 60_000; t += 137) {
      const v = getRimHaloPulseAlpha(t)
      expect(v).toBeGreaterThanOrEqual(0.9)
      expect(v).toBeLessThanOrEqual(1.1)
      expect(Number.isFinite(v)).toBe(true)
    }
  })

  it('is centered on 1 (zero phase = identity)', () => {
    // sin(0) = 0 → multiplier 1 + amp * 0 = 1
    expect(getRimHaloPulseAlpha(0)).toBeCloseTo(1, 6)
  })

  it('cycles approximately every 5.8 seconds', () => {
    // After one full period (5.8 s = 5800 ms) the multiplier should
    // come back to its phase-0 value (1).
    expect(getRimHaloPulseAlpha(5800)).toBeCloseTo(1, 4)
  })

  it('peak amplitude is reached near t = period / 4', () => {
    const peak = getRimHaloPulseAlpha(5800 / 4)
    // At t = T/4, sin(2π * 0.25) = 1, so multiplier = 1 + amp.
    expect(peak).toBeGreaterThan(1.05)
    expect(peak).toBeLessThanOrEqual(1.1)
  })
})
