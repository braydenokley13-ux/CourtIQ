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
import { promises as fs } from 'node:fs'
import path from 'node:path'

import {
  DEFAULT_FREEZE_TIMING,
  getFreezeBeatTemplates,
  hydrateFreezeBeats,
  resolveFreezeTiming,
  type FreezeBeatAnchors,
} from './freezeFrameCognition'
import { buildScene } from './scene'

const FULL_ANCHORS: FreezeBeatAnchors = {
  cue_defender: 'd1',
  cue_offensive: 'o1',
  cutter: 'o2',
  receiver: 'o3',
  open_player: 'o4',
  passer: 'o5',
  screen_defender: 'd2',
  ball_handler: 'o6',
  vacated_zone: { x: 1, z: 2 },
  open_rim_zone: { x: 0, z: 0 },
  closeout_target: { x: 3, z: 4 },
  pull_up_pocket: { x: -2, z: 16 },
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

// ---------------------------------------------------------------------------
// Phase 3.1.4 runtime — per-scenario timing override resolution.
//
// The schema validates floors at parse time (cognitionHoldMs ≥ 1100). We pin
// three runtime guarantees here:
//   1. Pack 1 scenarios that author NO timingOverrides resolve to the
//      module defaults bit-identically.
//   2. The gold-standard Pack 2 D3 template (BDW.late-clock-corner-deny,
//      materialized as BDW-T2-01) actually round-trips cognitionHoldMs=1200
//      and cueRepaintHoldWrongMs=600 through buildScene → resolveFreezeTiming.
//   3. resolveFreezeTiming(undefined) is a frozen reference equality with
//      DEFAULT_FREEZE_TIMING (so the no-override fast path is allocation-
//      free and cannot drift).
// ---------------------------------------------------------------------------

describe('resolveFreezeTiming — Pack 1/2 round-trip', () => {
  it('returns DEFAULT_FREEZE_TIMING (===) for the no-override path', () => {
    expect(resolveFreezeTiming(undefined)).toBe(DEFAULT_FREEZE_TIMING)
    expect(DEFAULT_FREEZE_TIMING.cognitionHoldMs).toBe(1400)
    expect(DEFAULT_FREEZE_TIMING.cueRepaintHoldCorrectMs).toBe(600)
    expect(DEFAULT_FREEZE_TIMING.cueRepaintHoldWrongMs).toBe(400)
  })

  it('layers a partial override on top of the defaults', () => {
    const t = resolveFreezeTiming({ cognitionHoldMs: 1200 })
    expect(t.cognitionHoldMs).toBe(1200)
    // unspecified fields fall through unchanged
    expect(t.cueRepaintHoldCorrectMs).toBe(DEFAULT_FREEZE_TIMING.cueRepaintHoldCorrectMs)
    expect(t.cueRepaintHoldWrongMs).toBe(DEFAULT_FREEZE_TIMING.cueRepaintHoldWrongMs)
    expect(t.choiceTrayAtMs).toBe(DEFAULT_FREEZE_TIMING.choiceTrayAtMs)
  })

  it('resolves BDW-T2-01 to its authored cognitionHoldMs=1200, cueRepaintHoldWrongMs=600', async () => {
    // Materialized output is the source the runtime ingests via buildScene.
    // Reading the JSON keeps this test in lockstep with whatever the
    // materializer emits — a regression in the template-pack pipeline shows
    // up here, not just in the schema.
    const file = path.resolve(
      __dirname,
      '..',
      '..',
      '..',
      '..',
      'packages',
      'db',
      'seed',
      'scenarios',
      'packs',
      'templates-v1',
      'BDW-T2-01.json',
    )
    const raw = await fs.readFile(file, 'utf8')
    const arr = JSON.parse(raw) as Array<{
      id: string
      decoder_tag: string
      court_state: unknown
      scene: unknown
      concept_tags: string[]
    }>
    const scenario = arr[0]!
    expect(scenario.id).toBe('BDW-T2-01')
    const scene = buildScene({
      id: scenario.id,
      court_state: scenario.court_state as never,
      scene: scenario.scene,
      decoder_tag: scenario.decoder_tag,
      concept_tags: scenario.concept_tags,
    })
    expect(scene.synthetic).toBe(false)
    expect(scene.timingOverrides?.cognitionHoldMs).toBe(1200)
    expect(scene.timingOverrides?.cueRepaintHoldWrongMs).toBe(600)
    const timing = resolveFreezeTiming(scene.timingOverrides)
    expect(timing.cognitionHoldMs).toBe(1200)
    expect(timing.cueRepaintHoldWrongMs).toBe(600)
    // Overrides not authored by this template still fall through to defaults.
    expect(timing.cueRepaintHoldCorrectMs).toBe(
      DEFAULT_FREEZE_TIMING.cueRepaintHoldCorrectMs,
    )
  })
})

// ---------------------------------------------------------------------------
// Pack 2 (Phase β) — DROP D1/D2 cognition templates.
//
// DROP = READ_THE_COVERAGE = "is the screen defender dropping?"
//
// These tests pin the contract for the new DROP templates added in this
// slice:
//   - Three beats land (cue / action / advantage).
//   - Cue + action are body-language cues on the screen defender —
//     defender_chest_line and defender_foot_arrow — both legal pre-
//     answer overlay primitives in the schema.
//   - Advantage is the pull-up pocket: an open_space_region anchored
//     by court-point, never a player id.
//   - The DROP schedule is single-freeze. Templates carry no second-
//     beat data and must hydrate without authoring beatSpec.secondBeat.
// ---------------------------------------------------------------------------

describe('DROP (READ_THE_COVERAGE) D1/D2 cognition templates', () => {
  it('exposes a non-empty template list with cue → action → advantage', () => {
    const tpl = getFreezeBeatTemplates('READ_THE_COVERAGE')
    expect(tpl.length).toBe(3)
    expect(tpl.map((t) => t.kind)).toEqual(['cue', 'action', 'advantage'])
  })

  it('uses screen-defender body-language primitives for cue + action', () => {
    const tpl = getFreezeBeatTemplates('READ_THE_COVERAGE')
    const cue = tpl.find((t) => t.kind === 'cue')
    const action = tpl.find((t) => t.kind === 'action')
    expect(cue?.primitive_kind).toBe('defender_chest_line')
    expect(cue?.anchor).toBe('screen_defender')
    expect(action?.primitive_kind).toBe('defender_foot_arrow')
    expect(action?.anchor).toBe('screen_defender')
  })

  it('uses a court-point pull_up_pocket anchor for the advantage beat', () => {
    const tpl = getFreezeBeatTemplates('READ_THE_COVERAGE')
    const adv = tpl.find((t) => t.kind === 'advantage')
    expect(adv?.primitive_kind).toBe('open_space_region')
    expect(adv?.anchor).toBe('pull_up_pocket')
  })

  it('hydrates to schema-legal OverlayBeats with the DROP anchors set', () => {
    const beats = hydrateFreezeBeats(
      'READ_THE_COVERAGE',
      getFreezeBeatTemplates('READ_THE_COVERAGE'),
      FULL_ANCHORS,
    )
    expect(beats).toHaveLength(3)
    const kinds = beats.map((b) => b.primitive.kind)
    expect(kinds).toEqual([
      'defender_chest_line',
      'defender_foot_arrow',
      'open_space_region',
    ])
    // All three beats must declare phase='freeze' — DROP is single-
    // freeze; nothing here ever schedules into a second beat.
    expect(beats.every((b) => b.phase === 'freeze')).toBe(true)
  })

  it('skips DROP beats when their anchors are missing', () => {
    const partial: FreezeBeatAnchors = {
      ...FULL_ANCHORS,
      screen_defender: undefined,
      pull_up_pocket: undefined,
    }
    const beats = hydrateFreezeBeats(
      'READ_THE_COVERAGE',
      getFreezeBeatTemplates('READ_THE_COVERAGE'),
      partial,
    )
    expect(beats.length).toBe(0)
  })

  it('does not require secondBeat — templates declare no beat-2 schedule', () => {
    const tpl = getFreezeBeatTemplates('READ_THE_COVERAGE')
    // No second-beat scheduling is encoded on the DROP templates: every
    // beat lives inside the single freeze envelope (≤ FREEZE_COGNITION_HOLD_MS
    // after freezeAtMs).
    for (const t of tpl) {
      expect(t.at_phase_ms).toBeLessThanOrEqual(1400)
      expect(t.at_phase_ms).toBeGreaterThanOrEqual(0)
    }
  })

  it('READ_THE_COVERAGE is compatible with the Pack 1 hydration code path', () => {
    // Same hydrate function, same anchor map, same OverlayBeat shape as
    // BDW/ESC/SKR/AOR — DROP rides the founder rails.
    const drop = hydrateFreezeBeats(
      'READ_THE_COVERAGE',
      getFreezeBeatTemplates('READ_THE_COVERAGE'),
      FULL_ANCHORS,
    )
    const bdw = hydrateFreezeBeats(
      'BACKDOOR_WINDOW',
      getFreezeBeatTemplates('BACKDOOR_WINDOW'),
      FULL_ANCHORS,
    )
    expect(drop.length).toBe(bdw.length)
    expect(drop.map((b) => b.phase)).toEqual(bdw.map((b) => b.phase))
  })
})
