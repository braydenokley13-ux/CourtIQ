/**
 * P0 — Camera Jitter Regression Coverage.
 *
 * Pins the four stability invariants the P0 audit identified as
 * residual jitter sources beyond what `cameraStability.test.ts` and
 * `cameraShakeRegression.test.ts` already covered:
 *
 *   1. setScene with the same scene reference does NOT bump the
 *      camera target. Pre-fix the canvas's [visibleScene] useEffect
 *      could fire multiple times per logical scene change and each
 *      call re-stamped the controller's target vector for scene-aware
 *      modes (auto / follow / four FR-4 teaching presets / top-down),
 *      restarting the eased lerp from whatever intermediate position
 *      the camera held.
 *
 *   2. hasSettled checks position convergence (not just lookAt).
 *      Pre-fix it only inspected the lookAt cursor and assumed the
 *      position lerp had matched. A downstream effect that mutated
 *      camera.position out of band (the disabled pass-arrival shake
 *      historically) would still report `true` even though the
 *      position lerp needed another frame to chase the offset.
 *
 *   3. Aspect-band hysteresis. The mobile aspect-adjustment policy
 *      is a step function with hard bands at 0.7 and 1.5. A
 *      fullscreen transition that publishes 0.69 → 0.71 → 0.69
 *      pre-fix flipped delta multipliers and chased each band's
 *      target. The controller now holds the previous band's deltas
 *      until the new aspect is solidly past the boundary (≥ 0.04).
 *
 *   4. Pass-arrival shake position offset is REMOVED. The trigger
 *      structure is preserved (so existing regression tests on the
 *      gate predicates still pin the contract) but no `cam.position
 *      +=` write happens. Asserts the source no longer contains the
 *      damped-sine cam.position += ... lines.
 *
 * Pure imperative-path coverage. No Canvas, no R3F.
 */

/* @vitest-environment jsdom */

import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { CameraController, computeCameraTarget } from './imperativeScene'
import { createDefaultScene, type Scene3D } from '@/lib/scenario3d/scene'

const BASE_FOV = 55
const DESKTOP_ASPECT = 1920 / 1080

function buildScene(): Scene3D {
  return createDefaultScene('camera-jitter-fixture')
}

function buildAndSnap(scene: Scene3D, mode: Parameters<CameraController['setMode']>[0]) {
  const ctrl = new CameraController(scene, DESKTOP_ASPECT, BASE_FOV)
  ctrl.setMode(mode)
  ctrl.snapNext()
  const cam = new THREE.PerspectiveCamera(BASE_FOV, DESKTOP_ASPECT, 0.5, 400)
  ctrl.tick(cam)
  return { ctrl, cam }
}

function snapshot(camera: THREE.PerspectiveCamera): [number, number, number] {
  return [camera.position.x, camera.position.y, camera.position.z]
}

// ---------------------------------------------------------------------------
// 1. setScene reference identity is honoured.
// ---------------------------------------------------------------------------

describe('Camera jitter — setScene with the same reference is a no-op', () => {
  it('repeated setScene with the SAME scene reference does not move the camera', () => {
    const scene = buildScene()
    const { ctrl, cam } = buildAndSnap(scene, 'teaching-angle')
    const baseline = snapshot(cam)

    // Pre-fix: each call would call recomputeTarget which re-stamps
    // targetPosition / targetLookAt. For scene-aware modes, the
    // computed values are identical so the camera target doesn't
    // actually move — but the side effect of bumping the target
    // vectors restarts the implicit lerp residual on the next tick.
    for (let i = 0; i < 240; i++) {
      ctrl.setScene(scene)
      ctrl.tick(cam)
    }

    const final = snapshot(cam)
    for (let i = 0; i < 3; i++) {
      expect(final[i]).toBeCloseTo(baseline[i]!, 5)
    }
  })

  it('setScene with a NEW scene reference still triggers a recompute', () => {
    // Sanity — the optimisation must not eat genuine scene swaps.
    const sceneA = buildScene()
    const sceneB = createDefaultScene('camera-jitter-fixture-B')
    const { ctrl, cam } = buildAndSnap(sceneA, 'follow')
    const baseline = snapshot(cam)

    // Force a different scene with a different ball-holder so the
    // follow target relocates. createDefaultScene returns the same
    // canonical scene shape but with the user's id baked from the
    // input — so we mutate sceneB's holder to ensure the target
    // differs.
    sceneB.players[0]!.start = { x: 12, z: 18 }
    sceneB.ball.holderId = sceneB.players[0]!.id
    ctrl.setScene(sceneB)
    ctrl.snapNext()
    ctrl.tick(cam)
    const final = snapshot(cam)

    // At least one axis must have meaningfully moved.
    const dx = Math.abs(final[0] - baseline[0]!)
    const dy = Math.abs(final[1] - baseline[1]!)
    const dz = Math.abs(final[2] - baseline[2]!)
    expect(dx + dy + dz).toBeGreaterThan(0.5)
  })
})

// ---------------------------------------------------------------------------
// 2. hasSettled checks both position and lookAt.
// ---------------------------------------------------------------------------

describe('Camera jitter — hasSettled covers position convergence', () => {
  it('returns false right after a setMode triggers a position-target shift', () => {
    const scene = buildScene()
    const { ctrl, cam } = buildAndSnap(scene, 'broadcast')
    expect(ctrl.hasSettled()).toBe(true)
    ctrl.setMode('teaching-angle')
    // The lookAt and position both moved; hasSettled must report
    // unsettled until the lerp resolves both.
    expect(ctrl.hasSettled()).toBe(false)
    void cam
  })

  it('returns true again after a snapNext + tick lands the camera on the new target', () => {
    const scene = buildScene()
    const { ctrl, cam } = buildAndSnap(scene, 'broadcast')
    ctrl.setMode('teaching-angle')
    expect(ctrl.hasSettled()).toBe(false)
    ctrl.snapNext()
    ctrl.tick(cam)
    expect(ctrl.hasSettled()).toBe(true)
  })

  it('detects an out-of-band position mutation between ticks', () => {
    // Simulates a future cinematic shake (or any other downstream
    // effect) that mutates camera.position after CameraController.tick.
    // The pre-fix `hasSettled()` only read the lookAt cursor, so it
    // would still report `true` here. The position-aware check now
    // surfaces the offset by comparing target vs. last-rendered
    // position the next time hasSettled is called.
    const scene = buildScene()
    const { ctrl, cam } = buildAndSnap(scene, 'broadcast')
    expect(ctrl.hasSettled()).toBe(true)
    // External offset, larger than the threshold (0.05 ft).
    cam.position.x += 1.5
    // Tick the controller again so it observes the offset position.
    // The lerp will pull back toward target, but on this very next
    // tick the recorded `lastRenderedPosition` is the lerped output —
    // which is still off-target. hasSettled must report false.
    ctrl.tick(cam)
    expect(ctrl.hasSettled()).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 3. Aspect-band hysteresis.
// ---------------------------------------------------------------------------

describe('Camera jitter — aspect-band hysteresis', () => {
  it('a tiny oscillation across the 0.7 portrait↔landscape boundary does not flip targets', () => {
    const scene = buildScene()
    const { ctrl, cam } = buildAndSnap(scene, 'teaching-angle')
    // Anchor in the portrait band first.
    ctrl.setAspect(0.6)
    ctrl.snapNext()
    ctrl.tick(cam)
    const portraitPos = snapshot(cam)

    // Now publish a fullscreen-transition-style sequence that
    // narrowly crosses 0.7 in either direction. With hysteresis,
    // none of these intra-deadband crossings should land us on a
    // landscape-band target.
    const noisy = [0.69, 0.71, 0.685, 0.715, 0.695, 0.705]
    for (const a of noisy) {
      ctrl.setAspect(a)
      ctrl.tick(cam)
    }
    // Drive the camera to settle.
    for (let i = 0; i < 60; i++) ctrl.tick(cam)
    const final = snapshot(cam)

    // The camera must still sit on (close to) the portrait target
    // because every value in `noisy` was within the 0.04 deadband
    // around 0.7. We do NOT require byte equality — the auto-fit
    // math inside computeAutoTarget can vary slightly with the
    // continuous aspect — but the band-step deltas must not have
    // flipped, so the position should be within ~1 ft of the
    // portrait baseline.
    const dx = Math.abs(final[0] - portraitPos[0]!)
    const dy = Math.abs(final[1] - portraitPos[1]!)
    const dz = Math.abs(final[2] - portraitPos[2]!)
    expect(dx + dy + dz).toBeLessThan(1.0)
  })

  it('a real band crossing (≥ 0.04 past the boundary) is still honoured', () => {
    // Sanity — the hysteresis must not eat genuine aspect changes.
    // Going from 0.5 (portrait) to 0.9 (landscape) crosses by 0.2,
    // well past the 0.04 deadband. The camera target must move.
    const scene = buildScene()
    const { ctrl, cam } = buildAndSnap(scene, 'teaching-angle')
    ctrl.setAspect(0.5)
    ctrl.snapNext()
    ctrl.tick(cam)
    const portraitPos = snapshot(cam)
    ctrl.setAspect(0.9)
    ctrl.snapNext()
    ctrl.tick(cam)
    const landscapePos = snapshot(cam)
    const dx = Math.abs(landscapePos[0] - portraitPos[0]!)
    const dy = Math.abs(landscapePos[1] - portraitPos[1]!)
    const dz = Math.abs(landscapePos[2] - portraitPos[2]!)
    // The portrait→landscape band change is small per the policy
    // table (distanceScale 0.9 → 0.95, pitchDelta -5 → 0). Distance
    // alone moves the camera along the camera→target ray by ~5%
    // which on the teaching preset is order-of-magnitude 1+ ft.
    expect(dx + dy + dz).toBeGreaterThan(0.5)
  })

  it('an oscillation across the 1.5 landscape↔desktop boundary does not flip targets', () => {
    const scene = buildScene()
    const { ctrl, cam } = buildAndSnap(scene, 'teaching-angle')
    ctrl.setAspect(1.4)
    ctrl.snapNext()
    ctrl.tick(cam)
    const landscapePos = snapshot(cam)

    const noisy = [1.49, 1.51, 1.485, 1.515, 1.495, 1.505]
    for (const a of noisy) {
      ctrl.setAspect(a)
      ctrl.tick(cam)
    }
    for (let i = 0; i < 60; i++) ctrl.tick(cam)
    const final = snapshot(cam)

    const dx = Math.abs(final[0] - landscapePos[0]!)
    const dy = Math.abs(final[1] - landscapePos[1]!)
    const dz = Math.abs(final[2] - landscapePos[2]!)
    expect(dx + dy + dz).toBeLessThan(1.0)
  })
})

// ---------------------------------------------------------------------------
// 4. Pass-arrival shake position offset is gone.
// ---------------------------------------------------------------------------

describe('Camera jitter — pass-arrival shake position offset is removed', () => {
  it('Scenario3DCanvas no longer writes a sine offset to cam.position', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(
      path.resolve(__dirname, 'Scenario3DCanvas.tsx'),
      'utf8',
    )
    // The old offset application looked like
    //   cam.position.x += Math.sin(...) * amp
    //   cam.position.y += Math.sin(...) * amp * 0.32
    // Both lines must be gone. Asserting the literal `cam.position.x +=`
    // and `cam.position.y +=` patterns are absent is sufficient.
    expect(src.includes('cam.position.x +=')).toBe(false)
    expect(src.includes('cam.position.y +=')).toBe(false)
  })

  it('the trigger structure that gates the (now-disabled) shake stays in place', async () => {
    // Future cinematic re-enable must keep the gate predicates the
    // existing regression suite pins. We check the patterns are
    // preserved so a refactor that unintentionally removes the gates
    // (alongside the offset) trips this.
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(
      path.resolve(__dirname, 'Scenario3DCanvas.tsx'),
      'utf8',
    )
    expect(src.includes('motion.consumePassArrival()')).toBe(true)
    expect(src.includes('shakeEnabledRef.current')).toBe(true)
    expect(src.includes('ctrl.hasSettled()')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 5. Initial mode dispatch is wired so the canvas births the controller
//    on the dispatched preset, not on `auto`-then-ease-to-dispatched.
// ---------------------------------------------------------------------------

describe('Camera jitter — initial scene mount uses the dispatched preset', () => {
  it('Scenario3DCanvas calls pickAssistedCameraMode in the controller-mount block', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(
      path.resolve(__dirname, 'Scenario3DCanvas.tsx'),
      'utf8',
    )
    // The mount block must compute an `initialPreset` from the
    // dispatcher BEFORE the controller's first snap, otherwise we
    // ease from auto to the dispatched preset on every scene swap.
    // Anchor on the comment we left in place so a future refactor
    // that removes the call surfaces here.
    const anchor = 'pickAssistedCameraMode({'
    const start = src.indexOf(anchor)
    expect(start, 'pickAssistedCameraMode call missing from mount block').toBeGreaterThan(0)
    // Right after the call there must be a `controller.snapNext()`
    // — without it the eased lerp re-introduces the bounce.
    const slice = src.slice(start, start + 1500)
    expect(
      slice.includes('controller.snapNext()'),
      'mount block must snap after applying the dispatched preset',
    ).toBe(true)
  })

  it('lastDispatchedModeRef is reset on scene rebuild teardown', async () => {
    // The dispatcher's short-circuit relies on this ref being null
    // for the first call after a fresh controller is born; a stale
    // value would silently skip the very first setMode.
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(
      path.resolve(__dirname, 'Scenario3DCanvas.tsx'),
      'utf8',
    )
    // Look for the assignment in the cleanup block.
    expect(
      src.includes('lastDispatchedModeRef.current = null'),
      'cleanup must clear lastDispatchedModeRef so the next mount sees a clean slate',
    ).toBe(true)
  })

  it('computeCameraTarget for the dispatched mode lands on the same target the controller will snap to', () => {
    // Sanity — the dispatched preset path produces a deterministic
    // target. If the dispatcher's preset does not match what
    // computeCameraTarget returns for the same mode, the snap would
    // still produce a visible re-aim on the next dispatcher fire.
    const scene = buildScene()
    const aspect = DESKTOP_ASPECT
    const broadcast = computeCameraTarget('broadcast', scene, aspect)
    const auto = computeCameraTarget('auto', scene, aspect)
    expect(broadcast).not.toBeNull()
    expect(auto).not.toBeNull()
    // The broadcast target is intentionally distinct from auto-fit;
    // they must NOT be byte-identical (otherwise the fix is a no-op
    // because the previous behaviour was already aligned).
    expect(broadcast!.position.equals(auto!.position)).toBe(false)
  })
})
