/**
 * freezeFrameCognition — bug-fix regression tests.
 *
 * Pin two P1 fixes that were silently dropping action / advantage
 * beats:
 *   1. drive_cut_preview must hydrate to a schema-valid OverlayBeat
 *      so the ESC + AOR action beats survive hydrateFreezeBeats.
 *   2. SKR's advantage beat uses 'open_space_region', which only
 *      hydrates from a court-point anchor — vacated_zone, not a
 *      player-id anchor like 'open_player'.
 */

import { describe, expect, it } from 'vitest'

import {
  getFreezeBeatTemplates,
  hydrateFreezeBeats,
  type FreezeBeatAnchors,
} from './freezeFrameCognition'

const FULL_ANCHORS: FreezeBeatAnchors = {
  cue_defender: 'd1',
  cue_offensive: 'o1',
  cutter: 'o2',
  receiver: 'o3',
  open_player: 'o4',
  passer: 'o5',
  vacated_zone: { x: 1, z: 2 },
  open_rim_zone: { x: 0, z: 0 },
  closeout_target: { x: 3, z: 4 },
}

describe('hydrateFreezeBeats — drive_cut_preview hydration (P1 fix)', () => {
  it('emits the ESC action beat (drive_cut_preview from cutter)', () => {
    const beats = hydrateFreezeBeats(
      'EMPTY_SPACE_CUT',
      getFreezeBeatTemplates('EMPTY_SPACE_CUT'),
      FULL_ANCHORS,
    )
    const action = beats.find((b) => b.primitive.kind === 'drive_cut_preview')
    expect(action).toBeDefined()
    if (action && action.primitive.kind === 'drive_cut_preview') {
      expect(action.primitive.playerId).toBeTruthy()
      expect(action.primitive.path.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('emits the AOR action beat (drive_cut_preview from receiver)', () => {
    const beats = hydrateFreezeBeats(
      'ADVANTAGE_OR_RESET',
      getFreezeBeatTemplates('ADVANTAGE_OR_RESET'),
      FULL_ANCHORS,
    )
    const action = beats.find((b) => b.primitive.kind === 'drive_cut_preview')
    expect(action).toBeDefined()
  })

  it('still skips drive_cut_preview when the player anchor is missing', () => {
    const partial: FreezeBeatAnchors = { ...FULL_ANCHORS, receiver: undefined, cutter: undefined }
    const aor = hydrateFreezeBeats(
      'ADVANTAGE_OR_RESET',
      getFreezeBeatTemplates('ADVANTAGE_OR_RESET'),
      partial,
    )
    const esc = hydrateFreezeBeats(
      'EMPTY_SPACE_CUT',
      getFreezeBeatTemplates('EMPTY_SPACE_CUT'),
      partial,
    )
    expect(aor.find((b) => b.primitive.kind === 'drive_cut_preview')).toBeUndefined()
    expect(esc.find((b) => b.primitive.kind === 'drive_cut_preview')).toBeUndefined()
  })
})

describe('hydrateFreezeBeats — SKR advantage anchor (P1 fix)', () => {
  it('emits the SKR advantage beat from a court-point anchor (vacated_zone)', () => {
    const beats = hydrateFreezeBeats(
      'SKIP_THE_ROTATION',
      getFreezeBeatTemplates('SKIP_THE_ROTATION'),
      FULL_ANCHORS,
    )
    const advantage = beats.find((b) => b.primitive.kind === 'open_space_region')
    expect(advantage).toBeDefined()
  })

  it('skips the SKR advantage beat when vacated_zone is missing', () => {
    const noZone: FreezeBeatAnchors = { ...FULL_ANCHORS, vacated_zone: undefined }
    const beats = hydrateFreezeBeats(
      'SKIP_THE_ROTATION',
      getFreezeBeatTemplates('SKIP_THE_ROTATION'),
      noZone,
    )
    expect(beats.find((b) => b.primitive.kind === 'open_space_region')).toBeUndefined()
  })

  it('still emits the full SKR cue → action → advantage trio when anchors are present', () => {
    const beats = hydrateFreezeBeats(
      'SKIP_THE_ROTATION',
      getFreezeBeatTemplates('SKIP_THE_ROTATION'),
      FULL_ANCHORS,
    )
    const kinds = beats.map((b) => b.primitive.kind)
    expect(kinds).toContain('help_pulse')
    expect(kinds).toContain('passing_lane_open')
    expect(kinds).toContain('open_space_region')
  })
})
