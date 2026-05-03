import { describe, expect, it } from 'vitest'

import {
  DECODER_OVERLAY_PRESETS,
  MAX_FREEZE_OVERLAYS_BEGINNER,
  MAX_OVERLAYS_ADVANCED,
  MAX_OVERLAYS_INTERMEDIATE,
  MAX_REPLAY_OVERLAYS_BEGINNER,
  applyOverlayPreset,
  getDecoderOverlayPreset,
  getOverlayClutterCap,
  presetPreAnswerKindsAreAllAllowed,
  type RoleResolutionMap,
} from './decoderOverlayPresets'
import { isAllowedPreAnswerOverlay, sceneSchema } from './schema'

describe('Decoder overlay preset map (P3.0)', () => {
  const FOUNDER_DECODERS = [
    'BACKDOOR_WINDOW',
    'ADVANTAGE_OR_RESET',
    'EMPTY_SPACE_CUT',
    'SKIP_THE_ROTATION',
  ] as const

  it('has a preset for every founder decoder', () => {
    for (const tag of FOUNDER_DECODERS) {
      const preset = getDecoderOverlayPreset(tag)
      expect(preset.decoder).toBe(tag)
      expect(preset.preAnswer.length).toBeGreaterThan(0)
      expect(preset.postAnswer.length).toBeGreaterThan(0)
    }
  })

  it('every preset preAnswer kind is in the schema pre-answer allow-list', () => {
    for (const tag of FOUNDER_DECODERS) {
      const preset = getDecoderOverlayPreset(tag)
      expect(presetPreAnswerKindsAreAllAllowed(preset)).toBe(true)
      for (const t of preset.preAnswer) {
        expect(isAllowedPreAnswerOverlay(t.kind)).toBe(true)
      }
    }
  })

  it('every preset preAnswer cluster fits the beginner clutter cap', () => {
    for (const tag of FOUNDER_DECODERS) {
      const preset = getDecoderOverlayPreset(tag)
      if (preset.defaultTier === 'beginner') {
        expect(preset.preAnswer.length).toBeLessThanOrEqual(
          MAX_FREEZE_OVERLAYS_BEGINNER,
        )
        expect(preset.postAnswer.length).toBeLessThanOrEqual(
          MAX_REPLAY_OVERLAYS_BEGINNER,
        )
      }
    }
  })

  it('clutter caps form a monotonic progression (beginner < intermediate < advanced)', () => {
    expect(MAX_FREEZE_OVERLAYS_BEGINNER).toBeLessThan(MAX_OVERLAYS_INTERMEDIATE)
    expect(MAX_REPLAY_OVERLAYS_BEGINNER).toBeLessThan(MAX_OVERLAYS_INTERMEDIATE)
    expect(MAX_OVERLAYS_INTERMEDIATE).toBeLessThan(MAX_OVERLAYS_ADVANCED)
  })

  it('getOverlayClutterCap returns the matching constant for each (phase, tier)', () => {
    expect(getOverlayClutterCap('pre', 'beginner')).toBe(MAX_FREEZE_OVERLAYS_BEGINNER)
    expect(getOverlayClutterCap('post', 'beginner')).toBe(MAX_REPLAY_OVERLAYS_BEGINNER)
    expect(getOverlayClutterCap('pre', 'intermediate')).toBe(MAX_OVERLAYS_INTERMEDIATE)
    expect(getOverlayClutterCap('post', 'intermediate')).toBe(MAX_OVERLAYS_INTERMEDIATE)
    expect(getOverlayClutterCap('pre', 'advanced')).toBe(MAX_OVERLAYS_ADVANCED)
    expect(getOverlayClutterCap('post', 'advanced')).toBe(MAX_OVERLAYS_ADVANCED)
  })

  it('DECODER_OVERLAY_PRESETS is frozen', () => {
    expect(Object.isFrozen(DECODER_OVERLAY_PRESETS)).toBe(true)
  })
})

describe('applyOverlayPreset (P3.0)', () => {
  // BDW-style scenario: the deny defender is x2, the cutter is the user,
  // the passer is pg. Anchor the rim window at (3, 2). Drive preview path
  // is the same shape the founder JSON authors.
  const BDW_MAP: RoleResolutionMap = {
    roleToPlayerId: {
      cutter: 'user',
      passer: 'pg',
      deny_defender: 'x2',
    },
    anchorToPoint: {
      rim: { x: 3, z: 2 },
    },
    drivePreviewPathByRole: {
      cutter: [
        { x: 18, z: 8 },
        { x: 4, z: 2 },
      ],
    },
  }

  it('compiles BDW preset into validated OverlayPrimitive arrays', () => {
    const preset = getDecoderOverlayPreset('BACKDOOR_WINDOW')
    const out = applyOverlayPreset(preset, BDW_MAP)
    expect(out.preAnswer.length).toBeGreaterThan(0)
    expect(out.postAnswer.length).toBeGreaterThan(0)
    expect(out.skipped).toBe(0)

    // Build a minimal scene that the schema can parse, then assert the
    // emitted primitives pass referential-integrity checks.
    const scene = {
      court: 'half',
      players: [
        { id: 'pg', team: 'offense', role: 'ball_handler', start: { x: -9, z: 14 }, hasBall: true },
        { id: 'user', team: 'offense', role: 'wing', start: { x: 18, z: 8 }, isUser: true },
        { id: 'x2', team: 'defense', role: 'denying', start: { x: 15, z: 10 } },
      ],
      ball: { start: { x: -9, z: 14 }, holderId: 'pg' },
      preAnswerOverlays: out.preAnswer,
      postAnswerOverlays: out.postAnswer,
    }
    const parsed = sceneSchema.safeParse(scene)
    expect(parsed.success).toBe(true)
  })

  it('skips primitives whose roles are not mapped (no throw)', () => {
    const preset = getDecoderOverlayPreset('BACKDOOR_WINDOW')
    const partial: RoleResolutionMap = {
      roleToPlayerId: { cutter: 'user' }, // missing deny_defender, passer
      anchorToPoint: {},
    }
    const out = applyOverlayPreset(preset, partial)
    expect(out.skipped).toBeGreaterThan(0)
    // Nothing in the output should reference an unmapped id.
    for (const ov of out.preAnswer) {
      if ('playerId' in ov) expect(ov.playerId).toBe('user')
    }
  })

  it('is pure — same input twice produces deep-equal output', () => {
    const preset = getDecoderOverlayPreset('BACKDOOR_WINDOW')
    const a = applyOverlayPreset(preset, BDW_MAP)
    const b = applyOverlayPreset(preset, BDW_MAP)
    expect(a).toEqual(b)
  })

  it('emits no NaN / Infinity in numeric overlay fields', () => {
    const preset = getDecoderOverlayPreset('ADVANTAGE_OR_RESET')
    const map: RoleResolutionMap = {
      roleToPlayerId: {
        receiver: 'user',
        passer: 'pg',
        closeout_defender: 'x2',
        low_man: 'x4',
      },
      anchorToPoint: {
        shooting_pocket: { x: 16, z: 10 },
      },
      drivePreviewPathByRole: {
        receiver: [
          { x: 16, z: 9 },
          { x: 18, z: 2 },
        ],
      },
    }
    const out = applyOverlayPreset(preset, map)
    const allNumbers: number[] = []
    for (const ov of [...out.preAnswer, ...out.postAnswer]) {
      if ('anchor' in ov && typeof ov.anchor === 'object') {
        allNumbers.push(ov.anchor.x, ov.anchor.z)
      }
      if ('radiusFt' in ov) allNumbers.push(ov.radiusFt)
      if ('durationMs' in ov && typeof ov.durationMs === 'number') {
        allNumbers.push(ov.durationMs)
      }
      if (ov.kind === 'drive_cut_preview') {
        for (const p of ov.path) allNumbers.push(p.x, p.z)
      }
    }
    for (const n of allNumbers) {
      expect(Number.isFinite(n)).toBe(true)
    }
  })
})
