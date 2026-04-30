/* @vitest-environment jsdom */
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  MotionController,
  ReplayStateMachine,
  computePlayerYaw,
  smoothAngle,
  type ReplayState,
} from './imperativeScene'
import type { Scene3D } from '@/lib/scenario3d/scene'

// Minimal stub for the THREE groups MotionController writes positions
// into. Phase C / C2 added a per-frame yaw update, so the stub now also
// exposes `rotation.y`. The rendering pipeline still isn't exercised
// here — both fields are plain mutable scalars/objects so the tests can
// assert end-state without booting WebGL.
function stubGroup(): THREE.Group {
  const v = new THREE.Vector3(0, 0, 0)
  const r = { x: 0, y: 0, z: 0 }
  return { position: v, rotation: r } as unknown as THREE.Group
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

describe('Phase B / B2 — restart from done dispatches showAgain', () => {
  // Recovery plan A2.5: prior to Phase B, both the in-canvas Restart
  // button and the FeedbackPanel "Replay" CTA dropped into
  // `motion.reset()`, which rewinds the playhead but leaves the state
  // machine in `done`. The result was a "ghosted replay" — the answer
  // demo replayed but no `replaying` snapshot fired, so consumers like
  // the page caption and learn-phase tracker did not re-react. The
  // canvas now branches: in `done`, dispatch `machine.showAgain()`;
  // otherwise call `motion.reset()` to rewind the active leg.
  function driveToDone(scene: Scene3D): {
    motion: MotionController
    machine: ReplayStateMachine
    states: ReplayState[]
  } {
    const { motion } = makeMotion(scene)
    const machine = new ReplayStateMachine(motion, scene)
    const states: ReplayState[] = []
    machine.subscribe(({ state }) => states.push(state))
    machine.start()
    motion.tick(0)
    motion.tick(0 + 250 + 600)
    machine.tick(0 + 250 + 600)
    machine.pickChoice('best_choice', 0 + 250 + 600)
    motion.tick(1500)
    motion.tick(1500 + 250 + 500)
    machine.tick(1500 + 250 + 500)
    return { motion, machine, states }
  }

  const sceneWithFreezeAndAnswer: Scene3D = {
    id: 'sm_b2',
    court: 'half',
    camera: 'teaching_angle',
    players: [
      { id: 'user', team: 'offense', role: 'wing', start: { x: 0, z: 10 }, isUser: true },
      { id: 'pg', team: 'offense', role: 'pg', start: { x: 5, z: 20 }, hasBall: true },
    ],
    ball: { start: { x: 5, z: 20 }, holderId: 'pg' },
    movements: [
      { id: 'cut', playerId: 'user', kind: 'cut', to: { x: 0, z: 4 }, durationMs: 1500 },
    ],
    answerDemo: [
      { id: 'demo', playerId: 'user', kind: 'cut', to: { x: 0, z: 4 }, durationMs: 400 },
    ],
    wrongDemos: [],
    preAnswerOverlays: [],
    postAnswerOverlays: [],
    freezeAtMs: 500,
    synthetic: false,
  }

  it('motion.reset() from done leaves the machine in done (pre-fix behavior)', () => {
    const { motion, machine, states } = driveToDone(sceneWithFreezeAndAnswer)
    expect(states.at(-1)).toBe('done')
    motion.reset()
    expect(machine.getSnapshot().state).toBe('done')
    // No additional snapshot was emitted by the reset — the listener
    // did not see a `replaying` event, which is exactly the user-visible
    // "ghosted replay" symptom from A2.5.
    expect(states.filter((s) => s === 'replaying').length).toBe(1)
  })

  it('canvas-style state-aware reset routes through showAgain when in done', () => {
    const { motion, machine, states } = driveToDone(sceneWithFreezeAndAnswer)
    // Mirrors the canvas's [resetCounter] effect post-B2.
    const resetEffect = () => {
      if (machine.getSnapshot().state === 'done') {
        machine.showAgain()
      } else {
        motion.reset()
      }
    }
    resetEffect()
    expect(machine.getSnapshot().state).toBe('replaying')
    // Replaying is re-emitted, so onPhase / caption consumers re-fire.
    expect(states.filter((s) => s === 'replaying').length).toBe(2)
    motion.tick(3000)
    motion.tick(3000 + 250 + 500)
    machine.tick(3000 + 250 + 500)
    expect(machine.getSnapshot().state).toBe('done')
  })

  it('canvas-style state-aware reset rewinds the active leg outside done', () => {
    // From `playing`, the same effect must keep the legacy "rewind the
    // active leg" semantics so the in-canvas Restart button still works
    // before the user has frozen.
    const { motion } = makeMotion(sceneWithFreezeAndAnswer)
    const machine = new ReplayStateMachine(motion, sceneWithFreezeAndAnswer)
    machine.start()
    motion.tick(0)
    motion.tick(0 + 250 + 200) // mid-intro
    expect(motion.getElapsedMs(0 + 250 + 200)).toBeGreaterThan(0)

    // Same effect closure as the canvas would apply.
    if (machine.getSnapshot().state === 'done') {
      machine.showAgain()
    } else {
      motion.reset()
    }
    expect(machine.getSnapshot().state).toBe('playing')
    motion.tick(0 + 250 + 200 + 1) // immediate next tick after reset
    expect(motion.getElapsedMs(0 + 250 + 200 + 1)).toBeLessThanOrEqual(1)
  })
})

describe('Phase B / B3 — speed control across leg swaps', () => {
  // Recovery plan A2.3: speed changes set at `frozen` (or any other
  // pre-leg-swap state) must apply to the next leg from its first
  // tick, with no perceptible visible-t jump. The controller's
  // internal `playbackRate` already survives `setMovements`; B3 adds
  // a defensive re-arm in the canvas subscriber so React state and
  // controller state can never drift across a swap.
  function makeSceneWithLegs(): Scene3D {
    return {
      id: 'sm_b3',
      court: 'half',
      camera: 'teaching_angle',
      players: [
        { id: 'user', team: 'offense', role: 'wing', start: { x: 0, z: 10 }, isUser: true },
        { id: 'pg', team: 'offense', role: 'pg', start: { x: 5, z: 20 }, hasBall: true },
      ],
      ball: { start: { x: 5, z: 20 }, holderId: 'pg' },
      movements: [
        { id: 'cut', playerId: 'user', kind: 'cut', to: { x: 0, z: 4 }, durationMs: 1500 },
      ],
      answerDemo: [
        { id: 'demo', playerId: 'user', kind: 'cut', to: { x: 0, z: 4 }, durationMs: 800 },
      ],
      wrongDemos: [
        {
          choiceId: 'wait',
          movements: [
            { id: 'recover', playerId: 'user', kind: 'rotation', to: { x: 5, z: 10 }, durationMs: 800 },
          ],
        },
      ],
      preAnswerOverlays: [],
      postAnswerOverlays: [],
      freezeAtMs: 500,
      synthetic: false,
    }
  }

  it('rate set at frozen applies to the consequence leg from t=0', () => {
    const scene = makeSceneWithLegs()
    const { motion } = makeMotion(scene)
    const machine = new ReplayStateMachine(motion, scene)

    // Subscriber-driven re-arm — pulls the latest rate from a closure
    // (mirrors the canvas's playbackRateRef).
    let userRate = 1
    machine.subscribe(() => {
      motion.setPlaybackRate(userRate)
    })

    machine.start()
    motion.tick(0)
    motion.tick(0 + 250 + 600)
    machine.tick(0 + 250 + 600)
    expect(machine.getSnapshot().state).toBe('frozen')

    // User selects 2x while frozen, then picks the wrong choice.
    const tFrozen = 0 + 250 + 600
    userRate = 2
    motion.setPlaybackRate(2, tFrozen)
    machine.pickChoice('wait', tFrozen)
    expect(motion.getPlaybackRate()).toBe(2)

    // Anchor the new leg with a tick at the same instant as the swap.
    motion.tick(tFrozen)
    // After PRE_DELAY (250ms) + 200ms of real time the consequence leg
    // should have advanced by 400ms of visible t (2x rate).
    motion.tick(tFrozen + 250 + 200)
    expect(motion.getElapsedMs(tFrozen + 250 + 200)).toBeCloseTo(400, 5)
  })

  it('subscriber re-arm of setPlaybackRate is idempotent (no t-jump)', () => {
    const scene = makeSceneWithLegs()
    const { motion } = makeMotion(scene)
    motion.setPlaybackRate(0.5, 0)
    motion.tick(0)
    motion.tick(0 + 250 + 200)
    const before = motion.getElapsedMs(0 + 250 + 200)
    // Re-apply the same rate (canvas subscriber pattern).
    motion.setPlaybackRate(0.5, 0 + 250 + 200)
    const after = motion.getElapsedMs(0 + 250 + 200)
    expect(after).toBe(before)
  })

  it('rate persists across showAgain (done → replaying)', () => {
    const scene = makeSceneWithLegs()
    const { motion } = makeMotion(scene)
    const machine = new ReplayStateMachine(motion, scene)
    // Drive at 1x to keep timing math simple; rate is set later.
    machine.subscribe(() => {
      motion.setPlaybackRate(motion.getPlaybackRate())
    })

    machine.start()
    motion.tick(0)
    motion.tick(0 + 250 + 600)
    machine.tick(0 + 250 + 600)
    machine.pickChoice('best_choice', 0 + 250 + 600)
    motion.tick(2000)
    motion.tick(2000 + 250 + 900)
    machine.tick(2000 + 250 + 900)
    expect(machine.getSnapshot().state).toBe('done')

    // User flips to 0.5x at done, then triggers Show me again.
    motion.setPlaybackRate(0.5, 3000)
    machine.showAgain()
    expect(machine.getSnapshot().state).toBe('replaying')
    expect(motion.getPlaybackRate()).toBe(0.5)
    // Anchor the leg, then advance: at 0.5x, 200ms real → 100ms t.
    motion.tick(3000)
    motion.tick(3000 + 250 + 200)
    expect(motion.getElapsedMs(3000 + 250 + 200)).toBeCloseTo(100, 5)

    // Re-applying the same rate does not jump visible t (idempotent).
    const before = motion.getElapsedMs(3000 + 250 + 200)
    motion.setPlaybackRate(0.5, 3000 + 250 + 200)
    expect(motion.getElapsedMs(3000 + 250 + 200)).toBe(before)
  })
})

describe('Phase B / B4 — robust consequence dispatch', () => {
  // Recovery plan A2.4 #1: when a pick arrives before the state
  // machine has reached `frozen`, the canvas's [pickedChoiceId] effect
  // early-returns and the dep-list (`[pickedChoiceId]`) prevents the
  // same id from retrying on a later render. Phase B buffers the id
  // and flushes it from the state-machine subscriber on the `frozen`
  // transition.
  function makeCanvasLikeFlow(scene: Scene3D) {
    const { motion } = makeMotion(scene)
    const machine = new ReplayStateMachine(motion, scene)
    let pendingPick: string | null = null
    let consumedPick: string | null = null
    machine.subscribe(({ state }) => {
      // Phase B / B4 mirror — flush a buffered pick when `frozen` lands.
      if (state === 'frozen' && pendingPick !== null && consumedPick !== pendingPick) {
        consumedPick = pendingPick
        pendingPick = null
        machine.pickChoice(consumedPick)
      }
    })
    const submitPick = (id: string) => {
      // Same shape as the [pickedChoiceId] effect post-B4.
      if (consumedPick === id) return
      if (machine.getSnapshot().state !== 'frozen') {
        pendingPick = id
        return
      }
      consumedPick = id
      pendingPick = null
      machine.pickChoice(id)
    }
    return { motion, machine, submitPick, peekPending: () => pendingPick }
  }

  const sceneB4: Scene3D = {
    id: 'sm_b4',
    court: 'half',
    camera: 'teaching_angle',
    players: [
      { id: 'user', team: 'offense', role: 'wing', start: { x: 0, z: 10 }, isUser: true },
      { id: 'pg', team: 'offense', role: 'pg', start: { x: 5, z: 20 }, hasBall: true },
    ],
    ball: { start: { x: 5, z: 20 }, holderId: 'pg' },
    movements: [
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
    preAnswerOverlays: [],
    postAnswerOverlays: [],
    freezeAtMs: 500,
    synthetic: false,
  }

  it('buffers a pick that arrives before frozen and flushes on freeze', () => {
    const { motion, machine, submitPick, peekPending } = makeCanvasLikeFlow(sceneB4)
    machine.start()
    motion.tick(0)
    // Pre-frozen pick.
    expect(machine.getSnapshot().state).toBe('playing')
    submitPick('wait')
    expect(peekPending()).toBe('wait')
    expect(machine.getSnapshot().state).toBe('playing')

    // Cross the freeze cap; subscriber must flush the buffer.
    motion.tick(0 + 250 + 600)
    machine.tick(0 + 250 + 600)
    expect(machine.getSnapshot().state).toBe('consequence')
    expect(peekPending()).toBeNull()
  })

  it('happy path: pick at frozen still dispatches immediately', () => {
    const { motion, machine, submitPick, peekPending } = makeCanvasLikeFlow(sceneB4)
    machine.start()
    motion.tick(0)
    motion.tick(0 + 250 + 600)
    machine.tick(0 + 250 + 600)
    expect(machine.getSnapshot().state).toBe('frozen')
    submitPick('wait')
    expect(machine.getSnapshot().state).toBe('consequence')
    expect(peekPending()).toBeNull()
  })

  it('best-read short-circuit is observable as a state transition', () => {
    // A2.4 #2: when the picked id has no wrongDemos entry the machine
    // skips `consequence` and goes straight to `replaying`. Phase B
    // does not change this behavior, but the test pins it down so a
    // future caption-driven UI can rely on the transition.
    const { motion, machine, submitPick } = makeCanvasLikeFlow(sceneB4)
    const states: ReplayState[] = []
    machine.subscribe(({ state }) => states.push(state))

    machine.start()
    motion.tick(0)
    motion.tick(0 + 250 + 600)
    machine.tick(0 + 250 + 600)
    expect(machine.getSnapshot().state).toBe('frozen')

    submitPick('best_choice')
    expect(machine.getSnapshot().state).toBe('replaying')
    // The transition list shows frozen → replaying with no consequence
    // entry — exactly the signal a caption layer needs to render
    // "best read" rather than the wrong-demo caption.
    expect(states).toContain('frozen')
    expect(states).toContain('replaying')
    expect(states).not.toContain('consequence')
  })

  it('idempotent: re-submitting the same pick after dispatch is a no-op', () => {
    const { motion, machine, submitPick } = makeCanvasLikeFlow(sceneB4)
    machine.start()
    motion.tick(0)
    motion.tick(0 + 250 + 600)
    machine.tick(0 + 250 + 600)
    submitPick('wait')
    expect(machine.getSnapshot().state).toBe('consequence')
    // Repeat submission should not re-trigger or break the leg.
    submitPick('wait')
    expect(machine.getSnapshot().state).toBe('consequence')
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

describe('Phase C / C2 — body-facing helpers', () => {
  // Pin the conventions the per-frame yaw pass relies on. The figure
  // is built so `rotation.y = atan2(dx, dz)` makes the chest face the
  // direction (dx, dz). `computePlayerYaw` reuses that convention to
  // pick a default team yaw at build time.
  it('smoothAngle returns target unchanged when k=1', () => {
    expect(smoothAngle(0, Math.PI / 2, 1)).toBeCloseTo(Math.PI / 2, 6)
  })

  it('smoothAngle holds when k=0', () => {
    expect(smoothAngle(0.7, -2, 0)).toBeCloseTo(0.7, 6)
  })

  it('smoothAngle rotates the short way around π', () => {
    // From -3 to 3 the short way is ~0.283 rad through the ±π wrap,
    // not 6 rad the long way. With k=0.5 the result should sit
    // halfway along that short arc — very close to ±π — and the
    // angular distance to the target must be smaller than half the
    // long way (3 rad).
    const out = smoothAngle(-3, 3, 0.5)
    const angularDist = (a: number, b: number): number => {
      let d = ((a - b) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2)
      if (d > Math.PI) d = Math.PI * 2 - d
      return d
    }
    expect(angularDist(out, 3)).toBeLessThan(angularDist(-3, 3))
    expect(angularDist(out, 3)).toBeLessThan(0.2)
  })

  it('computePlayerYaw flips offense and defense by π', () => {
    const off = computePlayerYaw('offense', 4, 6)
    const def = computePlayerYaw('defense', 4, 6)
    const diff = Math.abs(off - def)
    // Difference is π modulo 2π.
    const mod = ((diff % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
    expect(Math.min(mod, 2 * Math.PI - mod)).toBeCloseTo(Math.PI, 5)
  })
})

describe('Phase C / C2 — per-frame yaw update', () => {
  function buildYawScene(): Scene3D {
    return {
      id: 'yaw_scene',
      court: 'half',
      camera: 'teaching_angle',
      players: [
        { id: 'user', team: 'offense', role: 'wing', start: { x: 18, z: 10 }, isUser: true },
        { id: 'pg', team: 'offense', role: 'pg', start: { x: -9, z: 14 }, hasBall: true },
        { id: 'x2', team: 'defense', role: 'denying', start: { x: 14, z: 10 } },
      ],
      ball: { start: { x: -9, z: 14 }, holderId: 'pg' },
      movements: [
        // User cuts toward the rim — direction roughly (-18, -8).
        { id: 'cut', playerId: 'user', kind: 'cut', to: { x: 0, z: 2 }, durationMs: 800 },
      ],
      answerDemo: [],
      wrongDemos: [],
      preAnswerOverlays: [],
      postAnswerOverlays: [],
      freezeAtMs: null,
      synthetic: false,
    }
  }

  it('rotates a cutter toward the cut direction over multiple ticks', () => {
    const scene = buildYawScene()
    const { motion, players } = makeMotion(scene)
    // Seed the build-time yaw so the smoother starts from "facing rim",
    // which is what the canvas sets via computePlayerYaw before the
    // first tick.
    const userGroup = players.get('user')!
    userGroup.rotation.y = computePlayerYaw('offense', 18, 10)
    const pgGroup = players.get('pg')!
    pgGroup.rotation.y = computePlayerYaw('offense', -9, 14)

    // Anchor + advance a few real-world frames into the cut.
    motion.tick(0)
    for (let i = 1; i <= 30; i++) motion.tick(i * 16) // ~30 frames @ 60fps
    // Movement direction (dx, dz) = (0 - 18, 2 - 10) = (-18, -8).
    // Target yaw = atan2(-18, -8) ≈ -1.99 rad. The smoother should be
    // converging from the build-time atan2(-18, -10) ≈ -2.08 rad
    // toward -1.99, so the user yaw should be in the same neighborhood.
    const userYaw = userGroup.rotation.y
    const expected = Math.atan2(-18, -8)
    // Either the smoother reached the cut direction, or it's strictly
    // closer to it than the build-time value. Either way it must NOT
    // be sitting on the original team yaw any more.
    expect(userYaw).not.toBe(computePlayerYaw('offense', 18, 10))
    // Within 0.15 rad of the cut-direction target after 30 frames
    // (time constant ~0.18s, ~0.48s elapsed → ~93% converged).
    expect(Math.abs(userYaw - expected)).toBeLessThan(0.15)
  })

  it('rotates a stationary defender toward the ball-holder direction', () => {
    const scene = buildYawScene()
    const { motion, players } = makeMotion(scene)
    const x2Group = players.get('x2')!
    x2Group.rotation.y = computePlayerYaw('defense', 14, 10)

    motion.tick(0)
    for (let i = 1; i <= 30; i++) motion.tick(i * 16)
    // The defender is stationary at (14, 10). Ball holder pg is at
    // (-9, 14). After applyBall runs the ball is at pg's position —
    // so the defender's target yaw faces the ball.
    // Direction (dx, dz) = (-9 - 14, 14 - 10) = (-23, 4).
    const expected = Math.atan2(-23, 4)
    const yaw = x2Group.rotation.y
    expect(Math.abs(yaw - expected)).toBeLessThan(0.2)
  })

  it('does not allocate per-tick scaling with player count', () => {
    // Smoke check: many ticks should not blow up the wallMs ref or
    // produce NaN yaws even with bursty timestamps. Models a
    // backgrounded tab where a few-second gap appears between ticks.
    const scene = buildYawScene()
    const { motion, players } = makeMotion(scene)
    motion.tick(0)
    motion.tick(16)
    // Long gap (5s) — should not snap the yaw by a wild angle.
    motion.tick(5016)
    motion.tick(5032)
    for (const g of players.values()) {
      expect(Number.isFinite(g.rotation.y)).toBe(true)
    }
  })
})
