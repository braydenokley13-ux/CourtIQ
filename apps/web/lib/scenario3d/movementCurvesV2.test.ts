/**
 * V2-B — premium athletic motion curve tests.
 *
 * Locks the shape contracts so a future tuning packet can swap the
 * dispatch on a feature flag with byte-level confidence.
 */

import { describe, it, expect } from 'vitest'
import {
  easeAthleticCutV2,
  easeCloseoutV2,
  easeStopHardV2,
  getPremiumCurveForKind,
} from './movementCurvesV2'

const SAMPLE_US = [0, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 1.0] as const

describe('easeAthleticCutV2', () => {
  it('hits the endpoints exactly', () => {
    expect(easeAthleticCutV2(0)).toBe(0)
    expect(easeAthleticCutV2(1)).toBe(1)
  })

  it('produces a tiny anticipation dip in the load window', () => {
    // Inside the 0..0.06 anticipation window, the curve dips below 0
    // (then clamps to 0). We just verify the curve's mid-load value
    // is non-positive at u=0.03 — the dip's negative output is then
    // clamped by clamp01 to 0, but the math intent is preserved by
    // requiring the post-clamp value at u=0.03 to be 0 (not >0).
    expect(easeAthleticCutV2(0.03)).toBe(0)
    expect(easeAthleticCutV2(0.04)).toBe(0)
  })

  it('is monotonically non-decreasing past the load window', () => {
    // After the anticipation dip ends at 0.06, the curve must climb
    // monotonically to 1.
    let prev = easeAthleticCutV2(0.07)
    for (let u = 0.07; u <= 1; u += 0.01) {
      const v = easeAthleticCutV2(u)
      expect(v).toBeGreaterThanOrEqual(prev - 1e-12)
      prev = v
    }
  })

  it('is more front-loaded than ease-in-out cubic at u=0.3', () => {
    // ease-in-out cubic at u=0.3 (first half formula).
    const symmetric = 4 * 0.3 * 0.3 * 0.3
    expect(easeAthleticCutV2(0.3)).toBeGreaterThan(symmetric)
  })

  it('produces finite values inside [0, 1] for every sample', () => {
    for (const u of SAMPLE_US) {
      const v = easeAthleticCutV2(u)
      expect(Number.isFinite(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })
})

describe('easeCloseoutV2', () => {
  it('hits the endpoints exactly', () => {
    expect(easeCloseoutV2(0)).toBe(0)
    expect(easeCloseoutV2(1)).toBe(1)
  })

  it('is steeply front-loaded — at u=0.25 the defender is past 40%', () => {
    expect(easeCloseoutV2(0.25)).toBeGreaterThan(0.4)
  })

  it('is mostly arrived at u=0.75 (committed-stop tail)', () => {
    expect(easeCloseoutV2(0.75)).toBeGreaterThan(0.94)
  })

  it('is monotonically non-decreasing', () => {
    let prev = easeCloseoutV2(0)
    for (let u = 0; u <= 1; u += 0.02) {
      const v = easeCloseoutV2(u)
      expect(v).toBeGreaterThanOrEqual(prev - 1e-12)
      prev = v
    }
  })

  it('produces finite values inside [0, 1]', () => {
    for (const u of SAMPLE_US) {
      const v = easeCloseoutV2(u)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
      expect(Number.isFinite(v)).toBe(true)
    }
  })
})

describe('easeStopHardV2', () => {
  it('hits the endpoints exactly', () => {
    expect(easeStopHardV2(0)).toBe(0)
    expect(easeStopHardV2(1)).toBe(1)
  })

  it('matches ease-in-out cubic in the first half', () => {
    // Within u ∈ [0, 0.55) the curve must equal symmetric cubic.
    const symmetric = (u: number) =>
      u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2
    for (const u of [0, 0.1, 0.25, 0.4, 0.5]) {
      expect(easeStopHardV2(u)).toBeCloseTo(symmetric(u), 6)
    }
  })

  it('does most of the brake by u=0.85', () => {
    expect(easeStopHardV2(0.85)).toBeGreaterThan(0.94)
  })

  it('is monotonically non-decreasing', () => {
    let prev = easeStopHardV2(0)
    for (let u = 0; u <= 1; u += 0.02) {
      const v = easeStopHardV2(u)
      expect(v).toBeGreaterThanOrEqual(prev - 1e-12)
      prev = v
    }
  })
})

describe('getPremiumCurveForKind', () => {
  it('routes athletic cuts to easeAthleticCutV2', () => {
    expect(getPremiumCurveForKind('cut')).toBe(easeAthleticCutV2)
    expect(getPremiumCurveForKind('drive')).toBe(easeAthleticCutV2)
    expect(getPremiumCurveForKind('back_cut')).toBe(easeAthleticCutV2)
    expect(getPremiumCurveForKind('jab')).toBe(easeAthleticCutV2)
    expect(getPremiumCurveForKind('rip')).toBe(easeAthleticCutV2)
    expect(getPremiumCurveForKind('baseline_sneak')).toBe(easeAthleticCutV2)
  })

  it('routes closeouts to easeCloseoutV2', () => {
    expect(getPremiumCurveForKind('closeout')).toBe(easeCloseoutV2)
  })

  it('routes stop_ball to easeStopHardV2', () => {
    expect(getPremiumCurveForKind('stop_ball')).toBe(easeStopHardV2)
  })

  it('returns null for unknown kinds', () => {
    expect(getPremiumCurveForKind('rotation')).toBeNull()
    expect(getPremiumCurveForKind('pass')).toBeNull()
    expect(getPremiumCurveForKind('not-a-real-kind')).toBeNull()
  })

  it('is pure: same kind always returns the same function reference', () => {
    expect(getPremiumCurveForKind('cut')).toBe(getPremiumCurveForKind('cut'))
  })
})
