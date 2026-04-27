/* =============================================================================
 * RENDERER SAFETY BASELINE — imperative-only contract.
 *
 * This module is the load-bearing safety net for the entire scenario
 * renderer. It composes per-area builders (lighting / court / hoop / gym /
 * players / ball) into a single root group, all built with vanilla THREE
 * primitives and mounted by `Scenario3DCanvas` directly into THREE.Scene
 * — bypassing the R3F reconciler entirely.
 *
 * Why imperative-only:
 *   - R3F v9 + React 19 + Next 15 silently drops <Canvas> children in
 *     production (THREE.Scene.children stays at 0).
 *   - useFrame subscribers are not consistently invoked.
 *   - The reconciler cannot be trusted to mount, update, or animate
 *     scene geometry in this stack.
 *
 * Hard rules for every future packet (see docs/courtiq-realistic-renderer-plan.md):
 *   - All visual upgrades MUST be added to a builder under `./builders/`
 *     and wired into `buildBasketballScene`. Never declare critical
 *     visuals as JSX.
 *   - NEVER use useFrame for playback, animation, camera, or any
 *     per-frame logic. Animation runs from the parent-level
 *     requestAnimationFrame loop in `Scenario3DCanvas.tsx`.
 *   - Every geometry/material/texture allocated by a builder must be
 *     released by that builder's `dispose()` (or, defensively, by the
 *     orchestrator's traversal disposer on teardown).
 *   - Builders must remain side-effect free apart from constructing and
 *     returning THREE objects — no React, no global state, no scene-graph
 *     mutation outside the returned group.
 * =============================================================================
 */

import * as THREE from 'three'
import type { Scene3D } from '@/lib/scenario3d/scene'
import { buildBall } from './builders/buildBall'
import { buildCourt } from './builders/buildCourt'
import { buildGymShell } from './builders/buildGymShell'
import { buildHoop } from './builders/buildHoop'
import { buildLighting } from './builders/buildLighting'
import { buildPlayers, PLAYER_HEIGHT } from './builders/buildPlayers'
import { disposeObject3D } from './builders/dispose'
import type { BuilderResult, SceneHandle } from './builders/types'

export type { SceneHandle, BuilderResult } from './builders/types'

/**
 * Composes all per-area builders into a single mountable handle.
 * Caller (Scenario3DCanvas) adds `handle.root` to THREE.Scene and calls
 * `handle.dispose()` on unmount.
 */
export function buildBasketballScene(scene: Scene3D): SceneHandle {
  const root = new THREE.Group()
  root.name = 'imperative-basketball'

  // Order matters only for predictable z-fighting / stacking; rendering
  // order is the order of insertion. Lighting first so it owns its own
  // group; gym shell second so future walls sit behind everything; court
  // / hoop / players / ball next.
  const builders: BuilderResult[] = [
    buildLighting(),
    buildGymShell(),
    buildCourt(),
    buildHoop(),
    buildPlayers(scene),
    buildBall(scene),
  ]

  for (const b of builders) {
    root.add(b.object)
  }

  let disposed = false
  return {
    root,
    dispose: () => {
      if (disposed) return
      disposed = true
      // Per-builder dispose first so each owner has the chance to clean
      // up tracked resources (textures, render targets, etc. when they
      // are added in later packets).
      for (const b of builders) {
        try {
          b.dispose()
        } catch (error) {
          if (typeof console !== 'undefined') {
            // eslint-disable-next-line no-console
            console.error('[scenario3d] builder dispose error', error)
          }
        }
      }
      // Defensive sweep: walk the root in case anything escaped a builder's
      // tracking. Cheap, idempotent, and prevents GPU leaks if a future
      // builder forgets to register an allocation.
      disposeObject3D(root)
    },
  }
}

/**
 * Computes a Box3 over the players + ball, then aims the camera so the
 * whole box is in frame at the given pitch. Used by the canvas to
 * auto-fit the broadcast camera. Camera modes (Packet 10) will revisit
 * this; left here for now because it is consumed by Scenario3DCanvas
 * directly and is not a scene-geometry builder.
 */
export function fitCameraToScene(
  camera: THREE.PerspectiveCamera,
  scene: Scene3D,
  aspect: number,
  pitchDeg = 32,
  padding = 1.4,
): void {
  const points: THREE.Vector3[] = []
  for (const p of scene.players) {
    if (Number.isFinite(p.start.x) && Number.isFinite(p.start.z)) {
      points.push(new THREE.Vector3(p.start.x, 0, p.start.z))
      points.push(new THREE.Vector3(p.start.x, PLAYER_HEIGHT + 1, p.start.z))
    }
  }
  if (Number.isFinite(scene.ball.start.x) && Number.isFinite(scene.ball.start.z)) {
    points.push(new THREE.Vector3(scene.ball.start.x, 1, scene.ball.start.z))
  }
  if (points.length === 0) return

  const box = new THREE.Box3().setFromPoints(points)
  const center = new THREE.Vector3()
  const sizeVec = new THREE.Vector3()
  box.getCenter(center)
  box.getSize(sizeVec)

  const fovRad = (camera.fov * Math.PI) / 180
  const verticalFit = (sizeVec.y * 0.5 + sizeVec.z * 0.5) / Math.tan(fovRad / 2)
  const horizontalFit = (sizeVec.x * 0.5) / (Math.tan(fovRad / 2) * Math.max(aspect, 0.1))
  const distance = Math.max(verticalFit, horizontalFit) * padding

  const pitch = (pitchDeg * Math.PI) / 180
  camera.position.set(
    center.x,
    center.y + Math.sin(pitch) * distance,
    center.z + Math.cos(pitch) * distance,
  )
  camera.lookAt(center)

  const diag = sizeVec.length()
  camera.near = Math.max(0.1, distance * 0.05)
  camera.far = Math.max(1000, distance + diag * 4)
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld()
}
