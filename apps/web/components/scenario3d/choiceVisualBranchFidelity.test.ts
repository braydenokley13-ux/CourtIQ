/* @vitest-environment jsdom */
/**
 * Visual / Motion Review — Choice → Visual Branch Fidelity.
 *
 * Locks the contract that the user's picked choice ALWAYS drives a
 * visually distinct consequence, and that the best-read pick always
 * skips the wrong-demo and runs the answer-demo (best-read replay).
 *
 * Three invariants pinned here so they cannot regress:
 *
 *   1. A wrong/acceptable pick maps to its own `wrongDemos[choiceId]`
 *      entry — not the first one, not the last one, not a default.
 *      (`MotionController.startConsequence` must look up by id.)
 *
 *   2. Two different wrong-quality choices produce visually different
 *      end-frames. If the renderer were to ignore `choiceId` and play
 *      a single "generic consequence" for every wrong pick, both
 *      branches would converge to the same final positions and this
 *      test would catch it.
 *
 *   3. The best-read pick (no `wrongDemos[]` entry) skips consequence
 *      entirely and goes straight to `replaying`. The end-frame must
 *      match `scene.answerDemo`'s endpoints — never a wrongDemo's.
 *
 * Pure imperative-path coverage. The JSX `ScenarioReplayController`
 * runs the same dispatch (`scene.wrongDemos.find(d => d.choiceId === id)`)
 * but is exercised separately in `replayDeterminism.test.ts`.
 */

import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  MotionController,
  ReplayStateMachine,
  type ReplayState,
} from './imperativeScene'
import type { CourtPoint } from '@/lib/scenario3d/coords'
import type { Scene3D } from '@/lib/scenario3d/scene'

function stubGroup(): THREE.Group {
  const v = new THREE.Vector3(0, 0, 0)
  const r = { x: 0, y: 0, z: 0 }
  return { position: v, rotation: r } as unknown as THREE.Group
}

/**
 * Builds a deliberately distinguishable scene: each wrong-quality
 * choice resolves to a different player end-position, and the
 * answer-demo's end-position is different from every wrongDemo's.
 *
 * Choice metadata mirrors the founder-v0 shape (best/acceptable/wrong/
 * wrong) so a regression in either dispatch path surfaces here.
 */
function buildBranchedScene(): Scene3D {
  return {
    id: 'choice_branch_fixture',
    court: 'half',
    camera: 'teaching_angle',
    decoderTag: 'BACKDOOR_WINDOW',
    players: [
      { id: 'user', team: 'offense', role: 'wing', start: { x: 0, z: 10 }, isUser: true },
      { id: 'pg', team: 'offense', role: 'pg', start: { x: -8, z: 15 }, hasBall: true },
    ],
    ball: { start: { x: -8, z: 15 }, holderId: 'pg' },
    movements: [
      // Intro plays through to the freeze cap; the user lifts to the
      // catch point and the defender steps to the denial.
      { id: 'lift', playerId: 'user', kind: 'lift', to: { x: 0, z: 11 }, durationMs: 600 },
    ],
    answerDemo: [
      // Best-read replay: the back-cut to the rim. End-position is
      // (4, 1) — different from EVERY wrongDemo end.
      { id: 'back_cut', playerId: 'user', kind: 'back_cut', to: { x: 4, z: 1 }, durationMs: 700 },
    ],
    wrongDemos: [
      {
        choiceId: 'c2', // acceptable — V-cut keeps the play alive but misses the layup.
        movements: [
          { id: 'v_cut', playerId: 'user', kind: 'cut', to: { x: 8, z: 12 }, durationMs: 600 },
        ],
      },
      {
        choiceId: 'c3', // wrong — stand still, defender deflects.
        movements: [
          { id: 'stand', playerId: 'user', kind: 'rotation', to: { x: 0, z: 11 }, durationMs: 350 },
        ],
      },
      {
        choiceId: 'c4', // wrong — front cut, defender rides.
        movements: [
          { id: 'front_cut', playerId: 'user', kind: 'cut', to: { x: -6, z: 6 }, durationMs: 800 },
        ],
      },
    ],
    acceptableDemos: [],
    preAnswerOverlays: [],
    postAnswerOverlays: [],
    freezeAtMs: 500,
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
 * Drives the state machine to `frozen` so a `pickChoice` call lands.
 *
 * MotionController bootstraps `startedAt` on its first tick after a
 * leg swap. We deliberately tick twice: once to bootstrap, once to
 * cross the freeze cap. Returns the wall-clock `now` of the second
 * tick so callers can chain follow-up legs.
 */
function driveToFrozen(
  machine: ReplayStateMachine,
  motion: MotionController,
  states: ReplayState[],
): { now: number } {
  machine.start()
  // Bootstrap tick — sets startedAt = 0.
  motion.tick(0)
  // PRE_DELAY (250) + freezeAtMs (500) + slack
  const now = 0 + 250 + 600
  motion.tick(now)
  machine.tick(now)
  expect(states.at(-1)).toBe('frozen')
  return { now }
}

/**
 * Drives the consequence leg to completion. After `pickChoice`, the
 * controller's `startedAt` is null so the very next tick bootstraps
 * it. We do that bootstrap then jump to `+4s` to land beyond every
 * authored wrongDemo + the inter-leg PRE_DELAY. Returns the wall-
 * clock time at which the machine is observed in `replaying`.
 */
function driveConsequenceToReplay(
  machine: ReplayStateMachine,
  motion: MotionController,
  states: ReplayState[],
  startNow: number,
): number {
  // Bootstrap tick anchors the consequence leg.
  motion.tick(startNow)
  const t = startNow + 4_000
  motion.tick(t)
  machine.tick(t)
  expect(states.at(-1)).toBe('replaying')
  return t
}

/** Drives the replaying leg to completion. Bootstrap-then-jump same
 *  shape as the consequence helper above. */
function driveReplayToDone(
  machine: ReplayStateMachine,
  motion: MotionController,
  states: ReplayState[],
  startNow: number,
): number {
  motion.tick(startNow)
  const t = startNow + 4_000
  motion.tick(t)
  machine.tick(t)
  expect(states.at(-1)).toBe('done')
  return t
}

/**
 * Bootstrap-then-jump helper for asserting the user's end position
 * after a single pickChoice → consequence dispatch. Returns the
 * `(x, z)` at the consequence leg's terminal frame.
 */
function pickAndSampleEnd(
  scene: Scene3D,
  choiceId: string,
): { x: number; z: number } {
  const players = new Map<string, THREE.Group>()
  for (const p of scene.players) players.set(p.id, stubGroup())
  const ball = stubGroup()
  const motion = new MotionController(scene, 'intro', players, ball, 0.5)
  const machine = new ReplayStateMachine(motion, scene)
  const states: ReplayState[] = []
  machine.subscribe(({ state }) => states.push(state))
  const { now } = driveToFrozen(machine, motion, states)
  machine.pickChoice(choiceId, now)
  // Bootstrap then jump beyond every authored consequence span.
  motion.tick(now)
  motion.tick(now + 4_000)
  const u = players.get('user')!
  return { x: u.position.x, z: u.position.z }
}

describe('Choice fidelity — wrong/acceptable picks each play their own wrongDemo', () => {
  it('selecting c2 (acceptable) plays the c2 movement, not c3 or c4', () => {
    const end = pickAndSampleEnd(buildBranchedScene(), 'c2')
    expect(end.x).toBeCloseTo(8, 2)
    expect(end.z).toBeCloseTo(12, 2)
  })

  it('selecting c3 (wrong) plays the c3 movement, not c2 or c4', () => {
    const end = pickAndSampleEnd(buildBranchedScene(), 'c3')
    // c3 holds the user at (0, 11) — the V-cut and the front-cut go
    // elsewhere. If the dispatcher fell back to wrongDemos[0] (c2)
    // the user would be at (8, 12) and this would fail.
    expect(end.x).toBeCloseTo(0, 2)
    expect(end.z).toBeCloseTo(11, 2)
  })

  it('selecting c4 (wrong) plays the c4 movement, not c2 or c3', () => {
    const end = pickAndSampleEnd(buildBranchedScene(), 'c4')
    expect(end.x).toBeCloseTo(-6, 2)
    expect(end.z).toBeCloseTo(6, 2)
  })

  it('the three wrong/acceptable picks produce three distinct user end-positions', () => {
    // Cross-pick comparison: each pick lands the user at a different
    // (x, z) — the branches are visually distinguishable, not a
    // shared "generic consequence."
    const samples = (['c2', 'c3', 'c4'] as const).map((id) => ({
      id,
      ...pickAndSampleEnd(buildBranchedScene(), id),
    }))
    const distSq = (a: { x: number; z: number }, b: { x: number; z: number }) => {
      const dx = a.x - b.x
      const dz = a.z - b.z
      return dx * dx + dz * dz
    }
    // Pairwise distance > 1 ft² — comfortably larger than any rounding noise.
    expect(distSq(samples[0]!, samples[1]!)).toBeGreaterThan(1)
    expect(distSq(samples[1]!, samples[2]!)).toBeGreaterThan(1)
    expect(distSq(samples[0]!, samples[2]!)).toBeGreaterThan(1)
  })
})

describe('Choice fidelity — best-read short-circuit', () => {
  it('a best-quality pick (no wrongDemos entry) skips consequence and runs the answer demo', () => {
    const scene = buildBranchedScene()
    const { motion, players } = makeMotion(scene)
    const machine = new ReplayStateMachine(motion, scene)
    const states: ReplayState[] = []
    machine.subscribe(({ state }) => states.push(state))

    const { now } = driveToFrozen(machine, motion, states)
    // 'c1' has no wrongDemos entry in the fixture — expected best-read
    // path. Must skip 'consequence' and go straight to 'replaying'.
    machine.pickChoice('c1', now)
    expect(states.at(-1)).toBe('replaying')
    expect(states).not.toContain('consequence' as ReplayState)

    // Drive the answer-demo to completion; the user must end at the
    // back-cut endpoint (4, 1) — NOT a wrongDemo end.
    driveReplayToDone(machine, motion, states, now)
    const userGroup = players.get('user')!
    expect(userGroup.position.x).toBeCloseTo(4, 2)
    expect(userGroup.position.z).toBeCloseTo(1, 2)
  })

  it('after a wrong pick, the consequence-leg ends and the answer-demo replay still plays', () => {
    // The wrong-path full sequence: consequence completes, then the
    // machine swaps to the answer-demo. The user's final position
    // must equal scene.answerDemo's endpoint regardless of which
    // wrong choice was picked.
    for (const choiceId of ['c2', 'c3', 'c4'] as const) {
      const scene = buildBranchedScene()
      const { motion, players } = makeMotion(scene)
      const machine = new ReplayStateMachine(motion, scene)
      const states: ReplayState[] = []
      machine.subscribe(({ state }) => states.push(state))
      const { now } = driveToFrozen(machine, motion, states)
      machine.pickChoice(choiceId, now)
      const replayStart = driveConsequenceToReplay(machine, motion, states, now)
      driveReplayToDone(machine, motion, states, replayStart)

      const u = players.get('user')!
      expect(u.position.x, `${choiceId}: expected back-cut endpoint x`).toBeCloseTo(4, 2)
      expect(u.position.z, `${choiceId}: expected back-cut endpoint z`).toBeCloseTo(1, 2)
    }
  })
})

describe('Choice fidelity — startConsequence is choice-aware', () => {
  it('startConsequence loads the matching wrongDemos entry by id, not by index', () => {
    // Pin the lookup contract directly: when the wrongDemos list is
    // out-of-order vs the choices list, picking by id must still
    // resolve correctly. Builds a scene whose wrongDemos[] order is
    // [c4, c2, c3] (deliberately scrambled) and verifies each pick
    // still produces the right movement endpoint.
    const scene: Scene3D = {
      ...buildBranchedScene(),
      wrongDemos: [
        {
          choiceId: 'c4',
          movements: [
            { id: 'm', playerId: 'user', kind: 'cut', to: { x: -6, z: 6 }, durationMs: 800 },
          ],
        },
        {
          choiceId: 'c2',
          movements: [
            { id: 'm', playerId: 'user', kind: 'cut', to: { x: 8, z: 12 }, durationMs: 600 },
          ],
        },
        {
          choiceId: 'c3',
          movements: [
            { id: 'm', playerId: 'user', kind: 'rotation', to: { x: 0, z: 11 }, durationMs: 350 },
          ],
        },
      ],
    }

    const expected: Record<string, CourtPoint> = {
      c2: { x: 8, z: 12 },
      c3: { x: 0, z: 11 },
      c4: { x: -6, z: 6 },
    }
    for (const choiceId of ['c2', 'c3', 'c4'] as const) {
      const players = new Map<string, THREE.Group>()
      for (const p of scene.players) players.set(p.id, stubGroup())
      const ball = stubGroup()
      const motion = new MotionController(scene, 'intro', players, ball, 0.5)
      expect(motion.startConsequence(choiceId)).toBe(true)
      // Bootstrap then jump beyond the consequence span + PRE_DELAY.
      motion.tick(0)
      motion.tick(2_500)
      const u = players.get('user')!
      expect(u.position.x, `${choiceId}.x`).toBeCloseTo(expected[choiceId]!.x, 2)
      expect(u.position.z, `${choiceId}.z`).toBeCloseTo(expected[choiceId]!.z, 2)
    }
  })
})
