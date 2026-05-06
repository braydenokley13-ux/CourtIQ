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
import {
  getKeyDefenderPulseAlpha,
  getRimHaloPulseAlpha,
} from './atmosphere'

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

describe('V4-D — getKeyDefenderPulseAlpha', () => {
  it('returns the identity multiplier on non-finite input', () => {
    expect(getKeyDefenderPulseAlpha(Number.NaN)).toBe(1)
    expect(getKeyDefenderPulseAlpha(Number.POSITIVE_INFINITY)).toBe(1)
  })

  it('is deterministic — same time → same value', () => {
    expect(getKeyDefenderPulseAlpha(1000)).toBe(getKeyDefenderPulseAlpha(1000))
  })

  it('stays inside the [0.75, 1.25] band for any time', () => {
    for (let t = 0; t < 30_000; t += 73) {
      const v = getKeyDefenderPulseAlpha(t)
      expect(v).toBeGreaterThanOrEqual(0.75)
      expect(v).toBeLessThanOrEqual(1.25)
      expect(Number.isFinite(v)).toBe(true)
    }
  })

  it('is centered on 1 at zero phase', () => {
    expect(getKeyDefenderPulseAlpha(0)).toBeCloseTo(1, 6)
  })

  it('cycles approximately every 1.6 seconds', () => {
    expect(getKeyDefenderPulseAlpha(1600)).toBeCloseTo(1, 4)
  })

  it('pulses faster than the rim-halo (more cycles per second)', () => {
    // Peak count over 10 seconds: rim halo ≈ 10/5.8 ≈ 1.7,
    // key defender ≈ 10/1.6 ≈ 6.3. The key defender helper must
    // produce more zero-crossings in the same window.
    let rimCrossings = 0
    let keyCrossings = 0
    let prevRim = getRimHaloPulseAlpha(0) - 1
    let prevKey = getKeyDefenderPulseAlpha(0) - 1
    for (let t = 50; t < 10_000; t += 50) {
      const r = getRimHaloPulseAlpha(t) - 1
      const k = getKeyDefenderPulseAlpha(t) - 1
      if (Math.sign(r) !== Math.sign(prevRim)) rimCrossings++
      if (Math.sign(k) !== Math.sign(prevKey)) keyCrossings++
      prevRim = r
      prevKey = k
    }
    expect(keyCrossings).toBeGreaterThan(rimCrossings)
  })
})
