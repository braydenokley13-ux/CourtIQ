/**
 * Pack 2 (Phase γ) — HUNT authoring lint rule tests.
 *
 * Each rule gets one passing case + one failing case so a future
 * regression in either direction surfaces here. Mirrors the shape of
 * `dropAuthoringLint.test.ts`.
 */

import { describe, expect, it } from 'vitest'
import {
  HUNT_COGNITION_HOLD_CEILING_MS,
  HUNT_PER_BEAT_CUE_CAP_BEGINNER,
  lintHuntBeatCueCaps,
  lintHuntBeatSpecRequired,
  lintHuntCoachValidation,
  lintHuntCognitionHoldFloor,
  lintHuntInterBeatDeterminism,
  lintHuntVariant,
  type HuntLintSceneInput,
  type HuntLintVariantMeta,
} from './huntAuthoringLint'

function baseHuntScene(): HuntLintSceneInput {
  return {
    preAnswerOverlays: [
      { kind: 'help_pulse', beat: 1 },
      { kind: 'defender_hip_arrow', beat: 1 },
      { kind: 'defender_chest_line', beat: 2 },
    ],
    movements: [
      { id: 'm1', delayMs: 0, durationMs: 600 },
      { id: 'm2-interbeat', delayMs: 1500, durationMs: 800 },
    ],
    beatSpec: {
      firstBeat: { kind: 'atMs', atMs: 1100 },
      secondBeat: { kind: 'atMs', atMs: 2700 },
    },
    timingOverrides: {
      cognitionHoldMs: 1100,
    },
  }
}

function baseHuntMeta(): HuntLintVariantMeta {
  return {
    id: 'HUNT-T1-01',
    decoder_tag: 'HUNT_THE_ADVANTAGE',
    coach_validation: {
      level: 'high',
      status: 'approved',
    },
  }
}

describe('LINT-HUNT-01 — beat cue caps', () => {
  it('passes a D1 fixture inside the per-beat and total caps', () => {
    expect(lintHuntBeatCueCaps(baseHuntScene(), baseHuntMeta(), 1)).toEqual({ ok: true })
  })

  it('skips non-HUNT scenarios entirely', () => {
    const meta = baseHuntMeta()
    meta.decoder_tag = 'BACKDOOR_WINDOW'
    const overstuffed: HuntLintSceneInput = {
      preAnswerOverlays: [
        { kind: 'a', beat: 1 },
        { kind: 'b', beat: 1 },
        { kind: 'c', beat: 1 },
      ],
    }
    expect(lintHuntBeatCueCaps(overstuffed, meta, 1)).toEqual({ ok: true })
  })

  it('fails when beat 1 has more cues than the D1/D2 cap', () => {
    const scene = baseHuntScene()
    scene.preAnswerOverlays = [
      { kind: 'help_pulse', beat: 1 },
      { kind: 'defender_hip_arrow', beat: 1 },
      { kind: 'defender_vision_cone', beat: 1 },
    ]
    const r = lintHuntBeatCueCaps(scene, baseHuntMeta(), 2)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.rule).toBe('LINT-HUNT-01')
  })

  it('fails when beat 2 has more cues than the cap at D3+', () => {
    const scene = baseHuntScene()
    scene.preAnswerOverlays = [
      { kind: 'help_pulse', beat: 1 },
      { kind: 'a', beat: 2 },
      { kind: 'b', beat: 2 },
      { kind: 'c', beat: 2 },
      { kind: 'd', beat: 2 },
    ]
    const r = lintHuntBeatCueCaps(scene, baseHuntMeta(), 3)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.rule).toBe('LINT-HUNT-01')
  })

  it('fails when total unique primitives exceed the cap', () => {
    const scene = baseHuntScene()
    // D3+ cap is 5 unique primitives; ship 6.
    scene.preAnswerOverlays = [
      { kind: 'k1', beat: 1 },
      { kind: 'k2', beat: 1 },
      { kind: 'k3', beat: 2 },
      { kind: 'k4', beat: 2 },
      { kind: 'k5', beat: 2 },
      { kind: 'k6', beat: 2 },
    ]
    const r = lintHuntBeatCueCaps(scene, baseHuntMeta(), 3)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.rule).toBe('LINT-HUNT-01')
  })

  it('counts overlays without an explicit `beat` toward beat 1 (strictest)', () => {
    const scene = baseHuntScene()
    scene.preAnswerOverlays = [
      { kind: 'a' },
      { kind: 'b' },
      { kind: 'c' },
    ]
    const r = lintHuntBeatCueCaps(scene, baseHuntMeta(), 1)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.rule).toBe('LINT-HUNT-01')
  })

  it('uses the relaxed D3+ per-beat cap', () => {
    const scene = baseHuntScene()
    scene.preAnswerOverlays = [
      { kind: 'a', beat: 1 },
      { kind: 'b', beat: 1 },
      { kind: 'c', beat: 1 },
      { kind: 'd', beat: 2 },
    ]
    expect(lintHuntBeatCueCaps(scene, baseHuntMeta(), 3)).toEqual({ ok: true })
    expect(HUNT_PER_BEAT_CUE_CAP_BEGINNER).toBe(2)
  })
})

describe('LINT-HUNT-02 — inter-beat determinism', () => {
  it('passes when every inter-beat movement has explicit timing', () => {
    expect(lintHuntInterBeatDeterminism(baseHuntScene(), baseHuntMeta())).toEqual({ ok: true })
  })

  it('passes when no movements fall inside the inter-beat window', () => {
    const scene = baseHuntScene()
    scene.movements = [
      { id: 'm-pre', delayMs: 100, durationMs: 400 },
      // 3000 is past secondBeat.atMs (2700).
      { id: 'm-post', delayMs: 3000, durationMs: 400 },
    ]
    expect(lintHuntInterBeatDeterminism(scene, baseHuntMeta())).toEqual({ ok: true })
  })

  it('skips when beatSpec is incomplete (LINT-HUNT-03 owns that error)', () => {
    const scene = baseHuntScene()
    scene.beatSpec = { firstBeat: { kind: 'atMs', atMs: 1100 } }
    expect(lintHuntInterBeatDeterminism(scene, baseHuntMeta())).toEqual({ ok: true })
  })

  it('fails when an inter-beat movement omits durationMs', () => {
    const scene = baseHuntScene()
    scene.movements = [
      { id: 'm-bad', delayMs: 1500 /* no durationMs */ },
    ]
    const r = lintHuntInterBeatDeterminism(scene, baseHuntMeta())
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.rule).toBe('LINT-HUNT-02')
  })

  it('fails when any movement omits delayMs entirely', () => {
    const scene = baseHuntScene()
    scene.movements = [
      { id: 'm-no-delay', durationMs: 500 },
    ]
    const r = lintHuntInterBeatDeterminism(scene, baseHuntMeta())
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.rule).toBe('LINT-HUNT-02')
  })
})

describe('LINT-HUNT-03 — beatSpec required', () => {
  it('passes when both beats are authored', () => {
    expect(lintHuntBeatSpecRequired(baseHuntScene(), baseHuntMeta())).toEqual({ ok: true })
  })

  it('fails when beatSpec is missing', () => {
    const scene = baseHuntScene()
    scene.beatSpec = undefined
    const r = lintHuntBeatSpecRequired(scene, baseHuntMeta())
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.rule).toBe('LINT-HUNT-03')
  })

  it('fails when secondBeat is missing', () => {
    const scene = baseHuntScene()
    scene.beatSpec = { firstBeat: { kind: 'atMs', atMs: 1100 } }
    const r = lintHuntBeatSpecRequired(scene, baseHuntMeta())
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.rule).toBe('LINT-HUNT-03')
  })

  it('fails when firstBeat is missing', () => {
    const scene = baseHuntScene()
    scene.beatSpec = { secondBeat: { kind: 'atMs', atMs: 2700 } }
    const r = lintHuntBeatSpecRequired(scene, baseHuntMeta())
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.rule).toBe('LINT-HUNT-03')
  })
})

describe('LINT-HUNT-04 — cognition hold floor', () => {
  it('passes when cognitionHoldMs ≤ 1200', () => {
    expect(lintHuntCognitionHoldFloor(baseHuntScene(), baseHuntMeta())).toEqual({ ok: true })
  })

  it('fails when timingOverrides is missing entirely', () => {
    const scene = baseHuntScene()
    scene.timingOverrides = undefined
    const r = lintHuntCognitionHoldFloor(scene, baseHuntMeta())
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.rule).toBe('LINT-HUNT-04')
  })

  it('fails when cognitionHoldMs exceeds the HUNT ceiling', () => {
    const scene = baseHuntScene()
    scene.timingOverrides = { cognitionHoldMs: HUNT_COGNITION_HOLD_CEILING_MS + 1 }
    const r = lintHuntCognitionHoldFloor(scene, baseHuntMeta())
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.rule).toBe('LINT-HUNT-04')
  })
})

describe('LINT-HUNT-05 — coach validation gate', () => {
  it('passes at D1/D2 regardless of coach validation', () => {
    const meta = baseHuntMeta()
    meta.coach_validation = { level: 'low', status: 'not_needed' }
    expect(lintHuntCoachValidation(meta, 2)).toEqual({ ok: true })
  })

  it('passes at D3+ with high+approved', () => {
    expect(lintHuntCoachValidation(baseHuntMeta(), 3)).toEqual({ ok: true })
  })

  it('fails at D3+ when coach_validation is absent', () => {
    const meta = baseHuntMeta()
    meta.coach_validation = undefined
    const r = lintHuntCoachValidation(meta, 3)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.rule).toBe('LINT-HUNT-05')
  })

  it('fails at D3 when level is medium (Phase δ-A: D3 decoy-action scenarios require high)', () => {
    // Phase δ-A — HUNT D3 introduces decoy-action scenarios; per the
    // blueprint these require high+approved coach validation before
    // shipping, the same gate D4 / D5 already enforced. This test pins
    // the D3 boundary explicitly so a future relaxation surfaces here.
    const meta = baseHuntMeta()
    meta.coach_validation = { level: 'medium', status: 'approved' }
    const r = lintHuntCoachValidation(meta, 3)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.rule).toBe('LINT-HUNT-05')
  })

  it('fails at D4 when level is not high', () => {
    const meta = baseHuntMeta()
    meta.coach_validation = { level: 'medium', status: 'approved' }
    const r = lintHuntCoachValidation(meta, 4)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.rule).toBe('LINT-HUNT-05')
  })

  it('fails at D5 when status is not approved', () => {
    const meta = baseHuntMeta()
    meta.coach_validation = { level: 'high', status: 'reviewed' }
    const r = lintHuntCoachValidation(meta, 5)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.rule).toBe('LINT-HUNT-05')
  })
})

describe('lintHuntVariant — aggregate', () => {
  it('returns ok=true for a clean fixture', () => {
    const result = lintHuntVariant(baseHuntScene(), baseHuntMeta(), 1)
    expect(result.ok).toBe(true)
    expect(result.failures).toEqual([])
  })

  it('returns ok=true for non-HUNT scenarios even if every other gate would fail', () => {
    const meta = baseHuntMeta()
    meta.decoder_tag = 'READ_THE_COVERAGE'
    const empty: HuntLintSceneInput = {}
    const result = lintHuntVariant(empty, meta, 5)
    expect(result.ok).toBe(true)
    expect(result.failures).toEqual([])
  })

  it('aggregates multiple failures across rules', () => {
    const scene: HuntLintSceneInput = {
      preAnswerOverlays: [
        { kind: 'a', beat: 1 },
        { kind: 'b', beat: 1 },
        { kind: 'c', beat: 1 },
      ],
      // No beatSpec → LINT-HUNT-03; no timingOverrides → LINT-HUNT-04;
      // beat-1 cluster of 3 at D1 → LINT-HUNT-01.
    }
    const meta = baseHuntMeta()
    meta.coach_validation = undefined
    // D3 → LINT-HUNT-05 also fires.
    const result = lintHuntVariant(scene, meta, 3)
    expect(result.ok).toBe(false)
    const rules = new Set(result.failures.map((f) => f.rule))
    expect(rules.has('LINT-HUNT-03')).toBe(true)
    expect(rules.has('LINT-HUNT-04')).toBe(true)
    expect(rules.has('LINT-HUNT-05')).toBe(true)
  })
})
