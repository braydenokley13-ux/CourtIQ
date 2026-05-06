/**
 * V1 Premiumization — Movement Profile tests.
 *
 * Locked contracts:
 *  1. Every AnimationIntent yields a profile (no missing intents).
 *  2. Stationary intents have bodyLeanDeg === 0.
 *  3. Moving offense intents lean further forward than moving defense.
 *  4. CLOSEOUT and BACK_CUT have explicit overrides applied.
 *  5. The same intent always returns the same profile (determinism).
 *  6. Movement-kind path goes through `getMovementKindIntent` so
 *     unknown kinds degrade to IDLE_READY's stationary profile.
 *  7. easeOutDefenseSlide endpoints are exact at u=0 and u=1.
 *  8. resolveEase returns a function for every ease name.
 *  9. bodyLeanAxis returns null below the magnitude floor.
 */

import { describe, it, expect } from 'vitest'
import {
  getMovementProfile,
  getMovementProfileForKind,
  easeOutDefenseSlide,
  resolveEase,
  bodyLeanAxis,
  type MovementEaseName,
} from './movementProfile'
import { ALL_ANIMATION_INTENTS } from './animationIntent'

describe('getMovementProfile', () => {
  it('returns a profile for every animation intent', () => {
    for (const intent of ALL_ANIMATION_INTENTS) {
      const profile = getMovementProfile(intent)
      expect(profile).toBeTruthy()
      expect(profile.motionClass).toBeTruthy()
      expect(typeof profile.bodyLeanDeg).toBe('number')
      expect(typeof profile.headingFollowS).toBe('number')
      expect(typeof profile.groundednessFactor).toBe('number')
    }
  })

  it('keeps stationary intents fully upright (bodyLeanDeg === 0)', () => {
    expect(getMovementProfile('IDLE_READY').bodyLeanDeg).toBe(0)
    expect(getMovementProfile('RECEIVE_READY').bodyLeanDeg).toBe(0)
    expect(getMovementProfile('SHOT_READY').bodyLeanDeg).toBe(0)
    expect(getMovementProfile('RESET_HOLD').bodyLeanDeg).toBe(0)
    // JAB_OR_RIP is stationary motion-class but receives an override —
    // even with the override the lean must remain 0 so a jab does not
    // tip the figure.
    expect(getMovementProfile('JAB_OR_RIP').bodyLeanDeg).toBe(0)
    expect(getMovementProfile('DEFENSIVE_DENY').bodyLeanDeg).toBe(0)
  })

  it('moving offense leans further forward than moving defense', () => {
    const cut = getMovementProfile('BACK_CUT')
    const closeout = getMovementProfile('CLOSEOUT')
    const slide = getMovementProfile('SLIDE_RECOVER')
    expect(cut.bodyLeanDeg).toBeGreaterThan(closeout.bodyLeanDeg)
    expect(closeout.bodyLeanDeg).toBeGreaterThanOrEqual(slide.bodyLeanDeg)
  })

  it('applies BACK_CUT and EMPTY_SPACE_CUT overrides', () => {
    const back = getMovementProfile('BACK_CUT')
    const empty = getMovementProfile('EMPTY_SPACE_CUT')
    expect(back.motionClass).toBe('moving-offense')
    expect(back.bodyLeanDeg).toBe(6)
    expect(empty.bodyLeanDeg).toBe(5)
    // Both still use the athletic ease.
    expect(back.easeName).toBe('easeOutAthletic')
    expect(empty.easeName).toBe('easeOutAthletic')
  })

  it('applies the CLOSEOUT defensive override', () => {
    const profile = getMovementProfile('CLOSEOUT')
    expect(profile.motionClass).toBe('moving-defense')
    expect(profile.easeName).toBe('easeOutDefenseSlide')
    expect(profile.bodyLeanDeg).toBe(3)
    expect(profile.headingFollowS).toBeCloseTo(0.11)
  })

  it('is deterministic — same intent yields equal profiles', () => {
    for (const intent of ALL_ANIMATION_INTENTS) {
      const a = getMovementProfile(intent)
      const b = getMovementProfile(intent)
      expect(a).toEqual(b)
    }
  })

  it('keeps groundedness in [0, 1]', () => {
    for (const intent of ALL_ANIMATION_INTENTS) {
      const p = getMovementProfile(intent)
      expect(p.groundednessFactor).toBeGreaterThanOrEqual(0)
      expect(p.groundednessFactor).toBeLessThanOrEqual(1)
    }
  })
})

describe('getMovementProfileForKind', () => {
  it('routes a defender closeout to the moving-defense profile', () => {
    const profile = getMovementProfileForKind('closeout', 'defense')
    expect(profile.motionClass).toBe('moving-defense')
    expect(profile.easeName).toBe('easeOutDefenseSlide')
  })

  it('routes an offensive cut to moving-offense with athletic ease', () => {
    const profile = getMovementProfileForKind('back_cut', 'offense')
    expect(profile.motionClass).toBe('moving-offense')
    expect(profile.easeName).toBe('easeOutAthletic')
  })

  it("falls back to the IDLE_READY stationary profile for an unknown kind", () => {
    // 'idle' is not a SceneMovementKind — cast through any to verify
    // the helper defends against drift between this module and
    // the scene schema. The fallback comes from getMovementKindIntent
    // → IDLE_READY → stationary profile.
    const profile = getMovementProfileForKind(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      'idle' as any,
      'offense',
    )
    expect(profile.motionClass).toBe('stationary')
    expect(profile.bodyLeanDeg).toBe(0)
  })
})

describe('easeOutDefenseSlide', () => {
  it('hits exact endpoints at 0 and 1', () => {
    expect(easeOutDefenseSlide(0)).toBe(0)
    expect(easeOutDefenseSlide(1)).toBe(1)
  })

  it('clamps below 0 and above 1 to the boundary values', () => {
    expect(easeOutDefenseSlide(-0.4)).toBe(0)
    expect(easeOutDefenseSlide(1.4)).toBe(1)
  })

  it('stays monotonically increasing across the unit interval', () => {
    let prev = -1
    for (let i = 0; i <= 20; i++) {
      const u = i / 20
      const v = easeOutDefenseSlide(u)
      expect(v).toBeGreaterThanOrEqual(prev)
      prev = v
    }
  })

  it('keeps every output inside [0, 1]', () => {
    for (let i = 0; i <= 100; i++) {
      const u = i / 100
      const v = easeOutDefenseSlide(u)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })
})

describe('resolveEase', () => {
  it('returns a callable function for every ease name', () => {
    const names: MovementEaseName[] = [
      'easeInOutCubic',
      'easeOutAthletic',
      'easeOutDefenseSlide',
    ]
    for (const name of names) {
      const fn = resolveEase(name)
      expect(typeof fn).toBe('function')
      expect(fn(0)).toBe(0)
      expect(fn(1)).toBe(1)
    }
  })

  it('produces front-loaded values for easeOutAthletic at u=0.5', () => {
    const athletic = resolveEase('easeOutAthletic')(0.5)
    expect(athletic).toBeGreaterThan(0.5)
  })
})

describe('bodyLeanAxis', () => {
  it('returns null when magnitude is below the floor', () => {
    expect(bodyLeanAxis(0, 0)).toBeNull()
    expect(bodyLeanAxis(0.01, 0.01)).toBeNull()
  })

  it('returns a unit-magnitude vector for a real heading', () => {
    const axis = bodyLeanAxis(3, 4)!
    expect(axis).toBeTruthy()
    const mag = Math.sqrt(axis.x * axis.x + axis.z * axis.z)
    expect(mag).toBeCloseTo(1)
  })

  it('handles negative components correctly', () => {
    const axis = bodyLeanAxis(-3, -4)!
    expect(axis.x).toBeCloseTo(-3 / 5)
    expect(axis.z).toBeCloseTo(-4 / 5)
  })
})
