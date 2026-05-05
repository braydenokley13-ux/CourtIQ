/**
 * V1 stabilization — CameraController target-stability invariants.
 *
 * The film-room V1 readiness pass found two camera-jitter sources
 * that this suite pins so they cannot regress:
 *
 *   1. Per-frame `setAspect` from the parent rAF loop used to read
 *      `gl.domElement.clientWidth/Height` every frame and forward to
 *      the controller. During fullscreen transitions and GLB cold-
 *      load handoffs, sub-pixel layout fluctuations could clear the
 *      controller's 0.001 aspect-delta threshold every few frames
 *      and trigger a target recompute, producing visible jitter.
 *      The fix removes the per-frame call and relies on the Phase L
 *      ResizeObserver-driven `apply()` for aspect updates. This
 *      suite locks the underlying invariants the fix depends on:
 *      `setAspect` is a no-op when the aspect hasn't meaningfully
 *      changed, and the camera target stays stable across redundant
 *      calls.
 *
 *   2. Same `(scene, mode, aspect)` tuple always produces the same
 *      camera target — `recomputeTarget` is referentially stable so
 *      a re-render that flushes a setMode/setScene useEffect twice
 *      with the same value cannot move the camera.
 *
 *   3. Manual override (the dispatcher returning `null`) doesn't
 *      churn the controller mode — `setMode(currentMode)` is a no-op.
 */

/* @vitest-environment jsdom */

import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import {
  CameraController,
  computeCameraTarget,
  type CameraMode,
} from './imperativeScene'
import { createDefaultScene, type Scene3D } from '@/lib/scenario3d/scene'

const BASE_FOV = 55
const DESKTOP_ASPECT = 1920 / 1080 // 1.7777...

function buildScene(): Scene3D {
  return createDefaultScene('camera-stability-fixture')
}

/** Constructs a controller, snaps it onto its first target, and drives
 *  `tick` with a stub camera so we can read the resulting position. */
function buildControllerAndCamera(
  scene: Scene3D,
  mode: CameraMode,
  aspect: number,
) {
  const controller = new CameraController(scene, aspect, BASE_FOV)
  controller.setMode(mode)
  controller.snapNext()
  const camera = new THREE.PerspectiveCamera(BASE_FOV, aspect, 0.5, 400)
  controller.tick(camera)
  return { controller, camera }
}

function snapshotPosition(camera: THREE.PerspectiveCamera): [number, number, number] {
  return [camera.position.x, camera.position.y, camera.position.z]
}

describe('V1 stabilization — CameraController.setAspect is stable', () => {
  it('repeated setAspect with the same aspect does not move the snapped camera', () => {
    const scene = buildScene()
    const { controller, camera } = buildControllerAndCamera(
      scene,
      'broadcast',
      DESKTOP_ASPECT,
    )
    const baseline = snapshotPosition(camera)

    // Simulate the pre-fix behavior: a stable layout (1920x1080)
    // would have the rAF loop call setAspect 60 times per second
    // with the exact same aspect. None of those calls should move
    // the camera.
    for (let i = 0; i < 240; i++) {
      controller.setAspect(DESKTOP_ASPECT)
      controller.tick(camera)
    }

    const final = snapshotPosition(camera)
    // After settling, position must equal baseline (target unchanged
    // → lerp converges to the same point).
    for (let i = 0; i < 3; i++) {
      expect(final[i]).toBeCloseTo(baseline[i], 4)
    }
  })

  it('sub-threshold aspect changes do not trigger a target shift', () => {
    const scene = buildScene()
    const { controller, camera } = buildControllerAndCamera(
      scene,
      'teaching-angle',
      DESKTOP_ASPECT,
    )
    const baseline = snapshotPosition(camera)

    // Sub-threshold deltas (< 0.001) — these are the kind of
    // sub-pixel layout fluctuations a per-frame setAspect would
    // forward to the controller during a fullscreen transition.
    const noisyAspects = [
      DESKTOP_ASPECT + 0.0001,
      DESKTOP_ASPECT - 0.0002,
      DESKTOP_ASPECT + 0.00005,
      DESKTOP_ASPECT - 0.00099,
    ]
    for (const a of noisyAspects) {
      controller.setAspect(a)
      controller.tick(camera)
    }
    // Allow a few more ticks for any latent lerp to settle.
    for (let i = 0; i < 60; i++) controller.tick(camera)

    const final = snapshotPosition(camera)
    for (let i = 0; i < 3; i++) {
      expect(final[i]).toBeCloseTo(baseline[i], 4)
    }
  })

  it('above-threshold aspect change moves the target once; subsequent same-aspect calls are no-ops', () => {
    const scene = buildScene()
    const { controller, camera } = buildControllerAndCamera(
      scene,
      'teaching-angle',
      DESKTOP_ASPECT,
    )

    // Apply a real aspect change (desktop → portrait phone), then
    // snap so the camera is exactly at the new target.
    const portrait = 0.45
    controller.setAspect(portrait)
    controller.snapNext()
    controller.tick(camera)
    const afterSnap = snapshotPosition(camera)

    // Now hammer the same portrait aspect — the underlying target
    // must NOT change. We re-snap each time and check the camera
    // lands on the same position. If setAspect mutated the target
    // anyway (e.g. by ignoring its threshold and recomputing), the
    // snapped position would drift.
    for (let i = 0; i < 240; i++) {
      controller.setAspect(portrait)
    }
    controller.snapNext()
    controller.tick(camera)
    const settled = snapshotPosition(camera)

    for (let i = 0; i < 3; i++) {
      expect(settled[i]).toBeCloseTo(afterSnap[i], 6)
    }
  })

  it('invalid aspects (NaN, 0, negative) are ignored — camera holds', () => {
    const scene = buildScene()
    const { controller, camera } = buildControllerAndCamera(
      scene,
      'broadcast',
      DESKTOP_ASPECT,
    )
    const baseline = snapshotPosition(camera)

    for (const bad of [NaN, 0, -1, Number.NEGATIVE_INFINITY]) {
      controller.setAspect(bad)
      controller.tick(camera)
    }
    for (let i = 0; i < 60; i++) controller.tick(camera)
    const final = snapshotPosition(camera)
    for (let i = 0; i < 3; i++) {
      expect(final[i]).toBeCloseTo(baseline[i], 4)
    }
  })
})

describe('V1 stabilization — same (scene, mode, aspect) yields same target', () => {
  it('computeCameraTarget is referentially stable for identical inputs', () => {
    // Pure-function invariant. If a future packet introduces
    // randomness or non-determinism in any preset path, this trips.
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
      // Vector3.equals is exact; every preset path is deterministic.
      expect(a!.position.equals(b!.position), `${mode}.position`).toBe(true)
      expect(a!.lookAt.equals(b!.lookAt), `${mode}.lookAt`).toBe(true)
      expect(a!.fov, `${mode}.fov`).toBe(b!.fov)
    }
  })

  it('setMode with the current mode is a no-op (no target churn)', () => {
    const scene = buildScene()
    const { controller, camera } = buildControllerAndCamera(
      scene,
      'broadcast',
      DESKTOP_ASPECT,
    )
    const baseline = snapshotPosition(camera)

    // Repeated setMode('broadcast') — the dispatcher's manual-
    // override path returns null so the canvas's `setMode` useEffect
    // never fires for the assist branch, but the camera-mode
    // useEffect still calls setMode(activeCameraMode) on every
    // re-render. Verify it stays a no-op.
    for (let i = 0; i < 240; i++) {
      controller.setMode('broadcast')
      controller.tick(camera)
    }
    const final = snapshotPosition(camera)
    for (let i = 0; i < 3; i++) {
      expect(final[i]).toBeCloseTo(baseline[i], 4)
    }
  })
})

// =====================================================================
// V1 stabilization — parent rAF loop does NOT call setAspect every
// frame. This is a structural regression test: the canvas's parent
// rAF tick used to read `gl.domElement.clientWidth/clientHeight` and
// call `ctrl.setAspect(...)` every frame, which produced sub-pixel
// jitter during fullscreen transitions and GLB cold-load handoffs.
// The fix relies on the Phase L ResizeObserver-driven `apply()`
// being the SOLE caller of `setAspect` for wrapper-size changes.
// =====================================================================

describe('V1 stabilization — Scenario3DCanvas does not call setAspect from the parent rAF loop', () => {
  it('the parent rAF tick body does not call ctrl.setAspect', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(
      path.resolve(__dirname, 'Scenario3DCanvas.tsx'),
      'utf8',
    )

    // Find the `const tick = () => {` block that drives the parent
    // rAF loop. It starts at the FPS_GUARD constants and ends at
    // `rafId = window.requestAnimationFrame(tick)`. We extract the
    // body and assert no `ctrl.setAspect(` token appears in it.
    //
    // The structural cue we anchor on is the comment "Drive the
    // camera controller from the same parent rAF loop" which sits
    // at the top of the tick body (and is part of the V1
    // stabilization comment we left in place).
    const anchor = 'Drive the camera controller from the same parent rAF loop'
    const start = src.indexOf(anchor)
    expect(start, 'parent rAF loop anchor not found').toBeGreaterThan(0)

    // Take a generous slice — 5000 chars covers the entire tick
    // body across plausible refactors.
    const slice = src.slice(start, start + 5000)
    expect(
      slice.includes('ctrl.setAspect('),
      'parent rAF loop must not call ctrl.setAspect — that produced sub-pixel jitter during fullscreen transitions',
    ).toBe(false)
  })

  it('Phase L ResizeObserver path still calls setAspect (single source of truth)', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(
      path.resolve(__dirname, 'Scenario3DCanvas.tsx'),
      'utf8',
    )
    // The `apply()` helper inside the wrapper-size-sync effect must
    // still be the canonical path. We just assert the call site
    // exists somewhere (the effect body uses `ctrl.setAspect(width
    // / height)`).
    expect(src).toMatch(/ctrl\.setAspect\(\s*width\s*\/\s*height\s*\)/)
  })
})

describe('V1 stabilization — phase transition produces one intended target change', () => {
  it('a single setMode change updates the controller target to the new preset', () => {
    const scene = buildScene()
    const { controller, camera } = buildControllerAndCamera(
      scene,
      'broadcast',
      DESKTOP_ASPECT,
    )
    const broadcastTarget = computeCameraTarget(
      'broadcast',
      scene,
      DESKTOP_ASPECT,
    )!
    const teachingTarget = computeCameraTarget(
      'teaching-angle',
      scene,
      DESKTOP_ASPECT,
    )!

    // Sanity: camera is at the broadcast target after the snap+tick.
    const startPos = snapshotPosition(camera)
    expect(startPos[0]).toBeCloseTo(broadcastTarget.position.x, 3)
    expect(startPos[1]).toBeCloseTo(broadcastTarget.position.y, 3)
    expect(startPos[2]).toBeCloseTo(broadcastTarget.position.z, 3)

    // Phase transition → setMode('teaching-angle'). Snap to confirm
    // the new target lands exactly at the teaching-angle preset.
    controller.setMode('teaching-angle')
    controller.snapNext()
    controller.tick(camera)
    const endPos = snapshotPosition(camera)

    expect(endPos[0]).toBeCloseTo(teachingTarget.position.x, 4)
    expect(endPos[1]).toBeCloseTo(teachingTarget.position.y, 4)
    expect(endPos[2]).toBeCloseTo(teachingTarget.position.z, 4)
  })
})
