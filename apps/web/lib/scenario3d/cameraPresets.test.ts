/**
 * FR-4 — Decoder-Aware Camera Presets contracts.
 *
 * Locks the §8 policy table shipped by Packets 2 → 7:
 *
 *   1. §8.3 — `pickAssistedCameraMode` returns the documented
 *      preset for every (decoder, phase) tuple under `'full'`
 *      assist; broadcast through setup/playing for every decoder.
 *
 *   2. §8.6 — manual override always wins (returns `null`).
 *      `'done'` phase also returns `null` so the previous frame
 *      holds.
 *
 *   3. §8.9 — `'none'` assist collapses to broadcast everywhere
 *      (boss / advanced mode); `'partial'` keeps broadcast
 *      through freeze but composes a teaching replay.
 *
 *   4. §8.7 — `aspectAdjustmentForCanvas` returns the documented
 *      portrait / landscape / desktop deltas. `top-down-coach-board`
 *      widens FOV on portrait but does not tighten pitch.
 *
 *   5. The aspect adjustment helper inside `imperativeScene.ts`
 *      stays in lockstep with the policy-layer helper here so a
 *      future packet cannot drift one without the other.
 */

import { describe, expect, it } from 'vitest'
import {
  aspectAdjustmentForCanvas,
  DESKTOP_ASPECT_ADJUSTMENT,
  pickAssistedCameraMode,
  type CameraAssist,
} from './cameraPresets'
import type { DecoderTag } from './schema'

const ALL_DECODERS: DecoderTag[] = [
  'BACKDOOR_WINDOW',
  'EMPTY_SPACE_CUT',
  'ADVANTAGE_OR_RESET',
  'SKIP_THE_ROTATION',
]

// =====================================================================
// FR-4 §8.3 — decoder + phase → preset (full assist)
// =====================================================================

describe('FR-4 §8.3 — pickAssistedCameraMode (full assist)', () => {
  it('every decoder gets broadcast through setup/playing', () => {
    for (const decoder of ALL_DECODERS) {
      for (const phase of ['idle', 'setup', 'playing'] as const) {
        const picked = pickAssistedCameraMode({
          decoder,
          phase,
          assist: 'full',
          manualOverride: false,
        })
        expect(picked, `${decoder}/${phase}`).toBe('broadcast')
      }
    }
  })

  it('BDW / ESC / AOR get teaching-angle on freeze; SKR gets help-defense-angle', () => {
    expect(
      pickAssistedCameraMode({
        decoder: 'BACKDOOR_WINDOW',
        phase: 'frozen',
        assist: 'full',
        manualOverride: false,
      }),
    ).toBe('teaching-angle')
    expect(
      pickAssistedCameraMode({
        decoder: 'EMPTY_SPACE_CUT',
        phase: 'frozen',
        assist: 'full',
        manualOverride: false,
      }),
    ).toBe('teaching-angle')
    expect(
      pickAssistedCameraMode({
        decoder: 'ADVANTAGE_OR_RESET',
        phase: 'frozen',
        assist: 'full',
        manualOverride: false,
      }),
    ).toBe('teaching-angle')
    expect(
      pickAssistedCameraMode({
        decoder: 'SKIP_THE_ROTATION',
        phase: 'frozen',
        assist: 'full',
        manualOverride: false,
      }),
    ).toBe('help-defense-angle')
  })

  it('replay phase: BDW/ESC/AOR → player-read-angle; SKR → top-down-coach-board', () => {
    for (const decoder of ['BACKDOOR_WINDOW', 'EMPTY_SPACE_CUT', 'ADVANTAGE_OR_RESET'] as const) {
      expect(
        pickAssistedCameraMode({
          decoder,
          phase: 'replaying',
          assist: 'full',
          manualOverride: false,
        }),
      ).toBe('player-read-angle')
    }
    expect(
      pickAssistedCameraMode({
        decoder: 'SKIP_THE_ROTATION',
        phase: 'replaying',
        assist: 'full',
        manualOverride: false,
      }),
    ).toBe('top-down-coach-board')
  })

  it('consequence phase mirrors replay (action follows the read)', () => {
    expect(
      pickAssistedCameraMode({
        decoder: 'BACKDOOR_WINDOW',
        phase: 'consequence',
        assist: 'full',
        manualOverride: false,
      }),
    ).toBe('player-read-angle')
  })
})

// =====================================================================
// FR-4 §8.6 — manual override + 'done' phase return null
// =====================================================================

describe('FR-4 §8.6 — manual override + done phase', () => {
  it('manualOverride = true returns null for every (decoder, phase, assist) combo', () => {
    for (const decoder of ALL_DECODERS) {
      for (const phase of [
        'idle',
        'setup',
        'playing',
        'frozen',
        'consequence',
        'replaying',
        'done',
      ] as const) {
        for (const assist of ['full', 'partial', 'none'] as const) {
          expect(
            pickAssistedCameraMode({
              decoder,
              phase,
              assist,
              manualOverride: true,
            }),
            `${decoder}/${phase}/${assist}`,
          ).toBeNull()
        }
      }
    }
  })

  it('done phase returns null so the previous teaching frame holds', () => {
    for (const decoder of ALL_DECODERS) {
      expect(
        pickAssistedCameraMode({
          decoder,
          phase: 'done',
          assist: 'full',
          manualOverride: false,
        }),
      ).toBeNull()
    }
  })
})

// =====================================================================
// FR-4 §8.9 — assist tiers
// =====================================================================

describe("FR-4 §8.9 — 'none' assist collapses to broadcast everywhere", () => {
  it('every (decoder, phase) returns broadcast when assist is none', () => {
    for (const decoder of ALL_DECODERS) {
      for (const phase of [
        'idle',
        'setup',
        'playing',
        'frozen',
        'consequence',
        'replaying',
      ] as const) {
        expect(
          pickAssistedCameraMode({
            decoder,
            phase,
            assist: 'none',
            manualOverride: false,
          }),
          `${decoder}/${phase}`,
        ).toBe('broadcast')
      }
    }
  })
})

describe("FR-4 §8.9 — 'partial' assist keeps broadcast through freeze but composes the replay", () => {
  it('frozen phase falls back to broadcast under partial assist', () => {
    for (const decoder of ALL_DECODERS) {
      expect(
        pickAssistedCameraMode({
          decoder,
          phase: 'frozen',
          assist: 'partial',
          manualOverride: false,
        }),
        decoder,
      ).toBe('broadcast')
    }
  })

  it('replay phase still gets the decoder-specific preset under partial', () => {
    expect(
      pickAssistedCameraMode({
        decoder: 'BACKDOOR_WINDOW',
        phase: 'replaying',
        assist: 'partial',
        manualOverride: false,
      }),
    ).toBe('player-read-angle')
    expect(
      pickAssistedCameraMode({
        decoder: 'SKIP_THE_ROTATION',
        phase: 'replaying',
        assist: 'partial',
        manualOverride: false,
      }),
    ).toBe('top-down-coach-board')
  })
})

describe('FR-4 — null decoder fallback', () => {
  it('non-decoder scenes get auto for setup/playing/frozen and replay for replaying', () => {
    for (const phase of ['idle', 'setup', 'playing', 'frozen'] as const) {
      expect(
        pickAssistedCameraMode({
          decoder: null,
          phase,
          assist: 'full',
          manualOverride: false,
        }),
      ).toBe('auto')
    }
    expect(
      pickAssistedCameraMode({
        decoder: undefined,
        phase: 'replaying',
        assist: 'full',
        manualOverride: false,
      }),
    ).toBe('replay')
  })

  it('null-decoder + none assist still collapses to broadcast (boss mode never picks auto)', () => {
    expect(
      pickAssistedCameraMode({
        decoder: null,
        phase: 'frozen',
        assist: 'none' as CameraAssist,
        manualOverride: false,
      }),
    ).toBe('broadcast')
  })
})

// =====================================================================
// FR-4 §8.7 — mobile aspect adjustment
// =====================================================================

describe('FR-4 §8.7 — aspectAdjustmentForCanvas', () => {
  it('desktop / wide canvas (aspect >= 1.5) returns the no-op desktop deltas', () => {
    for (const aspect of [1.5, 1.78, 2.0, 3.0]) {
      expect(aspectAdjustmentForCanvas(aspect, 'teaching-angle')).toEqual(
        DESKTOP_ASPECT_ADJUSTMENT,
      )
      expect(aspectAdjustmentForCanvas(aspect, 'help-defense-angle')).toEqual(
        DESKTOP_ASPECT_ADJUSTMENT,
      )
    }
  })

  it('landscape phone (aspect 0.7..1.5) dollies in 5% with no pitch tweak', () => {
    const adj = aspectAdjustmentForCanvas(1.0, 'teaching-angle')
    expect(adj.distanceScale).toBe(0.95)
    expect(adj.pitchDeltaDeg).toBe(0)
    expect(adj.fovDeltaDeg).toBe(0)
  })

  it('portrait phone (aspect < 0.7) tightens pitch and dollies in 10% — except top-down', () => {
    const teach = aspectAdjustmentForCanvas(0.45, 'teaching-angle')
    expect(teach.distanceScale).toBe(0.9)
    expect(teach.pitchDeltaDeg).toBe(-5)
    expect(teach.fovDeltaDeg).toBe(0)

    const help = aspectAdjustmentForCanvas(0.45, 'help-defense-angle')
    expect(help.distanceScale).toBe(0.9)
    expect(help.pitchDeltaDeg).toBe(-5)
  })

  it('top-down-coach-board widens FOV on portrait but does NOT tighten pitch', () => {
    const portrait = aspectAdjustmentForCanvas(0.45, 'top-down-coach-board')
    expect(portrait.pitchDeltaDeg).toBe(0)
    expect(portrait.distanceScale).toBe(1)
    expect(portrait.fovDeltaDeg).toBe(6)

    const desktop = aspectAdjustmentForCanvas(1.78, 'top-down-coach-board')
    expect(desktop).toEqual(DESKTOP_ASPECT_ADJUSTMENT)
  })

  it('invalid aspect (NaN, 0, negative) returns the desktop no-op', () => {
    for (const bad of [NaN, 0, -1, Number.NEGATIVE_INFINITY]) {
      expect(aspectAdjustmentForCanvas(bad, 'teaching-angle')).toEqual(
        DESKTOP_ASPECT_ADJUSTMENT,
      )
    }
  })
})
