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
    preAnswerOverlays: [],
    postAnswerOverlays: [],
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

describe('Phase H — consequence + replay budgets', () => {
  // Section 5.5 / Phase H validation: each consequence demo plays in
  // ≤2.5 s; the answer-demo replay leg plays in ≤3.0 s. These bounds
  // come from the planning doc and apply to every authored decoder
  // scenario in Pack 1. The numbers below mirror BDW-01's authored
  // movements to guard against drift in the timing model.
  const introMovements = [
    { id: 'user_show_hands', playerId: 'user', kind: 'lift' as const, to: { x: 18, z: 9 }, delayMs: 0, durationMs: 600 },
    { id: 'x2_step_to_denial', playerId: 'pg', kind: 'rotation' as const, to: { x: 14, z: 11 }, delayMs: 200, durationMs: 600 },
  ]
  const answerMovements = [
    { id: 'user_jab', playerId: 'user', kind: 'jab' as const, to: { x: 19, z: 9 }, delayMs: 0, durationMs: 250 },
    { id: 'user_plant_and_go', playerId: 'user', kind: 'back_cut' as const, to: { x: 4, z: 2 }, delayMs: 100, durationMs: 750 },
    { id: 'pg_lead_pass', playerId: 'pg', kind: 'pass' as const, to: { x: 4, z: 2 }, delayMs: 350, durationMs: 500 },
    { id: 'user_finish', playerId: 'user', kind: 'cut' as const, to: { x: 0, z: 0.5 }, delayMs: 100, durationMs: 350 },
  ]
  const c2Demo = {
    choiceId: 'c2',
    movements: [
      { id: 'user_v_cut', playerId: 'user', kind: 'cut' as const, to: { x: 21, z: 10 }, delayMs: 0, durationMs: 600 },
      { id: 'pg_late_pass', playerId: 'pg', kind: 'pass' as const, to: { x: 21, z: 10 }, delayMs: 200, durationMs: 500 },
    ],
  }
  const c4Demo = {
    choiceId: 'c4',
    movements: [
      { id: 'user_front_cut', playerId: 'user', kind: 'cut' as const, to: { x: 8, z: 6 }, delayMs: 0, durationMs: 800 },
      { id: 'x2_ride', playerId: 'pg', kind: 'rotation' as const, to: { x: 9, z: 7 }, delayMs: 100, durationMs: 700 },
    ],
  }

  it('keeps every BDW-01 consequence under the 2.5 s budget', () => {
    const scene = buildScene({
      freezeAtMs: 1400,
      intro: introMovements,
      answerDemo: answerMovements,
      wrongDemos: [c2Demo, c4Demo],
    })
    for (const demo of scene.wrongDemos) {
      const { motion } = makeMotion(scene)
      motion.startConsequence(demo.choiceId)
      motion.tick(0)
      const total = motion.isPlaybackComplete(0 + 250 + 2500) // PRE_DELAY_MS + budget
      expect(total).toBe(true)
    }
  })

  it('keeps the BDW-01 answer demo under the 3.0 s budget', () => {
    const scene = buildScene({
      freezeAtMs: 1400,
      intro: introMovements,
      answerDemo: answerMovements,
    })
    const { motion } = makeMotion(scene)
    motion.startReplay()
    motion.tick(0)
    const total = motion.isPlaybackComplete(0 + 250 + 3000) // PRE_DELAY_MS + budget
    expect(total).toBe(true)
  })
})

describe('Phase B / B1 — paused state across leg swap', () => {
  // Recovery plan A2.1: `MotionController.setMovements` (called by
  // `startConsequence` and `startReplay`) hard-resets `pausedAtT = null`,
  // dropping the user's pause whenever the consequence or replay leg
  // begins. The Phase B fix re-applies `setPaused` from the canvas
  // subscriber on every state transition; the controller-level tests
  // here lock in the contract the subscriber relies on.
  it('setMovements clears the paused flag (documents existing behavior)', () => {
    const scene = buildScene({
      intro: [{ id: 'cut', playerId: 'user', kind: 'cut', to: { x: 0, z: 4 }, durationMs: 500 }],
      wrongDemos: [
        {
          choiceId: 'wait',
          movements: [
            { id: 'recover', playerId: 'user', kind: 'rotation', to: { x: 5, z: 10 }, durationMs: 400 },
          ],
        },
      ],
    })
    const { motion } = makeMotion(scene)
    motion.setPaused(true, 1000)
    expect(motion.isPaused()).toBe(true)
    motion.startConsequence('wait')
    expect(motion.isPaused()).toBe(false)
  })

  it('re-applying setPaused after setMovements pauses the new leg at t=0', () => {
    const scene = buildScene({
      intro: [{ id: 'cut', playerId: 'user', kind: 'cut', to: { x: 0, z: 4 }, durationMs: 500 }],
      wrongDemos: [
        {
          choiceId: 'wait',
          movements: [
            { id: 'recover', playerId: 'user', kind: 'rotation', to: { x: 5, z: 10 }, durationMs: 400 },
          ],
        },
      ],
    })
    const { motion } = makeMotion(scene)
    motion.setPaused(true, 1000)
    motion.startConsequence('wait')
    // Canvas subscriber pattern: re-apply paused after the leg swap.
    motion.setPaused(true, 1000)
    motion.tick(1000)
    expect(motion.isPaused()).toBe(true)
    expect(motion.getElapsedMs(1000)).toBe(0)
    // Even with real-time advancing, paused t stays clamped at 0.
    expect(motion.getElapsedMs(1500)).toBe(0)
    // Resuming at a later real time continues from t=0.
    motion.setPaused(false, 1500)
    expect(motion.isPaused()).toBe(false)
  })

  it('subscriber-driven re-arm keeps pause across frozen → consequence', () => {
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

    // Mirror the canvas subscriber: any time the state changes, re-apply
    // the React-owned paused flag. We model the React state as a single
    // mutable boolean here — the canvas reads from a ref initialised by
    // the [paused] effect.
    let userPaused = false
    machine.subscribe(() => {
      if (userPaused) motion.setPaused(true)
    })

    machine.start()
    motion.tick(0)
    motion.tick(0 + 250 + 600)
    machine.tick(0 + 250 + 600)
    expect(machine.getSnapshot().state).toBe('frozen')

    // User pauses while frozen, then picks the wrong choice. The
    // consequence leg's setMovements call clears the paused flag — the
    // subscriber must re-arm it.
    userPaused = true
    motion.setPaused(true, 0 + 250 + 600)
    machine.pickChoice('wait', 0 + 250 + 600)
    expect(machine.getSnapshot().state).toBe('consequence')
    expect(motion.isPaused()).toBe(true)
    // Visible t for the new leg stays at 0 while paused.
    expect(motion.getElapsedMs(0 + 250 + 600)).toBe(0)
    expect(motion.getElapsedMs(0 + 250 + 600 + 1000)).toBe(0)
  })

  it('subscriber-driven re-arm keeps pause across consequence → replaying', () => {
    // Models a user who wants the leg to advance but expects pause to
    // continue applying on every subsequent leg. The user briefly
    // releases pause to let the consequence leg finish, then re-engages
    // pause, and the answer-demo replay leg honors the renewed pause.
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

    let userPaused = false
    machine.subscribe(() => {
      if (userPaused) motion.setPaused(true)
    })

    machine.start()
    motion.tick(0)
    motion.tick(0 + 250 + 600)
    machine.tick(0 + 250 + 600)
    machine.pickChoice('wait', 0 + 250 + 600)
    expect(machine.getSnapshot().state).toBe('consequence')

    // Run the consequence to completion (user not paused yet). The
    // machine.tick after isPlaybackComplete fires startReplay, which
    // calls setMovements again — at that exact transition the user
    // just engaged pause from React, so the subscriber must re-arm it.
    motion.tick(2000)
    motion.tick(2000 + 250 + 400)
    userPaused = true
    motion.setPaused(true, 2000 + 250 + 400)
    machine.tick(2000 + 250 + 400)
    expect(machine.getSnapshot().state).toBe('replaying')
    expect(motion.isPaused()).toBe(true)
    expect(motion.getElapsedMs(2000 + 250 + 400)).toBe(0)
  })

  it('subscriber-driven re-arm covers the initial start() reset', () => {
    // `machine.start()` calls `motion.reset()` before transitioning to
    // `setup` / `playing`, so any pause set inline at mount is erased.
    // The canvas relies on the subscriber firing for the `setup` /
    // `playing` transitions to re-arm pause.
    const scene = buildScene({
      freezeAtMs: 500,
      intro: [
        { id: 'cut', playerId: 'user', kind: 'cut', to: { x: 0, z: 4 }, durationMs: 1500 },
      ],
    })
    const { motion } = makeMotion(scene)
    const machine = new ReplayStateMachine(motion, scene)

    const userPaused = true
    machine.subscribe(() => {
      if (userPaused) motion.setPaused(true)
    })

    // Inline mount-race: setPaused is called before start() resets.
    motion.setPaused(true, 0)
    machine.start()
    expect(motion.isPaused()).toBe(true)
    motion.tick(0)
    // Visible t stays at 0 because pausedAtT is set.
    expect(motion.getElapsedMs(0 + 1000)).toBe(0)
  })
})

describe('Phase H — idle players honor the freeze snapshot', () => {
  // Bug fix: before Phase H, an idle player (no entry in the
  // consequence/replay leg's `byPlayer`) snapped back to its
  // `scene.players[*].start` position the instant the leg began. With
  // the snapshot override threaded through `samplePlayer`, idle players
  // now hold their freeze pose. This guards both the schema-level fix
  // (`samplePlayer` accepting overrides) and the controller plumbing
  // (`MotionController.currentOverrides`).
  it('writes snapshot positions to idle players when running a wrongDemo leg', () => {
    const scene: Scene3D = {
      id: 'idle_test',
      court: 'half',
      camera: 'teaching_angle',
      players: [
        { id: 'user', team: 'offense', role: 'wing', start: { x: 18, z: 8 }, isUser: true },
        { id: 'pg', team: 'offense', role: 'pg', start: { x: -9, z: 14 }, hasBall: true },
        { id: 'x2', team: 'defense', role: 'denying', start: { x: 15, z: 10 } },
      ],
      ball: { start: { x: -9, z: 14 }, holderId: 'pg' },
      movements: [],
      answerDemo: [],
      wrongDemos: [
        {
          choiceId: 'wait',
          movements: [
            { id: 'm', playerId: 'user', kind: 'cut', to: { x: 21, z: 10 }, durationMs: 400 },
          ],
        },
      ],
      preAnswerOverlays: [],
      postAnswerOverlays: [],
      freezeAtMs: null,
      synthetic: false,
    }
    const { motion, players } = makeMotion(scene)
    // Snapshot says x2 is at (14, 11) — its post-rotation freeze pose.
    const snapshot = new Map([
      ['user', { x: 18, z: 9 }],
      ['pg', { x: -9, z: 14 }],
      ['x2', { x: 14, z: 11 }],
      ['ball', { x: -9, z: 14 }],
    ])
    motion.startConsequence('wait', snapshot)
    motion.tick(0)
    motion.tick(0 + 250 + 200) // Mid-leg.
    const x2 = players.get('x2')!
    // Without the snapshot override, samplePlayer would return x2.start
    // (15, 10) because x2 has no movement in this leg. With the
    // override, it stays at (14, 11) — the frozen pose.
    expect(x2.position.x).toBeCloseTo(14, 5)
    expect(x2.position.z).toBeCloseTo(11, 5)
  })
})
