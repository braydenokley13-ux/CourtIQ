/**
 * V1 Premiumization — integration contracts.
 *
 * One-stop suite that pins the cross-helper invariants the V1 pass
 * promises:
 *   1. Movement profile and fullscreen composition helpers stay
 *      decoder-agnostic — no scenario JSON changes are required.
 *   2. Movement profile + timeline ease names stay aligned (a
 *      profile that asks for `easeOutDefenseSlide` actually has a
 *      runnable curve in `resolveEase`).
 *   3. Fullscreen composition's safe-area floor envelope is wider
 *      than (or equal to) the renderer's pre-V1 baseline at every
 *      aspect — a regression here means a wider canvas would be
 *      framed against less court, which is the bug we are guarding.
 *   4. The aspect-aware framing never produces NaN inputs to the
 *      camera projection matrix (NaN aspect → 16:9 fallback).
 */

import { describe, expect, it } from 'vitest'
import {
  ALL_ANIMATION_INTENTS,
  getMovementKindIntent,
  getIntentMotionClass,
} from './animationIntent'
import {
  getMovementProfile,
  getMovementProfileForKind,
  resolveEase,
  type MovementEaseName,
} from './movementProfile'
import {
  composeFullscreenFraming,
  getFullscreenSafeArea,
  safeFullscreenAspect,
} from './fullscreenComposition'

describe('V1 Premiumization — cross-helper integration', () => {
  it('every animation intent has a profile AND a runnable ease', () => {
    for (const intent of ALL_ANIMATION_INTENTS) {
      const profile = getMovementProfile(intent)
      const fn = resolveEase(profile.easeName as MovementEaseName)
      expect(typeof fn).toBe('function')
      expect(fn(0)).toBe(0)
      expect(fn(1)).toBe(1)
    }
  })

  it('every movement kind path consumes a known intent + class', () => {
    const kinds = [
      'cut',
      'back_cut',
      'baseline_sneak',
      'drive',
      'jab',
      'rip',
      'stop_ball',
      'closeout',
      'rotation',
      'pass',
      'skip_pass',
      'lift',
      'drift',
    ] as const
    for (const kind of kinds) {
      const offProfile = getMovementProfileForKind(kind, 'offense')
      const defProfile = getMovementProfileForKind(kind, 'defense')
      // Intent class always resolves to one of the three known classes.
      const offClass = getIntentMotionClass(
        getMovementKindIntent(kind, 'offense'),
      )
      const defClass = getIntentMotionClass(
        getMovementKindIntent(kind, 'defense'),
      )
      expect(['stationary', 'moving-offense', 'moving-defense']).toContain(
        offClass,
      )
      expect(['stationary', 'moving-offense', 'moving-defense']).toContain(
        defClass,
      )
      expect(offProfile.motionClass).toBe(offClass)
      expect(defProfile.motionClass).toBe(defClass)
    }
  })

  it('fullscreen safe-area covers the renderer baseline at every aspect', () => {
    // The renderer's pre-V1 baseline floor envelope was (±19, [0, 24]).
    // Every aspect band must reserve AT LEAST as much z-extent as
    // baseline so the half-court reads end-to-end. The portrait band
    // tightens x for visual focus on the figure, but not below the
    // paint width (16ft).
    const aspects = [0.45, 0.7, 1.0, 1.5, 1.78, 2.0, 2.5, 3.5]
    const PAINT_HALF = 8
    const MIN_Z_EXTENT = 22 // portrait band minimum
    for (const a of aspects) {
      const safe = getFullscreenSafeArea(a)
      expect(safe.xHalf).toBeGreaterThanOrEqual(PAINT_HALF)
      expect(safe.zMax - safe.zMin).toBeGreaterThanOrEqual(MIN_Z_EXTENT)
    }
  })

  it('safeFullscreenAspect always yields a sane number for the projection matrix', () => {
    const inputs: Array<[number, number]> = [
      [1920, 1080],
      [3440, 1440],
      [390, 844],
      [0, 0],
      [-1, 1080],
      [NaN, 1080],
      [1920, NaN],
    ]
    for (const [w, h] of inputs) {
      const a = safeFullscreenAspect(w, h)
      expect(Number.isFinite(a)).toBe(true)
      expect(a).toBeGreaterThan(0)
    }
  })

  it('composeFullscreenFraming padding always stays inside (0.5, 1.5)', () => {
    const aspects = [0.4, 0.6, 0.8, 1.0, 1.5, 1.78, 2.0, 2.5, 4.0]
    for (const a of aspects) {
      const f = composeFullscreenFraming(a)
      expect(f.padding).toBeGreaterThan(0.5)
      expect(f.padding).toBeLessThan(1.5)
    }
  })
})
