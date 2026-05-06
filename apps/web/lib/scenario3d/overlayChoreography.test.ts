/**
 * V2-D — overlay choreography tests.
 *
 * Locks the staggering policy:
 *
 *  1. Empty input returns an empty timeline.
 *  2. Anchors mount before supports; supports mount before
 *     auxiliaries — for any non-empty mix.
 *  3. Within the same role bucket, primitives stagger by the
 *     within-bucket spread (capped at the configured cap so a wide
 *     bucket never trails past the cap × spread time).
 *  4. Every entry's delay/duration is finite and non-negative.
 *  5. The role dispatcher routes every known primitive kind to the
 *     intended bucket (smoke check across the schema).
 *  6. Pure: same input → byte-identical output.
 */

import { describe, it, expect } from 'vitest'
import {
  OVERLAY_CHOREOGRAPHY_DEFAULTS,
  buildChoreography,
  roleForPrimitive,
} from './overlayChoreography'
import type { OverlayPrimitive } from './schema'

const visionCone: OverlayPrimitive = {
  kind: 'defender_vision_cone',
  defenderId: 'wing-defender',
  yawDeg: 24,
  spreadDeg: 60,
}
const hipArrow: OverlayPrimitive = {
  kind: 'defender_hip_arrow',
  defenderId: 'wing-defender',
  vector: { dx: 1, dz: 0 },
}
const passLaneOpen: OverlayPrimitive = {
  kind: 'passing_lane_open',
  fromPlayerId: 'wing',
  toPlayerId: 'corner',
}
const openSpace: OverlayPrimitive = {
  kind: 'open_space_region',
  shape: 'rect',
  bounds: { x0: 0, z0: 0, x1: 6, z1: 8 },
}
const label: OverlayPrimitive = {
  kind: 'label',
  text: 'Wing denial',
  anchor: { kind: 'court', x: 12, z: 8 },
}
const helpPulse: OverlayPrimitive = {
  kind: 'help_pulse',
  defenderId: 'help',
}
const driveCutPreview: OverlayPrimitive = {
  kind: 'drive_cut_preview',
  fromPlayerId: 'you',
  to: { x: 0, z: 4 },
}
const handInLane: OverlayPrimitive = {
  kind: 'defender_hand_in_lane',
  defenderId: 'wing-defender',
  hand: 'left',
}

describe('buildChoreography', () => {
  it('returns an empty timeline for empty input', () => {
    expect(buildChoreography([])).toEqual([])
  })

  it('reveals anchors before supports before auxiliaries', () => {
    const timeline = buildChoreography([
      label,
      openSpace,
      visionCone,
    ])
    expect(timeline).toHaveLength(3)
    const anchorEntry = timeline.find((e) => e.role === 'anchor')!
    const supportEntry = timeline.find((e) => e.role === 'support')!
    const auxEntry = timeline.find((e) => e.role === 'auxiliary')!
    expect(anchorEntry.delayMs).toBeLessThan(supportEntry.delayMs)
    expect(supportEntry.delayMs).toBeLessThan(auxEntry.delayMs)
  })

  it('staggers within a bucket but caps the spread', () => {
    // Six anchors inside one bucket. The within-bucket cap is 3
    // spreads, so anchors 4..6 must share the cap × spread offset
    // with anchor #4.
    const anchors = Array.from(
      { length: 6 },
      (): OverlayPrimitive => visionCone,
    )
    const tl = buildChoreography(anchors)
    const cap = OVERLAY_CHOREOGRAPHY_DEFAULTS.withinBucketSpreadCap
    const spread = OVERLAY_CHOREOGRAPHY_DEFAULTS.withinBucketSpreadMs
    expect(tl[0]?.delayMs).toBe(0)
    expect(tl[cap]?.delayMs).toBe(cap * spread)
    expect(tl[cap + 1]?.delayMs).toBe(cap * spread)
    expect(tl[5]?.delayMs).toBe(cap * spread)
  })

  it('returns finite, non-negative timings for every entry', () => {
    const timeline = buildChoreography([
      visionCone,
      hipArrow,
      passLaneOpen,
      openSpace,
      label,
    ])
    for (const e of timeline) {
      expect(Number.isFinite(e.delayMs)).toBe(true)
      expect(Number.isFinite(e.durationMs)).toBe(true)
      expect(e.delayMs).toBeGreaterThanOrEqual(0)
      expect(e.durationMs).toBeGreaterThanOrEqual(0)
    }
  })

  it('preserves input order via inputIndex', () => {
    const inputs = [label, visionCone, openSpace]
    const timeline = buildChoreography(inputs)
    expect(timeline.map((e) => e.inputIndex)).toEqual([0, 1, 2])
  })

  it('is pure: same input → identical timeline', () => {
    const inputs: OverlayPrimitive[] = [visionCone, openSpace, label]
    const a = buildChoreography(inputs)
    const b = buildChoreography(inputs)
    expect(a).toEqual(b)
  })

  it('respects custom delay overrides', () => {
    const tl = buildChoreography([visionCone, openSpace, label], {
      anchorDelayMs: 100,
      supportDelayMs: 300,
      auxiliaryDelayMs: 600,
    })
    const anchor = tl.find((e) => e.role === 'anchor')!
    const support = tl.find((e) => e.role === 'support')!
    const aux = tl.find((e) => e.role === 'auxiliary')!
    expect(anchor.delayMs).toBe(100)
    expect(support.delayMs).toBe(300)
    expect(aux.delayMs).toBe(600)
  })
})

describe('roleForPrimitive', () => {
  it('routes anchors correctly', () => {
    expect(roleForPrimitive(visionCone)).toBe('anchor')
    expect(roleForPrimitive(hipArrow)).toBe('anchor')
    expect(roleForPrimitive(driveCutPreview)).toBe('anchor')
  })

  it('routes supports correctly', () => {
    expect(roleForPrimitive(passLaneOpen)).toBe('support')
    expect(roleForPrimitive(openSpace)).toBe('support')
    expect(roleForPrimitive(handInLane)).toBe('support')
    expect(roleForPrimitive(helpPulse)).toBe('support')
  })

  it('routes auxiliaries correctly', () => {
    expect(roleForPrimitive(label)).toBe('auxiliary')
  })
})
