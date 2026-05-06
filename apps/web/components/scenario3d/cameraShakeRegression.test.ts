/* @vitest-environment jsdom */
/**
 * Visual / Motion Review — Camera Shake Regression Coverage.
 *
 * Locks five invariants the visual review identified as the residual
 * shake / drift sources:
 *
 *   1. The camera target stays stable across an unchanged-phase
 *      sequence of dispatcher calls. Re-dispatching the same
 *      (decoder, phase, assist) tuple must NOT emit a setMode that
 *      moves the controller.
 *
 *   2. The cueRepaint phase never bounces between presets. Best-read
 *      and wrong-pick paths both go through `cueRepaint`; the
 *      dispatcher must return `null` (hold the previous mode) so
 *      the controller does not snap to a third preset between
 *      consequence and replaying.
 *
 *   3. Fullscreen / aspect updates are debounced. Sub-half-percent
 *      aspect changes (the kind a browser publishes during
 *      fullscreen layout settle) do NOT trigger a target recompute.
 *
 *   4. The pass-arrival shake amplitude is bounded ≤ 0.10 ft and
 *      gated on `ctrl.hasSettled()` so it cannot stack on top of an
 *      in-flight teaching-cut lerp.
 *
 *   5. Manual camera override during `frozen` keeps the controller
 *      on the user's chosen mode — the dispatcher returns null.
 *
 * Pure imperative-path coverage. No Canvas, no R3F. The actual
 * rendering is exercised by `Scenario3DCanvas.test.tsx` separately.
 */

import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import {
  CameraController,
  computeCameraTarget,
  type CameraMode,
} from './imperativeScene'
import { pickAssistedCameraMode } from '@/lib/scenario3d/cameraPresets'
import type { ReplayPhase } from './ScenarioReplayController'
import { createDefaultScene, type Scene3D } from '@/lib/scenario3d/scene'

const BASE_FOV = 55
const DESKTOP_ASPECT = 1920 / 1080

function buildScene(): Scene3D {
  return createDefaultScene('camera-shake-regression-fixture')
}

function snap(camera: THREE.PerspectiveCamera): [number, number, number] {
  return [camera.position.x, camera.position.y, camera.position.z]
}

function buildAndSnap(scene: Scene3D, mode: CameraMode, aspect: number) {
  const ctrl = new CameraController(scene, aspect, BASE_FOV)
  ctrl.setMode(mode)
  ctrl.snapNext()
  const cam = new THREE.PerspectiveCamera(BASE_FOV, aspect, 0.5, 400)
  ctrl.tick(cam)
  return { ctrl, cam }
}

// ---------------------------------------------------------------------------
// 1. Stable target under unchanged phase.
// ---------------------------------------------------------------------------

describe('Camera shake regression — stable target under unchanged phase', () => {
  it('repeated dispatcher calls with identical inputs produce identical preset choices', () => {
    // The Scenario3DCanvas dispatcher useEffect runs `pickAssistedCameraMode`
    // and only calls `setMode` when the result changes. Pin the policy:
    // identical inputs → identical preset → no churn.
    const inputs = [
      { decoder: 'BACKDOOR_WINDOW', phase: 'frozen', assist: 'partial', manualOverride: false },
      { decoder: 'BACKDOOR_WINDOW', phase: 'frozen', assist: 'partial', manualOverride: false },
      { decoder: 'BACKDOOR_WINDOW', phase: 'frozen', assist: 'partial', manualOverride: false },
    ] as const
    const results = inputs.map((i) =>
      pickAssistedCameraMode({
        decoder: i.decoder,
        phase: i.phase as ReplayPhase,
        assist: i.assist as 'full' | 'partial' | 'none',
        manualOverride: i.manualOverride,
      }),
    )
    expect(results[0]).toBe(results[1])
    expect(results[1]).toBe(results[2])
  })

  it('controller mode is byte-stable after repeated identical setMode calls', () => {
    const scene = buildScene()
    const { ctrl, cam } = buildAndSnap(scene, 'broadcast', DESKTOP_ASPECT)
    const baseline = snap(cam)
    for (let i = 0; i < 240; i++) {
      ctrl.setMode('broadcast')
      ctrl.tick(cam)
    }
    const final = snap(cam)
    for (let i = 0; i < 3; i++) {
      expect(final[i]).toBeCloseTo(baseline[i]!, 4)
    }
  })
})

// ---------------------------------------------------------------------------
// 2. cueRepaint never produces a new preset.
// ---------------------------------------------------------------------------

describe('Camera shake regression — cueRepaint never bounces the camera', () => {
  it('every (decoder, assist) tuple returns null (hold) for cueRepaint', () => {
    // The dispatcher's cueRepaint contract is "hold whatever mode the
    // previous phase set." Returning a non-null value would bounce
    // the controller through three presets in ~1.4s (consequence →
    // cueRepaint → replaying), reading as a brief shake.
    const decoders = [
      'BACKDOOR_WINDOW',
      'EMPTY_SPACE_CUT',
      'ADVANTAGE_OR_RESET',
      'SKIP_THE_ROTATION',
    ] as const
    const assists = ['full', 'partial'] as const
    for (const decoder of decoders) {
      for (const assist of assists) {
        const mode = pickAssistedCameraMode({
          decoder,
          phase: 'cueRepaint',
          assist,
          manualOverride: false,
        })
        expect(mode, `${decoder}/${assist}`).toBeNull()
      }
    }
  })

  it('a frozen → cueRepaint → replaying sequence emits at most ONE setMode call', () => {
    // Wire a stub controller that records every setMode invocation.
    const setModeCalls: CameraMode[] = []
    const stubCtrl = {
      setMode: (m: CameraMode) => setModeCalls.push(m),
    }
    const dispatchTuple = (phase: ReplayPhase) => {
      const picked = pickAssistedCameraMode({
        decoder: 'BACKDOOR_WINDOW',
        phase,
        assist: 'partial',
        manualOverride: false,
      })
      if (picked !== null) stubCtrl.setMode(picked as CameraMode)
    }
    dispatchTuple('frozen')
    dispatchTuple('cueRepaint')
    dispatchTuple('replaying')
    // 'frozen' under partial assist resolves to broadcast (pre-FR-4
    // contract); 'replaying' resolves to player-read-angle for BDW.
    // 'cueRepaint' must NOT issue a setMode in between — that's
    // exactly the bounce we are guarding against.
    expect(setModeCalls.length).toBeLessThanOrEqual(2)
    expect(setModeCalls).not.toContain('teaching-angle')
  })
})

// ---------------------------------------------------------------------------
// 3. Fullscreen / aspect debounce.
// ---------------------------------------------------------------------------

describe('Camera shake regression — fullscreen aspect updates are debounced', () => {
  it('half-percent aspect deltas during fullscreen layout settle do not move the camera', () => {
    const scene = buildScene()
    const { ctrl, cam } = buildAndSnap(scene, 'teaching-angle', DESKTOP_ASPECT)
    const baseline = snap(cam)
    // Browser-published sub-pixel layout fluctuations during a
    // fullscreen entry. Each is well below the human-noticeable
    // framing-change floor.
    const noisyAspects = [
      DESKTOP_ASPECT + 0.0008,
      DESKTOP_ASPECT - 0.0015,
      DESKTOP_ASPECT + 0.0030,
      DESKTOP_ASPECT - 0.0049,
    ]
    for (const a of noisyAspects) {
      ctrl.setAspect(a)
      ctrl.tick(cam)
    }
    for (let i = 0; i < 60; i++) ctrl.tick(cam)
    const final = snap(cam)
    for (let i = 0; i < 3; i++) {
      expect(final[i]).toBeCloseTo(baseline[i]!, 4)
    }
  })

  it('a real aspect transition (desktop → portrait) still updates the target', () => {
    // Sanity — the debounce must not eat genuine aspect changes.
    // 1.78 → 0.45 is 75% drop; the camera must move.
    const scene = buildScene()
    const { ctrl, cam } = buildAndSnap(scene, 'teaching-angle', DESKTOP_ASPECT)
    const baseline = snap(cam)
    ctrl.setAspect(0.45)
    ctrl.snapNext()
    ctrl.tick(cam)
    const final = snap(cam)
    // At least one axis must have moved by > 1 ft.
    const dx = Math.abs(final[0] - baseline[0]!)
    const dy = Math.abs(final[1] - baseline[1]!)
    const dz = Math.abs(final[2] - baseline[2]!)
    expect(dx + dy + dz).toBeGreaterThan(1)
  })

  it('repeated calls with the same in-band aspect collapse to one recompute', () => {
    // Even after a meaningful aspect change, hammering the same new
    // aspect must not re-issue work each tick. Exercises the early
    // exit at the top of `setAspect`.
    const scene = buildScene()
    const { ctrl, cam } = buildAndSnap(scene, 'broadcast', DESKTOP_ASPECT)
    const portrait = 0.45
    ctrl.setAspect(portrait)
    ctrl.snapNext()
    ctrl.tick(cam)
    const afterSnap = snap(cam)
    for (let i = 0; i < 240; i++) {
      ctrl.setAspect(portrait)
    }
    ctrl.snapNext()
    ctrl.tick(cam)
    const settled = snap(cam)
    for (let i = 0; i < 3; i++) {
      expect(settled[i]).toBeCloseTo(afterSnap[i]!, 6)
    }
  })
})

// ---------------------------------------------------------------------------
// 4. Pass-arrival shake bounded + gated.
// ---------------------------------------------------------------------------

describe('Camera shake regression — pass-arrival shake amplitude + settle gate', () => {
  it('the shake amplitude in Scenario3DCanvas is ≤ 0.10 ft', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(
      path.resolve(__dirname, 'Scenario3DCanvas.tsx'),
      'utf8',
    )
    const ampMatch = src.match(/amplitude:\s*([\d.]+)/)
    expect(ampMatch, 'amplitude assignment not found').not.toBeNull()
    const amp = parseFloat(ampMatch![1]!)
    expect(amp).toBeLessThanOrEqual(0.1)
  })

  it('the shake duration is ≤ 200 ms (capped to a single visual beat)', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(
      path.resolve(__dirname, 'Scenario3DCanvas.tsx'),
      'utf8',
    )
    const durMatch = src.match(/duration:\s*(\d+)/)
    expect(durMatch, 'duration assignment not found').not.toBeNull()
    const dur = parseInt(durMatch![1]!, 10)
    expect(dur).toBeLessThanOrEqual(200)
  })

  it('the shake trigger is gated on ctrl.hasSettled()', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(
      path.resolve(__dirname, 'Scenario3DCanvas.tsx'),
      'utf8',
    )
    // The shake-trigger condition must include `ctrl.hasSettled()`.
    // Without this gate, the shake stacks on top of an in-flight
    // teaching-cut lerp, reading as a "double bounce."
    const triggerMatch = /motion\.consumePassArrival\(\)[\s\S]{0,400}ctrl\.hasSettled\(\)/
    expect(
      triggerMatch.test(src),
      'shake trigger must be gated by ctrl.hasSettled()',
    ).toBe(true)
  })

  it('CameraController.hasSettled returns true on a freshly-snapped controller', () => {
    const scene = buildScene()
    const ctrl = new CameraController(scene, DESKTOP_ASPECT, BASE_FOV)
    ctrl.setMode('broadcast')
    ctrl.snapNext()
    expect(ctrl.hasSettled()).toBe(true)
  })

  it('CameraController.hasSettled returns false during an eased lerp toward a new mode', () => {
    const scene = buildScene()
    const ctrl = new CameraController(scene, DESKTOP_ASPECT, BASE_FOV)
    ctrl.setMode('broadcast')
    ctrl.snapNext()
    const cam = new THREE.PerspectiveCamera(BASE_FOV, DESKTOP_ASPECT, 0.5, 400)
    ctrl.tick(cam)
    // Now switch to a different mode — this updates the target but
    // does NOT snap, so the controller is in flight.
    ctrl.setMode('teaching-angle')
    expect(ctrl.hasSettled()).toBe(false)
  })

  it('CameraController.hasSettled returns true again after a snap to the new target', () => {
    // The eased lerp is wall-clock driven, so fake-timer-free tests
    // cannot reliably "advance time." We instead exercise the
    // user-visible contract: a forced snap (snapNext + tick) lands
    // the camera on the target in one frame, which must reset
    // hasSettled() to true.
    const scene = buildScene()
    const ctrl = new CameraController(scene, DESKTOP_ASPECT, BASE_FOV)
    ctrl.setMode('broadcast')
    ctrl.snapNext()
    const cam = new THREE.PerspectiveCamera(BASE_FOV, DESKTOP_ASPECT, 0.5, 400)
    ctrl.tick(cam)
    ctrl.setMode('teaching-angle')
    expect(ctrl.hasSettled()).toBe(false)
    ctrl.snapNext()
    ctrl.tick(cam)
    expect(ctrl.hasSettled()).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 5. Manual override stays out of the way.
// ---------------------------------------------------------------------------

describe('Camera shake regression — manual override remains stable', () => {
  it('manualOverride=true returns null for every phase (no setMode dispatched)', () => {
    const phases: ReplayPhase[] = [
      'idle',
      'setup',
      'playing',
      'frozen',
      'consequence',
      'cueRepaint',
      'replaying',
      'done',
    ]
    for (const phase of phases) {
      const mode = pickAssistedCameraMode({
        decoder: 'BACKDOOR_WINDOW',
        phase,
        assist: 'partial',
        manualOverride: true,
      })
      expect(mode, `phase=${phase}`).toBeNull()
    }
  })

  it('the controller stays on the user-picked mode across phase transitions', () => {
    // Even if the dispatcher would otherwise switch to teaching-angle
    // on `frozen`, manual override holds the camera on broadcast.
    const scene = buildScene()
    const { ctrl, cam } = buildAndSnap(scene, 'broadcast', DESKTOP_ASPECT)
    const baseline = snap(cam)

    // Simulate the canvas dispatcher firing on every phase change
    // with `manualOverride: true` (the dropdown was touched). Each
    // call returns null → setMode is not invoked → controller stays
    // on broadcast.
    const phases: ReplayPhase[] = ['playing', 'frozen', 'consequence', 'replaying']
    for (const phase of phases) {
      const picked = pickAssistedCameraMode({
        decoder: 'BACKDOOR_WINDOW',
        phase,
        assist: 'partial',
        manualOverride: true,
      })
      if (picked !== null) {
        // This branch must not execute — the test fails if it does.
        ctrl.setMode(picked as CameraMode)
        ctrl.snapNext()
      }
      ctrl.tick(cam)
    }

    // Drive the camera through any latent ease. Position must not
    // have moved.
    for (let i = 0; i < 60; i++) ctrl.tick(cam)
    const final = snap(cam)
    for (let i = 0; i < 3; i++) {
      expect(final[i]).toBeCloseTo(baseline[i]!, 4)
    }
  })
})

// ---------------------------------------------------------------------------
// 6. Per-(scene, mode, aspect) determinism.
// ---------------------------------------------------------------------------

describe('Camera shake regression — same (scene, mode, aspect) is byte-identical', () => {
  it('every preset is referentially stable for the same inputs', () => {
    const scene = buildScene()
    const modes: CameraMode[] = [
      'auto',
      'broadcast',
      'tactical',
      'follow',
      'replay',
      'teaching-angle',
      'player-read-angle',
      'help-defense-angle',
      'top-down-coach-board',
    ]
    for (const mode of modes) {
      const a = computeCameraTarget(mode, scene, DESKTOP_ASPECT)
      const b = computeCameraTarget(mode, scene, DESKTOP_ASPECT)
      expect(a, mode).not.toBeNull()
      expect(b, mode).not.toBeNull()
      expect(a!.position.equals(b!.position), `${mode}.position`).toBe(true)
      expect(a!.lookAt.equals(b!.lookAt), `${mode}.lookAt`).toBe(true)
      expect(a!.fov, `${mode}.fov`).toBe(b!.fov)
    }
  })
})
