/**
 * FR-4 — `computeCameraTarget` placements for the four decoder-aware
 * presets. Locks the §8.4 cue-locked-framing rules at unit-test
 * granularity so a future refactor cannot quietly drop the user,
 * the key defender, or the ball out of frame:
 *
 *   1. Each FR-4 mode produces a finite, reasonable placement on a
 *      well-formed scene.
 *   2. `top-down-coach-board` is genuinely top-down (height >> z
 *      look-at), centered on the play.
 *   3. The returned `lookAt` lies inside a bounding box that
 *      contains the user, the closest defender, and the ball — the
 *      §8.4 invariant that "the cue is in frame."
 *   4. Mobile aspect deltas land in the expected direction
 *      (portrait dollies the camera closer, top-down widens FOV
 *      instead of changing pitch).
 *   5. Degenerate scenes (no defender, no user) fall through to a
 *      broadcast / sensible fallback rather than producing a NaN
 *      target.
 */

/* @vitest-environment jsdom */

import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import {
  computeCameraTarget,
  type CameraMode,
  type CameraTarget,
} from './imperativeScene'
import { createDefaultScene } from '@/lib/scenario3d/scene'
import type { Scene3D } from '@/lib/scenario3d/scene'

const DESKTOP_ASPECT = 1.78
const PORTRAIT_ASPECT = 0.45

function buildBdwSceneFixture(): Scene3D {
  // Default scene puts the user at (0, 22) with d_user at (0, 24).
  // That gives us a real cue triple (user + closest defender + ball)
  // without authoring a custom JSON, which is forbidden in FR-4
  // anyway.
  return createDefaultScene('FR4-test-scene')
}

function inFrameOfBox(
  target: CameraTarget,
  expected: { minX: number; maxX: number; minZ: number; maxZ: number },
): boolean {
  const { x, z } = target.lookAt
  return x >= expected.minX && x <= expected.maxX && z >= expected.minZ && z <= expected.maxZ
}

function isFiniteVec(v: THREE.Vector3): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z)
}

// =====================================================================
// FR-4 §8.4 — placements produce finite cue-aware targets
// =====================================================================

describe('FR-4 §8.4 — decoder camera placements', () => {
  const scene = buildBdwSceneFixture()

  it('teaching-angle produces a finite placement aimed near the cue area', () => {
    const t = computeCameraTarget('teaching-angle', scene, DESKTOP_ASPECT)
    expect(t).not.toBeNull()
    expect(isFiniteVec(t!.position)).toBe(true)
    expect(isFiniteVec(t!.lookAt)).toBe(true)
    // Cue triple in default scene lives between z=22 and z=24, so
    // lookAt.z should fall between the user and the defender.
    expect(
      inFrameOfBox(t!, { minX: -10, maxX: 10, minZ: 18, maxZ: 28 }),
    ).toBe(true)
  })

  it('player-read-angle places camera on the opposite side of user from key defender', () => {
    const t = computeCameraTarget('player-read-angle', scene, DESKTOP_ASPECT)
    expect(t).not.toBeNull()
    // Default scene: user (0, 22), nearest defender d_user (0, 24).
    // Placement trails the camera away from the (defender→user)
    // axis, so the camera sits opposite the defender from the user.
    // Defender.z > user.z → camera.z < user.z. The lookAt is past
    // the user back toward the defender side, so lookAt.z > user.z.
    expect(t!.position.z).toBeLessThan(22)
    expect(t!.lookAt.z).toBeGreaterThan(22)
    expect(isFiniteVec(t!.position)).toBe(true)
  })

  it('help-defense-angle rides the side of the court opposite the ball', () => {
    const t = computeCameraTarget('help-defense-angle', scene, DESKTOP_ASPECT)
    expect(t).not.toBeNull()
    // Ball starts at x=0 in the default scene → ballSide defaults to
    // +1, so the camera should sit on the +x sideline.
    expect(Math.abs(t!.position.x)).toBeGreaterThan(20)
    expect(t!.position.y).toBeGreaterThan(0)
    expect(isFiniteVec(t!.position)).toBe(true)
  })

  it('top-down-coach-board places the camera high above the play centre', () => {
    const t = computeCameraTarget('top-down-coach-board', scene, DESKTOP_ASPECT)
    expect(t).not.toBeNull()
    // Top-down: y is the dominant offset; horizontal distance from
    // lookAt to camera should be tiny because the camera sits
    // directly above the centroid.
    const horizontal = Math.hypot(
      t!.position.x - t!.lookAt.x,
      t!.position.z - t!.lookAt.z,
    )
    expect(t!.position.y).toBeGreaterThan(40)
    expect(horizontal).toBeLessThan(1)
  })
})

// =====================================================================
// FR-4 §8.7 — aspect adjustment is applied
// =====================================================================

describe('FR-4 §8.7 — placements honor aspect deltas', () => {
  const scene = buildBdwSceneFixture()

  it('teaching-angle dollies in on portrait (camera distance smaller than desktop)', () => {
    const desktop = computeCameraTarget('teaching-angle', scene, DESKTOP_ASPECT)!
    const portrait = computeCameraTarget('teaching-angle', scene, PORTRAIT_ASPECT)!
    const dDesktop = desktop.position.distanceTo(desktop.lookAt)
    const dPortrait = portrait.position.distanceTo(portrait.lookAt)
    // Portrait should be ~10% closer (distanceScale 0.9).
    expect(dPortrait).toBeLessThan(dDesktop)
  })

  it('top-down-coach-board widens FOV on portrait, does not change camera distance', () => {
    const desktop = computeCameraTarget('top-down-coach-board', scene, DESKTOP_ASPECT)!
    const portrait = computeCameraTarget('top-down-coach-board', scene, PORTRAIT_ASPECT)!
    expect(portrait.fov).toBeGreaterThan(desktop.fov)
    // Top-down camera distance is dominated by y, which is unchanged
    // by the portrait deltas.
    expect(Math.abs(portrait.position.y - desktop.position.y)).toBeLessThan(0.001)
  })

  it('help-defense-angle on portrait stays finite (no NaN from pitch rotation)', () => {
    const t = computeCameraTarget('help-defense-angle', scene, PORTRAIT_ASPECT)
    expect(t).not.toBeNull()
    expect(isFiniteVec(t!.position)).toBe(true)
    expect(isFiniteVec(t!.lookAt)).toBe(true)
    expect(Number.isFinite(t!.fov)).toBe(true)
  })
})

// =====================================================================
// Degenerate-scene fallback safety
// =====================================================================

describe('FR-4 — degenerate scene fallback', () => {
  it('falls through to broadcast-shaped target when there is no user player', () => {
    const scene = createDefaultScene('FR4-empty-test')
    const noUserScene: Scene3D = {
      ...scene,
      players: scene.players.map((p) => ({ ...p, isUser: false })),
    }
    // Without a user, resolveCueAnchors returns null and
    // teaching/player-read/help-defense fall back to broadcast.
    for (const mode of [
      'teaching-angle',
      'player-read-angle',
      'help-defense-angle',
    ] as const) {
      const t = computeCameraTarget(mode, noUserScene, DESKTOP_ASPECT)
      expect(t).not.toBeNull()
      expect(isFiniteVec(t!.position)).toBe(true)
    }
  })
})

// =====================================================================
// Legacy modes still work (no FR-4 regressions)
// =====================================================================

describe('FR-4 regression — legacy CameraMode values still work', () => {
  const scene = buildBdwSceneFixture()
  it.each<CameraMode>(['auto', 'broadcast', 'tactical', 'follow', 'replay'])(
    '%s mode still produces a finite target',
    (mode) => {
      const t = computeCameraTarget(mode, scene, DESKTOP_ASPECT)
      expect(t).not.toBeNull()
      expect(isFiniteVec(t!.position)).toBe(true)
    },
  )
})
