import { describe, expect, it } from 'vitest'
import { buildTimeline, samplePlayer } from './timeline'
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
    // ease-in-out cubic at u=0.5 returns 0.5 exactly
    expect(p.z).toBeCloseTo(7, 1)
  })

  it('returns the static start for players with no movements', () => {
    expect(samplePlayer(scene, tl, 'pg', 500)).toEqual({ x: 5, z: 20 })
  })

  it('returns the resolved ball start when the ball has no movements', () => {
    expect(samplePlayer(scene, tl, 'ball', 500)).toEqual({ x: 5, z: 20 })
  })
})
