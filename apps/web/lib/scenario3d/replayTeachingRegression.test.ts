/**
 * FR-6 — cross-FR regression test.
 *
 * Locks the contracts FR-5 (adaptive overlays) and FR-4 (decoder-aware
 * camera) shipped against the new `cueRepaint` phase introduced in
 * Packet 3. If a future change accidentally widens cueRepaint into a
 * 'post' overlay window or stops resolving to the freeze camera, this
 * suite trips immediately.
 */

import { describe, expect, it } from 'vitest'

import { pickAssistedCameraMode } from './cameraPresets'
import { applyOverlayLevel } from './overlayLevel'
import { getDecoderTeachingLabel } from './replayTeachingTimeline'
import type { DecoderTag, OverlayPrimitive } from './schema'

// FR-5 shape: a cue cluster + a reveal cluster authored against
// the BDW-01 family. Used to verify the projection through the
// level helper and the cueRepaint visibility contract.
const PRE: OverlayPrimitive[] = [
  { kind: 'defender_vision_cone', playerId: 'x2', targetId: 'p1' },
  { kind: 'defender_hip_arrow', playerId: 'x2' },
  { kind: 'defender_hand_in_lane', playerId: 'x2' },
]

const POST: OverlayPrimitive[] = [
  { kind: 'passing_lane_blocked', from: 'p1', to: 'u1' },
  { kind: 'open_space_region', anchor: { x: 0, z: 18 }, radiusFt: 4 },
  {
    kind: 'drive_cut_preview',
    playerId: 'u1',
    path: [
      { x: -10, z: 16 },
      { x: 0, z: 22 },
    ],
  },
]

describe('FR-6 × FR-5 — overlay level semantics across the new cueRepaint phase', () => {
  it('FR-5 budget at every level is unchanged by FR-6', () => {
    const beg = applyOverlayLevel({ preAnswer: PRE, postAnswer: POST, level: 'beginner' })
    expect(beg.preAnswer.length).toBe(3)
    expect(beg.postAnswer.length).toBe(3)
    const adv = applyOverlayLevel({ preAnswer: PRE, postAnswer: POST, level: 'advanced' })
    expect(adv.preAnswer.length).toBe(1)
    expect(adv.postAnswer.length).toBe(1)
    const none = applyOverlayLevel({ preAnswer: PRE, postAnswer: POST, level: 'none' })
    expect(none.preAnswer.length).toBe(0)
    expect(none.postAnswer.length).toBe(0)
  })

  it('FR-5 pre-answer kind allow-list at every level — cueRepaint paints pre-answer overlays so the gate must hold', () => {
    const allowed = new Set([
      'defender_vision_cone',
      'defender_hip_arrow',
      'defender_foot_arrow',
      'defender_chest_line',
      'defender_hand_in_lane',
      'help_pulse',
      'label',
    ])
    for (const level of ['beginner', 'intermediate', 'advanced', 'none', 'review'] as const) {
      const r = applyOverlayLevel({ preAnswer: PRE, postAnswer: POST, level })
      for (const o of r.preAnswer) {
        expect(allowed.has(o.kind)).toBe(true)
      }
    }
  })
})

describe('FR-6 × FR-4 — cameraAssist semantics on cueRepaint', () => {
  const decoders: readonly DecoderTag[] = [
    'BACKDOOR_WINDOW',
    'EMPTY_SPACE_CUT',
    'ADVANTAGE_OR_RESET',
    'SKIP_THE_ROTATION',
  ]

  it('cueRepaint holds the previous preset (returns null) so the camera does not bounce', () => {
    // V1 stabilization — pre-V1 the dispatcher resolved cueRepaint to
    // the freeze preset, which produced a frozen → consequence →
    // cueRepaint → replaying camera bounce on the wrong-pick path
    // (consequence → replay preset, then snap back to freeze, then
    // forward to replay preset again). The dispatcher now holds the
    // previous mode for cueRepaint so the controller eases through
    // the transition without oscillating.
    //
    // Note: `'none'` assist short-circuits to `'broadcast'` before
    // reaching the phase table (boss-mode contract), so cueRepaint
    // resolves to broadcast there — that's still stable across
    // every phase, so no bounce.
    for (const decoder of decoders) {
      for (const assist of ['full', 'partial'] as const) {
        const cue = pickAssistedCameraMode({
          decoder,
          phase: 'cueRepaint',
          assist,
          manualOverride: false,
        })
        expect(cue, `${decoder}/${assist}`).toBeNull()
      }
    }
  })

  it('boss assist (none) still returns broadcast for cueRepaint (no bounce because every phase is broadcast)', () => {
    for (const decoder of decoders) {
      const cue = pickAssistedCameraMode({
        decoder,
        phase: 'cueRepaint',
        assist: 'none',
        manualOverride: false,
      })
      expect(cue, decoder).toBe('broadcast')
    }
  })

  it('cueRepaint defers to manual override just like every other phase', () => {
    for (const decoder of decoders) {
      const cue = pickAssistedCameraMode({
        decoder,
        phase: 'cueRepaint',
        assist: 'full',
        manualOverride: true,
      })
      expect(cue).toBeNull()
    }
  })
})

describe('FR-6 — every founder family has a teaching label', () => {
  const decoders: readonly DecoderTag[] = [
    'BACKDOOR_WINDOW',
    'EMPTY_SPACE_CUT',
    'ADVANTAGE_OR_RESET',
    'SKIP_THE_ROTATION',
  ]

  it('every decoder returns a non-empty label', () => {
    for (const d of decoders) {
      const l = getDecoderTeachingLabel(d)
      expect(l.text.length).toBeGreaterThan(0)
      expect(l.text.length).toBeLessThanOrEqual(24)
    }
  })

  it('every decoder label fits inside the §9.4 5-word maximum', () => {
    for (const d of decoders) {
      const words = getDecoderTeachingLabel(d).text.trim().split(/\s+/)
      expect(words.length).toBeLessThanOrEqual(5)
    }
  })

  it('label anchor roles are scenario-resolvable (cutter / receiver / open_player)', () => {
    const validAnchorRoles = new Set([
      'cutter',
      'receiver',
      'open_player',
      'helper_defender',
      'closeout_defender',
      'deny_defender',
    ])
    for (const d of decoders) {
      expect(validAnchorRoles.has(getDecoderTeachingLabel(d).anchorRole)).toBe(true)
    }
  })
})
