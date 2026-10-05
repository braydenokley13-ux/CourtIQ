import { describe, expect, it } from 'vitest'
import { defenseResponsibilities } from './defensivePolicy'
import { createDefaultConfig, HIGH_PNR_PROBLEM } from './scenario'
import { getTagGuide, tagDepthFromFloorPoint } from './tagGuide'
import type { Point2, WorldFrame } from './types'

function observation(): WorldFrame {
  const config = createDefaultConfig()
  return {
    t: 0.75,
    players: HIGH_PNR_PROBLEM.players.map(p => ({ ...p, ...p.start, vx: 0, vz: p.id === 'O5' ? -2 : 0, yaw: 0, pose: { stance: 'ready', hands: 0, phase: 0, jump: 0 } })),
    ball: { x: 1.6, z: 8.4, y: 1, phase: 'handle', owner: 'O1', receiver: null, flight: null },
    responsibilities: [], options: [], answer: config.answer, stage: 'screen', screenEngagedAt: 0.4,
  }
}
const between = (a: Point2, b: Point2, amount: number) => ({ x: a.x + (b.x - a.x) * amount, z: a.z + (b.z - a.z) * amount })

describe('world-native low-man rule geometry', () => {
  it('uses the actual role-based tag policy for both endpoints and every depth', () => {
    const config = createDefaultConfig(), frame = observation()
    for (const depth of [0, 0.13, 0.45, 0.73, 1]) {
      const answer = { ...config.answer, tagDepth: depth }
      const guide = getTagGuide(frame, answer, HIGH_PNR_PROBLEM, config)
      const policy = defenseResponsibilities(frame, answer, HIGH_PNR_PROBLEM, config, frame.t, { screenAt: 0.4, showReleased: false })
      expect(guide.mode).toBe('tag')
      expect(guide.currentTarget).toEqual(policy.find(r => r.defenderId === 'D3' && r.kind === 'tag')!.target)
      const expected = between(guide.home, guide.commit, depth)
      expect(guide.currentTarget.x).toBeCloseTo(expected.x, 12)
      expect(guide.currentTarget.z).toBeCloseTo(expected.z, 12)
      expect(tagDepthFromFloorPoint(guide, guide.currentTarget)).toBeCloseTo(depth, 12)
    }
  })

  it('uses the distinct preparation rail before the roller dives', () => {
    const config = createDefaultConfig(), frame = observation()
    frame.players.find(p => p.id === 'O5')!.vz = 0
    const prepared = getTagGuide(frame, config.answer, HIGH_PNR_PROBLEM, config)
    expect(prepared.mode).toBe('prepare')
    expect(prepared.editable).toBe(true)
    expect(tagDepthFromFloorPoint(prepared, prepared.currentTarget)).toBeCloseTo(config.answer.tagDepth, 12)
    frame.players.find(p => p.id === 'O5')!.vz = -2
    expect(prepared.commit).not.toEqual(getTagGuide(frame, config.answer, HIGH_PNR_PROBLEM, config).commit)
  })

  it('projects off-rail dragging to nearest depth and clamps beyond the endpoints', () => {
    const config = createDefaultConfig(), guide = getTagGuide(observation(), config.answer, HIGH_PNR_PROBLEM, config)
    const p = between(guide.home, guide.commit, 0.37)
    const dx = guide.commit.x - guide.home.x, dz = guide.commit.z - guide.home.z
    expect(tagDepthFromFloorPoint(guide, { x: p.x - dz * 3, z: p.z + dx * 3 })).toBeCloseTo(0.37, 12)
    expect(tagDepthFromFloorPoint(guide, between(guide.home, guide.commit, -2))).toBe(0)
    expect(tagDepthFromFloorPoint(guide, between(guide.home, guide.commit, 3))).toBe(1)
    expect(tagDepthFromFloorPoint(guide, { x: NaN, z: 1 })).toBe(guide.tagDepth)
  })

  it('does not offer fake depth edits for a released tag, switch, or non-screen action', () => {
    const config = createDefaultConfig(), frame = observation()
    frame.ball = { ...frame.ball, phase: 'pass', owner: null, receiver: 'O3' }
    const released = getTagGuide(frame, config.answer, HIGH_PNR_PROBLEM, config)
    expect(released.mode).toBe('released')
    expect(released.editable).toBe(false)
    expect(tagDepthFromFloorPoint(released, { x: 100, z: 100 })).toBe(config.answer.tagDepth)
    expect(getTagGuide(observation(), { ...config.answer, coverage: 'switch' }, HIGH_PNR_PROBLEM, config).editable).toBe(false)
    expect(getTagGuide(observation(), config.answer, { ...HIGH_PNR_PROBLEM, actions: [] }, config).editable).toBe(false)
    expect(getTagGuide(observation(), { ...config.answer, tag: false }, HIGH_PNR_PROBLEM, config).editable).toBe(false)
  })

  it('respects the recovery trigger and content-owned replacement responsibility', () => {
    const config = createDefaultConfig(), frame = observation()
    frame.ball = { ...frame.ball, phase: 'pass', owner: null, receiver: 'O3' }
    const held = getTagGuide(frame, { ...config.answer, recovery: 'roller-secured' }, HIGH_PNR_PROBLEM, config)
    expect(held.mode).toBe('tag')
    const problem = { ...HIGH_PNR_PROBLEM, defenseRules: [{ id: 'own-corner', label: 'Own corner', assignments: [{ defender: 'lowMan' as const, offense: 'weakCorner' as const, threat: 'corner' as const, kind: 'guard' as const, gap: 0.9, priority: 1 }] }] }
    expect(getTagGuide(observation(), config.answer, problem, config).editable).toBe(false)
  })
})
