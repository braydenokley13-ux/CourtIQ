/**
 * V1 Premiumization — Fullscreen Composition tests.
 *
 * Locked contracts:
 *  1. Every aspect category returns a finite framing.
 *  2. Padding stays inside (0.5, 1.5) — never produces a degenerate
 *     dolly that would crash the camera into the floor or push it
 *     past the auto-fit's far plane.
 *  3. Wider canvases reserve at least as much floor envelope as
 *     narrower canvases (monotone non-decreasing) — a regression
 *     here would mean a 21:9 player saw less court than 16:9.
 *  4. Portrait phone band tightens the envelope so the figure stays
 *     the subject — but never below a basketball-readable floor.
 *  5. safeFullscreenAspect coerces NaN / 0 / negative inputs to a
 *     16:9 fallback so the renderer never feeds NaN to perspective.
 *  6. The 16:9 desktop case matches the renderer's pre-V1 baseline
 *     so existing /train sessions are not visually altered.
 *  7. getGymShellExtensionFt grows monotonically with aspect — the
 *     gym shell at ultrawide must extend further than at 4:3.
 */

import { describe, it, expect } from 'vitest'
import {
  HALF_COURT_HALF_WIDTH_FT,
  HALF_COURT_LENGTH_FT,
  composeFullscreenFraming,
  getFullscreenSafeArea,
  getGymShellExtensionFt,
  safeFullscreenAspect,
} from './fullscreenComposition'

describe('composeFullscreenFraming', () => {
  it('returns finite values for every reasonable aspect', () => {
    const aspects = [0.5, 0.62, 0.8, 1.0, 1.33, 1.6, 1.78, 1.9, 2.1, 2.5, 3.0]
    for (const a of aspects) {
      const f = composeFullscreenFraming(a)
      expect(Number.isFinite(f.floorXHalfFt)).toBe(true)
      expect(Number.isFinite(f.floorZMinFt)).toBe(true)
      expect(Number.isFinite(f.floorZMaxFt)).toBe(true)
      expect(Number.isFinite(f.padding)).toBe(true)
      expect(Number.isFinite(f.lookAtLiftFt)).toBe(true)
      expect(f.floorZMaxFt).toBeGreaterThan(f.floorZMinFt)
    }
  })

  it('keeps padding in a safe (0.5, 1.5) band', () => {
    const aspects = [0.4, 0.62, 0.8, 1.0, 1.33, 1.78, 2.1, 2.5, 3.5]
    for (const a of aspects) {
      const f = composeFullscreenFraming(a)
      expect(f.padding).toBeGreaterThan(0.5)
      expect(f.padding).toBeLessThan(1.5)
    }
  })

  it('returns the renderer baseline at 16:9 (1.78)', () => {
    const f = composeFullscreenFraming(1.78)
    expect(f.floorXHalfFt).toBe(19)
    expect(f.floorZMinFt).toBe(0)
    expect(f.floorZMaxFt).toBe(24)
  })

  it('reserves more floor on ultrawide than on standard desktop', () => {
    const desktop = composeFullscreenFraming(1.78)
    const ultrawide = composeFullscreenFraming(2.4)
    expect(ultrawide.floorXHalfFt).toBeGreaterThan(desktop.floorXHalfFt)
    expect(ultrawide.floorZMaxFt).toBeGreaterThan(desktop.floorZMaxFt)
  })

  it('tightens to the action zone on portrait phones', () => {
    const portrait = composeFullscreenFraming(0.6)
    const desktop = composeFullscreenFraming(1.78)
    expect(portrait.floorXHalfFt).toBeLessThan(desktop.floorXHalfFt)
    // But it still keeps the paint + arc readable — paint is 16ft wide.
    expect(portrait.floorXHalfFt).toBeGreaterThanOrEqual(8)
    expect(portrait.floorZMaxFt).toBeGreaterThanOrEqual(20)
  })

  it('coerces non-finite or non-positive aspects to the baseline', () => {
    expect(composeFullscreenFraming(NaN).floorXHalfFt).toBe(19)
    expect(composeFullscreenFraming(0).floorXHalfFt).toBe(19)
    expect(composeFullscreenFraming(-1.7).floorXHalfFt).toBe(19)
  })
})

describe('getFullscreenSafeArea', () => {
  it('mirrors composeFullscreenFraming for floor extents', () => {
    for (const a of [0.6, 1.0, 1.78, 2.4]) {
      const safe = getFullscreenSafeArea(a)
      const framing = composeFullscreenFraming(a)
      expect(safe.xHalf).toBe(framing.floorXHalfFt)
      expect(safe.zMin).toBe(framing.floorZMinFt)
      expect(safe.zMax).toBe(framing.floorZMaxFt)
    }
  })

  it('safe area never exceeds the half-court itself', () => {
    for (const a of [0.6, 1.0, 1.78, 2.4]) {
      const safe = getFullscreenSafeArea(a)
      expect(safe.xHalf).toBeLessThanOrEqual(HALF_COURT_HALF_WIDTH_FT)
      expect(safe.zMax).toBeLessThanOrEqual(HALF_COURT_LENGTH_FT)
    }
  })

  it('grows monotonically across the four aspect bands', () => {
    const portrait = getFullscreenSafeArea(0.6)
    const square = getFullscreenSafeArea(1.0)
    const desktop = getFullscreenSafeArea(1.78)
    const ultra = getFullscreenSafeArea(2.4)
    // X axis: portrait tightens, then non-decreasing through square →
    // desktop → ultra.
    expect(square.xHalf).toBeGreaterThanOrEqual(portrait.xHalf)
    expect(desktop.xHalf).toBeGreaterThanOrEqual(square.xHalf)
    expect(ultra.xHalf).toBeGreaterThanOrEqual(desktop.xHalf)
  })
})

describe('safeFullscreenAspect', () => {
  it('falls back to 16:9 for invalid inputs', () => {
    expect(safeFullscreenAspect(0, 720)).toBeCloseTo(16 / 9)
    expect(safeFullscreenAspect(1280, 0)).toBeCloseTo(16 / 9)
    expect(safeFullscreenAspect(NaN, 720)).toBeCloseTo(16 / 9)
    expect(safeFullscreenAspect(1280, NaN)).toBeCloseTo(16 / 9)
    expect(safeFullscreenAspect(-1, 720)).toBeCloseTo(16 / 9)
  })

  it('returns the right ratio for valid inputs', () => {
    expect(safeFullscreenAspect(1920, 1080)).toBeCloseTo(1.778, 2)
    expect(safeFullscreenAspect(2560, 1080)).toBeCloseTo(2.37, 2)
    expect(safeFullscreenAspect(390, 844)).toBeCloseTo(0.462, 2)
  })
})

describe('getGymShellExtensionFt', () => {
  it('grows monotonically with aspect', () => {
    const portrait = getGymShellExtensionFt(0.6)
    const desktop = getGymShellExtensionFt(1.78)
    const ultra = getGymShellExtensionFt(2.4)
    expect(desktop.xExtensionFt).toBeGreaterThanOrEqual(portrait.xExtensionFt)
    expect(ultra.xExtensionFt).toBeGreaterThanOrEqual(desktop.xExtensionFt)
    expect(desktop.zBackExtensionFt).toBeGreaterThanOrEqual(portrait.zBackExtensionFt)
    expect(ultra.zBackExtensionFt).toBeGreaterThanOrEqual(desktop.zBackExtensionFt)
  })

  it('falls back to a sane default for invalid aspects', () => {
    const result = getGymShellExtensionFt(NaN)
    expect(result.xExtensionFt).toBeGreaterThan(0)
    expect(result.zBackExtensionFt).toBeGreaterThan(0)
  })
})
