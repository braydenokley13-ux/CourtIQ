import { describe, expect, it } from 'vitest'
import {
  BALL_PEAK_MAX_FT,
  BALL_PEAK_MIN_FT,
  computeReadablePassArcPeak,
  easeInOutCubic,
  resolvePassCatchAnchor,
  resolvePassReleaseAnchor,
  samplePassArc,
} from './passArc'
import { buildTimeline } from './timeline'
import type { Scene3D, SceneMovement } from './scene'

/**
 * P2.5 — Tests for the reusable, deterministic pass / catch primitives.
 *
 * The product principle: same inputs always produce the same arc, no
 * randomness, no scenario mutation, no NaN / Infinity for any
 * reasonable input. Other scenario-rendering tests (replay determinism,
 * BDW back-cut alignment) build on this contract.
 */

function buildScene(overrides: Partial<Scene3D> = {}): Scene3D {
  return {
    id: 'arc_test',
    court: 'half',
    camera: 'teaching_angle',
    players: [
      { id: 'pg', team: 'offense', role: 'pg', start: { x: 0, z: 0 }, hasBall: true },
      { id: 'wing', team: 'offense', role: 'wing', start: { x: 20, z: 0 } },
    ],
    ball: { start: { x: 0, z: 0 }, holderId: 'pg' },
    movements: [],
    answerDemo: [],
    wrongDemos: [],
    preAnswerOverlays: [],
    postAnswerOverlays: [],
    freezeAtMs: null,
    synthetic: false,
    ...overrides,
  }
}

describe('computeReadablePassArcPeak', () => {
  it('returns deterministic apex for identical inputs', () => {
    const a = computeReadablePassArcPeak(20, 'pass')
    const b = computeReadablePassArcPeak(20, 'pass')
    expect(a).toBe(b)
  })

  it('clamps cross-court bombs to the 7 ft ceiling', () => {
    expect(computeReadablePassArcPeak(40, 'pass')).toBe(BALL_PEAK_MAX_FT)
    expect(computeReadablePassArcPeak(100, 'pass')).toBe(BALL_PEAK_MAX_FT)
  })

  it('clamps short hand-offs to the 0.7 ft floor', () => {
    expect(computeReadablePassArcPeak(1, 'pass')).toBe(BALL_PEAK_MIN_FT)
    expect(computeReadablePassArcPeak(0.1, 'pass')).toBe(BALL_PEAK_MIN_FT)
  })

  it('keeps skip passes lower than standard passes at the same distance', () => {
    const standard = computeReadablePassArcPeak(25, 'pass')
    const skip = computeReadablePassArcPeak(25, 'skip_pass')
    expect(skip).toBeLessThan(standard)
  })

  it('is finite-safe for degenerate inputs', () => {
    expect(Number.isFinite(computeReadablePassArcPeak(0, 'pass'))).toBe(true)
    expect(Number.isFinite(computeReadablePassArcPeak(-10, 'pass'))).toBe(true)
    expect(Number.isFinite(computeReadablePassArcPeak(Number.NaN, 'pass'))).toBe(true)
    expect(Number.isFinite(computeReadablePassArcPeak(Number.POSITIVE_INFINITY, 'pass'))).toBe(true)
  })
})

describe('samplePassArc', () => {
  const from = { x: 0, z: 0 }
  const to = { x: 20, z: 0 }

  it('puts the ball at the passer at u=0 and at the catcher at u=1', () => {
    const start = samplePassArc({ from, to, u: 0, kind: 'pass' })
    const end = samplePassArc({ from, to, u: 1, kind: 'pass' })
    expect(start.x).toBeCloseTo(from.x, 6)
    expect(start.z).toBeCloseTo(from.z, 6)
    expect(start.height).toBeCloseTo(0, 6)
    expect(end.x).toBeCloseTo(to.x, 6)
    expect(end.z).toBeCloseTo(to.z, 6)
    expect(end.height).toBeCloseTo(0, 6)
  })

  it('peaks at the eased mid-flight (u=0.5)', () => {
    const mid = samplePassArc({ from, to, u: 0.5, kind: 'pass' })
    const peak = computeReadablePassArcPeak(20, 'pass')
    expect(mid.height).toBeCloseTo(peak, 6)
  })

  it('is deterministic — same inputs always produce the same sample', () => {
    const a = samplePassArc({ from, to, u: 0.37, kind: 'pass' })
    const b = samplePassArc({ from, to, u: 0.37, kind: 'pass' })
    expect(a.x).toBe(b.x)
    expect(a.z).toBe(b.z)
    expect(a.height).toBe(b.height)
  })

  it('clamps u outside [0, 1] to the endpoint', () => {
    const before = samplePassArc({ from, to, u: -1, kind: 'pass' })
    const after = samplePassArc({ from, to, u: 5, kind: 'pass' })
    expect(before.x).toBeCloseTo(from.x, 6)
    expect(after.x).toBeCloseTo(to.x, 6)
    expect(before.height).toBeCloseTo(0, 6)
    expect(after.height).toBeCloseTo(0, 6)
  })

  it('never returns NaN or Infinity for finite inputs anywhere along the curve', () => {
    for (let i = 0; i <= 20; i++) {
      const u = i / 20
      const sample = samplePassArc({ from, to, u, kind: 'pass' })
      expect(Number.isFinite(sample.x)).toBe(true)
      expect(Number.isFinite(sample.z)).toBe(true)
      expect(Number.isFinite(sample.height)).toBe(true)
    }
  })

  it('never returns NaN or Infinity for degenerate inputs (zero-length, NaN coords)', () => {
    const zeroLen = samplePassArc({ from, to: from, u: 0.5, kind: 'pass' })
    expect(Number.isFinite(zeroLen.height)).toBe(true)
    expect(zeroLen.height).toBeCloseTo(BALL_PEAK_MIN_FT, 6)

    const nanFrom = samplePassArc({ from: { x: Number.NaN, z: 0 }, to, u: 0.5, kind: 'pass' })
    expect(Number.isFinite(nanFrom.x)).toBe(true)
    expect(Number.isFinite(nanFrom.height)).toBe(true)

    const nanTo = samplePassArc({ from, to: { x: 0, z: Number.NaN }, u: 0.5, kind: 'pass' })
    expect(Number.isFinite(nanTo.z)).toBe(true)
    expect(Number.isFinite(nanTo.height)).toBe(true)
  })

  it('does not mutate input points', () => {
    const localFrom = { x: 1, z: 2 }
    const localTo = { x: 3, z: 4 }
    samplePassArc({ from: localFrom, to: localTo, u: 0.5, kind: 'pass' })
    expect(localFrom).toEqual({ x: 1, z: 2 })
    expect(localTo).toEqual({ x: 3, z: 4 })
  })
})

describe('easeInOutCubic', () => {
  it('is monotonic and bounded', () => {
    let prev = -Infinity
    for (let i = 0; i <= 10; i++) {
      const v = easeInOutCubic(i / 10)
      expect(v).toBeGreaterThanOrEqual(prev)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
      prev = v
    }
  })

  it('is symmetric around 0.5', () => {
    expect(easeInOutCubic(0.25) + easeInOutCubic(0.75)).toBeCloseTo(1, 6)
  })
})

describe('resolvePassReleaseAnchor / resolvePassCatchAnchor', () => {
  it('returns null when no holder is given', () => {
    const scene = buildScene()
    const tl = buildTimeline(scene, [])
    expect(resolvePassReleaseAnchor(scene, tl, null, 0)).toBeNull()
  })

  it('returns the holder’s sampled position at the requested release ms', () => {
    const scene = buildScene()
    const moves: SceneMovement[] = [
      { id: 'pg_step', playerId: 'pg', kind: 'lift', to: { x: 2, z: 0 }, durationMs: 500 },
    ]
    const tl = buildTimeline(scene, moves)
    const releaseAtStart = resolvePassReleaseAnchor(scene, tl, 'pg', 0)
    const releaseAtEnd = resolvePassReleaseAnchor(scene, tl, 'pg', 500)
    expect(releaseAtStart!.x).toBeCloseTo(0, 6)
    expect(releaseAtEnd!.x).toBeCloseTo(2, 6)
  })

  it('catch anchor picks the closest player to the target at arrival', () => {
    const scene = buildScene({
      players: [
        { id: 'pg', team: 'offense', role: 'pg', start: { x: 0, z: 0 }, hasBall: true },
        { id: 'cutter', team: 'offense', role: 'wing', start: { x: 19, z: 9 } },
        { id: 'corner', team: 'offense', role: 'corner', start: { x: 22, z: 1 } },
      ],
    })
    const moves: SceneMovement[] = [
      { id: 'cut', playerId: 'cutter', kind: 'back_cut', to: { x: 4, z: 2 }, durationMs: 750 },
    ]
    const tl = buildTimeline(scene, moves)
    const anchor = resolvePassCatchAnchor(scene, tl, { x: 4, z: 2 }, 750)
    expect(anchor).not.toBeNull()
    expect(anchor!.playerId).toBe('cutter')
    // The cutter is fully arrived at u=1, so the anchor matches the
    // cutter's end position to within the easing precision.
    expect(anchor!.point.x).toBeCloseTo(4, 4)
    expect(anchor!.point.z).toBeCloseTo(2, 4)
  })

  it('returns null on a scene with no players', () => {
    const scene = buildScene({ players: [] })
    const tl = buildTimeline(scene, [])
    expect(resolvePassCatchAnchor(scene, tl, { x: 0, z: 0 }, 0)).toBeNull()
  })

  it('does not mutate the scene when resolving anchors', () => {
    const scene = buildScene()
    const snapshot = JSON.stringify(scene)
    const tl = buildTimeline(scene, [])
    resolvePassReleaseAnchor(scene, tl, 'pg', 100)
    resolvePassCatchAnchor(scene, tl, { x: 4, z: 2 }, 100)
    expect(JSON.stringify(scene)).toBe(snapshot)
  })
})

describe('P2.5 — BDW-01 backdoor pass timing alignment', () => {
  // Mirrors the authored BDW-01 answer demo. The teaching beat must
  // read as: defender denies → cutter goes backdoor → passer reacts
  // to the cut → ball arrives in open space when the cutter does.
  //
  // The numbers below are kept in sync with
  // packages/db/seed/scenarios/packs/founder-v0/BDW-01.json.
  const scene = buildScene({
    players: [
      { id: 'pg', team: 'offense', role: 'pg', start: { x: -9, z: 14 }, hasBall: true },
      { id: 'user', team: 'offense', role: 'wing', start: { x: 18, z: 8 }, isUser: true },
    ],
    ball: { start: { x: -9, z: 14 }, holderId: 'pg' },
  })
  const answer: SceneMovement[] = [
    { id: 'user_jab', playerId: 'user', kind: 'jab', to: { x: 19, z: 9 }, delayMs: 0, durationMs: 250 },
    { id: 'user_plant_and_go', playerId: 'user', kind: 'back_cut', to: { x: 4, z: 2 }, delayMs: 100, durationMs: 750 },
    { id: 'pg_lead_pass', playerId: 'ball', kind: 'pass', to: { x: 4, z: 2 }, delayMs: 500, durationMs: 600 },
    { id: 'user_finish', playerId: 'user', kind: 'cut', to: { x: 0, z: 0.5 }, delayMs: 50, durationMs: 350 },
  ]
  const tl = buildTimeline(scene, answer)
  const pass = tl.movements.find((m) => m.id === 'pg_lead_pass')!
  const cut = tl.movements.find((m) => m.id === 'user_plant_and_go')!

  it('passer releases AFTER the cutter has visibly committed to the back-cut', () => {
    // Cutter starts the back-cut at 350 ms; pass releases at 500 ms.
    // The 150 ms gap is the readable "passer reacts to the cut" beat.
    expect(pass.startMs).toBeGreaterThan(cut.startMs)
    expect(pass.startMs - cut.startMs).toBeGreaterThanOrEqual(100)
  })

  it('ball arrival lines up with the cutter arriving at the rim', () => {
    expect(pass.endMs).toBe(cut.endMs)
  })

  it('pass does not mutate scenario data when sampled mid-flight', () => {
    const snapshot = JSON.stringify(scene)
    samplePassArc({
      from: pass.from,
      to: pass.to,
      u: 0.5,
      kind: 'pass',
    })
    expect(JSON.stringify(scene)).toBe(snapshot)
  })

  it('arc is finite-safe across the full pass timeline', () => {
    for (let t = pass.startMs; t <= pass.endMs; t += 25) {
      const u = (t - pass.startMs) / (pass.endMs - pass.startMs)
      const s = samplePassArc({ from: pass.from, to: pass.to, u, kind: 'pass' })
      expect(Number.isFinite(s.x)).toBe(true)
      expect(Number.isFinite(s.z)).toBe(true)
      expect(Number.isFinite(s.height)).toBe(true)
      // Apex must stay below the gym ceiling.
      expect(s.height).toBeLessThanOrEqual(BALL_PEAK_MAX_FT + 1e-6)
    }
  })
})
