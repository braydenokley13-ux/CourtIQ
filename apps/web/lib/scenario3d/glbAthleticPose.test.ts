/**
 * FR-8 Packet 3 — basketball-ready rest delta tests.
 *
 * Locks the audited bind-relative offsets so any future packet that
 * tweaks the rest pose has to update this file deliberately.
 */

import { describe, expect, it } from 'vitest'

import {
  BASKETBALL_READY_BONE_KEYS,
  BASKETBALL_READY_MAX_DELTA_RAD,
  BASKETBALL_READY_REST_DELTA,
  getBasketballReadyDelta,
  type AthleticPoseBoneKey,
} from './glbAthleticPose'

describe('FR-8 Packet 3 — basketball-ready rest delta is well-formed', () => {
  it('exposes deltas for both legs (thigh + shin) and both arms (upper + fore)', () => {
    expect([...BASKETBALL_READY_BONE_KEYS].sort()).toEqual([
      'leftForeArm',
      'leftShin',
      'leftThigh',
      'leftUpperArm',
      'rightForeArm',
      'rightShin',
      'rightThigh',
      'rightUpperArm',
    ])
  })

  it('does NOT touch hips, spine, or head — those stay at bind unless a clip drives them', () => {
    const keys = Object.keys(BASKETBALL_READY_REST_DELTA)
    for (const banned of ['hips', 'spine', 'Head', 'head']) {
      expect(keys).not.toContain(banned)
    }
  })

  it('every delta magnitude stays under the safety cap', () => {
    for (const key of BASKETBALL_READY_BONE_KEYS) {
      const d = BASKETBALL_READY_REST_DELTA[key]
      expect(Math.abs(d.x)).toBeLessThanOrEqual(BASKETBALL_READY_MAX_DELTA_RAD)
      expect(Math.abs(d.y)).toBeLessThanOrEqual(BASKETBALL_READY_MAX_DELTA_RAD)
      expect(Math.abs(d.z)).toBeLessThanOrEqual(BASKETBALL_READY_MAX_DELTA_RAD)
    }
  })

  it('rest delta object is frozen', () => {
    expect(Object.isFrozen(BASKETBALL_READY_REST_DELTA)).toBe(true)
  })
})

describe('FR-8 Packet 3 — knees bend forward, not back', () => {
  it('thighs pitch FORWARD (negative X) — the audited "athletic stance" sign', () => {
    expect(BASKETBALL_READY_REST_DELTA.leftThigh.x).toBeLessThan(0)
    expect(BASKETBALL_READY_REST_DELTA.rightThigh.x).toBeLessThan(0)
  })

  it('shins tuck UNDER (positive X) — counter-rotates the thigh so the foot stays under the knee', () => {
    expect(BASKETBALL_READY_REST_DELTA.leftShin.x).toBeGreaterThan(0)
    expect(BASKETBALL_READY_REST_DELTA.rightShin.x).toBeGreaterThan(0)
  })

  it('thigh / shin signs are mirrored — the figure is not lop-sided', () => {
    expect(BASKETBALL_READY_REST_DELTA.leftThigh).toEqual(
      BASKETBALL_READY_REST_DELTA.rightThigh,
    )
    expect(BASKETBALL_READY_REST_DELTA.leftShin).toEqual(
      BASKETBALL_READY_REST_DELTA.rightShin,
    )
  })

  it('thigh bend is small — under ~12° (≈ 0.21 rad) so the figure still reads as "standing"', () => {
    expect(Math.abs(BASKETBALL_READY_REST_DELTA.leftThigh.x)).toBeLessThan(0.21)
  })
})

describe('FR-8 Packet 3 — arms read as "ready", not "T-pose"', () => {
  it('upperarm X delta is positive — rotates the bind T-pose-ish arm IN to the rib', () => {
    expect(BASKETBALL_READY_REST_DELTA.leftUpperArm.x).toBeGreaterThan(0)
    expect(BASKETBALL_READY_REST_DELTA.rightUpperArm.x).toBeGreaterThan(0)
  })

  it('upperarm Z deltas are mirrored across the body centerline', () => {
    expect(BASKETBALL_READY_REST_DELTA.leftUpperArm.z).toBe(
      -BASKETBALL_READY_REST_DELTA.rightUpperArm.z,
    )
  })

  it('forearm Y delta is negative on both sides — soft elbow bend', () => {
    expect(BASKETBALL_READY_REST_DELTA.leftForeArm.y).toBeLessThan(0)
    expect(BASKETBALL_READY_REST_DELTA.rightForeArm.y).toBeLessThan(0)
  })

  it('forearm bend matches across L/R so the figure is symmetric', () => {
    expect(BASKETBALL_READY_REST_DELTA.leftForeArm).toEqual(
      BASKETBALL_READY_REST_DELTA.rightForeArm,
    )
  })
})

describe('FR-8 Packet 3 — getBasketballReadyDelta accessor', () => {
  it('returns the same reference as direct lookup (pure)', () => {
    for (const key of BASKETBALL_READY_BONE_KEYS) {
      expect(getBasketballReadyDelta(key)).toBe(BASKETBALL_READY_REST_DELTA[key])
    }
  })

  it('every key resolves to a non-null delta', () => {
    for (const key of BASKETBALL_READY_BONE_KEYS) {
      expect(getBasketballReadyDelta(key)).toBeDefined()
    }
  })

  it('determinism — same key always returns the same numbers', () => {
    const calls: AthleticPoseBoneKey[] = [
      'leftThigh',
      'leftThigh',
      'rightUpperArm',
      'rightUpperArm',
    ]
    const out = calls.map((k) => getBasketballReadyDelta(k))
    expect(out[0]).toEqual(out[1])
    expect(out[2]).toEqual(out[3])
  })
})
