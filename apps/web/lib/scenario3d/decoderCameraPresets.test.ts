/**
 * Pack 2 (Phase β) — DROP camera preset dispatch tests.
 *
 * Locks two contracts:
 *
 *   1. DROP (READ_THE_COVERAGE) resolves to a single-freeze top-down
 *      preset and declares NO `secondBeat`. The runtime uses
 *      `isSingleFreezeDecoder` to gate the chained-freeze bridge
 *      transition; if DROP grew a second beat by accident, the gate
 *      would silently let the HUNT-only bridge fire on a DROP rep.
 *
 *   2. The Pack 1 founder camera presets (BDW / ESC / SKR / AOR) are
 *      bit-identical to their pre-DROP values. This is the regression
 *      anchor for "DROP authoring did not change Pack 1 framing."
 */

import { describe, expect, it } from 'vitest'
import {
  DECODER_CAMERA_PRESETS,
  cameraMatchesDecoderPreset,
  getDecoderCameraPreset,
  isSingleFreezeDecoder,
} from './decoderCameraPresets'

describe('DECODER_CAMERA_PRESETS — Pack 1 regression lock', () => {
  it('keeps BDW on passer_side_three_quarter, single freeze', () => {
    const p = getDecoderCameraPreset('BACKDOOR_WINDOW')
    expect(p.firstBeat).toBe('passer_side_three_quarter')
    expect(p.secondBeat).toBeUndefined()
  })

  it('keeps ESC on teaching_angle, single freeze', () => {
    const p = getDecoderCameraPreset('EMPTY_SPACE_CUT')
    expect(p.firstBeat).toBe('teaching_angle')
    expect(p.secondBeat).toBeUndefined()
  })

  it('keeps SKR on top_down, single freeze', () => {
    const p = getDecoderCameraPreset('SKIP_THE_ROTATION')
    expect(p.firstBeat).toBe('top_down')
    expect(p.secondBeat).toBeUndefined()
  })

  it('keeps AOR on defense, single freeze', () => {
    const p = getDecoderCameraPreset('ADVANTAGE_OR_RESET')
    expect(p.firstBeat).toBe('defense')
    expect(p.secondBeat).toBeUndefined()
  })

  it('keeps HUNT as the only chained-freeze decoder', () => {
    const p = getDecoderCameraPreset('HUNT_THE_ADVANTAGE')
    expect(p.firstBeat).toBe('teaching_angle')
    expect(p.secondBeat).toBe('passer_side_three_quarter')
  })
})

describe('Pack 2 (Phase β) — DROP camera preset', () => {
  it('resolves to a single-freeze top_down preset', () => {
    const p = getDecoderCameraPreset('READ_THE_COVERAGE')
    expect(p.firstBeat).toBe('top_down')
    expect(p.secondBeat).toBeUndefined()
  })

  it('matches the DROP authoring default via cameraMatchesDecoderPreset', () => {
    expect(cameraMatchesDecoderPreset('READ_THE_COVERAGE', 'top_down')).toBe(true)
    expect(cameraMatchesDecoderPreset('READ_THE_COVERAGE', 'teaching_angle')).toBe(
      false,
    )
  })

  it('is registered as a single-freeze decoder (not chained)', () => {
    expect(isSingleFreezeDecoder('READ_THE_COVERAGE')).toBe(true)
    // Pack 1 founders are also single-freeze.
    expect(isSingleFreezeDecoder('BACKDOOR_WINDOW')).toBe(true)
    expect(isSingleFreezeDecoder('EMPTY_SPACE_CUT')).toBe(true)
    expect(isSingleFreezeDecoder('SKIP_THE_ROTATION')).toBe(true)
    expect(isSingleFreezeDecoder('ADVANTAGE_OR_RESET')).toBe(true)
    // HUNT is the chained-freeze decoder, so the gate must reject it.
    expect(isSingleFreezeDecoder('HUNT_THE_ADVANTAGE')).toBe(false)
  })
})

describe('DECODER_CAMERA_PRESETS — map shape', () => {
  it('is frozen at module load', () => {
    expect(Object.isFrozen(DECODER_CAMERA_PRESETS)).toBe(true)
  })

  it('has exactly one entry per known decoder tag', () => {
    const keys = Object.keys(DECODER_CAMERA_PRESETS).sort()
    expect(keys).toEqual([
      'ADVANTAGE_OR_RESET',
      'BACKDOOR_WINDOW',
      'EMPTY_SPACE_CUT',
      'HUNT_THE_ADVANTAGE',
      'READ_THE_COVERAGE',
      'SKIP_THE_ROTATION',
    ])
  })
})
