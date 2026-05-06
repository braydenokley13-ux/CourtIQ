/**
 * V2-C — cinematic camera transition tests.
 *
 * Locks the policy contract:
 *
 *  1. Same mode → same mode returns the legacy 0.18s baseline (no
 *     visible transition).
 *  2. Every (from, to) pair returns a finite τ inside [0.10, 0.60].
 *  3. Teaching-cut transitions are always slower than incidental
 *     base-to-base transitions, and faster than the top-down lift.
 *  4. Returning from a teaching preset to broadcast is faster than
 *     entering one (so the answer demo's tail does not overstay).
 *  5. The kind label and the τ value agree (kind is a stable surface
 *     for tests / debug overlays).
 *  6. Unknown mode strings fall back to the legacy baseline so a
 *     stale `?camera=` URL cannot stall the camera.
 */

import { describe, it, expect } from 'vitest'
import {
  LEGACY_CAMERA_EASE_S,
  getCameraTransitionEaseS,
  getCameraTransitionKind,
} from './cameraTransitions'
import type { CameraMode } from '@/components/scenario3d/imperativeScene'

const MODES: CameraMode[] = [
  'auto',
  'broadcast',
  'tactical',
  'follow',
  'replay',
  'teaching-angle',
  'player-read-angle',
  'help-defense-angle',
  'top-down-coach-board',
]

describe('getCameraTransitionEaseS', () => {
  it('returns the legacy baseline for same-mode transitions', () => {
    for (const mode of MODES) {
      expect(getCameraTransitionEaseS(mode, mode)).toBe(LEGACY_CAMERA_EASE_S)
    }
  })

  it('returns finite values inside [0.10, 0.60] for every pair', () => {
    for (const a of MODES) {
      for (const b of MODES) {
        const t = getCameraTransitionEaseS(a, b)
        expect(Number.isFinite(t)).toBe(true)
        expect(t).toBeGreaterThanOrEqual(0.1)
        expect(t).toBeLessThanOrEqual(0.6)
      }
    }
  })

  it('rides a slower curve when entering a teaching preset from broadcast', () => {
    const teachIn = getCameraTransitionEaseS('broadcast', 'teaching-angle')
    const baseSwap = getCameraTransitionEaseS('broadcast', 'follow')
    expect(teachIn).toBeGreaterThan(baseSwap)
  })

  it('exits a teaching preset back to broadcast faster than it entered', () => {
    const teachIn = getCameraTransitionEaseS('broadcast', 'teaching-angle')
    const teachOut = getCameraTransitionEaseS('teaching-angle', 'broadcast')
    expect(teachOut).toBeLessThan(teachIn)
  })

  it('rides the slowest curve for top-down lifts', () => {
    const lift = getCameraTransitionEaseS('broadcast', 'top-down-coach-board')
    const teachIn = getCameraTransitionEaseS('broadcast', 'teaching-angle')
    expect(lift).toBeGreaterThan(teachIn)
  })

  it('SKR freeze (broadcast → help-defense-angle) is a teach-in', () => {
    expect(getCameraTransitionKind('broadcast', 'help-defense-angle')).toBe(
      'teach-in',
    )
  })

  it('teach-pivot fires on freeze→replay decoder cuts', () => {
    expect(getCameraTransitionKind('teaching-angle', 'player-read-angle')).toBe(
      'teach-pivot',
    )
  })

  it('falls back to the legacy baseline for unknown mode strings', () => {
    expect(getCameraTransitionEaseS('not-a-mode' as CameraMode, 'broadcast')).toBe(
      LEGACY_CAMERA_EASE_S,
    )
    expect(getCameraTransitionEaseS('broadcast', 'gibberish' as CameraMode)).toBe(
      LEGACY_CAMERA_EASE_S,
    )
  })

  it('kind labels agree with relative τ ordering', () => {
    const incidental = getCameraTransitionEaseS('auto', 'follow')
    const teachIn = getCameraTransitionEaseS('broadcast', 'teaching-angle')
    const lift = getCameraTransitionEaseS('broadcast', 'top-down-coach-board')

    expect(getCameraTransitionKind('auto', 'follow')).toBe('incidental')
    expect(getCameraTransitionKind('broadcast', 'teaching-angle')).toBe(
      'teach-in',
    )
    expect(getCameraTransitionKind('broadcast', 'top-down-coach-board')).toBe(
      'top-down-lift',
    )

    expect(incidental).toBeLessThan(teachIn)
    expect(teachIn).toBeLessThan(lift)
  })
})
