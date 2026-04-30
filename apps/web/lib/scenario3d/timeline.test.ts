import { describe, expect, it } from 'vitest'
import { buildTimeline, easeForKind, samplePlayer } from './timeline'
import type { Scene3D } from './scene'

const scene: Scene3D = {
  id: 'test',
  court: 'half',
  camera: 'teaching_angle',
  players: [
    { id: 'user', team: 'offense', role: 'wing', start: { x: 0, z: 10 } },
    { id: 'pg', team: 'offense', role: 'pg', start: { x: 5, z: 20 }, hasBall: true },
  ],
  ball: { start: { x: 5, z: 20 }, holderId: 'pg' },
  movements: [],
  answerDemo: [],
  wrongDemos: [],
  preAnswerOverlays: [],
  postAnswerOverlays: [],
  freezeAtMs: null,
  synthetic: false,
}

describe('buildTimeline', () => {
  it('returns total=0 for an empty list', () => {
    const tl = buildTimeline(scene, [])
    expect(tl.totalMs).toBe(0)
    expect(tl.movements).toHaveLength(0)
  })

  it('chains movements per player and sums durations', () => {
    const tl = buildTimeline(scene, [
      { id: 'a', playerId: 'user', kind: 'cut', to: { x: 0, z: 4 }, durationMs: 700 },
      { id: 'b', playerId: 'user', kind: 'cut', to: { x: 5, z: 4 }, durationMs: 500, delayMs: 100 },
    ])
    expect(tl.totalMs).toBe(700 + 100 + 500)
    const m1 = tl.movements[0]!
    const m2 = tl.movements[1]!
    expect(m1.from).toEqual({ x: 0, z: 10 })
    expect(m1.endMs).toBe(700)
    expect(m2.startMs).toBe(800)
    expect(m2.from).toEqual({ x: 0, z: 4 })
  })
})

describe('samplePlayer', () => {
  const tl = buildTimeline(scene, [
    { id: 'cut', playerId: 'user', kind: 'cut', to: { x: 0, z: 4 }, durationMs: 1000 },
  ])

  it('returns the start position before any movement begins', () => {
    expect(samplePlayer(scene, tl, 'user', 0)).toEqual({ x: 0, z: 10 })
  })

  it('returns the end position once the movement is complete', () => {
    const p = samplePlayer(scene, tl, 'user', 1000)
    expect(p.x).toBeCloseTo(0, 4)
    expect(p.z).toBeCloseTo(4, 4)
  })

  it('returns an interpolated position mid-movement', () => {
    const p = samplePlayer(scene, tl, 'user', 500)
    expect(p.x).toBeCloseTo(0, 4)
    // Phase C / C3 — `cut` now uses ease-out cubic, which returns
    // 1 - 0.5^3 = 0.875 at u=0.5. Position z = 10 + (4-10) * 0.875 = 4.75.
    expect(p.z).toBeCloseTo(4.75, 4)
  })

  it('returns the static start for players with no movements', () => {
    expect(samplePlayer(scene, tl, 'pg', 500)).toEqual({ x: 5, z: 20 })
  })

  it('returns the resolved ball start when the ball has no movements', () => {
    expect(samplePlayer(scene, tl, 'ball', 500)).toEqual({ x: 5, z: 20 })
  })
})

describe('Phase C / C3 — easeForKind', () => {
  it('uses ease-out cubic for explosive kinds (cut, drive, jab, …)', () => {
    // Ease-out at u=0.5 = 1 - 0.5^3 = 0.875.
    for (const kind of ['cut', 'back_cut', 'baseline_sneak', 'drive', 'jab', 'rip', 'stop_ball'] as const) {
      expect(easeForKind(kind, 0.5)).toBeCloseTo(0.875, 5)
    }
  })

  it('uses ease-in-out cubic for defensive / settle kinds', () => {
    // Symmetric ease-in-out at u=0.5 = 0.5 exactly.
    for (const kind of ['rotation', 'closeout', 'lift', 'drift', 'pass'] as const) {
      expect(easeForKind(kind, 0.5)).toBeCloseTo(0.5, 5)
    }
  })

  it('always hits exact endpoints regardless of kind', () => {
    for (const kind of ['cut', 'rotation', 'pass'] as const) {
      expect(easeForKind(kind, 0)).toBe(0)
      expect(easeForKind(kind, 1)).toBe(1)
    }
  })

  it('explosive curves are front-loaded (advance further than ease-in-out by mid-segment)', () => {
    // At u=0.25, ease-out (1 - 0.75^3 = 0.578) outruns ease-in-out
    // (4 * 0.25^3 = 0.0625) — proves cuts feel more decisive.
    expect(easeForKind('cut', 0.25)).toBeGreaterThan(easeForKind('rotation', 0.25))
  })
})
