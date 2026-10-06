import { describe, expect, it } from 'vitest'
import { contestScale, directionalSpeed, resolveCapability } from './capability'
import { estimateArrival } from './analytics'
import { createDefaultConfig, HIGH_PNR_PROBLEM } from './scenario'
import { simulate } from './simulation'

describe('per-player physical capability', () => {
  const guard = resolveCapability({ height: 1.86 }), big = resolveCapability({ height: 2.03 })
  it('derives a quicker guard and a slower, longer big, never above the model assumption', () => {
    for (const c of [guard, big]) { expect(c.speed).toBeLessThanOrEqual(1); expect(c.acceleration).toBeLessThanOrEqual(1); expect(c.lateral).toBeLessThan(1) }
    expect(big.speed).toBeLessThan(guard.speed)
    expect(big.acceleration).toBeLessThan(guard.acceleration)
    expect(big.lateral).toBeLessThan(guard.lateral)
    expect(big.contest).toBeGreaterThan(guard.contest)
    expect(resolveCapability({ height: 1.9, speed: 0.8 }).speed).toBe(0.8)
  })
  it('is slower sideways and backward than forward for everyone, most for the big', () => {
    for (const c of [guard, big]) {
      const forward = directionalSpeed(4.5, c.lateral, 0, 0, 1), side = directionalSpeed(4.5, c.lateral, 0, 1, 0), back = directionalSpeed(4.5, c.lateral, 0, 0, -1)
      expect(forward).toBeCloseTo(4.5); expect(side).toBeLessThan(forward); expect(back).toBeLessThan(forward)
    }
    expect(directionalSpeed(4.5, big.lateral, 0, 1, 0)).toBeLessThan(directionalSpeed(4.5, guard.lateral, 0, 1, 0))
  })
  it('arrival estimates use the actual body: a big facing the ball takes longer sideways than a guard', () => {
    const assumptions = createDefaultConfig().assumptions
    const body = (c: typeof guard) => ({ x: 0, z: 0, vx: 0, vz: 0, yaw: 0, speed: c.speed, acceleration: c.acceleration, lateral: c.lateral })
    const target = { x: 4, z: 0 }
    expect(estimateArrival(body(big), target, assumptions, 0, 0)).toBeGreaterThan(estimateArrival(body(guard), target, assumptions, 0, 0))
    expect(estimateArrival({ ...body(guard), yaw: Math.PI / 2 }, target, assumptions, 0, 0)).toBeLessThan(estimateArrival(body(guard), target, assumptions, 0, 0))
  })
  it('stretches contest radius by height given up, in both directions', () => {
    expect(contestScale({ height: 1.87 }, 2.02)).toBeLessThan(contestScale({ height: 2.03 }, 1.86))
    expect(contestScale({ height: 1.9 }, 1.9)).toBe(1)
  })
  it('carries the resolved profile on every simulated player and never exceeds the acceleration cap', () => {
    const result = simulate(createDefaultConfig())
    const d5 = result.frames[0].players.find(p => p.id === HIGH_PNR_PROBLEM.roles.big)!, d1 = result.frames[0].players.find(p => p.id === HIGH_PNR_PROBLEM.roles.poa)!
    expect(d5.lateral!).toBeLessThan(d1.lateral!)
    expect(d5.contest!).toBeGreaterThan(d1.contest!)
    const cap = result.config.assumptions.acceleration * result.config.assumptions.dt + 1e-6
    for (let i = 1; i < result.frames.length; i++) for (const p of result.frames[i].players) {
      const q = result.frames[i - 1].players.find(o => o.id === p.id)!
      expect(Math.hypot(p.vx - q.vx, p.vz - q.vz)).toBeLessThanOrEqual(cap)
    }
  })
})
