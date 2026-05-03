import { describe, expect, it } from 'vitest'

import {
  compileBeatsToFlatOverlays,
  isBeatFinite,
  sortBeats,
  type OverlayBeat,
} from './overlayBeats'

function beat(over: Partial<OverlayBeat>): OverlayBeat {
  return {
    beat_id: 'b',
    decoder: 'BACKDOOR_WINDOW',
    phase: 'freeze',
    at_phase_ms: 0,
    teaching_question: 'what_changed',
    primitive: { kind: 'defender_chest_line', playerId: 'x2' },
    clutter_priority: 1,
    visibility: { beginner: true, intermediate: true, advanced: true },
    ...over,
  }
}

describe('overlayBeats — sortBeats', () => {
  it('sorts by phase, then time, then priority, then id', () => {
    const beats: OverlayBeat[] = [
      beat({ beat_id: 'a', phase: 'answer_replay', at_phase_ms: 0, clutter_priority: 1 }),
      beat({ beat_id: 'b', phase: 'freeze', at_phase_ms: 200, clutter_priority: 1 }),
      beat({ beat_id: 'c', phase: 'freeze', at_phase_ms: 0, clutter_priority: 2 }),
      beat({ beat_id: 'd', phase: 'freeze', at_phase_ms: 0, clutter_priority: 1 }),
      beat({ beat_id: 'e', phase: 'watch', at_phase_ms: 0, clutter_priority: 1 }),
    ]
    const sorted = sortBeats(beats)
    expect(sorted.map((b) => b.beat_id)).toEqual(['e', 'd', 'c', 'b', 'a'])
  })

  it('is deterministic — same input twice produces deep-equal output', () => {
    const beats: OverlayBeat[] = [
      beat({ beat_id: 'a', phase: 'freeze', at_phase_ms: 100 }),
      beat({ beat_id: 'b', phase: 'freeze', at_phase_ms: 0 }),
      beat({ beat_id: 'c', phase: 'answer_replay', at_phase_ms: 50 }),
    ]
    expect(sortBeats(beats)).toEqual(sortBeats(beats))
  })

  it('drops malformed beats (NaN, Infinity, negative time)', () => {
    const beats: OverlayBeat[] = [
      beat({ beat_id: 'good', at_phase_ms: 0 }),
      beat({ beat_id: 'nan', at_phase_ms: Number.NaN }),
      beat({ beat_id: 'inf', at_phase_ms: Number.POSITIVE_INFINITY }),
      beat({ beat_id: 'neg', at_phase_ms: -1 }),
      beat({ beat_id: 'bad_pri', clutter_priority: Number.NaN }),
    ]
    const sorted = sortBeats(beats)
    expect(sorted.map((b) => b.beat_id)).toEqual(['good'])
  })

  it('isBeatFinite catches every malformed numeric field', () => {
    expect(isBeatFinite(beat({ at_phase_ms: 0 }))).toBe(true)
    expect(isBeatFinite(beat({ at_phase_ms: Number.NaN }))).toBe(false)
    expect(isBeatFinite(beat({ at_phase_ms: -1 }))).toBe(false)
    expect(isBeatFinite(beat({ clutter_priority: Number.NaN }))).toBe(false)
    expect(isBeatFinite(beat({ fade_in_ms: Number.POSITIVE_INFINITY }))).toBe(false)
    expect(isBeatFinite(beat({ fade_out_ms: Number.NaN }))).toBe(false)
    expect(isBeatFinite(beat({ fade_in_ms: 200 }))).toBe(true)
  })
})

describe('overlayBeats — compileBeatsToFlatOverlays', () => {
  it('routes beats to preAnswer / postAnswer / consequence by phase', () => {
    const beats: OverlayBeat[] = [
      beat({
        beat_id: 'w1',
        phase: 'watch',
        primitive: { kind: 'defender_hip_arrow', playerId: 'x2' },
      }),
      beat({
        beat_id: 'f1',
        phase: 'freeze',
        primitive: { kind: 'defender_chest_line', playerId: 'x2' },
      }),
      beat({
        beat_id: 'r1',
        phase: 'answer_replay',
        primitive: { kind: 'open_space_region', anchor: { x: 0, z: 0 }, radiusFt: 4 },
      }),
      beat({
        beat_id: 'c1',
        phase: 'consequence',
        primitive: { kind: 'passing_lane_blocked', from: 'pg', to: 'user' },
      }),
    ]
    const out = compileBeatsToFlatOverlays(beats, {
      tier: 'beginner',
      maxPerPhase: {},
    })
    expect(out.preAnswer.map((p) => p.kind)).toEqual([
      'defender_hip_arrow',
      'defender_chest_line',
    ])
    expect(out.postAnswer.map((p) => p.kind)).toEqual(['open_space_region'])
    expect(out.consequence.map((p) => p.kind)).toEqual(['passing_lane_blocked'])
    expect(out.dropped).toBe(0)
  })

  it('drops beats whose visibility flag is false for the active tier', () => {
    const beats: OverlayBeat[] = [
      beat({
        beat_id: 'always',
        visibility: { beginner: true, intermediate: true, advanced: true },
      }),
      beat({
        beat_id: 'advanced_only',
        visibility: { beginner: false, intermediate: false, advanced: true },
      }),
    ]
    const begin = compileBeatsToFlatOverlays(beats, {
      tier: 'beginner',
      maxPerPhase: {},
    })
    expect(begin.preAnswer).toHaveLength(1)
    expect(begin.dropped).toBe(1)

    const adv = compileBeatsToFlatOverlays(beats, {
      tier: 'advanced',
      maxPerPhase: {},
    })
    expect(adv.preAnswer).toHaveLength(2)
    expect(adv.dropped).toBe(0)
  })

  it('enforces per-phase clutter caps; drops lowest priority first', () => {
    const beats: OverlayBeat[] = [
      beat({ beat_id: 'p1', phase: 'freeze', clutter_priority: 1 }),
      beat({ beat_id: 'p2', phase: 'freeze', clutter_priority: 2 }),
      beat({ beat_id: 'p3', phase: 'freeze', clutter_priority: 3 }),
      beat({ beat_id: 'p4', phase: 'freeze', clutter_priority: 4 }),
    ]
    const out = compileBeatsToFlatOverlays(beats, {
      tier: 'beginner',
      maxPerPhase: { freeze: 2 },
    })
    // Sort puts p1 (priority 1) first, p4 (priority 4) last; cap=2 keeps p1, p2.
    expect(out.preAnswer).toHaveLength(2)
    expect(out.dropped).toBe(2)
  })

  it('is deterministic — same input twice produces deep-equal output', () => {
    const beats: OverlayBeat[] = [
      beat({
        beat_id: 'a',
        phase: 'freeze',
        at_phase_ms: 0,
        primitive: { kind: 'defender_hip_arrow', playerId: 'x2' },
      }),
      beat({
        beat_id: 'b',
        phase: 'answer_replay',
        at_phase_ms: 200,
        primitive: { kind: 'open_space_region', anchor: { x: 0, z: 0 }, radiusFt: 4 },
      }),
    ]
    const opts = {
      tier: 'beginner' as const,
      maxPerPhase: { freeze: 2, answer_replay: 2 },
    }
    expect(compileBeatsToFlatOverlays(beats, opts)).toEqual(
      compileBeatsToFlatOverlays(beats, opts),
    )
  })
})
