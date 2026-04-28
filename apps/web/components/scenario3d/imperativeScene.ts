/**
 * Imperative basketball scene builder. Builds the whole basketball scene
 * (court, lines, hoop, players, ball, lights) directly with vanilla THREE
 * primitives — no React, no R3F reconciler.
 *
 * We hit a failure mode where R3F v9 + React 19 + Next 15 silently
 * dropped every Canvas child (THREE.Scene.children stayed at 0 even
 * with the rAF loop running and the gl ready). This module bypasses
 * the reconciler entirely so the scene paints regardless.
 */

import * as THREE from 'three'
import { COURT } from '@/lib/scenario3d/coords'
import type { Scene3D, SceneMovement, SceneTeam } from '@/lib/scenario3d/scene'
import {
  buildTimeline,
  resolveBallStart,
  samplePlayer,
  type ResolvedMovement,
  type Timeline,
} from '@/lib/scenario3d/timeline'

const FLOOR_COLOR = '#C2823F'
const LINE_COLOR = '#FFFFFF'
const PAINT_COLOR = '#0050B4'
// Authentic basketball orange/brown leather (not the neon orange of the
// previous sphere). The pebble texture darkens this further so the
// rendered ball reads richer than the flat hex would suggest.
const BALL_COLOR = '#D26B26'
const BALL_SEAM_COLOR = '#0E0F10'
const RIM_COLOR = '#F26B1F'
const BACKBOARD_GLASS_TINT = '#9FD8FF'
const BACKBOARD_FRAME_COLOR = '#1B1F2A'
const BACKBOARD_TARGET_COLOR = '#FFFFFF'
const POLE_COLOR = '#2A3344'
const PADDING_COLOR = '#1A1A1A'
const NET_COLOR = '#F0F0F0'
const OFFENSE_COLOR = '#5DB4FF'
const DEFENSE_COLOR = '#FF5C72'
const USER_COLOR = '#3BFF9D'
const GYM_WALL_COLOR = '#2D2F36'
const GYM_CEILING_COLOR = '#16181D'
const GYM_FLOOR_EXT_COLOR = '#5C3A1A'
const GYM_RAFTER_COLOR = '#0E0F12'
const GYM_TRIM_COLOR = '#0B0C10'

const PLAYER_HEIGHT = 6
const PLAYER_RADIUS = 1.2
// NBA regulation ball radius is ~0.39 ft (9.4" diameter). Bumped slightly
// so the ball still reads from the default broadcast camera which sits
// ~70 ft from the action.
const BALL_RADIUS = 0.45
const FLOOR_LIFT = 0
const LINE_LIFT = 0.05
const PLAYER_LIFT = 0.05

// Humanoid skin / footwear colors. Jersey color is per-team, supplied
// to buildPlayerFigure().
const SKIN_COLOR = '#D7A47A'
const SHOE_COLOR = '#101216'
const SHORTS_DARKEN = 0.55
const ACCENT_COLOR = '#FFFFFF'

/**
 * Bundles the imperative scene root with the per-player and ball
 * groups the MotionController needs to mutate each frame. The root
 * remains the only object the caller adds/removes from the scene
 * graph; the player/ball references are non-owning views into root's
 * descendants.
 */
export interface SceneBuildResult {
  root: THREE.Group
  players: Map<string, THREE.Group>
  ball: THREE.Group
  /** Y position the held ball should sit at — preserves the prior y math. */
  ballBaseY: number
}

/**
 * Builds the full basketball scene as a single THREE.Group plus a
 * sidecar map of per-player groups and the ball group. Caller is
 * responsible for adding/removing `result.root` from the scene graph
 * and for disposing it via disposeGroup() on unmount.
 */
export function buildBasketballGroup(scene: Scene3D): SceneBuildResult {
  const root = new THREE.Group()
  root.name = 'imperative-basketball'
  const playerGroups = new Map<string, THREE.Group>()

  // Lights — ambient + two directionals so meshStandardMaterial reads.
  root.add(new THREE.AmbientLight(0xffffff, 1.4))
  const dir1 = new THREE.DirectionalLight(0xffffff, 1.1)
  dir1.position.set(30, 60, 30)
  root.add(dir1)
  const dir2 = new THREE.DirectionalLight(0xcfe2ff, 0.6)
  dir2.position.set(-20, 40, 10)
  root.add(dir2)

  const halfW = COURT.halfWidthFt
  const halfL = COURT.halfLengthFt
  const courtCenterZ = halfL / 2 - 0.5

  // Gym environment shell. Walls + ceiling + out-of-court floor so the
  // court no longer floats in the canvas-clear void. Added before the
  // court floor so the court paints over the OOB extension.
  root.add(buildGymShell())

  // Floor plane.
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(halfW * 2, halfL),
    new THREE.MeshBasicMaterial({ color: FLOOR_COLOR, toneMapped: false }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.position.set(0, FLOOR_LIFT, courtCenterZ)
  root.add(floor)

  // Royal blue paint.
  const paint = new THREE.Mesh(
    new THREE.PlaneGeometry(COURT.paintWidthFt, COURT.freeThrowDistFt),
    new THREE.MeshBasicMaterial({ color: PAINT_COLOR, toneMapped: false }),
  )
  paint.rotation.x = -Math.PI / 2
  paint.position.set(0, FLOOR_LIFT + 0.02, COURT.freeThrowDistFt / 2)
  root.add(paint)

  // Court outline + paint lines.
  const outlineSegments: Array<[THREE.Vector3, THREE.Vector3]> = [
    [
      new THREE.Vector3(-halfW, LINE_LIFT, 0),
      new THREE.Vector3(halfW, LINE_LIFT, 0),
    ],
    [
      new THREE.Vector3(halfW, LINE_LIFT, 0),
      new THREE.Vector3(halfW, LINE_LIFT, halfL),
    ],
    [
      new THREE.Vector3(halfW, LINE_LIFT, halfL),
      new THREE.Vector3(-halfW, LINE_LIFT, halfL),
    ],
    [
      new THREE.Vector3(-halfW, LINE_LIFT, halfL),
      new THREE.Vector3(-halfW, LINE_LIFT, 0),
    ],
    [
      new THREE.Vector3(-COURT.paintWidthFt / 2, LINE_LIFT, 0),
      new THREE.Vector3(-COURT.paintWidthFt / 2, LINE_LIFT, COURT.freeThrowDistFt),
    ],
    [
      new THREE.Vector3(COURT.paintWidthFt / 2, LINE_LIFT, 0),
      new THREE.Vector3(COURT.paintWidthFt / 2, LINE_LIFT, COURT.freeThrowDistFt),
    ],
    [
      new THREE.Vector3(-COURT.paintWidthFt / 2, LINE_LIFT, COURT.freeThrowDistFt),
      new THREE.Vector3(COURT.paintWidthFt / 2, LINE_LIFT, COURT.freeThrowDistFt),
    ],
  ]
  for (const [start, end] of outlineSegments) {
    root.add(buildTubeLine(start, end, 0.18))
  }

  // Three-point arc + free-throw arc (semi-circles around the rim).
  addArcLines(root, COURT.threePointRadiusFt, Math.PI, LINE_LIFT, 0)
  addArcLines(root, 6, Math.PI, LINE_LIFT, COURT.freeThrowDistFt)

  // Hoop (backboard, rim, stanchion, padding, net).
  root.add(buildHoopAssembly())

  // Players. Each player is a lightweight humanoid figure rotated so
  // offense faces the rim and defense faces back toward the offense.
  for (const p of scene.players) {
    const teamColor = p.color
      ? p.color
      : p.isUser
        ? USER_COLOR
        : p.team === 'offense'
          ? OFFENSE_COLOR
          : DEFENSE_COLOR

    const playerGroup = buildPlayerFigure(teamColor, p.isUser ?? false)
    playerGroup.position.set(p.start.x, PLAYER_LIFT, p.start.z)
    playerGroup.rotation.y = computePlayerYaw(p.team, p.start.x, p.start.z)
    root.add(playerGroup)
    playerGroups.set(p.id, playerGroup)
  }

  // Ball. Holder lookup is unchanged from prior packets — ball follows
  // either the explicit holderId or the first player with hasBall, and
  // falls back to the scene's static ball coords if neither resolves.
  const ballHolder = scene.ball.holderId
    ? scene.players.find((p) => p.id === scene.ball.holderId)
    : scene.players.find((p) => p.hasBall)
  const ballX = ballHolder?.start.x ?? scene.ball.start.x
  const ballZ = ballHolder?.start.z ?? scene.ball.start.z

  const ball = buildBasketball()
  const ballBaseY = BALL_RADIUS + 0.2
  ball.position.set(ballX, ballBaseY, ballZ)
  root.add(ball)

  return { root, players: playerGroups, ball, ballBaseY }
}

/**
 * Disposes every geometry/material/texture under the given object and
 * its descendants. Call before removing an imperative group from the
 * scene to prevent GPU memory leaks.
 *
 * Textures are disposed alongside materials because Material.dispose()
 * does NOT cascade to attached maps — a leaked CanvasTexture (e.g. the
 * basketball surface map) would otherwise hang around forever.
 */
export function disposeGroup(group: THREE.Object3D): void {
  group.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (mesh.geometry) mesh.geometry.dispose()
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined
    if (Array.isArray(mat)) {
      for (const m of mat) {
        disposeMaterialTextures(m)
        m.dispose()
      }
    } else if (mat) {
      disposeMaterialTextures(mat)
      mat.dispose()
    }
  })
}

/**
 * Disposes every THREE.Texture currently attached to the material. The
 * lookup walks a known set of standard map slots — anything the
 * imperative scene builders actually use today (map, bumpMap, normalMap,
 * roughnessMap, metalnessMap, alphaMap, emissiveMap, aoMap, envMap).
 */
function disposeMaterialTextures(mat: THREE.Material): void {
  const slots = [
    'map',
    'bumpMap',
    'normalMap',
    'roughnessMap',
    'metalnessMap',
    'alphaMap',
    'emissiveMap',
    'aoMap',
    'envMap',
  ] as const
  const record = mat as unknown as Record<string, unknown>
  for (const slot of slots) {
    const tex = record[slot]
    if (tex && typeof (tex as THREE.Texture).dispose === 'function') {
      ;(tex as THREE.Texture).dispose()
    }
  }
}

/**
 * Computes a Box3 over the players + ball, then aims the camera so the
 * whole box is in frame at the given pitch.
 */
export function fitCameraToScene(
  camera: THREE.PerspectiveCamera,
  scene: Scene3D,
  aspect: number,
  pitchDeg = 32,
  padding = 1.4,
): void {
  const target = computeAutoTarget(scene, aspect, camera.fov, pitchDeg, padding)
  if (!target) return
  camera.position.copy(target.position)
  camera.lookAt(target.lookAt)
  camera.near = target.near
  camera.far = target.far
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld()
}

// ---------- camera modes ----------

/** All supported camera mode presets, plus "auto" for fit-to-scene. */
export type CameraMode = 'auto' | 'broadcast' | 'tactical' | 'follow' | 'replay'

/** Static set of every selectable camera mode (used for prop validation). */
export const CAMERA_MODES: readonly CameraMode[] = [
  'auto',
  'broadcast',
  'tactical',
  'follow',
  'replay',
] as const

/**
 * A precomputed camera placement: where the camera should be, what it
 * should look at, the FOV it should use, and the near/far clip planes
 * it needs so geometry is never clipped at the bounds. Returned by
 * `computeCameraTarget` for each mode and consumed by CameraController.
 */
export interface CameraTarget {
  position: THREE.Vector3
  lookAt: THREE.Vector3
  fov: number
  near: number
  far: number
}

// Default broadcast/replay/tactical target geometry, all in feet.
// Court spans x ∈ [-25, 25], z ∈ [0, 47], rim sits at the origin (0,
// y≈10, 0). Half-court is at z = 47.
const SCENE_FOCUS = new THREE.Vector3(0, 4, 22)
const BROADCAST_POSITION = new THREE.Vector3(3, 28, 70)
const BROADCAST_LOOKAT = new THREE.Vector3(0, 4, 22)
const BROADCAST_FOV = 50
const TACTICAL_POSITION = new THREE.Vector3(0, 70, 32)
const TACTICAL_LOOKAT = new THREE.Vector3(0, 0, 24)
const TACTICAL_FOV = 45
const REPLAY_POSITION = new THREE.Vector3(-30, 9, 38)
const REPLAY_LOOKAT = new THREE.Vector3(3, 5, 12)
const REPLAY_FOV = 38
const FOLLOW_LIFT_Y = 9
const FOLLOW_TRAIL_DIST = 14
const FOLLOW_LOOK_HEIGHT = 4

/**
 * Computes a camera target for the given mode. Returns null only if the
 * scene has no usable framing data (auto mode with no finite players or
 * ball). Follow falls back to broadcast when no holder/ball-target can
 * be located.
 */
export function computeCameraTarget(
  mode: CameraMode,
  scene: Scene3D,
  aspect: number,
  baseFov = 55,
): CameraTarget | null {
  switch (mode) {
    case 'broadcast':
      return broadcastTarget()
    case 'tactical':
      return tacticalTarget()
    case 'replay':
      return replayTarget()
    case 'follow':
      return followTarget(scene) ?? broadcastTarget()
    case 'auto':
    default:
      return computeAutoTarget(scene, aspect, baseFov)
  }
}

function broadcastTarget(): CameraTarget {
  return {
    position: BROADCAST_POSITION.clone(),
    lookAt: BROADCAST_LOOKAT.clone(),
    fov: BROADCAST_FOV,
    near: 0.5,
    far: 400,
  }
}

function tacticalTarget(): CameraTarget {
  return {
    position: TACTICAL_POSITION.clone(),
    lookAt: TACTICAL_LOOKAT.clone(),
    fov: TACTICAL_FOV,
    near: 0.5,
    far: 400,
  }
}

function replayTarget(): CameraTarget {
  return {
    position: REPLAY_POSITION.clone(),
    lookAt: REPLAY_LOOKAT.clone(),
    fov: REPLAY_FOV,
    near: 0.5,
    far: 400,
  }
}

/**
 * Locates a follow target — the explicit ball-holder, then the first
 * `hasBall` player, then the user player, then the static ball coords.
 * Returns null if nothing finite is available so the caller can fall
 * back to a non-follow preset.
 */
function followTarget(scene: Scene3D): CameraTarget | null {
  const candidate =
    (scene.ball.holderId
      ? scene.players.find((p) => p.id === scene.ball.holderId)
      : undefined) ??
    scene.players.find((p) => p.hasBall) ??
    scene.players.find((p) => p.isUser)

  let tx: number | null = null
  let tz: number | null = null
  if (candidate && Number.isFinite(candidate.start.x) && Number.isFinite(candidate.start.z)) {
    tx = candidate.start.x
    tz = candidate.start.z
  } else if (
    Number.isFinite(scene.ball.start.x) &&
    Number.isFinite(scene.ball.start.z)
  ) {
    tx = scene.ball.start.x
    tz = scene.ball.start.z
  }
  if (tx === null || tz === null) return null

  // Trail behind the target along the rim→player axis. If the player
  // sits exactly on the rim line, fall back to a straight back-court
  // pull so we never produce a zero-length direction.
  const dx = tx
  const dz = tz
  const len = Math.hypot(dx, dz)
  const ux = len > 0.001 ? dx / len : 0
  const uz = len > 0.001 ? dz / len : 1

  return {
    position: new THREE.Vector3(
      tx + ux * FOLLOW_TRAIL_DIST,
      FOLLOW_LIFT_Y,
      tz + uz * FOLLOW_TRAIL_DIST,
    ),
    lookAt: new THREE.Vector3(tx, FOLLOW_LOOK_HEIGHT, tz),
    fov: 50,
    near: 0.5,
    far: 400,
  }
}

/**
 * Auto-fit target. Builds a Box3 over players + ball, then computes a
 * camera position that frames it given FOV/aspect. Mirrors the original
 * `fitCameraToScene` math so 'auto' camera mode preserves prior framing
 * exactly.
 */
function computeAutoTarget(
  scene: Scene3D,
  aspect: number,
  fov: number,
  pitchDeg = 32,
  padding = 1.4,
): CameraTarget | null {
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
  if (points.length === 0) return null

  const box = new THREE.Box3().setFromPoints(points)
  const center = new THREE.Vector3()
  const sizeVec = new THREE.Vector3()
  box.getCenter(center)
  box.getSize(sizeVec)

  const fovRad = (fov * Math.PI) / 180
  const verticalFit = (sizeVec.y * 0.5 + sizeVec.z * 0.5) / Math.tan(fovRad / 2)
  const horizontalFit = (sizeVec.x * 0.5) / (Math.tan(fovRad / 2) * Math.max(aspect, 0.1))
  const distance = Math.max(verticalFit, horizontalFit) * padding

  const pitch = (pitchDeg * Math.PI) / 180
  const position = new THREE.Vector3(
    center.x,
    center.y + Math.sin(pitch) * distance,
    center.z + Math.cos(pitch) * distance,
  )
  const diag = sizeVec.length()

  return {
    position,
    lookAt: center,
    fov,
    near: Math.max(0.1, distance * 0.05),
    far: Math.max(1000, distance + diag * 4),
  }
}

/**
 * Drives the camera between modes with eased position/target/FOV
 * interpolation. Owns no THREE objects directly; mutates the camera the
 * caller passes in and never schedules its own rAF — the parent
 * imperative loop calls `tick()` once per frame.
 *
 * On first `tick()` after construction or a `snapNext()` call the
 * camera jumps directly to the target. Every other tick eases toward
 * the current target with a small per-frame lerp factor, so mode/scene
 * changes appear as smooth sweeps rather than cuts.
 */
export class CameraController {
  private mode: CameraMode = 'auto'
  private scene: Scene3D
  private aspect: number
  private baseFov: number
  private targetPosition = new THREE.Vector3()
  private targetLookAt = new THREE.Vector3(SCENE_FOCUS.x, SCENE_FOCUS.y, SCENE_FOCUS.z)
  private targetFov: number
  private targetNear = 0.5
  private targetFar = 400
  private currentLookAt = new THREE.Vector3(SCENE_FOCUS.x, SCENE_FOCUS.y, SCENE_FOCUS.z)
  private hasTarget = false
  private snap = true
  private easing = 0.10

  constructor(scene: Scene3D, aspect: number, baseFov: number) {
    this.scene = scene
    this.aspect = aspect
    this.baseFov = baseFov
    this.targetFov = baseFov
    this.recomputeTarget()
  }

  /**
   * Updates the active mode. Mode changes trigger a target recompute
   * and are eased in unless the caller follows up with snapNext().
   */
  setMode(mode: CameraMode): void {
    if (mode === this.mode) return
    this.mode = mode
    this.recomputeTarget()
  }

  /** Replaces the underlying scene (e.g. on scenario change). */
  setScene(scene: Scene3D): void {
    this.scene = scene
    this.recomputeTarget()
  }

  /**
   * Keeps the camera aspect-aware. Called once per parent rAF tick
   * with the current canvas aspect; only triggers a recompute when
   * the aspect actually changes meaningfully.
   */
  setAspect(aspect: number): void {
    if (!Number.isFinite(aspect) || aspect <= 0) return
    if (Math.abs(this.aspect - aspect) < 0.001) return
    this.aspect = aspect
    this.recomputeTarget()
  }

  /** Forces the next tick to snap rather than ease. */
  snapNext(): void {
    this.snap = true
  }

  /** Returns the current mode (for diagnostics). */
  getMode(): CameraMode {
    return this.mode
  }

  /**
   * Mutates the camera one step toward the current target. Safe to
   * call every frame even when the target hasn't changed — the lerp
   * resolves to a no-op once the camera has settled.
   */
  tick(camera: THREE.PerspectiveCamera): void {
    if (!this.hasTarget) return
    const t = this.snap ? 1 : this.easing
    camera.position.lerp(this.targetPosition, t)
    this.currentLookAt.lerp(this.targetLookAt, t)
    camera.lookAt(this.currentLookAt)

    const fovDelta = this.targetFov - camera.fov
    if (Math.abs(fovDelta) > 0.01) {
      camera.fov = camera.fov + fovDelta * t
      camera.updateProjectionMatrix()
    } else if (this.snap) {
      camera.fov = this.targetFov
      camera.updateProjectionMatrix()
    }

    if (this.snap) {
      camera.near = this.targetNear
      camera.far = this.targetFar
      camera.updateProjectionMatrix()
    }

    camera.updateMatrixWorld()
    this.snap = false
  }

  private recomputeTarget(): void {
    const target = computeCameraTarget(
      this.mode,
      this.scene,
      this.aspect,
      this.baseFov,
    )
    if (!target) return
    this.targetPosition.copy(target.position)
    this.targetLookAt.copy(target.lookAt)
    this.targetFov = target.fov
    this.targetNear = target.near
    this.targetFar = target.far
    if (!this.hasTarget) {
      this.currentLookAt.copy(target.lookAt)
      this.hasTarget = true
    }
  }
}

// ---------- imperative motion ----------

/** Replay modes the MotionController understands. Mirrors ReplayMode in
 * ScenarioReplayController so callers can pass the same prop through.
 */
export type MotionMode = 'static' | 'intro' | 'answer'

/**
 * Pre-roll pause before motion starts. Matches the JSX
 * ScenarioReplayController so the imperative path feels identical when
 * a scene is loaded — viewers see the start pose for ~250ms before any
 * player begins to move.
 */
const MOTION_PRE_DELAY_MS = 250

/**
 * Resolves the movement list for a given mode. Centralised here so the
 * imperative MotionController and the older JSX ScenarioReplayController
 * agree on which list to play even though they live in separate files.
 */
export function resolveMovementsForMode(
  scene: Scene3D,
  mode: MotionMode,
): readonly SceneMovement[] {
  if (mode === 'answer') return scene.answerDemo
  if (mode === 'intro') return scene.movements
  return []
}

/** Internal: a [startMs, endMs) span describing the ball's current owner.
 * `holderId` is the player who currently holds the ball; `pass` is set
 * for in-flight phases (between two holders) and unsets `holderId`.
 */
interface BallPhase {
  startMs: number
  endMs: number
  holderId: string | null
  pass: ResolvedMovement | null
}

/**
 * Drives per-frame transform updates for player and ball groups based
 * on the scene's movement list. Pure function of (scene, movements,
 * elapsed time) — same inputs always produce the same transforms, so
 * replays are byte-identical.
 *
 * Created once per scene mount alongside the imperative scene group.
 * Owns no Three.js resources directly: the player and ball groups it
 * mutates are still owned by the scene root and disposed via the same
 * disposeGroup() traversal as everything else.
 */
export class MotionController {
  private scene: Scene3D
  private timeline: Timeline
  private playerGroups: Map<string, THREE.Group>
  private ballGroup: THREE.Group
  private baseBallY: number
  private startedAt: number | null = null
  private phases: BallPhase[] = []
  private initialHolderId: string | null
  // Playback rate multiplier applied on top of real elapsed time.
  // Defaults to 1, so the existing deterministic 1x playback math is
  // unchanged. setPlaybackRate() rebases startedAt so the visible t
  // does not jump when speed changes mid-playback.
  private playbackRate = 1
  // When non-null the controller is paused: ticks freeze the timeline
  // at this t (in ms) and the rendered transforms stop advancing. A
  // resume() rebases startedAt so play continues from the paused t.
  private pausedAtT: number | null = null
  // Index into `phases` for the most recent tick. Used purely to spot
  // transitions for the polish layer (pass-arrival camera shake) — not
  // consulted for transform sampling, so the existing deterministic
  // motion math is unchanged.
  private lastPhaseIndex: number = -1
  // One-shot flag set when a pass phase ends and a held phase begins.
  // Cleared by `consumePassArrival()` so the parent rAF loop can read
  // it once per arrival without re-triggering on subsequent frames.
  private pendingPassArrival = false

  constructor(
    scene: Scene3D,
    mode: MotionMode,
    playerGroups: Map<string, THREE.Group>,
    ballGroup: THREE.Group,
    baseBallY: number,
  ) {
    this.scene = scene
    this.playerGroups = playerGroups
    this.ballGroup = ballGroup
    this.baseBallY = baseBallY
    // Mode is consumed at construction time only — the resolved list
    // is captured into the timeline, after which mode isn't needed
    // again. A scene/mode change rebuilds the controller wholesale.
    this.timeline = buildTimeline(
      scene,
      [...resolveMovementsForMode(scene, mode)],
    )
    this.initialHolderId = resolveInitialHolder(scene)
    this.phases = this.computeBallPhases()
  }

  /** Drops the playback anchor so the next tick starts the timeline at
   *  t=0 from the current real time. Called when the parent bumps
   *  resetCounter or replays the scene. The user's selected speed is
   *  intentionally preserved across a reset so a "Show me again" press
   *  honors the speed they picked.
   */
  reset(): void {
    this.startedAt = null
    this.pausedAtT = null
    this.lastPhaseIndex = -1
    this.pendingPassArrival = false
  }

  /** Returns true (and clears the flag) once after a pass phase ends
   *  and the ball returns to a holder. Used by the polish layer for a
   *  tiny camera shake on pass arrival; safe to ignore. */
  consumePassArrival(): boolean {
    if (this.pendingPassArrival) {
      this.pendingPassArrival = false
      return true
    }
    return false
  }

  /** Sets the playback rate (clamped to 0.25x..4x). Rebases startedAt
   *  so the currently visible t does not jump when speed changes. At
   *  rate=1 the math collapses to the original `nowMs - startedAt`
   *  formulation, so default playback is bit-identical to before.
   */
  setPlaybackRate(rate: number, nowMs: number = performance.now()): void {
    const safe = Math.max(0.25, Math.min(4, rate))
    if (safe === this.playbackRate) return
    if (this.startedAt !== null && this.pausedAtT === null) {
      const t = this.getElapsedMs(nowMs)
      this.startedAt = nowMs - MOTION_PRE_DELAY_MS - t / safe
    }
    this.playbackRate = safe
  }

  getPlaybackRate(): number {
    return this.playbackRate
  }

  /** Freezes playback at the current t. Subsequent ticks still run
   *  (the parent rAF loop calls them every frame) but the rendered
   *  transforms hold steady at the paused t.
   */
  setPaused(paused: boolean, nowMs: number = performance.now()): void {
    if (paused) {
      if (this.pausedAtT !== null) return
      this.pausedAtT = this.getElapsedMs(nowMs)
    } else {
      if (this.pausedAtT === null) return
      const t = this.pausedAtT
      this.startedAt =
        nowMs - MOTION_PRE_DELAY_MS - t / Math.max(0.0001, this.playbackRate)
      this.pausedAtT = null
    }
  }

  isPaused(): boolean {
    return this.pausedAtT !== null
  }

  /** Returns the current playback elapsed time in ms (clamped to the
   *  timeline length). Useful for tests / diagnostics; not currently
   *  used by the renderer itself.
   */
  getElapsedMs(nowMs: number): number {
    if (this.pausedAtT !== null) return this.pausedAtT
    if (this.startedAt === null) return 0
    const raw = (nowMs - this.startedAt - MOTION_PRE_DELAY_MS) * this.playbackRate
    return Math.max(0, Math.min(raw, this.timeline.totalMs))
  }

  /** Mutates player + ball positions for the current playback time.
   *  Idempotent — calling tick(now) twice in a row yields identical
   *  transforms. Allocates nothing per frame beyond the stack frames
   *  for `samplePlayer`.
   */
  tick(nowMs: number): void {
    if (this.startedAt === null && this.pausedAtT === null) {
      this.startedAt = nowMs
    }
    const t =
      this.timeline.totalMs > 0
        ? this.getElapsedMs(nowMs)
        : 0

    // Players first so the ball's holder-follow logic sees the
    // up-to-date sampled position when it reads samplePlayer().
    for (const player of this.scene.players) {
      const g = this.playerGroups.get(player.id)
      if (!g) continue
      const pos = samplePlayer(this.scene, this.timeline, player.id, t)
      g.position.x = pos.x
      g.position.z = pos.z
    }

    // Phase-transition detection for polish hooks. We compute the
    // current phase index here (the same lookup applyBall does
    // immediately after) and compare to the previous tick. A
    // pass-phase → non-pass-phase transition flips pendingPassArrival
    // so the parent rAF loop can trigger a tiny camera shake. Skipped
    // entirely while paused, so freezing the timeline does not
    // re-fire arrivals on every frame.
    if (this.pausedAtT === null) {
      const curIdx = this.findPhaseIndex(t)
      if (
        curIdx !== this.lastPhaseIndex &&
        this.lastPhaseIndex !== -1 &&
        this.phases[this.lastPhaseIndex]?.pass &&
        !this.phases[curIdx]?.pass
      ) {
        this.pendingPassArrival = true
      }
      this.lastPhaseIndex = curIdx
    }

    this.applyBall(t)
  }

  // --- internals ---

  /** Walks the resolved ball-pass timeline and produces a contiguous
   *  list of held / in-flight phases covering [0, totalMs]. Built once
   *  in the constructor so per-frame ticks just do an O(passes) lookup.
   */
  private computeBallPhases(): BallPhase[] {
    const ballMoves = (this.timeline.byPlayer.get('ball') ?? [])
      .filter((m) => m.kind === 'pass')
      .slice()
      .sort((a, b) => a.startMs - b.startMs)

    const phases: BallPhase[] = []
    let currentHolder: string | null = this.initialHolderId
    let cursor = 0

    for (const pass of ballMoves) {
      if (pass.startMs > cursor) {
        phases.push({
          startMs: cursor,
          endMs: pass.startMs,
          holderId: currentHolder,
          pass: null,
        })
      }
      phases.push({
        startMs: pass.startMs,
        endMs: pass.endMs,
        holderId: null,
        pass,
      })
      currentHolder = this.resolveCatcher(pass.to, pass.endMs)
      cursor = pass.endMs
    }

    const tail = Math.max(this.timeline.totalMs, 1)
    if (cursor < tail) {
      phases.push({
        startMs: cursor,
        endMs: tail,
        holderId: currentHolder,
        pass: null,
      })
    }
    return phases
  }

  /** Returns the player whose sampled position at `atMs` is closest to
   *  the pass's `target` point. Falls back to null if the scene has no
   *  finite players (defensive — buildScene already guarantees finite
   *  starts, but this keeps the controller from crashing on bad data).
   */
  private resolveCatcher(
    target: { x: number; z: number },
    atMs: number,
  ): string | null {
    let bestId: string | null = null
    let bestDist = Number.POSITIVE_INFINITY
    for (const p of this.scene.players) {
      const pos = samplePlayer(this.scene, this.timeline, p.id, atMs)
      const dx = pos.x - target.x
      const dz = pos.z - target.z
      const d = dx * dx + dz * dz
      if (d < bestDist) {
        bestDist = d
        bestId = p.id
      }
    }
    return bestId
  }

  /** Computes and applies the ball's position for time t, picking
   *  between in-flight (lerp + parabolic Y arc) and held (follow the
   *  current holder's sampled x/z, keep base Y).
   */
  private applyBall(t: number): void {
    const phase = this.findPhase(t)
    if (!phase) {
      const start = resolveBallStart(this.scene)
      this.ballGroup.position.set(start.x, this.baseBallY, start.z)
      return
    }

    if (phase.pass) {
      const span = Math.max(1, phase.endMs - phase.startMs)
      const u = clamp01((t - phase.startMs) / span)
      const eased = easeInOutCubic(u)
      const fromX = phase.pass.from.x
      const fromZ = phase.pass.from.z
      const toX = phase.pass.to.x
      const toZ = phase.pass.to.z
      const x = fromX + (toX - fromX) * eased
      const z = fromZ + (toZ - fromZ) * eased
      // Symmetric parabolic arc with peak height proportional to pass
      // distance, capped so cross-court bombs do not visibly clip the
      // gym ceiling.
      const dist = Math.hypot(toX - fromX, toZ - fromZ)
      const peak = Math.min(7, Math.max(2, dist * 0.25))
      const y = this.baseBallY + peak * 4 * u * (1 - u)
      this.ballGroup.position.set(x, y, z)
      return
    }

    if (phase.holderId) {
      const pos = samplePlayer(this.scene, this.timeline, phase.holderId, t)
      this.ballGroup.position.set(pos.x, this.baseBallY, pos.z)
      return
    }

    const start = resolveBallStart(this.scene)
    this.ballGroup.position.set(start.x, this.baseBallY, start.z)
  }

  private findPhase(t: number): BallPhase | null {
    if (this.phases.length === 0) return null
    for (const phase of this.phases) {
      if (t >= phase.startMs && t <= phase.endMs) return phase
    }
    // Past end of timeline — return the last phase so the ball settles
    // with the final holder rather than snapping back to the start.
    return this.phases[this.phases.length - 1] ?? null
  }

  /** Same lookup as findPhase but returns the index instead of the
   *  phase. Lets the polish layer detect phase transitions across
   *  ticks via simple integer comparison. */
  private findPhaseIndex(t: number): number {
    if (this.phases.length === 0) return -1
    for (let i = 0; i < this.phases.length; i++) {
      const phase = this.phases[i]!
      if (t >= phase.startMs && t <= phase.endMs) return i
    }
    return this.phases.length - 1
  }
}

/** Resolves the player who starts the play with the ball: explicit
 *  holderId wins, then the first hasBall flag, then null. Validated
 *  against the player list so a stale id never escapes this function.
 */
function resolveInitialHolder(scene: Scene3D): string | null {
  const candidate =
    scene.ball.holderId ??
    scene.players.find((p) => p.hasBall)?.id ??
    null
  if (candidate && scene.players.some((p) => p.id === candidate)) {
    return candidate
  }
  return null
}

function clamp01(v: number): number {
  if (v <= 0) return 0
  if (v >= 1) return 1
  return v
}

/** Same eased curve the existing timeline.ts uses for player motion.
 *  Duplicated here (rather than re-exported) so the imperative motion
 *  controller and the legacy JSX controller can evolve independently
 *  without breaking each other.
 */
function easeInOutCubic(u: number): number {
  if (u <= 0) return 0
  if (u >= 1) return 1
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2
}

// ---------- internals ----------

// Hoop dimensions roughly match regulation (rim 18" diameter at 10 ft,
// backboard 6 ft x 3.5 ft, target square 24" x 18", front face 4 ft
// behind the rim center along the +z direction toward the baseline).
// All numbers in feet.
const RIM_RADIUS = 0.75
const RIM_TUBE = 0.06
const BACKBOARD_WIDTH = 6
const BACKBOARD_HEIGHT = 3.5
const BACKBOARD_THICKNESS = 0.12
const BACKBOARD_FRONT_Z = -0.5
const BACKBOARD_CENTER_Y = COURT.rimHeightFt + 1.0
const TARGET_SQUARE_W = 2
const TARGET_SQUARE_H = 1.5
const TARGET_LINE = 0.06
const POLE_BASE_Z = -4.5
const POLE_RADIUS = 0.22
const NET_TOP_Y = COURT.rimHeightFt - 0.05
const NET_BOTTOM_Y = COURT.rimHeightFt - 1.4
const NET_BOTTOM_RADIUS = 0.42
const NET_STRANDS = 12
const NET_RINGS = 4

/**
 * Builds the full basket assembly: stanchion, backboard with target
 * square, rim with mounting plate, padding, and a hanging net.
 *
 * Returned as a single THREE.Group. All geometry/material is added to
 * the group's descendants so disposeGroup() cleans it up automatically.
 */
function buildHoopAssembly(): THREE.Group {
  const hoop = new THREE.Group()
  hoop.name = 'hoop-assembly'

  // --- Stanchion / pole. Simple cylinder rooted in the floor behind
  // the baseline, plus a horizontal arm reaching the back of the
  // backboard.
  const poleHeight = COURT.rimHeightFt + 2.5
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(POLE_RADIUS, POLE_RADIUS * 1.4, poleHeight, 16),
    new THREE.MeshStandardMaterial({
      color: POLE_COLOR,
      roughness: 0.5,
      metalness: 0.4,
    }),
  )
  pole.position.set(0, poleHeight / 2, POLE_BASE_Z)
  pole.castShadow = true
  pole.receiveShadow = true
  hoop.add(pole)

  // Floor plate at the base of the pole — small square hint of bolts.
  const basePlate = new THREE.Mesh(
    new THREE.CylinderGeometry(POLE_RADIUS * 2.2, POLE_RADIUS * 2.4, 0.18, 16),
    new THREE.MeshStandardMaterial({
      color: POLE_COLOR,
      roughness: 0.6,
      metalness: 0.3,
    }),
  )
  basePlate.position.set(0, 0.09, POLE_BASE_Z)
  basePlate.receiveShadow = true
  hoop.add(basePlate)

  // Horizontal support arm from pole to backboard back face.
  const armLength = Math.abs(POLE_BASE_Z - (BACKBOARD_FRONT_Z - BACKBOARD_THICKNESS))
  const supportArm = new THREE.Mesh(
    new THREE.BoxGeometry(0.35, 0.35, armLength),
    new THREE.MeshStandardMaterial({
      color: POLE_COLOR,
      roughness: 0.5,
      metalness: 0.4,
    }),
  )
  supportArm.position.set(
    0,
    BACKBOARD_CENTER_Y,
    POLE_BASE_Z + armLength / 2,
  )
  supportArm.castShadow = true
  hoop.add(supportArm)

  // Diagonal brace from the pole down to the bottom of the support arm
  // for a believable cantilever look.
  const braceLength = Math.hypot(armLength * 0.6, 2.0)
  const brace = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.18, braceLength),
    new THREE.MeshStandardMaterial({
      color: POLE_COLOR,
      roughness: 0.5,
      metalness: 0.4,
    }),
  )
  const braceFrontZ = POLE_BASE_Z + armLength * 0.6
  const braceBackY = BACKBOARD_CENTER_Y - 2.0
  brace.position.set(
    0,
    (BACKBOARD_CENTER_Y + braceBackY) / 2,
    (POLE_BASE_Z + braceFrontZ) / 2,
  )
  const braceDir = new THREE.Vector3(
    0,
    BACKBOARD_CENTER_Y - braceBackY,
    POLE_BASE_Z - braceFrontZ,
  ).normalize()
  brace.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), braceDir)
  brace.castShadow = true
  hoop.add(brace)

  // Pole padding — black foam wrap for the lower 6 ft of the pole.
  const padding = new THREE.Mesh(
    new THREE.CylinderGeometry(POLE_RADIUS + 0.18, POLE_RADIUS + 0.18, 6, 16),
    new THREE.MeshStandardMaterial({
      color: PADDING_COLOR,
      roughness: 0.95,
      metalness: 0,
    }),
  )
  padding.position.set(0, 3, POLE_BASE_Z)
  padding.castShadow = true
  padding.receiveShadow = true
  hoop.add(padding)

  // --- Backboard. Tinted, transparent glass with a thin dark frame.
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(
      BACKBOARD_WIDTH,
      BACKBOARD_HEIGHT,
      BACKBOARD_THICKNESS,
    ),
    new THREE.MeshStandardMaterial({
      color: BACKBOARD_GLASS_TINT,
      transparent: true,
      opacity: 0.32,
      roughness: 0.05,
      metalness: 0.0,
      envMapIntensity: 1.2,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  )
  glass.position.set(0, BACKBOARD_CENTER_Y, BACKBOARD_FRONT_Z - BACKBOARD_THICKNESS / 2)
  glass.castShadow = false
  glass.receiveShadow = false
  hoop.add(glass)

  // Backboard frame — slim dark border around the glass.
  const frameMat = new THREE.MeshStandardMaterial({
    color: BACKBOARD_FRAME_COLOR,
    roughness: 0.6,
    metalness: 0.3,
  })
  const frameThickness = 0.18
  const frameDepth = BACKBOARD_THICKNESS + 0.04
  const frameZ = BACKBOARD_FRONT_Z - BACKBOARD_THICKNESS / 2

  const frameTop = new THREE.Mesh(
    new THREE.BoxGeometry(BACKBOARD_WIDTH + frameThickness, frameThickness, frameDepth),
    frameMat,
  )
  frameTop.position.set(0, BACKBOARD_CENTER_Y + BACKBOARD_HEIGHT / 2, frameZ)
  hoop.add(frameTop)

  const frameBottom = new THREE.Mesh(
    new THREE.BoxGeometry(BACKBOARD_WIDTH + frameThickness, frameThickness, frameDepth),
    frameMat,
  )
  frameBottom.position.set(0, BACKBOARD_CENTER_Y - BACKBOARD_HEIGHT / 2, frameZ)
  hoop.add(frameBottom)

  const frameLeft = new THREE.Mesh(
    new THREE.BoxGeometry(frameThickness, BACKBOARD_HEIGHT, frameDepth),
    frameMat,
  )
  frameLeft.position.set(-BACKBOARD_WIDTH / 2, BACKBOARD_CENTER_Y, frameZ)
  hoop.add(frameLeft)

  const frameRight = new THREE.Mesh(
    new THREE.BoxGeometry(frameThickness, BACKBOARD_HEIGHT, frameDepth),
    frameMat,
  )
  frameRight.position.set(BACKBOARD_WIDTH / 2, BACKBOARD_CENTER_Y, frameZ)
  hoop.add(frameRight)

  // Bottom backboard padding (red foam strip is more common, but black
  // reads cleaner against the blue paint below).
  const bottomPad = new THREE.Mesh(
    new THREE.BoxGeometry(BACKBOARD_WIDTH + 0.2, 0.22, frameDepth + 0.06),
    new THREE.MeshStandardMaterial({
      color: PADDING_COLOR,
      roughness: 0.95,
      metalness: 0,
    }),
  )
  bottomPad.position.set(
    0,
    BACKBOARD_CENTER_Y - BACKBOARD_HEIGHT / 2 - 0.11,
    frameZ,
  )
  hoop.add(bottomPad)

  // White target square painted just in front of the glass, centered
  // above the rim. Built as four thin boxes so the inside is empty.
  const targetMat = new THREE.MeshStandardMaterial({
    color: BACKBOARD_TARGET_COLOR,
    roughness: 0.4,
    metalness: 0,
  })
  const targetCenterY = COURT.rimHeightFt + TARGET_SQUARE_H / 2 + 0.1
  const targetFrontZ = BACKBOARD_FRONT_Z + 0.01

  const targetTop = new THREE.Mesh(
    new THREE.BoxGeometry(TARGET_SQUARE_W, TARGET_LINE, 0.02),
    targetMat,
  )
  targetTop.position.set(
    0,
    targetCenterY + TARGET_SQUARE_H / 2,
    targetFrontZ,
  )
  hoop.add(targetTop)

  const targetBottom = new THREE.Mesh(
    new THREE.BoxGeometry(TARGET_SQUARE_W, TARGET_LINE, 0.02),
    targetMat,
  )
  targetBottom.position.set(
    0,
    targetCenterY - TARGET_SQUARE_H / 2,
    targetFrontZ,
  )
  hoop.add(targetBottom)

  const targetLeft = new THREE.Mesh(
    new THREE.BoxGeometry(TARGET_LINE, TARGET_SQUARE_H, 0.02),
    targetMat,
  )
  targetLeft.position.set(
    -TARGET_SQUARE_W / 2,
    targetCenterY,
    targetFrontZ,
  )
  hoop.add(targetLeft)

  const targetRight = new THREE.Mesh(
    new THREE.BoxGeometry(TARGET_LINE, TARGET_SQUARE_H, 0.02),
    targetMat,
  )
  targetRight.position.set(
    TARGET_SQUARE_W / 2,
    targetCenterY,
    targetFrontZ,
  )
  hoop.add(targetRight)

  // --- Rim. Bright orange torus with a small mounting plate connecting
  // back to the backboard.
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(RIM_RADIUS, RIM_TUBE, 16, 48),
    new THREE.MeshStandardMaterial({
      color: RIM_COLOR,
      roughness: 0.45,
      metalness: 0.55,
      emissive: RIM_COLOR,
      emissiveIntensity: 0.05,
    }),
  )
  rim.position.set(0, COURT.rimHeightFt, 0)
  rim.rotation.x = Math.PI / 2
  rim.castShadow = true
  hoop.add(rim)

  // Mounting bracket from the rim's back to the backboard front face.
  const bracketLength = Math.abs(BACKBOARD_FRONT_Z - (-RIM_RADIUS))
  const bracket = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.16, bracketLength),
    new THREE.MeshStandardMaterial({
      color: RIM_COLOR,
      roughness: 0.5,
      metalness: 0.5,
    }),
  )
  bracket.position.set(
    0,
    COURT.rimHeightFt,
    (BACKBOARD_FRONT_Z + (-RIM_RADIUS)) / 2,
  )
  bracket.castShadow = true
  hoop.add(bracket)

  // --- Net. Lightweight LineSegments hung from the rim. A small set of
  // vertical strands plus a few horizontal rings tying them together.
  hoop.add(buildHoopNet())

  return hoop
}

/**
 * Builds a static hanging net as one LineSegments mesh. Strands fan
 * inward from the rim circumference toward a smaller circle below the
 * rim; horizontal "tie" rings link the strands at four heights so the
 * net reads as woven rather than as parallel cords.
 */
function buildHoopNet(): THREE.LineSegments {
  const positions: number[] = []

  const topY = NET_TOP_Y
  const bottomY = NET_BOTTOM_Y
  const topR = RIM_RADIUS - 0.02
  const bottomR = NET_BOTTOM_RADIUS

  const ringHeights: number[] = []
  for (let r = 0; r <= NET_RINGS; r++) {
    const t = r / NET_RINGS
    ringHeights.push(topY + (bottomY - topY) * t)
  }
  const ringRadii = ringHeights.map((_, idx) => {
    const t = idx / NET_RINGS
    // Slight inward bow so the net silhouette is shaped, not a cone.
    const bow = Math.sin(t * Math.PI) * 0.08
    return topR + (bottomR - topR) * t - bow
  })

  // Vertical strands — connect each strand point on each ring level
  // with a slight side-to-side zig-zag so the strands cross like a real
  // net weave.
  for (let s = 0; s < NET_STRANDS; s++) {
    const baseAngle = (s / NET_STRANDS) * Math.PI * 2
    for (let r = 0; r < NET_RINGS; r++) {
      const aTop = baseAngle + (r % 2 === 0 ? 0 : Math.PI / NET_STRANDS)
      const aBottom = baseAngle + (r % 2 === 0 ? Math.PI / NET_STRANDS : 0)
      const top = new THREE.Vector3(
        Math.cos(aTop) * ringRadii[r],
        ringHeights[r],
        Math.sin(aTop) * ringRadii[r],
      )
      const bottom = new THREE.Vector3(
        Math.cos(aBottom) * ringRadii[r + 1],
        ringHeights[r + 1],
        Math.sin(aBottom) * ringRadii[r + 1],
      )
      positions.push(top.x, top.y, top.z, bottom.x, bottom.y, bottom.z)
    }
  }

  // Horizontal tie rings at each ring height except the very top
  // (which is already implied by the rim itself).
  const tieSegments = 24
  for (let r = 1; r <= NET_RINGS; r++) {
    const y = ringHeights[r]
    const radius = ringRadii[r]
    for (let i = 0; i < tieSegments; i++) {
      const a0 = (i / tieSegments) * Math.PI * 2
      const a1 = ((i + 1) / tieSegments) * Math.PI * 2
      positions.push(
        Math.cos(a0) * radius,
        y,
        Math.sin(a0) * radius,
        Math.cos(a1) * radius,
        y,
        Math.sin(a1) * radius,
      )
    }
  }

  const geom = new THREE.BufferGeometry()
  geom.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  )
  const mat = new THREE.LineBasicMaterial({
    color: NET_COLOR,
    transparent: true,
    opacity: 0.85,
    toneMapped: false,
  })
  const net = new THREE.LineSegments(geom, mat)
  net.name = 'hoop-net'
  return net
}

// Gym shell dimensions in feet. The half-court the renderer cares about
// occupies x ∈ [-25, 25], z ∈ [0, 47]. The gym box surrounds it with a
// few feet of buffer on the sides and behind the baseline, and is left
// open toward +z so the default camera (which sits behind half-court)
// is never inside-out relative to a wall.
const GYM_HALF_WIDTH = 35
const GYM_BACK_Z = -12
const GYM_FRONT_Z = 55
const GYM_HEIGHT = 32

/**
 * Builds the surrounding gym: out-of-court floor strip, three walls
 * (back + two sides), a ceiling, and a small set of rafters spanning
 * the ceiling. The +z (camera-facing) wall is intentionally omitted so
 * the default broadcast camera always looks INTO the gym rather than at
 * the back of a wall.
 *
 * Walls and ceiling render with BackSide so they are only drawn from
 * inside the box; orbit views past the gym envelope simply see through
 * them rather than slamming into a flat back face.
 */
function buildGymShell(): THREE.Group {
  const gym = new THREE.Group()
  gym.name = 'gym-shell'

  const wallMat = new THREE.MeshStandardMaterial({
    color: GYM_WALL_COLOR,
    roughness: 0.85,
    metalness: 0.05,
    side: THREE.BackSide,
  })
  const ceilingMat = new THREE.MeshStandardMaterial({
    color: GYM_CEILING_COLOR,
    roughness: 0.95,
    metalness: 0,
    side: THREE.BackSide,
  })
  const floorExtMat = new THREE.MeshStandardMaterial({
    color: GYM_FLOOR_EXT_COLOR,
    roughness: 0.9,
    metalness: 0,
  })
  const rafterMat = new THREE.MeshStandardMaterial({
    color: GYM_RAFTER_COLOR,
    roughness: 0.85,
    metalness: 0.1,
  })
  const trimMat = new THREE.MeshStandardMaterial({
    color: GYM_TRIM_COLOR,
    roughness: 0.7,
    metalness: 0.2,
  })

  const gymDepth = GYM_FRONT_Z - GYM_BACK_Z
  const gymWidth = GYM_HALF_WIDTH * 2
  const centerZ = (GYM_BACK_Z + GYM_FRONT_Z) / 2

  // Out-of-court floor extension. Sits a hair below the court floor so
  // the court paints cleanly on top with no z-fighting.
  const floorExt = new THREE.Mesh(
    new THREE.PlaneGeometry(gymWidth, gymDepth),
    floorExtMat,
  )
  floorExt.rotation.x = -Math.PI / 2
  floorExt.position.set(0, -0.02, centerZ)
  floorExt.receiveShadow = true
  gym.add(floorExt)

  // Dark trim strip just outside the court rectangle to suggest a
  // sideline border. Built from four thin boxes so it reads at any
  // zoom without aliasing into the OOB plane.
  const trimThickness = 0.4
  const trimY = 0.01
  const courtHalfW = COURT.halfWidthFt
  const courtL = COURT.halfLengthFt

  const trimBack = new THREE.Mesh(
    new THREE.BoxGeometry(courtHalfW * 2 + trimThickness * 2, 0.05, trimThickness),
    trimMat,
  )
  trimBack.position.set(0, trimY, -trimThickness / 2)
  gym.add(trimBack)

  const trimFront = new THREE.Mesh(
    new THREE.BoxGeometry(courtHalfW * 2 + trimThickness * 2, 0.05, trimThickness),
    trimMat,
  )
  trimFront.position.set(0, trimY, courtL + trimThickness / 2)
  gym.add(trimFront)

  const trimLeft = new THREE.Mesh(
    new THREE.BoxGeometry(trimThickness, 0.05, courtL),
    trimMat,
  )
  trimLeft.position.set(-courtHalfW - trimThickness / 2, trimY, courtL / 2)
  gym.add(trimLeft)

  const trimRight = new THREE.Mesh(
    new THREE.BoxGeometry(trimThickness, 0.05, courtL),
    trimMat,
  )
  trimRight.position.set(courtHalfW + trimThickness / 2, trimY, courtL / 2)
  gym.add(trimRight)

  // Back wall (behind baseline). PlaneGeometry rendered BackSide so it
  // shows from inside the gym box.
  const backWall = new THREE.Mesh(
    new THREE.PlaneGeometry(gymWidth, GYM_HEIGHT),
    wallMat,
  )
  backWall.position.set(0, GYM_HEIGHT / 2, GYM_BACK_Z)
  // Plane default normal is +z; we want it facing +z (toward the court).
  // BackSide means the side facing -z renders, so leave rotation at 0.
  backWall.receiveShadow = true
  gym.add(backWall)

  // Left wall (-x).
  const leftWall = new THREE.Mesh(
    new THREE.PlaneGeometry(gymDepth, GYM_HEIGHT),
    wallMat,
  )
  leftWall.position.set(-GYM_HALF_WIDTH, GYM_HEIGHT / 2, centerZ)
  leftWall.rotation.y = Math.PI / 2
  leftWall.receiveShadow = true
  gym.add(leftWall)

  // Right wall (+x).
  const rightWall = new THREE.Mesh(
    new THREE.PlaneGeometry(gymDepth, GYM_HEIGHT),
    wallMat,
  )
  rightWall.position.set(GYM_HALF_WIDTH, GYM_HEIGHT / 2, centerZ)
  rightWall.rotation.y = -Math.PI / 2
  rightWall.receiveShadow = true
  gym.add(rightWall)

  // Ceiling.
  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(gymWidth, gymDepth),
    ceilingMat,
  )
  ceiling.rotation.x = Math.PI / 2
  ceiling.position.set(0, GYM_HEIGHT, centerZ)
  gym.add(ceiling)

  // Rafters — a few thin dark beams running across the ceiling. Cheap
  // structural detail that breaks up the otherwise flat ceiling plane.
  const rafterCount = 4
  const rafterThickness = 0.5
  const rafterSpacing = gymDepth / (rafterCount + 1)
  for (let i = 1; i <= rafterCount; i++) {
    const rafter = new THREE.Mesh(
      new THREE.BoxGeometry(gymWidth - 1, rafterThickness, rafterThickness),
      rafterMat,
    )
    rafter.position.set(
      0,
      GYM_HEIGHT - rafterThickness / 2 - 0.05,
      GYM_BACK_Z + rafterSpacing * i,
    )
    gym.add(rafter)
  }

  // Two longitudinal rafters running depth-wise to suggest a truss
  // grid. Kept thin so the ceiling still feels open.
  for (const x of [-GYM_HALF_WIDTH * 0.55, GYM_HALF_WIDTH * 0.55]) {
    const rafter = new THREE.Mesh(
      new THREE.BoxGeometry(rafterThickness * 0.8, rafterThickness * 0.8, gymDepth - 1),
      rafterMat,
    )
    rafter.position.set(x, GYM_HEIGHT - rafterThickness / 2 - 0.05, centerZ)
    gym.add(rafter)
  }

  return gym
}

// Humanoid anatomy in feet. Hand-tuned so the figure reads as a 6 ft
// athlete from the default broadcast camera.
const SHOE_HEIGHT = 0.4
const SHOE_WIDTH = 0.5
const SHOE_DEPTH = 1.0
const LEG_RADIUS = 0.22
const LEG_HEIGHT = 2.1
const HIP_GAP = 0.45
const SHORTS_HEIGHT = 1.0
const SHORTS_WIDTH = 1.5
const SHORTS_DEPTH = 0.95
const TORSO_HEIGHT = 1.4
const TORSO_WIDTH = 1.55
const TORSO_DEPTH = 0.9
const ARM_RADIUS = 0.18
const ARM_LENGTH = 1.4
const ARM_OFFSET = TORSO_WIDTH / 2 + ARM_RADIUS - 0.04
const NECK_RADIUS = 0.18
const NECK_HEIGHT = 0.22
const HEAD_RADIUS = 0.42

const SHOE_Y = SHOE_HEIGHT / 2
const LEG_Y = SHOE_HEIGHT + LEG_HEIGHT / 2
const SHORTS_Y = SHOE_HEIGHT + LEG_HEIGHT + SHORTS_HEIGHT / 2
const TORSO_Y = SHORTS_Y + SHORTS_HEIGHT / 2 + TORSO_HEIGHT / 2
const ARM_Y = TORSO_Y
const NECK_Y = TORSO_Y + TORSO_HEIGHT / 2 + NECK_HEIGHT / 2
const HEAD_Y = NECK_Y + NECK_HEIGHT / 2 + HEAD_RADIUS

/**
 * Returns the yaw (rotation around y in radians) for a player at
 * (x, z) on the given team. Offense is oriented to face the rim at
 * the origin; defense is oriented to face outward toward the offense.
 *
 * Player local +z is the figure's "back" (default Three.js forward is
 * -z), so we rotate so the chest points the way we want.
 */
function computePlayerYaw(team: SceneTeam, x: number, z: number): number {
  // Direction toward the rim from the player's position.
  const towardRim = Math.atan2(-x, -z)
  // Same direction with PI flip → facing outward away from rim.
  const awayFromRim = towardRim + Math.PI
  return team === 'offense' ? towardRim : awayFromRim
}

/**
 * Builds a single humanoid player figure as a THREE.Group. Local
 * coordinate frame: origin at the floor between the feet, +y up,
 * default facing toward -z. Caller is expected to set position and
 * rotation.y on the returned group.
 *
 * Geometry budget: ~12 simple meshes per player. Materials are
 * created per-figure so the existing disposeGroup() traversal cleans
 * everything without aliasing.
 */
function buildPlayerFigure(teamColor: string, isUser: boolean): THREE.Group {
  const figure = new THREE.Group()
  figure.name = 'player-figure'

  const jerseyMat = new THREE.MeshStandardMaterial({
    color: teamColor,
    roughness: 0.65,
    metalness: 0.05,
  })
  const shortsMat = new THREE.MeshStandardMaterial({
    color: darkenHex(teamColor, SHORTS_DARKEN),
    roughness: 0.75,
    metalness: 0,
  })
  const skinMat = new THREE.MeshStandardMaterial({
    color: SKIN_COLOR,
    roughness: 0.7,
    metalness: 0,
  })
  const shoeMat = new THREE.MeshStandardMaterial({
    color: SHOE_COLOR,
    roughness: 0.5,
    metalness: 0.15,
  })
  const accentMat = new THREE.MeshStandardMaterial({
    color: ACCENT_COLOR,
    roughness: 0.6,
    metalness: 0,
  })

  // Shoes — slightly forward-biased (-z) so the silhouette reads as
  // facing forward rather than as a featureless box.
  for (const sx of [-HIP_GAP / 2, HIP_GAP / 2]) {
    const shoe = new THREE.Mesh(
      new THREE.BoxGeometry(SHOE_WIDTH, SHOE_HEIGHT, SHOE_DEPTH),
      shoeMat,
    )
    shoe.position.set(sx, SHOE_Y, -0.05)
    shoe.castShadow = true
    shoe.receiveShadow = true
    figure.add(shoe)
  }

  // Lower-body legs (calves + thighs as a single tapered cylinder per leg
  // for cheapness; shorts hide the upper portion).
  for (const lx of [-HIP_GAP / 2, HIP_GAP / 2]) {
    const leg = new THREE.Mesh(
      new THREE.CylinderGeometry(LEG_RADIUS, LEG_RADIUS * 1.15, LEG_HEIGHT, 12),
      skinMat,
    )
    leg.position.set(lx, LEG_Y, 0)
    leg.castShadow = true
    figure.add(leg)
  }

  // Shorts — single block, rounded by softening the box's prominent
  // edges through a slim accent stripe.
  const shorts = new THREE.Mesh(
    new THREE.BoxGeometry(SHORTS_WIDTH, SHORTS_HEIGHT, SHORTS_DEPTH),
    shortsMat,
  )
  shorts.position.set(0, SHORTS_Y, 0)
  shorts.castShadow = true
  shorts.receiveShadow = true
  figure.add(shorts)

  const shortsStripe = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, SHORTS_HEIGHT * 0.85, SHORTS_DEPTH + 0.02),
    accentMat,
  )
  shortsStripe.position.set(SHORTS_WIDTH / 2 + 0.001, SHORTS_Y, 0)
  figure.add(shortsStripe)

  // Torso — jersey-colored block. A small accent stripe across the
  // chest hints at a uniform without being noisy.
  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(TORSO_WIDTH, TORSO_HEIGHT, TORSO_DEPTH),
    jerseyMat,
  )
  torso.position.set(0, TORSO_Y, 0)
  torso.castShadow = true
  torso.receiveShadow = true
  figure.add(torso)

  const chestStripe = new THREE.Mesh(
    new THREE.BoxGeometry(TORSO_WIDTH + 0.02, 0.12, TORSO_DEPTH + 0.02),
    accentMat,
  )
  chestStripe.position.set(0, TORSO_Y + TORSO_HEIGHT / 2 - 0.18, 0)
  figure.add(chestStripe)

  // Arms — slight outward tilt at the shoulders so the figure does not
  // read as a stiff T-pose.
  for (const ax of [-ARM_OFFSET, ARM_OFFSET]) {
    const arm = new THREE.Mesh(
      new THREE.CylinderGeometry(ARM_RADIUS, ARM_RADIUS * 0.9, ARM_LENGTH, 12),
      skinMat,
    )
    arm.position.set(ax, ARM_Y, 0)
    arm.rotation.z = ax < 0 ? 0.18 : -0.18
    arm.castShadow = true
    figure.add(arm)
  }

  // Neck.
  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(NECK_RADIUS, NECK_RADIUS, NECK_HEIGHT, 10),
    skinMat,
  )
  neck.position.set(0, NECK_Y, 0)
  figure.add(neck)

  // Head.
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(HEAD_RADIUS, 18, 16),
    skinMat,
  )
  head.position.set(0, HEAD_Y, 0)
  head.castShadow = true
  figure.add(head)

  // Tiny "front" wedge on the head front (negative-z side) so the
  // facing direction reads even at distance. Cheap nose stand-in.
  const facingMarker = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.12, 0.12),
    skinMat,
  )
  facingMarker.position.set(0, HEAD_Y, -HEAD_RADIUS - 0.04)
  figure.add(facingMarker)

  // Floor disc — keeps the existing team-colored selection ring used
  // upstream by the 2D motion overlay so the renderer reads the same.
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(PLAYER_RADIUS + 0.2, PLAYER_RADIUS + 0.5, 32),
    new THREE.MeshBasicMaterial({
      color: teamColor,
      toneMapped: false,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: isUser ? 0.95 : 0.7,
    }),
  )
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.04
  figure.add(ring)

  return figure
}

/**
 * Returns a hex string `#rrggbb` whose channels have been multiplied
 * by `factor` (0..1 → darker, 1..2 → lighter). Used to derive shorts
 * color from jersey color so the uniform reads as a coordinated set.
 */
function darkenHex(hex: string, factor: number): string {
  const cleaned = hex.replace('#', '')
  if (cleaned.length !== 6) return hex
  const r = parseInt(cleaned.slice(0, 2), 16)
  const g = parseInt(cleaned.slice(2, 4), 16)
  const b = parseInt(cleaned.slice(4, 6), 16)
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)))
  const rr = clamp(r * factor).toString(16).padStart(2, '0')
  const gg = clamp(g * factor).toString(16).padStart(2, '0')
  const bb = clamp(b * factor).toString(16).padStart(2, '0')
  return `#${rr}${gg}${bb}`
}

function buildTubeLine(
  start: THREE.Vector3,
  end: THREE.Vector3,
  radius: number,
): THREE.Mesh {
  const dir = new THREE.Vector3().subVectors(end, start)
  const length = dir.length()
  const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5)
  const up = new THREE.Vector3(0, 1, 0)
  const quat = new THREE.Quaternion().setFromUnitVectors(up, dir.clone().normalize())

  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, length, 8),
    new THREE.MeshBasicMaterial({ color: LINE_COLOR, toneMapped: false }),
  )
  mesh.position.copy(mid)
  mesh.quaternion.copy(quat)
  return mesh
}

function addArcLines(
  parent: THREE.Group,
  radius: number,
  sweep: number,
  y: number,
  z: number,
): void {
  const segments = 64
  const start = -sweep / 2
  const points: Array<[number, number]> = []
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const angle = start + t * sweep
    points.push([Math.sin(angle) * radius, Math.cos(angle) * radius])
  }
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    const startV = new THREE.Vector3(a[0], y, a[1] + z)
    const endV = new THREE.Vector3(b[0], y, b[1] + z)
    parent.add(buildTubeLine(startV, endV, 0.14))
  }
}

// Basketball seam geometry. Three thin black tori form the canonical
// "8-panel" basketball pattern (one equator + two perpendicular
// pole-to-pole great circles). Each torus is nudged just outside the
// sphere surface to avoid z-fighting with the ball body.
const BALL_SEAM_RADIAL_SEGMENTS = 8
const BALL_SEAM_TUBULAR_SEGMENTS = 56
const BALL_SEAM_THICKNESS = 0.014

/**
 * Builds the basketball as a small Group: a sphere body with a
 * procedural pebble surface texture, three black seam rings forming
 * the classic 8-panel basketball pattern, and shadow flags on so the
 * existing lighting rig casts a believable contact shadow.
 *
 * Geometry/material/texture lifetimes follow the existing imperative
 * convention — every owned resource is reachable via the returned
 * group's descendants so disposeGroup() cleans it up automatically.
 */
function buildBasketball(): THREE.Group {
  const group = new THREE.Group()
  group.name = 'basketball'

  const surfaceTex = generateBasketballSurfaceTexture(256)

  const body = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_RADIUS, 32, 32),
    new THREE.MeshStandardMaterial({
      color: '#FFFFFF',
      map: surfaceTex,
      roughness: 0.78,
      metalness: 0,
    }),
  )
  body.castShadow = true
  body.receiveShadow = true
  group.add(body)

  const seamMat = new THREE.MeshStandardMaterial({
    color: BALL_SEAM_COLOR,
    roughness: 0.85,
    metalness: 0,
  })
  const seamRingRadius = BALL_RADIUS + 0.001

  // Equator. Default TorusGeometry lies in the local XY plane; rotating
  // it 90° about X drops the ring into the XZ plane (around the ball's
  // waist).
  const equator = new THREE.Mesh(
    new THREE.TorusGeometry(
      seamRingRadius,
      BALL_SEAM_THICKNESS,
      BALL_SEAM_RADIAL_SEGMENTS,
      BALL_SEAM_TUBULAR_SEGMENTS,
    ),
    seamMat,
  )
  equator.rotation.x = Math.PI / 2
  group.add(equator)

  // Pole-to-pole great circle in the XY plane (default torus
  // orientation). Reads as the front vertical seam from the broadcast
  // camera.
  const longitudeFront = new THREE.Mesh(
    new THREE.TorusGeometry(
      seamRingRadius,
      BALL_SEAM_THICKNESS,
      BALL_SEAM_RADIAL_SEGMENTS,
      BALL_SEAM_TUBULAR_SEGMENTS,
    ),
    seamMat,
  )
  group.add(longitudeFront)

  // Pole-to-pole great circle in the YZ plane. With the front circle
  // above this gives the recognizable 8-panel basketball cut.
  const longitudeSide = new THREE.Mesh(
    new THREE.TorusGeometry(
      seamRingRadius,
      BALL_SEAM_THICKNESS,
      BALL_SEAM_RADIAL_SEGMENTS,
      BALL_SEAM_TUBULAR_SEGMENTS,
    ),
    seamMat,
  )
  longitudeSide.rotation.y = Math.PI / 2
  group.add(longitudeSide)

  return group
}

/**
 * Procedurally paints a small canvas with a basketball-leather-ish
 * pebble pattern and returns it as a CanvasTexture suitable for
 * MeshStandardMaterial.map. The texture is solid orange with sparse
 * dark micro-spots and lighter highlights so the ball does not read as
 * a perfectly flat sphere even at glancing angles.
 *
 * Generation runs only on the client (the scene builder is invoked
 * from a useEffect in Scenario3DCanvas), so document.createElement is
 * safe here.
 */
function generateBasketballSurfaceTexture(size: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.fillStyle = BALL_COLOR
    ctx.fillRect(0, 0, size, size)

    // Dark micro-pebble dots — give the surface its leathery look
    // without a heavy noise pass.
    const darkCount = Math.floor(size * size * 0.018)
    for (let i = 0; i < darkCount; i++) {
      const x = Math.random() * size
      const y = Math.random() * size
      const r = 0.7 + Math.random() * 1.3
      const a = 0.18 + Math.random() * 0.22
      ctx.fillStyle = `rgba(40, 18, 6, ${a})`
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }

    // Subtle warm highlights — break up the orange so it is not a
    // single flat tone under directional light.
    const lightCount = Math.floor(size * size * 0.012)
    for (let i = 0; i < lightCount; i++) {
      const x = Math.random() * size
      const y = Math.random() * size
      const r = 0.5 + Math.random() * 1.0
      const a = 0.08 + Math.random() * 0.14
      ctx.fillStyle = `rgba(255, 200, 130, ${a})`
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}
