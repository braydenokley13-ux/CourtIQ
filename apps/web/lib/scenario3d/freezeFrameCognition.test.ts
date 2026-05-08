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
  ACTION_BEAT_AT_MS,
  ADVANTAGE_BEAT_AT_MS,
  beatSchedule,
  CUE_BEAT_AT_MS,
  DEFAULT_BEAT_FADE_IN_MS,
  DEFAULT_BEAT_FADE_OUT_MS,
  DEFAULT_FREEZE_TIMING,
  FREEZE_COGNITION_HOLD_MS,
  getFreezeBeatTemplates,
  hydrateFreezeBeats,
  LABEL_BEAT_AT_MS,
  resolveFreezeTiming,
  type FreezeBeatAnchors,
} from './freezeFrameCognition'
import { buildScene } from './scene'

import type { DecoderTag } from './schema'

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

// ---------------------------------------------------------------------------
// Pack 2 Teaching-Quality F5 — difficulty-aware beat schedule.
// ---------------------------------------------------------------------------

describe('beatSchedule — F5 difficulty-aware offsets', () => {
  const FOUNDER_DECODERS: ReadonlyArray<DecoderTag> = [
    'BACKDOOR_WINDOW',
    'EMPTY_SPACE_CUT',
    'SKIP_THE_ROTATION',
    'ADVANTAGE_OR_RESET',
  ]

  it('D1, D2, D3 share a single Pack-1-cadence schedule (cue/label/action unchanged from constants)', () => {
    for (const dec of FOUNDER_DECODERS) {
      for (const d of [1, 2, 3]) {
        const s = beatSchedule(dec, d)
        expect(s.cueAtMs).toBe(CUE_BEAT_AT_MS)
        expect(s.labelAtMs).toBe(LABEL_BEAT_AT_MS)
        expect(s.actionAtMs).toBe(ACTION_BEAT_AT_MS)
        // Advantage tightened from the legacy 1100 to 1000 so it
        // starts strictly before the 1100ms schema floor on any
        // override. The legacy module constant stays at 1100 for
        // backward compat with existing callers of getFreezeBeatTemplates.
        expect(s.advantageAtMs).toBe(1000)
        expect(s.advantageAtMs).toBeLessThan(ADVANTAGE_BEAT_AT_MS)
        expect(s.fadeInMs).toBe(DEFAULT_BEAT_FADE_IN_MS)
        expect(s.fadeOutMs).toBe(DEFAULT_BEAT_FADE_OUT_MS)
      }
    }
  })

  it('D4 advantage compresses to +700ms (audit target)', () => {
    const s = beatSchedule('BACKDOOR_WINDOW', 4)
    expect(s.advantageAtMs).toBe(700)
  })

  it('D5 advantage compresses to +500ms (audit target)', () => {
    const s = beatSchedule('BACKDOOR_WINDOW', 5)
    expect(s.advantageAtMs).toBe(500)
  })

  it('cue → label → action → advantage stays strictly monotonic at every difficulty', () => {
    for (const d of [1, 2, 3, 4, 5]) {
      const s = beatSchedule('BACKDOOR_WINDOW', d)
      expect(s.cueAtMs).toBeLessThan(s.labelAtMs)
      expect(s.labelAtMs).toBeLessThan(s.actionAtMs)
      expect(s.actionAtMs).toBeLessThan(s.advantageAtMs)
    }
  })

  it('advantage offset is monotonic non-increasing in difficulty (harder = sooner)', () => {
    let prev = Number.POSITIVE_INFINITY
    for (const d of [1, 2, 3, 4, 5]) {
      const s = beatSchedule('BACKDOOR_WINDOW', d)
      expect(s.advantageAtMs).toBeLessThanOrEqual(prev)
      prev = s.advantageAtMs
    }
  })

  it('every offset (cue/label/action/advantage) is monotonic non-increasing in difficulty', () => {
    const offsets: Array<keyof Pick<ReturnType<typeof beatSchedule>, 'cueAtMs' | 'labelAtMs' | 'actionAtMs' | 'advantageAtMs'>> = [
      'cueAtMs',
      'labelAtMs',
      'actionAtMs',
      'advantageAtMs',
    ]
    for (const k of offsets) {
      let prev = Number.POSITIVE_INFINITY
      for (const d of [1, 2, 3, 4, 5]) {
        const v = beatSchedule('BACKDOOR_WINDOW', d)[k]
        expect(v).toBeLessThanOrEqual(prev)
        prev = v
      }
    }
  })

  it('fade-ins shrink at D4 and D5 alongside the offsets', () => {
    expect(beatSchedule('BACKDOOR_WINDOW', 1).fadeInMs).toBe(300)
    expect(beatSchedule('BACKDOOR_WINDOW', 4).fadeInMs).toBe(250)
    expect(beatSchedule('BACKDOOR_WINDOW', 5).fadeInMs).toBe(200)
  })

  it('advantage beat STARTS strictly before the schema-floor cognition hold (1100ms) at every difficulty — H5 invariant', () => {
    // H5 — the advantage explanation must arrive strictly before the
    // choice tray opens. "Arrives" = start of fade-in (matching the
    // audit's framing of "ADVANTAGE_BEAT_AT_MS = CHOICE_TRAY floor").
    // The schema floor is 1100ms for every difficulty today; F1 will
    // lower it per-D (D≤3=1100, D4=1000, D5=800). The schedule below
    // already satisfies the future per-D floors so F1 can land
    // without revisiting these numbers.
    const SCHEMA_MIN_HOLD_MS = 1100
    const FUTURE_HOLD_BY_D: Record<number, number> = {
      1: SCHEMA_MIN_HOLD_MS,
      2: SCHEMA_MIN_HOLD_MS,
      3: SCHEMA_MIN_HOLD_MS,
      4: 1000,
      5: 800,
    }
    for (const d of [1, 2, 3, 4, 5]) {
      const s = beatSchedule('BACKDOOR_WINDOW', d)
      // Today's schema floor — every D must clear it.
      expect(s.advantageAtMs).toBeLessThan(SCHEMA_MIN_HOLD_MS)
      // Future per-D floor (post-F1) — every D must also clear it.
      expect(s.advantageAtMs).toBeLessThan(FUTURE_HOLD_BY_D[d]!)
    }
  })

  it('advantage beat finishes its fade-in before the default 1400ms cognition hold', () => {
    // The Pack 1 default cognition hold is 1400ms. The schedule must
    // not regress the case where a scenario uses the default hold —
    // advantage's full fade-in should still complete before the tray.
    for (const d of [1, 2, 3, 4, 5]) {
      const s = beatSchedule('BACKDOOR_WINDOW', d)
      expect(s.advantageAtMs + s.fadeInMs).toBeLessThanOrEqual(
        FREEZE_COGNITION_HOLD_MS,
      )
    }
  })

  it('out-of-band difficulties clamp to D1 (loosest, safest schedule)', () => {
    const d1Advantage = beatSchedule('BACKDOOR_WINDOW', 1).advantageAtMs
    expect(beatSchedule('BACKDOOR_WINDOW', 0).advantageAtMs).toBe(d1Advantage)
    expect(beatSchedule('BACKDOOR_WINDOW', -2).advantageAtMs).toBe(d1Advantage)
    expect(beatSchedule('BACKDOOR_WINDOW', Number.NaN).advantageAtMs).toBe(
      d1Advantage,
    )
  })

  it('above-band difficulties clamp to D5 (tightest schedule); +Infinity falls back to D1', () => {
    expect(beatSchedule('BACKDOOR_WINDOW', 6).advantageAtMs).toBe(500)
    expect(beatSchedule('BACKDOOR_WINDOW', 99).advantageAtMs).toBe(500)
    // +Infinity is non-finite, so the helper treats it as out-of-band
    // and falls back to the loosest schedule (D1) — never crash.
    expect(
      beatSchedule('BACKDOOR_WINDOW', Number.POSITIVE_INFINITY).advantageAtMs,
    ).toBe(beatSchedule('BACKDOOR_WINDOW', 1).advantageAtMs)
  })

  it('non-integer difficulties round to the nearest integer', () => {
    expect(beatSchedule('BACKDOOR_WINDOW', 4.4).advantageAtMs).toBe(700)
    expect(beatSchedule('BACKDOOR_WINDOW', 4.6).advantageAtMs).toBe(500)
  })

  it('decoder parameter is forward-compatible — every founder decoder gets the same schedule today', () => {
    for (const d of [1, 2, 3, 4, 5]) {
      const ref = beatSchedule(FOUNDER_DECODERS[0], d)
      for (const dec of FOUNDER_DECODERS) {
        expect(beatSchedule(dec, d)).toEqual(ref)
      }
    }
  })

  it('undefined decoder still resolves the difficulty-keyed schedule', () => {
    expect(beatSchedule(undefined, 5).advantageAtMs).toBe(500)
    expect(beatSchedule(undefined, 1).advantageAtMs).toBe(
      beatSchedule('BACKDOOR_WINDOW', 1).advantageAtMs,
    )
  })

  it('returned schedules are referentially stable for the same difficulty', () => {
    expect(beatSchedule('BACKDOOR_WINDOW', 5)).toBe(
      beatSchedule('SKIP_THE_ROTATION', 5),
    )
    expect(beatSchedule('BACKDOOR_WINDOW', 1)).toBe(
      beatSchedule('SKIP_THE_ROTATION', 1),
    )
  })
})

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
