/**
 * Phase M — experimental SkinnedMesh + AnimationMixer player path.
 *
 * This module is isolated from `imperativeScene.ts` on purpose: it
 * owns the experimental skinned/animated player builder while the
 * procedural builders (Phase F / J / K / L) remain the production
 * default. Phase M3 ships this scaffold; subsequent phases (M4..M8)
 * progressively flesh out a generated low-poly skinned prototype,
 * AnimationMixer support, replay-state mapping, and performance
 * guardrails.
 *
 * Public contract — same return shape the procedural builder
 * exposes via `imperativeScene.buildPlayerFigure`:
 *
 *   - returns a `THREE.Group` (the figure root) on success
 *   - returns `null` if the skinned path is not available; the
 *     caller falls back to the procedural figure
 *   - attaches `userData.indicatorLayers` so
 *     `getPlayerIndicatorLayers` resolves the same way as the
 *     procedural figure
 *   - all geometry / materials / textures owned by the figure are
 *     reachable via figure descendants so the existing
 *     `disposeGroup` traversal frees them
 *
 * Determinism — the skinned figure does NOT animate during build.
 * Every animation update flows through the
 * `updateSkinnedAthletePose` helper from a controlled `dt`, which
 * the scene's motion controller can drive from the same parent
 * rAF tick that the timeline uses. Replay still owns root motion.
 */

import * as THREE from 'three'
import type { PlayerStance } from './imperativeScene'

/**
 * Indicator layer handles attached to a skinned figure. Same
 * shape as the procedural `PlayerIndicatorLayers` so the
 * existing `getPlayerIndicatorLayers` resolver returns the same
 * fields. Re-declared here to keep the skinned module
 * dependency-light.
 */
interface SkinnedIndicatorLayers {
  base: THREE.Group
  user: THREE.Group
  userHead: THREE.Group
  possession: THREE.Group
}

/**
 * Marker stored on the figure root userData so callers can detect
 * a skinned figure without inspecting the geometry. The motion
 * controller, indicator helper, and tests all key off this.
 */
export const SKINNED_ATHLETE_USER_DATA_KEY = 'skinnedAthlete'

/**
 * Per-figure handle returned alongside the figure root. Holds the
 * mixer, named clip actions, and root bone so the scene's motion
 * controller can drive animation deterministically.
 *
 * Phase M3 ships only the type. Phase M4/M5 fill in the mixer,
 * actions, and rootBone; until then the handle stays `null` and
 * the caller falls back to the procedural figure.
 */
export interface SkinnedAthleteHandle {
  figure: THREE.Group
  rootBone: THREE.Bone | null
  mixer: THREE.AnimationMixer | null
  actions: Record<string, THREE.AnimationAction>
  indicatorLayers: SkinnedIndicatorLayers
}

/**
 * Phase M — experimental skinned/animated player builder.
 *
 * M3 returns `null` to keep the production path the procedural
 * figure. Subsequent phases will replace the body with a real
 * generated skinned prototype + AnimationMixer.
 *
 * Contract once implemented:
 *   - returns a `THREE.Group` whose root position is owned by the
 *     scene's motion controller (replay still owns root motion)
 *   - `userData.skinnedAthlete` holds the `SkinnedAthleteHandle`
 *   - `userData.indicatorLayers` holds the indicator anchors
 *   - figure descendants reach every owned geometry / material so
 *     `disposeGroup` cleans up the figure cleanly
 *   - returns `null` if the skinned path cannot run on this device
 *     or in this build (caller falls back to the procedural figure)
 */
export function buildSkinnedAthletePreview(
  _teamColor: string,
  _trimColor: string,
  _isUser: boolean,
  _hasBall: boolean,
  _jerseyNumber: string,
  _stance: PlayerStance,
): THREE.Group | null {
  // M3 scaffold — the body is filled in M4. Returning null keeps
  // the procedural fallback live until the prototype is ready.
  return null
}

/**
 * Read the skinned-athlete handle attached to a figure root by
 * `buildSkinnedAthletePreview`, or `null` if the figure is not a
 * skinned figure (e.g. the procedural fallback). Lookup is O(1).
 */
export function getSkinnedAthleteHandle(
  figure: THREE.Object3D,
): SkinnedAthleteHandle | null {
  const handle = (figure.userData as Record<string, unknown>)[
    SKINNED_ATHLETE_USER_DATA_KEY
  ]
  if (!handle || typeof handle !== 'object') return null
  return handle as SkinnedAthleteHandle
}

/**
 * Phase M5 entry point. Ticks the AnimationMixer for the figure
 * with a deterministic `dt`. No-op for procedural figures and for
 * skinned figures whose mixer has not been built yet.
 *
 * The caller is responsible for using the same `dt` source the
 * scene uses for replay (so animation stays in lock-step with
 * timeline-driven root motion).
 */
export function updateSkinnedAthletePose(
  figure: THREE.Object3D,
  dt: number,
): void {
  const handle = getSkinnedAthleteHandle(figure)
  if (!handle || !handle.mixer) return
  handle.mixer.update(dt)
}
