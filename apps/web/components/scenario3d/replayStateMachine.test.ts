/* @vitest-environment jsdom */
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  MotionController,
  ReplayStateMachine,
  type ReplayState,
} from './imperativeScene'
import type { Scene3D } from '@/lib/scenario3d/scene'

// Minimal stub for the THREE groups MotionController writes positions
// into. The controller only ever touches `position.x/y/z` and
// `position.set()`, so the rendering pipeline isn't exercised here.
function stubGroup(): THREE.Group {
  const v = new THREE.Vector3(0, 0, 0)
  return { position: v } as unknown as THREE.Group
}

function buildScene(opts: {
  freezeAtMs?: number | null
  intro: Scene3D['movements']
  answerDemo?: Scene3D['answerDemo']
  wrongDemos?: Scene3D['wrongDemos']
}): Scene3D {
  return {
    id: 'sm_test',
    court: 'half',
    camera: 'teaching_angle',
    players: [
      { id: 'user', team: 'offense', role: 'wing', start: { x: 0, z: 10 }, isUser: true },
      { id: 'pg', team: 'offense', role: 'pg', start: { x: 5, z: 20 }, hasBall: true },
    ],
    ball: { start: { x: 5, z: 20 }, holderId: 'pg' },
    movements: opts.intro,
    answerDemo: opts.answerDemo ?? [],
    wrongDemos: opts.wrongDemos ?? [],
    freezeAtMs: opts.freezeAtMs ?? null,
    synthetic: false,
  }
}

function makeMotion(scene: Scene3D): { motion: MotionController; players: Map<string, THREE.Group>; ball: THREE.Group } {
  const players = new Map<string, THREE.Group>()
  for (const p of scene.players) players.set(p.id, stubGroup())
  const ball = stubGroup()
  const motion = new MotionController(scene, 'intro', players, ball, 0.5)
  return { motion, players, ball }
}

describe('MotionController — freeze cap', () => {
  it('clamps elapsed time at freezeAtMs and fires consumeFrozen exactly once', () => {
    const scene = buildScene({
      freezeAtMs: 700,
      intro: [
        { id: 'cut', playerId: 'user', kind: 'cut', to: { x: 0, z: 4 }, durationMs: 1500 },
      ],
    })
    const { motion } = makeMotion(scene)
    motion.setFreezeAtMs(scene.freezeAtMs)

    // Anchor the timeline. tick at t=0 sets startedAt; the freeze flag
    // can fire on the same tick or the next, depending on whether the
    // raw elapsed has already crossed the cap.
    motion.tick(1000)
    expect(motion.consumeFrozen()).toBe(false)

    // Jump forward past the freeze cap. PRE_DELAY_MS (250) + freezeAtMs
    // (700) = 950ms of real time after the first tick.
    motion.tick(1000 + 250 + 700 + 50)
    expect(motion.consumeFrozen()).toBe(true)
    // One-shot — does not re-fire.
    expect(motion.consumeFrozen()).toBe(false)

    // Even with more elapsed real time, the visible t stays clamped.
    expect(motion.getElapsedMs(1000 + 250 + 5000)).toBe(700)
  })

  it('does not fire consumeFrozen when freezeAtMs is null (legacy scenes)', () => {
    const scene = buildScene({
      intro: [{ id: 'cut', playerId: 'user', kind: 'cut', to: { x: 0, z: 4 }, durationMs: 700 }],
    })
    const { motion } = makeMotion(scene)
    motion.tick(1000)
    motion.tick(1000 + 5000)
    expect(motion.consumeFrozen()).toBe(false)
  })

  it('isPlaybackComplete flips true after the timeline ends', () => {
    const scene = buildScene({
      intro: [{ id: 'cut', playerId: 'user', kind: 'cut', to: { x: 0, z: 4 }, durationMs: 500 }],
    })
    const { motion } = makeMotion(scene)
    motion.tick(1000)
    expect(motion.isPlaybackComplete(1000)).toBe(false)
    motion.tick(1000 + 250 + 600)
    expect(motion.isPlaybackComplete(1000 + 250 + 600)).toBe(true)
  })
})

describe('MotionController — leg swap', () => {
  it('startConsequence returns false when no wrongDemos entry matches', () => {
    const scene = buildScene({
      intro: [{ id: 'cut', playerId: 'user', kind: 'cut', to: { x: 0, z: 4 }, durationMs: 500 }],
    })
    const { motion } = makeMotion(scene)
    expect(motion.startConsequence('nonexistent_choice')).toBe(false)
  })

  it('startConsequence(choiceId) loads the matching wrongDemos movement list', () => {
    const scene = buildScene({
      intro: [{ id: 'cut', playerId: 'user', kind: 'cut', to: { x: 0, z: 4 }, durationMs: 500 }],
      wrongDemos: [
        {
          choiceId: 'wait',
          movements: [
            { id: 'recover', playerId: 'user', kind: 'rotation', to: { x: 5, z: 10 }, durationMs: 800 },
          ],
        },
      ],
    })
    const { motion } = makeMotion(scene)
    expect(motion.startConsequence('wait')).toBe(true)
    motion.tick(2000)
    expect(motion.isPlaybackComplete(2000)).toBe(false)
    // Consequence leg has its own 800ms total.
    motion.tick(2000 + 250 + 900)
    expect(motion.isPlaybackComplete(2000 + 250 + 900)).toBe(true)
  })

  it('startReplay swaps to the answer-demo timeline', () => {
    const scene = buildScene({
      intro: [],
      answerDemo: [
        { id: 'demo', playerId: 'user', kind: 'cut', to: { x: 0, z: 4 }, durationMs: 600 },
      ],
    })
    const { motion } = makeMotion(scene)
    motion.startReplay()
    motion.tick(1000)
    motion.tick(1000 + 250 + 700)
    expect(motion.isPlaybackComplete(1000 + 250 + 700)).toBe(true)
  })
})

describe('ReplayStateMachine', () => {
  function collectStates(machine: ReplayStateMachine): ReplayState[] {
    const states: ReplayState[] = []
    machine.subscribe(({ state }) => states.push(state))
    return states
  }

  it('drives idle → setup → playing → frozen → consequence → replaying → done', () => {
    const scene = buildScene({
      freezeAtMs: 500,
      intro: [
        { id: 'cut', playerId: 'user', kind: 'cut', to: { x: 0, z: 4 }, durationMs: 1500 },
      ],
      answerDemo: [
        { id: 'demo', playerId: 'user', kind: 'cut', to: { x: 0, z: 4 }, durationMs: 400 },
      ],
      wrongDemos: [
        {
          choiceId: 'wait',
          movements: [
            { id: 'recover', playerId: 'user', kind: 'rotation', to: { x: 5, z: 10 }, durationMs: 300 },
          ],
        },
      ],
    })
    const { motion } = makeMotion(scene)
    const machine = new ReplayStateMachine(motion, scene)
    const states = collectStates(machine)

    machine.start()
    expect(states.at(-1)).toBe('playing')

    // Cross the freeze cap.
    motion.tick(0)
    motion.tick(0 + 250 + 600)
    machine.tick(0 + 250 + 600)
    expect(states.at(-1)).toBe('frozen')

    // Pick the wrong choice → consequence leg.
    machine.pickChoice('wait', 0 + 250 + 600)
    expect(states.at(-1)).toBe('consequence')

    // Run the consequence to completion.
    motion.tick(2000)
    motion.tick(2000 + 250 + 400)
    machine.tick(2000 + 250 + 400)
    expect(states.at(-1)).toBe('replaying')

    // Run the replay to completion.
    motion.tick(3000)
    motion.tick(3000 + 250 + 500)
    machine.tick(3000 + 250 + 500)
    expect(states.at(-1)).toBe('done')
  })

  it('best-read short-circuits frozen → replaying when no wrongDemos entry matches', () => {
    const scene = buildScene({
      freezeAtMs: 500,
      intro: [
        { id: 'cut', playerId: 'user', kind: 'cut', to: { x: 0, z: 4 }, durationMs: 1500 },
      ],
      answerDemo: [
        { id: 'demo', playerId: 'user', kind: 'cut', to: { x: 0, z: 4 }, durationMs: 400 },
      ],
      // No wrongDemos for 'best_choice' → state machine must skip
      // 'consequence' and go straight to 'replaying'.
      wrongDemos: [],
    })
    const { motion } = makeMotion(scene)
    const machine = new ReplayStateMachine(motion, scene)
    const states = collectStates(machine)

    machine.start()
    motion.tick(0)
    motion.tick(0 + 250 + 600)
    machine.tick(0 + 250 + 600)
    expect(states.at(-1)).toBe('frozen')

    machine.pickChoice('best_choice', 0 + 250 + 600)
    expect(states.at(-1)).toBe('replaying')
  })

  it('showAgain cycles done → replaying → done', () => {
    const scene = buildScene({
      freezeAtMs: 500,
      intro: [
        { id: 'cut', playerId: 'user', kind: 'cut', to: { x: 0, z: 4 }, durationMs: 1500 },
      ],
      answerDemo: [
        { id: 'demo', playerId: 'user', kind: 'cut', to: { x: 0, z: 4 }, durationMs: 400 },
      ],
    })
    const { motion } = makeMotion(scene)
    const machine = new ReplayStateMachine(motion, scene)
    const states = collectStates(machine)

    // Drive to done via the best-read short-circuit.
    machine.start()
    motion.tick(0)
    motion.tick(0 + 250 + 600)
    machine.tick(0 + 250 + 600)
    machine.pickChoice('best_choice', 0 + 250 + 600)
    motion.tick(1500)
    motion.tick(1500 + 250 + 500)
    machine.tick(1500 + 250 + 500)
    expect(states.at(-1)).toBe('done')

    machine.showAgain()
    expect(states.at(-1)).toBe('replaying')
    motion.tick(3000)
    motion.tick(3000 + 250 + 500)
    machine.tick(3000 + 250 + 500)
    expect(states.at(-1)).toBe('done')
  })

  it('legacy scenes (no freezeAtMs) drive playing → done without entering frozen', () => {
    const scene = buildScene({
      intro: [
        { id: 'cut', playerId: 'user', kind: 'cut', to: { x: 0, z: 4 }, durationMs: 500 },
      ],
    })
    const { motion } = makeMotion(scene)
    const machine = new ReplayStateMachine(motion, scene)
    const states = collectStates(machine)

    machine.start()
    motion.tick(0)
    motion.tick(0 + 250 + 600)
    machine.tick(0 + 250 + 600)
    expect(states).not.toContain('frozen')
    expect(states.at(-1)).toBe('done')
  })

  it('reset() returns the machine to idle and re-arms start()', () => {
    const scene = buildScene({
      freezeAtMs: 500,
      intro: [
        { id: 'cut', playerId: 'user', kind: 'cut', to: { x: 0, z: 4 }, durationMs: 1500 },
      ],
      answerDemo: [],
    })
    const { motion } = makeMotion(scene)
    const machine = new ReplayStateMachine(motion, scene)
    machine.start()
    expect(machine.getSnapshot().state).toBe('playing')

    machine.reset()
    expect(machine.getSnapshot().state).toBe('idle')
    expect(machine.getSnapshot().choiceId).toBeNull()

    machine.start()
    expect(machine.getSnapshot().state).toBe('playing')
  })
})
