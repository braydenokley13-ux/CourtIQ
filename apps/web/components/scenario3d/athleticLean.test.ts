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
    it(`'${kind}' segment shows a non-zero bob between strides (u≈0.25)`, () => {
      const scene = buildSceneWithSingleMovement(kind)
      // u ≈ 0.25 → 200 ms into 800 ms span.
      const bob = bobAt(scene, 200)
      expect(bob).toBeGreaterThan(0)
      // Bob is bounded ≤ 0.06 ft (~1.8 cm) — explicitly small.
      expect(bob).toBeLessThan(0.07)
    })

    it(`'${kind}' segment grounds the figure at u=0.5 (peak lean, mid-stride contact)`, () => {
      const scene = buildSceneWithSingleMovement(kind)
      // |sin(2π·0.5)| = |sin(π)| = 0 → contact point.
      const bob = bobAt(scene, 400)
      expect(bob).toBeCloseTo(0, 6)
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
