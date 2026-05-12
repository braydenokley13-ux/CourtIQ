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
  getCourtSpotPulseAlpha,
  getGlassShimmerAlpha,
  getKeyDefenderPulseAlpha,
  getRimHaloPulseAlpha,
  getRimMetalShimmerIntensity,
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

describe('AAA polish — getRimMetalShimmerIntensity', () => {
  it('returns the identity multiplier on non-finite input', () => {
    expect(getRimMetalShimmerIntensity(Number.NaN)).toBe(1)
    expect(getRimMetalShimmerIntensity(Number.POSITIVE_INFINITY)).toBe(1)
  })

  it('is deterministic — same time → same value', () => {
    expect(getRimMetalShimmerIntensity(1234)).toBe(getRimMetalShimmerIntensity(1234))
  })

  it('stays inside the [0.78, 1.22] band for any time', () => {
    for (let t = 0; t < 30_000; t += 41) {
      const v = getRimMetalShimmerIntensity(t)
      expect(v).toBeGreaterThanOrEqual(0.78)
      expect(v).toBeLessThanOrEqual(1.22)
      expect(Number.isFinite(v)).toBe(true)
    }
  })

  it('produces a non-trivial dynamic range across a few seconds', () => {
    // Locks the contract that the shimmer is actually moving — a
    // bug that pinned the multiplier to a constant would silently
    // disable the AAA chrome glint.
    let min = Infinity
    let max = -Infinity
    for (let t = 0; t < 6000; t += 50) {
      const v = getRimMetalShimmerIntensity(t)
      if (v < min) min = v
      if (v > max) max = v
    }
    expect(max - min).toBeGreaterThan(0.15)
  })
})

describe('AAA polish — getCourtSpotPulseAlpha', () => {
  it('returns the identity multiplier on non-finite input', () => {
    expect(getCourtSpotPulseAlpha(Number.NaN)).toBe(1)
    expect(getCourtSpotPulseAlpha(Number.POSITIVE_INFINITY)).toBe(1)
  })

  it('stays inside the [0.93, 1.07] band for any time', () => {
    // Court spot swells gently — band must be narrower than the
    // rim shimmer so the painted key never reads as flickering.
    for (let t = 0; t < 30_000; t += 47) {
      const v = getCourtSpotPulseAlpha(t)
      expect(v).toBeGreaterThanOrEqual(0.93)
      expect(v).toBeLessThanOrEqual(1.07)
    }
  })

  it('is slower than the rim shimmer (fewer cycles per second)', () => {
    let spotCrossings = 0
    let shimmerCrossings = 0
    let prevSpot = getCourtSpotPulseAlpha(0) - 1
    let prevShim = getRimMetalShimmerIntensity(0) - 1
    for (let t = 50; t < 10_000; t += 50) {
      const s = getCourtSpotPulseAlpha(t) - 1
      const r = getRimMetalShimmerIntensity(t) - 1
      if (Math.sign(s) !== Math.sign(prevSpot)) spotCrossings++
      if (Math.sign(r) !== Math.sign(prevShim)) shimmerCrossings++
      prevSpot = s
      prevShim = r
    }
    expect(spotCrossings).toBeLessThan(shimmerCrossings)
  })
})

describe('AAA polish — getGlassShimmerAlpha', () => {
  it('returns the identity multiplier on non-finite input', () => {
    expect(getGlassShimmerAlpha(Number.NaN)).toBe(1)
    expect(getGlassShimmerAlpha(Number.POSITIVE_INFINITY)).toBe(1)
  })

  it('is deterministic — same time → same value', () => {
    expect(getGlassShimmerAlpha(777)).toBe(getGlassShimmerAlpha(777))
  })

  it('stays inside the [0.85, 1.15] band for any time', () => {
    for (let t = 0; t < 30_000; t += 41) {
      const v = getGlassShimmerAlpha(t)
      expect(v).toBeGreaterThanOrEqual(0.85)
      expect(v).toBeLessThanOrEqual(1.15)
    }
  })
})
