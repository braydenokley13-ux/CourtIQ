import { describe, expect, it } from 'vitest'
import { COURT, projectLegacyPoint, unprojectLegacyPoint, clampToCourt } from './coords'

describe('projectLegacyPoint', () => {
  it('places the legacy rim point at the 3D origin', () => {
    const result = projectLegacyPoint(250, 52)
    expect(result.x).toBeCloseTo(0, 4)
    expect(result.z).toBeCloseTo(0, 4)
  })

  it('round-trips between legacy px and court ft', () => {
    const samples = [
      [250, 200],
      [100, 90],
      [400, 350],
      [150, 60],
    ] as const
    for (const [px, py] of samples) {
      const point = projectLegacyPoint(px, py)
      const back = unprojectLegacyPoint(point)
      expect(back.x).toBeCloseTo(px, 4)
      expect(back.y).toBeCloseTo(py, 4)
    }
  })

  it('places half-court near z = 47 ft', () => {
    const result = projectLegacyPoint(250, 450)
    expect(result.z).toBeCloseTo(COURT.halfLengthFt, 1)
  })
})

describe('clampToCourt', () => {
  it('clamps x to ±halfWidth', () => {
    expect(clampToCourt({ x: 80, z: 5 }).x).toBe(COURT.halfWidthFt)
    expect(clampToCourt({ x: -80, z: 5 }).x).toBe(-COURT.halfWidthFt)
  })

  it('clamps z to [0, halfLength]', () => {
    expect(clampToCourt({ x: 0, z: -10 }).z).toBe(0)
    expect(clampToCourt({ x: 0, z: 200 }).z).toBe(COURT.halfLengthFt)
  })
})
