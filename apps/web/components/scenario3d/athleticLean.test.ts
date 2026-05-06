/* @vitest-environment jsdom */
/**
 * Visual / Motion Review — Athletic Forward-Lean.
 *
 * Locks the contract that explosive movement segments (cut, back_cut,
 * drive, jab, baseline_sneak) tilt the player forward through a
 * deterministic triangular envelope, while non-explosive segments
 * (rotation, lift, drift, closeout, pass) keep the figure upright.
 *
 * Pure imperative-path coverage — replay determinism is preserved.
 */

import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { MotionController } from './imperativeScene'
import type { Scene3D, SceneMovementKind } from '@/lib/scenario3d/scene'

function stubGroup(): THREE.Group {
  const v = new THREE.Vector3(0, 0, 0)
  const r = { x: 0, y: 0, z: 0 }
  return { position: v, rotation: r } as unknown as THREE.Group
}

function buildSceneWithSingleMovement(kind: SceneMovementKind): Scene3D {
  return {
    id: `lean_test_${kind}`,
    court: 'half',
    camera: 'teaching_angle',
    players: [
      { id: 'user', team: 'offense', role: 'wing', start: { x: 0, z: 10 }, isUser: true },
    ],
    ball: { start: { x: 0, z: 10 }, holderId: 'user' },
    movements: [
      { id: 'm', playerId: 'user', kind, to: { x: 6, z: 4 }, durationMs: 800 },
    ],
    answerDemo: [],
    wrongDemos: [],
    preAnswerOverlays: [],
    postAnswerOverlays: [],
    freezeAtMs: null,
    synthetic: false,
  }
}

function makeMotion(scene: Scene3D) {
  const players = new Map<string, THREE.Group>()
  for (const p of scene.players) players.set(p.id, stubGroup())
  const ball = stubGroup()
  const motion = new MotionController(scene, 'intro', players, ball, 0.5)
  return { motion, players, ball }
}

/**
 * Drives the controller to a specific time and returns the user's
 * `rotation.x`. Bootstrap-then-jump pattern so `startedAt` lands
 * cleanly at t=0.
 */
function leanAt(scene: Scene3D, ms: number): number {
  const { motion, players } = makeMotion(scene)
  // Bootstrap at t=0; second tick at t=PRE_DELAY+ms lands the
  // controller's elapsed time at exactly `ms`.
  motion.tick(0)
  motion.tick(0 + 250 + ms)
  return players.get('user')!.rotation.x
}

describe('Athletic lean — explosive segments lean forward through a triangular envelope', () => {
  for (const kind of ['cut', 'back_cut', 'drive', 'jab', 'baseline_sneak', 'closeout'] as const) {
    it(`'${kind}' segment peaks above 0 at u=0.5 (mid-segment)`, () => {
      const scene = buildSceneWithSingleMovement(kind)
      // Sample at mid-segment (~400 ms into the 800 ms span).
      const lean = leanAt(scene, 400)
      // The triangular envelope hits exactly 1.0 at u=0.5, so the
      // observed rotation.x equals the configured peak. Every
      // segment tagged "explosive" has peak > 0.04 rad (~2.3°) —
      // visible at broadcast distance but well below ragdoll
      // territory. Closeout is included as the smallest "explosive
      // commit" (≈ 4°) — defenders weight forward to challenge.
      expect(lean).toBeGreaterThan(0.04)
      // Cap at ~12° (0.21 rad) so no kind tilts the figure into a
      // dive — the upper bound is the basketball-body-language
      // floor we want, not a hard physics limit.
      expect(lean).toBeLessThan(0.21)
    })

    it(`'${kind}' segment ramps in (lower lean at u=0.1 than u=0.5)`, () => {
      const scene = buildSceneWithSingleMovement(kind)
      const earlyLean = leanAt(scene, 80) // u ≈ 0.1
      const midLean = leanAt(scene, 400) // u ≈ 0.5
      expect(earlyLean).toBeLessThan(midLean)
    })

    it(`'${kind}' segment ramps out (lower lean at u=0.9 than u=0.5)`, () => {
      const scene = buildSceneWithSingleMovement(kind)
      const lateLean = leanAt(scene, 720) // u ≈ 0.9
      const midLean = leanAt(scene, 400) // u ≈ 0.5
      expect(lateLean).toBeLessThan(midLean)
    })
  }
})

describe('Athletic lean — non-explosive segments keep the figure upright', () => {
  // Closeout was promoted to "committed defender" lean in the premium
  // pass — see ATHLETIC_LEAN_PEAK_RAD_BY_KIND. Repositioning /
  // off-ball / pass segments still stay upright.
  for (const kind of ['rotation', 'lift', 'drift', 'stop_ball'] as const) {
    it(`'${kind}' segment never leans the figure (rotation.x stays 0)`, () => {
      const scene = buildSceneWithSingleMovement(kind)
      // Sample across the segment: any sample must be 0.
      for (const ms of [80, 400, 720]) {
        expect(leanAt(scene, ms), `${kind}@${ms}ms`).toBeCloseTo(0, 6)
      }
    })
  }
})

describe('Athletic lean — outside any active segment, figure is upright', () => {
  it('between segments, rotation.x is 0', () => {
    const scene: Scene3D = {
      ...buildSceneWithSingleMovement('cut'),
      movements: [
        // First cut ends at 800 ms.
        { id: 'cut1', playerId: 'user', kind: 'cut', to: { x: 6, z: 4 }, durationMs: 800 },
        // Second cut starts after a 400 ms gap.
        { id: 'cut2', playerId: 'user', kind: 'cut', to: { x: 0, z: 0 }, delayMs: 400, durationMs: 600 },
      ],
    }
    // Sample inside the gap (e.g. 1000 ms — between 800 and 1200).
    const lean = leanAt(scene, 1000)
    expect(lean).toBeCloseTo(0, 6)
  })
})

describe('Athletic lean — determinism', () => {
  it('two independent controllers produce identical lean at the same t', () => {
    const sceneA = buildSceneWithSingleMovement('back_cut')
    const sceneB = buildSceneWithSingleMovement('back_cut')
    const a = leanAt(sceneA, 400)
    const b = leanAt(sceneB, 400)
    expect(a).toBeCloseTo(b, 12)
  })
})

/**
 * Returns the user's `position.y` at elapsed `ms` for the given scene.
 * The test stub initializes y=0, so any non-zero return is the bob
 * contribution from the active segment. Same bootstrap-then-jump
 * pattern as `leanAt`.
 */
function bobAt(scene: Scene3D, ms: number): number {
  const { motion, players } = makeMotion(scene)
  motion.tick(0)
  motion.tick(0 + 250 + ms)
  return players.get('user')!.position.y
}

describe('Athletic stride bob — explosive segments produce a foot-load cadence', () => {
  for (const kind of ['cut', 'back_cut', 'drive'] as const) {
    it(`'${kind}' segment produces a non-zero bob somewhere in the segment`, () => {
      // V4-B — per-player phase offset means the |sin| zero crossings
      // aren't pinned to u=0.5 anymore. The contract becomes "the bob
      // has at least one non-zero peak across the segment AND stays
      // inside the budgeted amplitude."
      const scene = buildSceneWithSingleMovement(kind)
      const samples = [80, 160, 240, 320, 400, 480, 560, 640, 720].map((ms) =>
        bobAt(scene, ms),
      )
      const peak = Math.max(...samples)
      expect(peak).toBeGreaterThan(0)
      expect(peak).toBeLessThan(0.07)
    })

    it(`'${kind}' segment bob is bounded by the kind's peak budget`, () => {
      // Sample the segment densely and confirm no sample exceeds the
      // budget. Used to be "pinned to 0 at u=0.5"; the V4-B
      // per-player phase offset breaks the pin but the BOUND still
      // holds, which is the safety invariant we actually care about.
      const scene = buildSceneWithSingleMovement(kind)
      for (let ms = 0; ms <= 800; ms += 40) {
        const bob = bobAt(scene, ms)
        expect(bob, `${kind}@${ms}ms`).toBeLessThanOrEqual(0.07)
        expect(bob, `${kind}@${ms}ms`).toBeGreaterThanOrEqual(0)
      }
    })
  }
})

describe('Athletic stride bob — non-explosive segments keep the figure grounded', () => {
  // Players in non-explosive movements never get tagged for bob, so
  // position.y stays at the build-time baseline (0 in the test stub,
  // PLAYER_LIFT in the real builder).
  for (const kind of ['rotation', 'lift', 'drift'] as const) {
    it(`'${kind}' segment keeps position.y at the build baseline across the segment`, () => {
      const scene = buildSceneWithSingleMovement(kind)
      for (const ms of [100, 400, 700]) {
        expect(bobAt(scene, ms), `${kind}@${ms}ms`).toBeCloseTo(0, 6)
      }
    })
  }
})

describe('V4-B — Lateral cornering bank during angle-cuts', () => {
  /**
   * Builds a scene where the user makes a single cut whose direction
   * is purely lateral (high |dx|, near-zero dz). Verifies that
   * `rotation.z` banks INTO the corner — negative when traveling +x,
   * positive when traveling -x.
   */
  function buildLateralCutScene(direction: 'right' | 'left'): Scene3D {
    const sign = direction === 'right' ? 1 : -1
    return {
      ...buildSceneWithSingleMovement('cut'),
      players: [
        { id: 'user', team: 'offense', role: 'wing', start: { x: 0, z: 10 }, isUser: true },
      ],
      movements: [
        { id: 'lateral', playerId: 'user', kind: 'cut', to: { x: sign * 8, z: 10.5 }, durationMs: 800 },
      ],
    }
  }

  it('a +x cut produces negative rotation.z (banks right)', () => {
    const scene = buildLateralCutScene('right')
    const { motion, players } = makeMotion(scene)
    motion.tick(0)
    motion.tick(0 + 250 + 400) // u ≈ 0.5 — peak envelope
    expect(players.get('user')!.rotation.z).toBeLessThan(0)
  })

  it('a -x cut produces positive rotation.z (banks left)', () => {
    const scene = buildLateralCutScene('left')
    const { motion, players } = makeMotion(scene)
    motion.tick(0)
    motion.tick(0 + 250 + 400)
    expect(players.get('user')!.rotation.z).toBeGreaterThan(0)
  })

  it('a forward-only cut (no |dx|) produces zero bank', () => {
    const scene: Scene3D = {
      ...buildSceneWithSingleMovement('cut'),
      players: [
        { id: 'user', team: 'offense', role: 'wing', start: { x: 0, z: 10 }, isUser: true },
      ],
      movements: [
        { id: 'forward', playerId: 'user', kind: 'cut', to: { x: 0, z: 4 }, durationMs: 800 },
      ],
    }
    const { motion, players } = makeMotion(scene)
    motion.tick(0)
    motion.tick(0 + 250 + 400)
    expect(players.get('user')!.rotation.z).toBeCloseTo(0, 6)
  })

  it('bank amplitude stays under 6° (~0.105 rad) at peak', () => {
    const scene = buildLateralCutScene('right')
    const { motion, players } = makeMotion(scene)
    motion.tick(0)
    // Sample across segment; the deepest bank shows around mid-segment.
    let maxAbs = 0
    for (let ms = 80; ms <= 720; ms += 40) {
      motion.tick(0 + 250 + ms)
      const bank = Math.abs(players.get('user')!.rotation.z)
      if (bank > maxAbs) maxAbs = bank
    }
    expect(maxAbs).toBeLessThan(0.105)
  })
})

describe('V4-B — Per-player stride phase offset', () => {
  it('two players with different ids produce different bob values at the same t', () => {
    const scene: Scene3D = {
      ...buildSceneWithSingleMovement('cut'),
      players: [
        { id: 'aaaa', team: 'offense', role: 'wing', start: { x: 0, z: 10 }, isUser: true },
        { id: 'zzzz', team: 'offense', role: 'wing', start: { x: 5, z: 10 } },
      ],
      movements: [
        { id: 'a_cut', playerId: 'aaaa', kind: 'cut', to: { x: 4, z: 4 }, durationMs: 800 },
        { id: 'z_cut', playerId: 'zzzz', kind: 'cut', to: { x: 8, z: 4 }, durationMs: 800 },
      ],
    }
    const { motion, players } = makeMotion(scene)
    motion.tick(0)
    motion.tick(0 + 250 + 200) // mid-stride window
    const aBob = players.get('aaaa')!.position.y
    const zBob = players.get('zzzz')!.position.y
    // Different ids → different phase offsets → different bob values.
    expect(aBob).not.toBe(zBob)
  })

  it('the same id produces a stable phase offset across separate scenes', () => {
    // Determinism — a player named 'user' gets the same offset in
    // two independent scenes that share that id.
    const sceneA = buildSceneWithSingleMovement('cut')
    const sceneB = buildSceneWithSingleMovement('cut')
    const a = bobAt(sceneA, 200)
    const b = bobAt(sceneB, 200)
    expect(a).toBeCloseTo(b, 12)
  })
})

describe('Athletic stride bob — preserves build-time baseline outside any active segment', () => {
  it('a player with no movements is never tagged for bob (position.y untouched)', () => {
    const scene: Scene3D = {
      ...buildSceneWithSingleMovement('cut'),
      movements: [],
    }
    const { motion, players } = makeMotion(scene)
    // The mock stub initializes y=0; the controller MUST NOT write
    // to it for a player that never enters an explosive segment.
    motion.tick(0)
    motion.tick(1_000)
    expect(players.get('user')!.position.y).toBe(0)
  })
})
