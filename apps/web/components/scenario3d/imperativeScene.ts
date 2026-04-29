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
import type { CourtPoint } from '@/lib/scenario3d/coords'
import { COURT } from '@/lib/scenario3d/coords'
import type { Scene3D, SceneMovement, SceneTeam } from '@/lib/scenario3d/scene'
import {
  buildTimeline,
  resolveBallStart,
  samplePlayer,
  samplePositionsAt,
  type ResolvedMovement,
  type Timeline,
} from '@/lib/scenario3d/timeline'

// Visual upgrade pass: warmer, richer hardwood; deeper, more saturated
// paint; brighter team colors so jerseys pop against both floor and
// gym backdrop. The hardwood now has a procedural plank texture that
// gives the floor honest depth instead of reading as a flat plane.
const FLOOR_COLOR = '#C77A36'
const FLOOR_PLANK_DARK = '#9C5821'
const LINE_COLOR = '#FFFFFF'
const PAINT_COLOR = '#0B5BD3'
const PAINT_DEEP = '#063C92'
// Authentic basketball orange/brown leather (not the neon orange of the
// previous sphere). The pebble texture darkens this further so the
// rendered ball reads richer than the flat hex would suggest.
const BALL_COLOR = '#D26B26'
const BALL_SEAM_COLOR = '#0E0F10'
const RIM_COLOR = '#FF6A1F'
const BACKBOARD_GLASS_TINT = '#9FD8FF'
const BACKBOARD_FRAME_COLOR = '#0F1320'
const BACKBOARD_TARGET_COLOR = '#FFFFFF'
const POLE_COLOR = '#1F2733'
const PADDING_COLOR = '#0F1218'
const NET_COLOR = '#FAFAFA'
// Visual upgrade — pushed offense/defense saturation and lifted the
// user mint so all three jerseys read clearly against both the warm
// hardwood and the gym backdrop. User's mint is the brightest of the
// three so the eye lands on YOU first.
const OFFENSE_COLOR = '#2D8AFF'
const OFFENSE_TRIM = '#0A4FB8'
const DEFENSE_COLOR = '#FF3046'
const DEFENSE_TRIM = '#A10F22'
const USER_COLOR = '#3BFF9D'
const USER_TRIM = '#0F8C4E'
// Possession ring — warm gold so it reads as "ball" without competing
// with any of the team colors. Used on the floor under whichever
// player held the ball when the scene was built.
const POSSESSION_RING_COLOR = '#FFCB44'
// Soft contact shadow beneath every player. Pure dark, semi-transparent
// so it reads as grounding rather than a paint dot.
const CONTACT_SHADOW_COLOR = '#05070A'
// Packet C (renderer-polish) lifted these from near-black to warm
// mid-grays so the upper portion of the canvas no longer reads as a
// black void. Walls + ceiling stay desaturated and dim enough to keep
// the lit hardwood as the visual subject, but bright enough that a
// player on a default monitor can see them as a real gym.
const GYM_WALL_COLOR = '#54606E'
const GYM_CEILING_COLOR = '#3A4150'
const GYM_FLOOR_EXT_COLOR = '#7A4D24'
const GYM_RAFTER_COLOR = '#1F232B'
const GYM_TRIM_COLOR = '#181B22'
// Packet F (renderer-polish, gym backdrop). Bleacher silhouettes sit
// between the baseline and the back wall to ground the play in a real
// gym. Seats and risers stay desaturated/low-contrast so they never
// compete with the hardwood, the players, or the teaching overlays.
const BLEACHER_SEAT_COLOR = '#2A3140'
const BLEACHER_RISER_COLOR = '#1A1F28'
// Soft horizontal banner band just below the rafters — lighter than
// the wall so it reads as a hung cloth, not paint. Kept very thin and
// translucent so it never advertises a brand or fights the court.
const BANNER_BAND_COLOR = '#7C879A'
// Wainscot trim runs around the room at human-eye height to break up
// the otherwise flat wall. Same dark tone as the existing court trim
// so the eye reads it as a single architectural detail.
const WAINSCOT_COLOR = '#252A35'

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

  // Lighting rig — Packet C (renderer-polish).
  //
  // The MeshBasic floor/lines/ball use `toneMapped: false` and ignore
  // these lights entirely; the rig exists for the lit
  // MeshStandardMaterial gym shell, hoop, and player figures. With
  // ACES Filmic tone mapping enabled at the renderer level (see
  // Scenario3DCanvas.tsx) the rig now follows a standard 3-point setup:
  //   - Hemisphere: warm sky bounce + cool ground bounce, replaces a
  //     flat AmbientLight so PBR materials get directional ambient.
  //   - Key (warm overhead): primary illumination from the main gym
  //     lights, slightly warm so wood reads inviting.
  //   - Fill (cool side): softens shadows on player faces / the off
  //     side of the hoop.
  //   - Rim (back-overhead, slightly cool): separates players and the
  //     hoop from the back wall so they don't melt into the gym.
  // A small AmbientLight is kept at low intensity to lift extreme
  // shadow valleys without washing the scene.
  root.add(new THREE.AmbientLight(0xffffff, 0.45))
  const hemi = new THREE.HemisphereLight(0xfff5e0, 0x1c2330, 1.05)
  hemi.position.set(0, 40, 0)
  root.add(hemi)
  // Key — primary warm overhead. Punchier than before so the hardwood
  // takes on real luminance and players read with strong dimensional
  // shading instead of flat color blocks.
  const key = new THREE.DirectionalLight(0xfff1d6, 1.6)
  key.position.set(24, 58, 30)
  root.add(key)
  // Cool fill on the off side to keep the shaded planes from going
  // muddy; tightens up the player silhouettes.
  const fill = new THREE.DirectionalLight(0xb8d2ff, 0.65)
  fill.position.set(-28, 36, 12)
  root.add(fill)
  // Cool rim from behind/above lifts the silhouette off the back wall
  // so players never melt into the gym. Slightly more teal than before
  // for a film-room feel without overwhelming the warm key.
  const rim = new THREE.DirectionalLight(0xa8c8ff, 0.55)
  rim.position.set(0, 48, -22)
  root.add(rim)
  // Spot from the rim direction — a soft warm pool of light over the
  // paint that mimics arena spot lighting on the play area. Cheap and
  // visually centers the eye on the read.
  const courtSpot = new THREE.PointLight(0xffd8a0, 0.9, 60, 1.4)
  courtSpot.position.set(0, 24, 8)
  root.add(courtSpot)

  const halfW = COURT.halfWidthFt
  const halfL = COURT.halfLengthFt
  const courtCenterZ = halfL / 2 - 0.5

  // Gym environment shell. Walls + ceiling + out-of-court floor so the
  // court no longer floats in the canvas-clear void. Added before the
  // court floor so the court paints over the OOB extension.
  root.add(buildGymShell())

  // Floor plane. The hardwood gets a procedural plank texture so the
  // floor reads as real wood from any camera angle instead of a flat
  // orange plane. Texture is owned by the floor mesh's material and is
  // freed via disposeMaterialTextures() on unmount.
  const hardwoodTex = makeHardwoodTexture()
  const floorMat = hardwoodTex
    ? new THREE.MeshBasicMaterial({
        map: hardwoodTex,
        color: FLOOR_COLOR,
        toneMapped: false,
      })
    : new THREE.MeshBasicMaterial({ color: FLOOR_COLOR, toneMapped: false })
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(halfW * 2, halfL),
    floorMat,
  )
  floor.rotation.x = -Math.PI / 2
  floor.position.set(0, FLOOR_LIFT, courtCenterZ)
  root.add(floor)

  // Soft warm spot under the rim — a faint glow that anchors the eye
  // on the rim/paint area without lighting up the rest of the floor.
  const rimGlow = new THREE.Mesh(
    new THREE.CircleGeometry(11, 64),
    new THREE.MeshBasicMaterial({
      color: '#FFB070',
      toneMapped: false,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    }),
  )
  rimGlow.rotation.x = -Math.PI / 2
  rimGlow.position.set(0, FLOOR_LIFT + 0.005, 1.5)
  rimGlow.renderOrder = -2
  root.add(rimGlow)

  // Royal blue paint. Slightly translucent so a hint of the hardwood
  // texture shows through and the painted area reads as actual paint
  // on wood rather than a separate flat decal.
  const paint = new THREE.Mesh(
    new THREE.PlaneGeometry(COURT.paintWidthFt, COURT.freeThrowDistFt),
    new THREE.MeshBasicMaterial({
      color: PAINT_COLOR,
      toneMapped: false,
      transparent: true,
      opacity: 0.92,
    }),
  )
  paint.rotation.x = -Math.PI / 2
  paint.position.set(0, FLOOR_LIFT + 0.02, COURT.freeThrowDistFt / 2)
  root.add(paint)

  // Subtle painted gradient at the front of the paint — a thin darker
  // band along the baseline and free-throw line so the paint reads as
  // a freshly-finished court rather than a single flat color. Pure
  // visual decoration, no functional impact.
  const paintTrim = new THREE.Mesh(
    new THREE.PlaneGeometry(COURT.paintWidthFt, 0.6),
    new THREE.MeshBasicMaterial({
      color: PAINT_DEEP,
      toneMapped: false,
      transparent: true,
      opacity: 0.55,
    }),
  )
  paintTrim.rotation.x = -Math.PI / 2
  paintTrim.position.set(0, FLOOR_LIFT + 0.022, 0.3)
  root.add(paintTrim)

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

  // Packet H — small realism props (scoreboard, hanging banners,
  // center-court mark, sideline benches). Parented under root so the
  // existing disposeGroup() traversal frees their geometry, materials,
  // and canvas textures alongside the rest of the imperative scene.
  root.add(buildRealismProps())

  // Resolve the initial ball-handler once, before walking the players.
  // Mirrors the holder lookup used for ball placement below so the
  // possession ring and the rendered ball end up on the same player.
  const initialHolderId =
    scene.ball.holderId ??
    scene.players.find((p) => p.hasBall)?.id ??
    null

  // Players. Each player is a lightweight humanoid figure rotated so
  // offense faces the rim and defense faces back toward the offense.
  // A stable jersey number is derived from the player id so the same
  // scene always renders the same numbers (deterministic by id, not
  // by mount order). Defenders can pose in a denial stance when they
  // are the primary threat, which the BDW-01 backdoor read needs to
  // sell the "sitting on the pass" lesson visually.
  let offenseIdx = 0
  let defenseIdx = 0
  // Mark the most-imminent denying defender — by convention this is
  // the defender closest to the user (or the ball-handler) and on the
  // ball-handler's side. For simple decoder scenes this is a useful
  // visual cue without authoring overhead.
  const userPlayer = scene.players.find((p) => p.isUser)
  const denyTarget = userPlayer ?? scene.players.find((p) => p.hasBall) ?? null
  let denyDefenderId: string | null = null
  if (denyTarget) {
    let bestDist = Infinity
    for (const dp of scene.players) {
      if (dp.team !== 'defense') continue
      const dx = dp.start.x - denyTarget.start.x
      const dz = dp.start.z - denyTarget.start.z
      const dist = Math.hypot(dx, dz)
      if (dist < bestDist) {
        bestDist = dist
        denyDefenderId = dp.id
      }
    }
  }

  for (const p of scene.players) {
    const teamColor = p.color
      ? p.color
      : p.isUser
        ? USER_COLOR
        : p.team === 'offense'
          ? OFFENSE_COLOR
          : DEFENSE_COLOR
    const trimColor = p.isUser
      ? USER_TRIM
      : p.team === 'offense'
        ? OFFENSE_TRIM
        : DEFENSE_TRIM

    // Jersey number: deterministic per player slot. User always wears
    // 0 to match the "you are the read" framing; teammates take 4..11
    // on offense, defenders take a separate band so the two teams
    // never collide on numbers.
    const jerseyNumber = p.isUser
      ? '0'
      : p.team === 'offense'
        ? String(4 + (offenseIdx++ % 6))
        : String(20 + (defenseIdx++ % 6))

    // Stance: the closest defender to the user / ball-handler stays
    // 'denial' to preserve the BDW-01 backdoor cue; other defenders
    // sit in the base 'defensive' stance (knees bent, hands out);
    // offense stays 'idle'. Future phases can extend this heuristic
    // without changing the call site.
    const stance: PlayerStance =
      p.id === denyDefenderId
        ? 'denial'
        : p.team === 'defense'
          ? 'defensive'
          : 'idle'

    const playerGroup = buildPlayerFigure(
      teamColor,
      trimColor,
      p.isUser ?? false,
      p.id === initialHolderId,
      jerseyNumber,
      stance,
    )
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
 * Computes a Box3 over the players + ball + movement endpoints, then
 * aims the camera so the whole play (start AND end positions) is in
 * frame at the given pitch. Defaults are tuned for a coaching-film feel:
 * a moderate down-angle that keeps the half-court the subject and
 * leaves only a small margin around the action.
 */
export function fitCameraToScene(
  camera: THREE.PerspectiveCamera,
  scene: Scene3D,
  aspect: number,
  pitchDeg = 28,
  padding = 1.18,
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
//
// All presets were re-tuned in Packet B (renderer-polish) to push the
// court toward the centre of the frame and shrink the empty black
// space that previously dominated the canvas. Lower height, closer
// distance, and a slightly tighter FOV move from "stadium upper deck"
// to "coaching film".
const SCENE_FOCUS = new THREE.Vector3(0, 3, 20)
const BROADCAST_POSITION = new THREE.Vector3(2, 18, 48)
const BROADCAST_LOOKAT = new THREE.Vector3(0, 3, 20)
const BROADCAST_FOV = 42
const TACTICAL_POSITION = new THREE.Vector3(0, 52, 26)
const TACTICAL_LOOKAT = new THREE.Vector3(0, 0, 22)
const TACTICAL_FOV = 38
const REPLAY_POSITION = new THREE.Vector3(-22, 8, 30)
const REPLAY_LOOKAT = new THREE.Vector3(2, 4, 12)
const REPLAY_FOV = 34
const FOLLOW_LIFT_Y = 8
const FOLLOW_TRAIL_DIST = 12
const FOLLOW_LOOK_HEIGHT = 3.5

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
 * Auto-fit target. Builds a Box3 over players + ball + every movement
 * endpoint (so the WHOLE play, start to finish, is in frame, not just
 * t=0 positions), then computes a camera position that frames it given
 * FOV/aspect.
 *
 * Two corrections vs. the previous implementation:
 *  1. The vertical extent on screen is `sizeY*cos(pitch) +
 *     sizeZ*sin(pitch)`, not `sizeY/2 + sizeZ/2`. The old formula was
 *     ~67% conservative on a typical half-court box, which combined
 *     with a 1.4 padding meant the camera sat ~2.3× too far back —
 *     the headline "court is a sliver, canvas is mostly black" symptom.
 *  2. A minimum half-court extent floor (≈ x ∈ [-25, 25], z ∈ [0, 28])
 *     is folded in so that scenes with players bunched in one zone
 *     still show enough of the floor for spacing reads.
 */
function computeAutoTarget(
  scene: Scene3D,
  aspect: number,
  fov: number,
  pitchDeg = 28,
  padding = 1.18,
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
  // Fold every movement endpoint into the box too, so the camera frames
  // where players GO, not only where they start. Without this, cuts and
  // relocations off-screen push the user to the edge of the visible
  // area mid-play, exactly the kind of framing failure that hides the
  // very read the scenario is teaching.
  for (const list of [scene.movements, scene.answerDemo]) {
    for (const m of list) {
      if (Number.isFinite(m.to.x) && Number.isFinite(m.to.z)) {
        points.push(new THREE.Vector3(m.to.x, 0, m.to.z))
        points.push(new THREE.Vector3(m.to.x, PLAYER_HEIGHT + 1, m.to.z))
      }
    }
  }
  if (points.length === 0) return null

  // Floor: always include a minimal "half-court visible" envelope so we
  // never frame so tightly that the user loses sense of where the rim,
  // wings, and elbows sit relative to the action.
  const HALF_COURT_FLOOR_X = 22
  const HALF_COURT_FLOOR_Z_MIN = 0
  const HALF_COURT_FLOOR_Z_MAX = 28
  points.push(new THREE.Vector3(-HALF_COURT_FLOOR_X, 0, HALF_COURT_FLOOR_Z_MIN))
  points.push(new THREE.Vector3(HALF_COURT_FLOOR_X, 0, HALF_COURT_FLOOR_Z_MAX))

  const box = new THREE.Box3().setFromPoints(points)
  const center = new THREE.Vector3()
  const sizeVec = new THREE.Vector3()
  box.getCenter(center)
  box.getSize(sizeVec)

  const fovRad = (fov * Math.PI) / 180
  const pitch = (pitchDeg * Math.PI) / 180
  // Projected vertical extent of an axis-aligned box viewed at `pitch`
  // below horizontal: world-y maps to screen-y by cos(pitch), world-z
  // maps to screen-y by sin(pitch). Combined extent fits in
  // 2*distance*tan(fov/2).
  const projectedV =
    sizeVec.y * Math.cos(pitch) + sizeVec.z * Math.sin(pitch)
  const verticalFit = projectedV / (2 * Math.tan(fovRad / 2))
  const horizontalFit =
    sizeVec.x / (2 * Math.tan(fovRad / 2) * Math.max(aspect, 0.1))
  const distance = Math.max(verticalFit, horizontalFit) * padding

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
  // Phase D — playback hard-cap. When set, `getElapsedMs` clamps the
  // visible t at this value so the rendered transforms freeze on the
  // cue. tick() fires `pendingFrozen` once when t first crosses this
  // threshold; the state-machine layer reads the flag via
  // `consumeFrozen()` and transitions `playing → frozen`. null means
  // "play to end of timeline" (legacy behaviour).
  private freezeAtMs: number | null = null
  private hasFiredFrozen = false
  private pendingFrozen = false
  // Phase H — currently active start-position overrides (the freeze
  // snapshot for consequence/replay legs). Stored so `samplePlayer`
  // calls can hold idle players (no entry in `byPlayer`) at their
  // freeze pose instead of snapping them back to `scene.players[*].
  // start`. null on the initial intro leg.
  private currentOverrides: ReadonlyMap<string, CourtPoint> | null = null

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
    this.hasFiredFrozen = false
    this.pendingFrozen = false
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
   *  timeline length, or to `freezeAtMs` when one is set).
   */
  getElapsedMs(nowMs: number): number {
    if (this.pausedAtT !== null) return this.pausedAtT
    if (this.startedAt === null) return 0
    const raw = (nowMs - this.startedAt - MOTION_PRE_DELAY_MS) * this.playbackRate
    return Math.max(0, Math.min(raw, this.effectiveCapMs()))
  }

  /** Effective upper bound on the visible t for the current leg. The
   *  cap is the smaller of the timeline length and the explicit
   *  freezeAtMs (when set). Encapsulating this keeps `getElapsedMs`,
   *  `isPlaybackComplete`, and the freeze detection in `tick` consistent.
   */
  private effectiveCapMs(): number {
    if (this.freezeAtMs !== null) {
      return Math.max(0, Math.min(this.freezeAtMs, this.timeline.totalMs))
    }
    return this.timeline.totalMs
  }

  /** Phase D — sets (or clears) the freeze hard-cap. The next tick that
   *  crosses the cap fires the one-shot `pendingFrozen` flag exactly
   *  once; subsequent ticks hold the rendered transforms steady at the
   *  freeze pose. Pass `null` to drop the cap and resume normal
   *  end-of-timeline playback (used by `startConsequence` / `startReplay`).
   */
  setFreezeAtMs(ms: number | null): void {
    this.freezeAtMs = ms
    this.hasFiredFrozen = false
    this.pendingFrozen = false
  }

  /** Phase D — reads the one-shot frozen flag. Returns true exactly
   *  once after the playhead crosses `freezeAtMs`; subsequent calls
   *  return false until `setFreezeAtMs` / `setMovements` resets it.
   */
  consumeFrozen(): boolean {
    if (this.pendingFrozen) {
      this.pendingFrozen = false
      return true
    }
    return false
  }

  /** Phase D — true when the playhead has reached the end of the
   *  current movement list. Used by the state machine to detect
   *  consequence-leg / replay-leg completion. Falls back to false for
   *  empty timelines (so callers don't transition immediately on
   *  zero-movement legs).
   */
  isPlaybackComplete(nowMs: number): boolean {
    if (this.timeline.totalMs <= 0) return false
    return this.getElapsedMs(nowMs) >= this.timeline.totalMs
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

    // Phase D — fire the one-shot frozen flag the first time t reaches
    // the cap. Held in `pendingFrozen` so the state-machine consumer
    // sees it exactly once, even if the parent rAF loop calls tick()
    // many times after the cap was first crossed.
    if (
      this.freezeAtMs !== null &&
      !this.hasFiredFrozen &&
      this.timeline.totalMs > 0 &&
      t >= this.effectiveCapMs()
    ) {
      this.pendingFrozen = true
      this.hasFiredFrozen = true
    }

    // Players first so the ball's holder-follow logic sees the
    // up-to-date sampled position when it reads samplePlayer().
    for (const player of this.scene.players) {
      const g = this.playerGroups.get(player.id)
      if (!g) continue
      const pos = samplePlayer(
        this.scene,
        this.timeline,
        player.id,
        t,
        this.currentOverrides,
      )
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
      const pos = samplePlayer(this.scene, this.timeline, p.id, atMs, this.currentOverrides)
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
      const pos = samplePlayer(
        this.scene,
        this.timeline,
        phase.holderId,
        t,
        this.currentOverrides,
      )
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

  /**
   * Phase D — swaps the active movement list. Used by the state machine
   * to drive `frozen → consequence → replaying`. The new timeline starts
   * from `startOverrides` (typically the freeze snapshot) so the
   * consequence and replay legs resume from the visible pose rather than
   * snapping back to `scene.players[*].start`. The freeze cap is cleared
   * — the new leg always plays to its end.
   */
  setMovements(
    movements: SceneMovement[],
    startOverrides?: ReadonlyMap<string, CourtPoint>,
  ): void {
    this.timeline = buildTimeline(this.scene, movements, { startOverrides })
    this.currentOverrides = startOverrides ?? null
    this.initialHolderId =
      startOverrides && startOverrides.has('ball')
        ? this.findHolderForOverride(startOverrides)
        : resolveInitialHolder(this.scene)
    this.phases = this.computeBallPhases()
    this.startedAt = null
    this.pausedAtT = null
    this.lastPhaseIndex = -1
    this.pendingPassArrival = false
    this.freezeAtMs = null
    this.hasFiredFrozen = false
    this.pendingFrozen = false
  }

  /** Phase D — captures the current sampled positions of every player
   *  and the ball. Used by the state machine to snapshot at freeze
   *  before swapping to the consequence or replay leg.
   */
  snapshotPositions(nowMs: number = performance.now()): Map<string, CourtPoint> {
    const t = this.getElapsedMs(nowMs)
    return samplePositionsAt(this.scene, this.timeline, t, this.currentOverrides)
  }

  /** Phase D — starts the per-choice consequence leg. Returns false
   *  (and does not touch state) when the scene has no `wrongDemos`
   *  entry for this choice — the state-machine layer treats that as
   *  the best-read short-circuit and goes straight to `startReplay`.
   */
  startConsequence(
    choiceId: string,
    startOverrides?: ReadonlyMap<string, CourtPoint>,
  ): boolean {
    const demo = this.scene.wrongDemos.find((d) => d.choiceId === choiceId)
    if (!demo) return false
    this.setMovements(demo.movements, startOverrides)
    return true
  }

  /** Phase D — starts the answer-demo replay leg. The leg always plays
   *  to the end of `scene.answerDemo`; "Show me again" calls this again
   *  to recycle `done → replaying → done`.
   */
  startReplay(startOverrides?: ReadonlyMap<string, CourtPoint>): void {
    this.setMovements(this.scene.answerDemo, startOverrides)
  }

  /** Defensive: when start overrides include the ball, pick the player
   *  whose override position is closest to the override ball position
   *  as the initial holder. Keeps the ball glued to the right hand on
   *  the first frame of consequence / replay legs.
   */
  private findHolderForOverride(
    overrides: ReadonlyMap<string, CourtPoint>,
  ): string | null {
    const ball = overrides.get('ball')
    if (!ball) return resolveInitialHolder(this.scene)
    let bestId: string | null = null
    let bestDist = Number.POSITIVE_INFINITY
    for (const p of this.scene.players) {
      const pos = overrides.get(p.id) ?? p.start
      const dx = pos.x - ball.x
      const dz = pos.z - ball.z
      const d = dx * dx + dz * dz
      if (d < bestDist) {
        bestDist = d
        bestId = p.id
      }
    }
    return bestId
  }
}

// ---------- Phase D: replay state machine ----------

/**
 * Phase D — replay state machine.
 *
 * Models the full decoder loop:
 *
 *   idle → setup → playing → frozen → consequence → replaying → done
 *                                  ↑                              │
 *                                  └────── (showAgain) ───────────┘
 *
 * Drives a `MotionController`: configures `freezeAtMs` for the initial
 * leg, snapshots the freeze pose, swaps movement lists for the
 * consequence and replay legs (keyed off the picked choiceId), and
 * recycles `done → replaying → done` on `showAgain`.
 *
 * Best-read short-circuit (Section 5.4): when `pickChoice(id)` is called
 * with a choice that has no matching `wrongDemos[]` entry, the machine
 * skips `consequence` and goes straight to `replaying` — because for a
 * best-quality choice, the consequence *is* the answer demo.
 *
 * The machine itself does no per-frame work: it owns React-friendly
 * state and exposes `tick(now)` so the parent rAF loop can drive event
 * detection (frozen / consequence-end / replay-end) once per frame.
 */
export type ReplayState =
  | 'idle'
  | 'setup'
  | 'playing'
  | 'frozen'
  | 'consequence'
  | 'replaying'
  | 'done'

export interface ReplayStateSnapshot {
  state: ReplayState
  /** The choiceId picked when the state machine entered `consequence`
   *  or `replaying`. Null in every other state, and reset on
   *  `showAgain` so the replay leg does not re-emit a picked choice. */
  choiceId: string | null
}

export type ReplayStateListener = (snapshot: ReplayStateSnapshot) => void

export class ReplayStateMachine {
  private state: ReplayState = 'idle'
  private chosenChoiceId: string | null = null
  private freezeSnapshot: Map<string, CourtPoint> | null = null
  private listeners = new Set<ReplayStateListener>()

  constructor(
    private readonly motion: MotionController,
    private readonly scene: Scene3D,
  ) {}

  /** Returns the current state and the choiceId that drove the most
   *  recent `consequence` / `replaying` transition. */
  getSnapshot(): ReplayStateSnapshot {
    return { state: this.state, choiceId: this.chosenChoiceId }
  }

  /** Subscribe to state transitions. Returns an unsubscribe function. */
  subscribe(listener: ReplayStateListener): () => void {
    this.listeners.add(listener)
    listener(this.getSnapshot())
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** Begins playback. Configures the motion controller's freeze cap
   *  from `scene.freezeAtMs` and transitions `idle → setup → playing`.
   *  Idempotent: callable multiple times only when in `idle` (other
   *  callers must `reset()` first).
   */
  start(): void {
    if (this.state !== 'idle') return
    this.motion.reset()
    this.motion.setFreezeAtMs(this.scene.freezeAtMs)
    this.transition('setup')
    this.transition('playing')
  }

  /** Records the user's choice while in `frozen`. Snapshots the
   *  freeze pose, then either:
   *    - jumps to `consequence` and runs the matching `wrongDemos[]`
   *      entry; or
   *    - short-circuits to `replaying` when no wrongDemos entry
   *      matches (best-read short-circuit, Section 5.4).
   */
  pickChoice(choiceId: string, nowMs: number = performance.now()): void {
    if (this.state !== 'frozen') return
    this.chosenChoiceId = choiceId
    if (this.freezeSnapshot === null) {
      this.freezeSnapshot = this.motion.snapshotPositions(nowMs)
    }
    const started = this.motion.startConsequence(choiceId, this.freezeSnapshot)
    if (started) {
      this.transition('consequence')
    } else {
      this.motion.startReplay(this.freezeSnapshot)
      this.transition('replaying')
    }
  }

  /** "Show me again" — only available in `done`; cycles the replay
   *  leg from the snapshotted freeze pose. Idempotent in any other
   *  state (no-op).
   */
  showAgain(): void {
    if (this.state !== 'done') return
    if (this.freezeSnapshot === null) {
      // Without a freeze snapshot (legacy scenes that never froze),
      // just rewind the original timeline by resetting the motion
      // controller.
      this.motion.reset()
    } else {
      this.motion.startReplay(this.freezeSnapshot)
    }
    this.transition('replaying')
  }

  /** Drops the machine back to `idle` so a fresh `start()` plays the
   *  scenario from the beginning. Used when the parent swaps to a new
   *  scene or the user navigates between scenarios. */
  reset(): void {
    this.chosenChoiceId = null
    this.freezeSnapshot = null
    this.motion.reset()
    this.motion.setFreezeAtMs(null)
    this.transition('idle')
  }

  /** Phase D — drives event-based transitions. Called once per parent
   *  rAF tick after `motion.tick(now)`. Reads the motion controller's
   *  one-shot frozen flag and end-of-leg flag and advances the state
   *  machine accordingly. Pure event polling — no per-frame allocation.
   */
  tick(nowMs: number): void {
    if (this.state === 'playing') {
      if (this.motion.consumeFrozen()) {
        this.freezeSnapshot = this.motion.snapshotPositions(nowMs)
        this.transition('frozen')
        return
      }
      if (this.motion.isPlaybackComplete(nowMs)) {
        // Legacy scenes (no freezeAtMs): playing → done directly. The
        // freeze snapshot stays null, which `showAgain` handles by
        // resetting the original timeline.
        this.transition('done')
      }
      return
    }

    if (this.state === 'consequence' && this.motion.isPlaybackComplete(nowMs)) {
      // Consequence finished. Snap back to the freeze pose and start
      // the answer-demo replay leg.
      this.motion.startReplay(this.freezeSnapshot ?? undefined)
      this.transition('replaying')
      return
    }

    if (this.state === 'replaying' && this.motion.isPlaybackComplete(nowMs)) {
      this.transition('done')
    }
  }

  private transition(next: ReplayState): void {
    if (this.state === next) return
    this.state = next
    if (next === 'idle') this.chosenChoiceId = null
    const snapshot = this.getSnapshot()
    for (const fn of this.listeners) fn(snapshot)
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

  // Packet F — gym backdrop composition. Adds bleachers, banner band,
  // wainscot trim, and a soft top-of-wall vignette. All children of the
  // gym shell group so the existing disposeGroup() traversal cleans
  // them up alongside the walls and ceiling.
  addGymBackdrop(gym, gymWidth, gymDepth, centerZ)

  return gym
}

/**
 * Composites the gym backdrop in place: stepped bleacher silhouettes
 * behind the baseline, a long horizontal banner band high on each
 * wall, a wainscot trim line around the room, and a vertical-gradient
 * vignette that darkens the top of each wall toward the rafters. All
 * elements are MeshStandard or MeshBasic (no per-frame work), use
 * shared materials where possible, and read as one cohesive room
 * without competing with the court or the teaching overlays.
 */
function addGymBackdrop(
  gym: THREE.Group,
  gymWidth: number,
  gymDepth: number,
  centerZ: number,
): void {
  const seatMat = new THREE.MeshStandardMaterial({
    color: BLEACHER_SEAT_COLOR,
    roughness: 0.92,
    metalness: 0.05,
  })
  const riserMat = new THREE.MeshStandardMaterial({
    color: BLEACHER_RISER_COLOR,
    roughness: 0.95,
    metalness: 0,
  })
  const wainscotMat = new THREE.MeshStandardMaterial({
    color: WAINSCOT_COLOR,
    roughness: 0.7,
    metalness: 0.15,
  })
  const bannerMat = new THREE.MeshBasicMaterial({
    color: BANNER_BAND_COLOR,
    transparent: true,
    opacity: 0.42,
    toneMapped: false,
    side: THREE.DoubleSide,
    depthWrite: false,
  })

  // ----- Stepped bleacher rows behind the baseline -----
  // Five rows that climb from the baseline back toward the rear wall.
  // Width is narrowed so the rim/hoop read clearly in front of them
  // and the side walls keep their own visible bleacher block.
  const rowCount = 5
  const rowDepth = 1.6
  const rowHeight = 0.7
  const seatThickness = 0.18
  const bleacherWidth = GYM_HALF_WIDTH * 1.55
  const bleacherStartZ = GYM_BACK_Z + 0.6
  for (let i = 0; i < rowCount; i++) {
    const baseY = i * rowHeight
    const z = bleacherStartZ + i * rowDepth
    // Riser (back face of the step).
    const riser = new THREE.Mesh(
      new THREE.BoxGeometry(bleacherWidth, rowHeight, 0.18),
      riserMat,
    )
    riser.position.set(0, baseY + rowHeight / 2, z)
    riser.receiveShadow = true
    gym.add(riser)
    // Seat plank — sits on top of the riser, depth = rowDepth so the
    // next row's riser hides the seam.
    const seat = new THREE.Mesh(
      new THREE.BoxGeometry(bleacherWidth, seatThickness, rowDepth),
      seatMat,
    )
    seat.position.set(
      0,
      baseY + rowHeight + seatThickness / 2,
      z + rowDepth / 2,
    )
    seat.receiveShadow = true
    gym.add(seat)
  }

  // ----- Side-wall bleacher silhouettes -----
  // Two short stepped blocks that hug the side walls between the
  // baseline and the back wall. Smaller than the back-baseline stand
  // so they read as side seating without intruding on the play.
  const sideRowCount = 4
  const sideRowDepth = 1.4
  const sideRowHeight = 0.65
  const sideBlockWidth = 4.5
  for (const sign of [-1, 1]) {
    const xCenter = sign * (GYM_HALF_WIDTH - sideBlockWidth / 2 - 0.6)
    for (let i = 0; i < sideRowCount; i++) {
      const baseY = i * sideRowHeight
      const z = GYM_BACK_Z + 1.2 + i * sideRowDepth
      const seat = new THREE.Mesh(
        new THREE.BoxGeometry(sideBlockWidth, seatThickness, sideRowDepth),
        seatMat,
      )
      seat.position.set(
        xCenter,
        baseY + sideRowHeight + seatThickness / 2,
        z + sideRowDepth / 2,
      )
      gym.add(seat)
      const riser = new THREE.Mesh(
        new THREE.BoxGeometry(sideBlockWidth, sideRowHeight, 0.18),
        riserMat,
      )
      riser.position.set(xCenter, baseY + sideRowHeight / 2, z)
      gym.add(riser)
    }
  }

  // ----- Wainscot trim band -----
  // Thin horizontal box that wraps around the inside of the room at
  // ~6 ft. Adds a low-contrast architectural line that breaks up the
  // tall blank walls without introducing any extra material.
  const wainscotY = 6
  const wainscotThickness = 0.15
  const wainscotDepthInsetZ = GYM_BACK_Z + 0.05
  const wainscotFrontZ = GYM_FRONT_Z - 0.05
  // Back wall stripe.
  const wainscotBack = new THREE.Mesh(
    new THREE.BoxGeometry(gymWidth - 0.2, wainscotThickness, 0.06),
    wainscotMat,
  )
  wainscotBack.position.set(0, wainscotY, wainscotDepthInsetZ + 0.03)
  gym.add(wainscotBack)
  // Side wall stripes.
  for (const sign of [-1, 1]) {
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, wainscotThickness, gymDepth - 0.2),
      wainscotMat,
    )
    stripe.position.set(
      sign * (GYM_HALF_WIDTH - 0.03),
      wainscotY,
      (wainscotDepthInsetZ + wainscotFrontZ) / 2,
    )
    gym.add(stripe)
  }

  // ----- Banner band high on each wall -----
  // Translucent strip just below the rafters that reads as a row of
  // hung banners or a clerestory window line. We deliberately keep it
  // free of text/logos — Packet H owns those props.
  const bannerY = GYM_HEIGHT - 5.5
  const bannerHeight = 1.6
  const bannerInset = 0.05
  // Back wall.
  const bannerBack = new THREE.Mesh(
    new THREE.PlaneGeometry(gymWidth - 1, bannerHeight),
    bannerMat,
  )
  bannerBack.position.set(0, bannerY, GYM_BACK_Z + bannerInset)
  gym.add(bannerBack)
  // Side walls. Use a fresh PlaneGeometry per wall so each can rotate
  // independently; the material is shared so the GPU material count
  // stays at one for the whole banner band.
  for (const sign of [-1, 1]) {
    const banner = new THREE.Mesh(
      new THREE.PlaneGeometry(gymDepth - 1, bannerHeight),
      bannerMat,
    )
    banner.position.set(
      sign * (GYM_HALF_WIDTH - bannerInset),
      bannerY,
      centerZ,
    )
    banner.rotation.y = sign === -1 ? Math.PI / 2 : -Math.PI / 2
    gym.add(banner)
  }

  // ----- Top-of-wall vignette -----
  // A vertical-gradient canvas texture darkens the top ~8 ft of each
  // wall toward the ceiling. Reads as ambient ceiling falloff and
  // softens the harsh wall/rafter junction without any extra lights.
  const vignetteTex = makeVerticalDarkenTexture()
  if (vignetteTex) {
    const vignetteMat = new THREE.MeshBasicMaterial({
      map: vignetteTex,
      transparent: true,
      opacity: 0.85,
      toneMapped: false,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    const vignetteHeight = 8
    const vignetteY = GYM_HEIGHT - vignetteHeight / 2 - 0.02
    // Back wall.
    const vBack = new THREE.Mesh(
      new THREE.PlaneGeometry(gymWidth - 0.2, vignetteHeight),
      vignetteMat,
    )
    vBack.position.set(0, vignetteY, GYM_BACK_Z + 0.04)
    gym.add(vBack)
    // Side walls.
    for (const sign of [-1, 1]) {
      const v = new THREE.Mesh(
        new THREE.PlaneGeometry(gymDepth - 0.2, vignetteHeight),
        vignetteMat,
      )
      v.position.set(
        sign * (GYM_HALF_WIDTH - 0.04),
        vignetteY,
        centerZ,
      )
      v.rotation.y = sign === -1 ? Math.PI / 2 : -Math.PI / 2
      gym.add(v)
    }
  }
}

/**
 * Generates a 1×64 vertical gradient that fades from transparent at
 * the bottom to dark at the top. Used as a top-of-wall vignette so the
 * ceiling/wall junction reads as ambient falloff rather than a hard
 * seam. The texture is owned by the gym shell group and will be
 * disposed via disposeGroup()'s material/texture traversal in
 * Scenario3DCanvas.
 */
function makeVerticalDarkenTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const gradient = ctx.createLinearGradient(0, 0, 0, 64)
  // Top of the texture is the bottom of the wall (origin of the
  // PlaneGeometry's UV is bottom-left). We want the DARK end at the
  // TOP of the wall, so dark is at v=1 → gradient stop 1.
  gradient.addColorStop(0, 'rgba(10, 14, 22, 0)')
  gradient.addColorStop(0.55, 'rgba(10, 14, 22, 0.18)')
  gradient.addColorStop(1, 'rgba(10, 14, 22, 0.78)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 1, 64)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.needsUpdate = true
  return tex
}

/**
 * Generates a procedural hardwood texture for the court floor. Paints
 * vertical planks with subtle grain noise and inter-plank seams. Tiled
 * across the floor plane so the floor reads as actual hardwood from
 * any camera angle instead of a flat orange rectangle. Owned by the
 * floor mesh's material; freed via disposeMaterialTextures().
 */
function makeHardwoodTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  // Base wood tone.
  ctx.fillStyle = FLOOR_COLOR
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // Vertical planks. Each plank gets a slightly varied base tone and
  // a few horizontal grain streaks.
  const plankCount = 8
  const plankWidth = canvas.width / plankCount
  for (let i = 0; i < plankCount; i++) {
    const x = i * plankWidth
    // Slight per-plank tone variation so planks read as individual
    // pieces of wood rather than a single wash.
    const variation = Math.sin(i * 12.3) * 18
    const r = 199 + variation
    const g = 122 + variation * 0.6
    const b = 54 + variation * 0.3
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`
    ctx.fillRect(x, 0, plankWidth, canvas.height)

    // Grain — short horizontal streaks at random heights.
    ctx.strokeStyle = FLOOR_PLANK_DARK
    ctx.globalAlpha = 0.18
    ctx.lineWidth = 1
    for (let g = 0; g < 14; g++) {
      const gy = Math.floor((Math.sin(i * 47 + g * 11.7) * 0.5 + 0.5) * canvas.height)
      const gx = x + Math.floor((Math.cos(i * 31 + g * 7.3) * 0.5 + 0.5) * plankWidth * 0.6)
      const len = 30 + Math.floor((Math.sin(g * 3.1) * 0.5 + 0.5) * 60)
      ctx.beginPath()
      ctx.moveTo(gx, gy)
      ctx.lineTo(gx + len, gy + (Math.sin(g) * 0.5))
      ctx.stroke()
    }
    ctx.globalAlpha = 1

    // Plank seam — thin dark line on the right edge of every plank.
    ctx.strokeStyle = 'rgba(60, 30, 8, 0.55)'
    ctx.lineWidth = 1.4
    ctx.beginPath()
    ctx.moveTo(x + plankWidth, 0)
    ctx.lineTo(x + plankWidth, canvas.height)
    ctx.stroke()
  }

  // Soft varnish highlight — a single broad diagonal sweep that
  // suggests a lacquered finish.
  const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
  grad.addColorStop(0, 'rgba(255, 226, 176, 0.0)')
  grad.addColorStop(0.45, `rgba(255, 226, 176, 0.10)`)
  grad.addColorStop(0.55, `rgba(255, 226, 176, 0.10)`)
  grad.addColorStop(1, 'rgba(255, 226, 176, 0.0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  // Repeat horizontally so planks tile across the full court width but
  // don't squish vertically — one full repetition along the length.
  tex.repeat.set(2, 1)
  tex.minFilter = THREE.LinearMipMapLinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.anisotropy = 4
  tex.needsUpdate = true
  return tex
}

/**
 * Generates a square jersey-front canvas texture: a numeric label
 * centered on the team color, with a thin contrasting outline so the
 * digit reads from broadcast distance. Used as a small panel applied
 * to the front of each player's torso so jerseys read as authentic
 * basketball uniforms instead of plain colored boxes.
 *
 * Returns null on SSR / non-DOM contexts; caller falls back to the
 * untextured jersey block.
 */
function makeJerseyNumberTexture(
  number: string,
  jerseyColor: string,
  trimColor: string,
): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.fillStyle = jerseyColor
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // Subtle vertical accent stripes on the sides.
  ctx.fillStyle = trimColor
  ctx.globalAlpha = 0.5
  ctx.fillRect(0, 0, 14, canvas.height)
  ctx.fillRect(canvas.width - 14, 0, 14, canvas.height)
  ctx.globalAlpha = 1

  // Jersey number — bold sans-serif, white with thin dark outline.
  ctx.font = 'bold 168px "Inter", "Helvetica Neue", system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  // Outline.
  ctx.lineWidth = 14
  ctx.strokeStyle = trimColor
  ctx.strokeText(number, canvas.width / 2, canvas.height / 2 + 8)

  // Fill.
  ctx.fillStyle = '#FFFFFF'
  ctx.fillText(number, canvas.width / 2, canvas.height / 2 + 8)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.needsUpdate = true
  return tex
}

// ----- Packet H — gym realism props -----

const SCOREBOARD_BODY_COLOR = '#101620'
const SCOREBOARD_BEZEL_COLOR = '#2A3140'
const SCOREBOARD_FACE_BG = '#05080F'
const SCOREBOARD_HOME_COLOR = '#3BFF9D'
const SCOREBOARD_GUEST_COLOR = '#FFB070'
const SCOREBOARD_DIM_TEXT = '#7E8A9B'

// Championship banners hung from the rafters. Tonally close to the
// wall so they read as background props, never as marketing.
const BANNER_PALETTE = ['#1F3A6B', '#642F2F', '#3D4654'] as const
const BANNER_TRIM_COLOR = '#C9A14B'

// Center-court CourtIQ mark — a faint two-letter monogram printed
// directly into the hardwood. Kept very low contrast so the floor
// stays the visual subject and the mark only reads from a still
// frame.
const CENTER_MARK_INK = 'rgba(255, 255, 255, 0.10)'
const CENTER_MARK_RIM = 'rgba(255, 255, 255, 0.18)'

// Sideline bench silhouette colors.
const BENCH_FRAME_COLOR = '#1B2230'
const BENCH_SEAT_COLOR = '#2A3140'

/**
 * Builds and returns a single THREE.Group containing every Packet H
 * realism prop: a back-wall scoreboard, three hanging banners between
 * the rafters, a center-court CourtIQ floor mark, and a pair of
 * sideline bench silhouettes. All geometry/materials/canvas textures
 * are owned by descendants of this group so the existing
 * disposeGroup() traversal in Scenario3DCanvas frees them on unmount.
 */
function buildRealismProps(): THREE.Group {
  const props = new THREE.Group()
  props.name = 'gym-realism-props'

  props.add(buildScoreboard())
  props.add(buildHangingBanners())

  const centerMark = buildCenterCourtMark()
  if (centerMark) props.add(centerMark)

  props.add(buildSidelineBenches())

  return props
}

/**
 * Back-wall scoreboard. Mounts a small panel above the rafter line,
 * centered along x. The face is a single canvas texture (HOME / GUEST
 * placeholder digits + clock) so the whole prop costs one geometry,
 * one body material, and one face material with one map.
 */
function buildScoreboard(): THREE.Group {
  const group = new THREE.Group()
  group.name = 'scoreboard'

  const width = 8
  const height = 3.6
  const depth = 0.6
  // Sit just below the rafters but above the banner band so it reads
  // as a piece of mounted hardware, not part of the wall paint.
  const y = GYM_HEIGHT - 7.5
  const z = GYM_BACK_Z + 0.05 + depth / 2

  const bodyMat = new THREE.MeshStandardMaterial({
    color: SCOREBOARD_BODY_COLOR,
    roughness: 0.6,
    metalness: 0.4,
  })
  const bezelMat = new THREE.MeshStandardMaterial({
    color: SCOREBOARD_BEZEL_COLOR,
    roughness: 0.5,
    metalness: 0.5,
  })

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    bodyMat,
  )
  body.position.set(0, y, z)
  group.add(body)

  // Subtle bezel strip on top + bottom so the box doesn't read as a
  // flat painted rectangle from the broadcast camera.
  const bezelThickness = 0.18
  for (const sign of [-1, 1]) {
    const bezel = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.2, bezelThickness, depth + 0.05),
      bezelMat,
    )
    bezel.position.set(0, y + sign * (height / 2 + bezelThickness / 2), z)
    group.add(bezel)
  }

  // Face panel — flush with the front of the body, slightly inset so
  // the bezel reads in front of it from the broadcast camera.
  const faceTex = makeScoreboardFaceTexture()
  if (faceTex) {
    const faceMat = new THREE.MeshBasicMaterial({
      map: faceTex,
      toneMapped: false,
      transparent: false,
    })
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(width - 0.4, height - 0.5),
      faceMat,
    )
    face.position.set(0, y, z + depth / 2 + 0.01)
    group.add(face)
  }

  // Two thin mounting brackets running from the body to the back
  // wall. Cheap detail that keeps the scoreboard from reading as a
  // floating sticker.
  const armGeom = new THREE.BoxGeometry(0.18, 0.18, depth + 0.4)
  const armMat = bezelMat
  for (const sign of [-1, 1]) {
    const arm = new THREE.Mesh(armGeom, armMat)
    arm.position.set(sign * (width / 2 - 0.6), y + height / 2 + 0.5, GYM_BACK_Z + 0.1 + (depth + 0.4) / 2)
    group.add(arm)
  }

  return group
}

/**
 * Three thin championship-style banners hung between the back-wall
 * rafters. Each banner is one PlaneGeometry plus a thin trim bar at
 * top and bottom; colors are pulled from BANNER_PALETTE so each banner
 * reads as a different season without any text.
 */
function buildHangingBanners(): THREE.Group {
  const group = new THREE.Group()
  group.name = 'hanging-banners'

  const bannerWidth = 2.2
  const bannerHeight = 5.5
  const trimHeight = 0.18
  // Hang the banners about a foot behind the back wall plane so they
  // sit visually inside the gym from the broadcast camera. Slightly
  // forward of the back wall means they read in front of the wall
  // vignette without z-fighting.
  const z = GYM_BACK_Z + 0.6
  const topY = GYM_HEIGHT - 2.5

  const positions = [-12, 0, 12]
  for (let i = 0; i < positions.length; i++) {
    const x = positions[i]!
    const color = BANNER_PALETTE[i % BANNER_PALETTE.length]

    const bannerMat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.95,
      metalness: 0,
      side: THREE.DoubleSide,
    })
    const banner = new THREE.Mesh(
      new THREE.PlaneGeometry(bannerWidth, bannerHeight),
      bannerMat,
    )
    banner.position.set(x, topY - bannerHeight / 2, z)
    group.add(banner)

    const trimMat = new THREE.MeshStandardMaterial({
      color: BANNER_TRIM_COLOR,
      roughness: 0.5,
      metalness: 0.6,
    })
    // Top + bottom trim strips.
    for (const sign of [-1, 1]) {
      const trim = new THREE.Mesh(
        new THREE.BoxGeometry(bannerWidth + 0.1, trimHeight, 0.08),
        trimMat,
      )
      trim.position.set(
        x,
        sign === 1 ? topY - trimHeight / 2 : topY - bannerHeight + trimHeight / 2,
        z,
      )
      group.add(trim)
    }
  }

  return group
}

/**
 * Faint center-court mark printed into the hardwood at the middle of
 * the half-court. A 10 ft circle with a low-contrast "CIQ" monogram —
 * just present enough to read as a court logo when the eye lands on
 * it, never bright enough to compete with team colors or paths.
 *
 * Returns null on SSR / non-DOM contexts so the renderer never
 * attempts to allocate a CanvasTexture without document.
 */
function buildCenterCourtMark(): THREE.Mesh | null {
  if (typeof document === 'undefined') return null
  const tex = makeCenterCourtTexture()
  if (!tex) return null

  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    toneMapped: false,
    transparent: true,
    depthWrite: false,
  })
  const size = 9
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat)
  mesh.rotation.x = -Math.PI / 2
  // Place the mark in the open hardwood between the top of the
  // three-point arc and the half-court line, where a real court logo
  // sits on a half-court layout. Lifted a hair above the floor so the
  // painted court lines still draw cleanly on top from any angle.
  const markZ = (COURT.threePointRadiusFt + COURT.halfLengthFt) / 2
  mesh.position.set(0, FLOOR_LIFT + 0.04, markZ)
  mesh.renderOrder = 1
  return mesh
}

/**
 * Two low silhouette benches sitting just outside the sidelines,
 * roughly mid-court. Frame + seat slab only — no players, no
 * substitutes, no logos. They exist to break up the empty out-of-
 * bounds floor strip so the eye doesn't read it as void.
 */
function buildSidelineBenches(): THREE.Group {
  const group = new THREE.Group()
  group.name = 'sideline-benches'

  const benchLength = 10
  const benchDepth = 1.2
  const seatHeight = 1.4
  const seatThickness = 0.16
  const legHeight = seatHeight - seatThickness
  const legThickness = 0.18

  const frameMat = new THREE.MeshStandardMaterial({
    color: BENCH_FRAME_COLOR,
    roughness: 0.65,
    metalness: 0.3,
  })
  const seatMat = new THREE.MeshStandardMaterial({
    color: BENCH_SEAT_COLOR,
    roughness: 0.85,
    metalness: 0.05,
  })

  // Place each bench just outside the sideline, aligned with the
  // free-throw line so it never visually overlaps the action area.
  const sidelineX = COURT.halfWidthFt + 1.4
  const benchZ = COURT.halfLengthFt * 0.45

  for (const sign of [-1, 1]) {
    const xCenter = sign * sidelineX

    // Seat slab.
    const seat = new THREE.Mesh(
      new THREE.BoxGeometry(benchDepth, seatThickness, benchLength),
      seatMat,
    )
    seat.position.set(xCenter, seatHeight - seatThickness / 2, benchZ)
    group.add(seat)

    // Two legs (each end). Cheaper than a full frame and reads
    // unambiguously as bench seating from the broadcast camera.
    for (const zSign of [-1, 1]) {
      const leg = new THREE.Mesh(
        new THREE.BoxGeometry(benchDepth - 0.05, legHeight, legThickness),
        frameMat,
      )
      leg.position.set(
        xCenter,
        legHeight / 2,
        benchZ + zSign * (benchLength / 2 - 0.4),
      )
      group.add(leg)
    }
  }

  return group
}

/**
 * Generates a 512×256 canvas containing the back-wall scoreboard
 * face: HOME / GUEST labels, two big score digits, and a clock. All
 * static — no per-frame updates — so the texture lives for the scene
 * lifetime and disposes via the existing material/texture traversal.
 */
function makeScoreboardFaceTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.fillStyle = SCOREBOARD_FACE_BG
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // HOME / GUEST labels.
  ctx.font = 'bold 28px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = SCOREBOARD_DIM_TEXT
  ctx.fillText('HOME', 90, 56)
  ctx.fillText('GUEST', 422, 56)

  // Score digits.
  ctx.font = 'bold 110px "DM Mono", "Courier New", monospace'
  ctx.fillStyle = SCOREBOARD_HOME_COLOR
  ctx.fillText('64', 90, 150)
  ctx.fillStyle = SCOREBOARD_GUEST_COLOR
  ctx.fillText('58', 422, 150)

  // Quarter / clock band along the bottom.
  ctx.font = 'bold 24px "DM Mono", "Courier New", monospace'
  ctx.fillStyle = SCOREBOARD_DIM_TEXT
  ctx.fillText('Q3', 90, 220)
  ctx.fillText('FOULS 4 · 5', 256, 220)
  ctx.fillStyle = SCOREBOARD_HOME_COLOR
  ctx.fillText('07:32', 422, 220)

  // Thin divider line down the middle so the two halves read as
  // independent panels rather than one flat readout.
  ctx.strokeStyle = SCOREBOARD_BEZEL_COLOR
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(256, 32)
  ctx.lineTo(256, 196)
  ctx.stroke()

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.needsUpdate = true
  return tex
}

/**
 * Generates a 256×256 canvas with a soft circular CourtIQ-style mark
 * — outer rim ring, inner faint disc, and a "CIQ" monogram. Alpha
 * elsewhere so the mesh blends cleanly into the hardwood.
 */
function makeCenterCourtTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  // Transparent background — only the ring + monogram render.
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  const cx = 128
  const cy = 128
  const outerR = 116
  const innerR = 100

  // Outer rim ring.
  ctx.strokeStyle = CENTER_MARK_RIM
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.arc(cx, cy, outerR, 0, Math.PI * 2)
  ctx.stroke()

  // Faint inner disc.
  ctx.fillStyle = CENTER_MARK_INK
  ctx.beginPath()
  ctx.arc(cx, cy, innerR, 0, Math.PI * 2)
  ctx.fill()

  // Monogram.
  ctx.font = 'bold 88px "Inter", system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = CENTER_MARK_RIM
  ctx.fillText('CIQ', cx, cy + 4)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.needsUpdate = true
  return tex
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

// Shoulder yoke — a thin horizontal capsule across the top of the
// torso, slightly wider than the torso itself. Makes the shoulder line
// the widest part of the upper body so facing direction is unambiguous
// from the high 3/4 broadcast camera.
const YOKE_WIDTH = TORSO_WIDTH * 1.18
const YOKE_HEIGHT = 0.32
const YOKE_DEPTH = TORSO_DEPTH * 0.85
const YOKE_Y = TORSO_Y + TORSO_HEIGHT / 2 - YOKE_HEIGHT * 0.55

/**
 * Stance presets the renderer paints today. The closest defender to the
 * user / ball-handler is `'denial'` (preserves the BDW-01 backdoor cue);
 * other defenders are `'defensive'` (knees bent, feet wider, active
 * hands); offense is `'idle'` (standing tall, hands relaxed). Future
 * phases can add `'closeout'`, `'sag'`, `'cut'` here without changing
 * the call sites — only `buildPlayerFigure` interprets the value.
 */
type PlayerStance = 'idle' | 'defensive' | 'denial'

// Crouch lower — how far the upper body drops in defensive / denial
// stances. The legs stay full length; the shorts cover the visual
// overlap at the hips, which from broadcast distance reads as bent
// knees. Cheap stance abstraction (no skeletal rig).
const STANCE_LOWER_FT = 0.35
// Defensive feet are wider than offensive idle feet so the player
// reads as "in a stance" instead of "standing".
const HIP_GAP_DEFENSIVE = 0.62
// Forward / back foot offset. Defensive: stance-ready stagger.
// Denial: small stagger toward the rim side. Idle: tiny forward bias
// already used to break up the silhouette.
const FOOT_STAGGER_DEFENSIVE = 0.18
const FOOT_STAGGER_DENIAL = 0.1

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
 * The upper body (shorts, torso, jersey, shoulder yoke, arms, neck,
 * head, hair, facing wedge, user chevron) is parented to a sub-group
 * so a single translation drops the player into a defensive crouch
 * without rebuilding any geometry. Legs stay full length; the shorts
 * cover the resulting hip overlap, which from broadcast distance reads
 * as bent knees. This keeps stance changes to a position write rather
 * than a per-frame skeletal rig.
 */
function buildPlayerFigure(
  teamColor: string,
  trimColor: string,
  isUser: boolean,
  hasBall: boolean,
  jerseyNumber: string,
  stance: PlayerStance,
): THREE.Group {
  const figure = new THREE.Group()
  figure.name = 'player-figure'

  const jerseyMat = new THREE.MeshStandardMaterial({
    color: teamColor,
    roughness: 0.6,
    metalness: 0.06,
  })
  const shortsMat = new THREE.MeshStandardMaterial({
    color: darkenHex(teamColor, SHORTS_DARKEN),
    roughness: 0.78,
    metalness: 0,
  })
  const skinMat = new THREE.MeshStandardMaterial({
    color: SKIN_COLOR,
    roughness: 0.72,
    metalness: 0,
  })
  const shoeMat = new THREE.MeshStandardMaterial({
    color: SHOE_COLOR,
    roughness: 0.45,
    metalness: 0.18,
  })
  const accentMat = new THREE.MeshStandardMaterial({
    color: ACCENT_COLOR,
    roughness: 0.6,
    metalness: 0,
  })
  const trimMat = new THREE.MeshStandardMaterial({
    color: trimColor,
    roughness: 0.55,
    metalness: 0.1,
  })

  const isCrouch = stance === 'defensive' || stance === 'denial'
  const hipGap = isCrouch ? HIP_GAP_DEFENSIVE : HIP_GAP
  const upperLower = isCrouch ? STANCE_LOWER_FT : 0
  // Per-foot z offset for stance stagger. Index 0 is the left foot,
  // index 1 the right foot. Defensive: classic ready stagger (right
  // foot forward, left foot back). Denial: small stagger toward the
  // ball side. Idle: tiny forward bias on both feet to break up the
  // silhouette without reading as motion.
  const footStagger: [number, number] =
    stance === 'defensive'
      ? [-FOOT_STAGGER_DEFENSIVE, FOOT_STAGGER_DEFENSIVE]
      : stance === 'denial'
        ? [FOOT_STAGGER_DENIAL, -FOOT_STAGGER_DENIAL]
        : [-0.05, -0.05]

  // Shoes — staggered per stance for hip/foot readability. White
  // midsole stripe sells the "athletic shoe" silhouette without
  // extra meshes.
  const shoeXs: [number, number] = [-hipGap / 2, hipGap / 2]
  for (let i = 0; i < 2; i++) {
    const sx = shoeXs[i]!
    const sz = footStagger[i]!
    const shoe = new THREE.Mesh(
      new THREE.BoxGeometry(SHOE_WIDTH, SHOE_HEIGHT, SHOE_DEPTH),
      shoeMat,
    )
    shoe.position.set(sx, SHOE_Y, sz)
    shoe.castShadow = true
    shoe.receiveShadow = true
    figure.add(shoe)

    // Midsole stripe — a thin white band at the bottom of the shoe.
    const sole = new THREE.Mesh(
      new THREE.BoxGeometry(SHOE_WIDTH + 0.02, 0.12, SHOE_DEPTH + 0.02),
      accentMat,
    )
    sole.position.set(sx, 0.06, sz)
    figure.add(sole)
  }

  // Lower-body legs — tapered cylinder (thicker at thigh, thinner at
  // calf) for a more athletic silhouette. Shorts hide the very top.
  // Legs follow the foot stagger so the figure reads as a single
  // staggered stance, not a torso floating over offset shoes.
  for (let i = 0; i < 2; i++) {
    const lx = shoeXs[i]!
    const lz = footStagger[i]! * 0.4
    const leg = new THREE.Mesh(
      new THREE.CylinderGeometry(LEG_RADIUS * 0.95, LEG_RADIUS * 1.25, LEG_HEIGHT, 14),
      skinMat,
    )
    leg.position.set(lx, LEG_Y, lz)
    leg.castShadow = true
    figure.add(leg)
  }

  // Upper body — every part above the knees lives on this sub-group
  // so a single position write drops the figure into a crouch for
  // defensive / denial stances. Lower body (shoes, legs) stays on the
  // figure root so the feet always touch the floor.
  const upperBody = new THREE.Group()
  upperBody.name = 'player-upper'
  upperBody.position.y = -upperLower
  figure.add(upperBody)

  // Shorts — capsule-shaped via a slightly tapered cylinder so the
  // bottom is wider than the top (athletic basketball shorts). Side
  // accent stripes in trim color sell the uniform.
  const shorts = new THREE.Mesh(
    new THREE.CylinderGeometry(SHORTS_WIDTH * 0.5, SHORTS_WIDTH * 0.55, SHORTS_HEIGHT, 16),
    shortsMat,
  )
  shorts.position.set(0, SHORTS_Y, 0)
  shorts.castShadow = true
  shorts.receiveShadow = true
  shorts.scale.set(1, 1, 0.85)
  upperBody.add(shorts)

  // Side stripes on the shorts — thin trim-color bands hugging both
  // hips. Two bands instead of one so the player reads symmetrically
  // from the broadcast camera regardless of yaw.
  for (const sign of [-1, 1]) {
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, SHORTS_HEIGHT * 0.9, SHORTS_DEPTH * 0.85),
      trimMat,
    )
    stripe.position.set(sign * (SHORTS_WIDTH / 2 + 0.001), SHORTS_Y, 0)
    upperBody.add(stripe)
  }

  // Torso — capsule for a more natural torso silhouette than a box.
  // Tapered toward the waist (narrower at the bottom) so the
  // V-shaped athletic torso reads from above.
  const torso = new THREE.Mesh(
    new THREE.CapsuleGeometry(TORSO_WIDTH * 0.46, TORSO_HEIGHT * 0.6, 6, 16),
    jerseyMat,
  )
  torso.position.set(0, TORSO_Y, 0)
  torso.castShadow = true
  torso.receiveShadow = true
  // Wider at the chest, narrower at the waist, shallow front-to-back —
  // the broadcast-silhouette V the eye reads as "athlete".
  torso.scale.set(1.05, 1, 0.72)
  upperBody.add(torso)

  // Shoulder yoke — a thin horizontal capsule riding the shoulder
  // line. Makes the shoulders unambiguously the widest part of the
  // upper body so facing direction reads without overlays. Painted
  // in trim so a defensive shoulder line and an offensive shoulder
  // line are immediately distinguishable from the broadcast camera.
  const yoke = new THREE.Mesh(
    new THREE.CapsuleGeometry(YOKE_HEIGHT * 0.5, YOKE_WIDTH - YOKE_HEIGHT, 4, 10),
    trimMat,
  )
  yoke.position.set(0, YOKE_Y, 0)
  // Capsule's long axis is +y by default; rotate so it lies along x.
  yoke.rotation.z = Math.PI / 2
  yoke.scale.set(1, 1, YOKE_DEPTH / YOKE_HEIGHT)
  yoke.castShadow = true
  upperBody.add(yoke)

  // Jersey number panel — flat plane on the chest with the number
  // canvas texture. Sits a hair in front of the torso so depth-write
  // doesn't z-fight at glancing angles.
  const numberTex = makeJerseyNumberTexture(jerseyNumber, teamColor, trimColor)
  if (numberTex) {
    const numberMat = new THREE.MeshBasicMaterial({
      map: numberTex,
      toneMapped: false,
      transparent: false,
    })
    const numberPanel = new THREE.Mesh(
      new THREE.PlaneGeometry(TORSO_WIDTH * 0.85, TORSO_HEIGHT * 0.7),
      numberMat,
    )
    numberPanel.position.set(0, TORSO_Y, -TORSO_DEPTH * 0.36)
    numberPanel.rotation.y = Math.PI
    upperBody.add(numberPanel)

    // Mirror panel on the back so the number reads from any angle.
    const backPanel = new THREE.Mesh(
      new THREE.PlaneGeometry(TORSO_WIDTH * 0.85, TORSO_HEIGHT * 0.7),
      numberMat,
    )
    backPanel.position.set(0, TORSO_Y, TORSO_DEPTH * 0.36)
    upperBody.add(backPanel)
  }

  // Chest accent stripe across the top of the jersey.
  const chestStripe = new THREE.Mesh(
    new THREE.BoxGeometry(TORSO_WIDTH + 0.02, 0.1, TORSO_DEPTH * 0.78),
    trimMat,
  )
  chestStripe.position.set(0, TORSO_Y + TORSO_HEIGHT / 2 - 0.12, 0)
  upperBody.add(chestStripe)

  // Arms — capsule limbs posed by stance.
  //   idle    : relaxed, slight outward angle (current offense pose)
  //   defensive: both arms low and out to the sides, palms-out feel
  //   denial  : asymmetric raise — outside arm in the passing lane,
  //             inside arm low. Sells the BDW-01 "sitting on the
  //             pass" read at a glance.
  for (const ax of [-ARM_OFFSET, ARM_OFFSET]) {
    const arm = new THREE.Mesh(
      new THREE.CapsuleGeometry(ARM_RADIUS, ARM_LENGTH * 0.9, 4, 10),
      skinMat,
    )
    arm.position.set(ax, ARM_Y, 0)

    if (stance === 'denial') {
      // Outside arm raised toward the rim side, inside arm low.
      const raise = ax < 0 ? 1.0 : 1.1
      arm.rotation.z = ax < 0 ? 0.22 : -0.22
      arm.rotation.x = -raise
      arm.position.y = ARM_Y + 0.55
      arm.position.z = -0.45
    } else if (stance === 'defensive') {
      // Hands-out base defensive pose. Arms angled outward and a
      // touch forward so the silhouette reads "active hands" without
      // copying the asymmetric denial raise.
      arm.rotation.z = ax < 0 ? 0.55 : -0.55
      arm.rotation.x = -0.25
      arm.position.x = ax * 1.05
      arm.position.y = ARM_Y - 0.18
      arm.position.z = -0.18
    } else {
      // Idle / offensive — relaxed, hands-down with a small outward
      // angle so arms don't fuse to the torso.
      arm.rotation.z = ax < 0 ? 0.22 : -0.22
    }
    arm.castShadow = true
    upperBody.add(arm)
  }

  // Neck.
  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(NECK_RADIUS, NECK_RADIUS * 1.1, NECK_HEIGHT, 12),
    skinMat,
  )
  neck.position.set(0, NECK_Y, 0)
  upperBody.add(neck)

  // Head — slightly squashed sphere. Tessellation trimmed (24×20 →
  // 18×14) since the head is small in the frame; saves ~512 tris per
  // figure with no visible quality drop at any default camera mode.
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(HEAD_RADIUS, 18, 14),
    skinMat,
  )
  head.position.set(0, HEAD_Y, 0)
  head.scale.set(1, 1.05, 0.95)
  head.castShadow = true
  upperBody.add(head)

  // Hair cap — darker hemisphere on top of the head so heads don't
  // read as featureless pink balls. Same skin-toned hair for all
  // figures keeps the team color the dominant signal; the cap exists
  // only to sell "this is a person", not identity. Same tessellation
  // trim as the head.
  const hairMat = new THREE.MeshStandardMaterial({
    color: '#1B1208',
    roughness: 0.85,
    metalness: 0,
  })
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(HEAD_RADIUS * 1.02, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
    hairMat,
  )
  hair.position.set(0, HEAD_Y + 0.02, 0)
  hair.castShadow = true
  upperBody.add(hair)

  // Front-facing wedge — a small skin-tone nub on the head's front
  // (-z) so facing direction reads from any default camera angle.
  // Slightly larger than before so it survives medium camera distance.
  const facingMarker = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.13, 0.16),
    skinMat,
  )
  facingMarker.position.set(0, HEAD_Y - 0.05, -HEAD_RADIUS - 0.05)
  upperBody.add(facingMarker)

  // Soft contact shadow — anchors the figure to the hardwood so it
  // doesn't read as floating. Sits beneath every other floor mark.
  // Cheap: a single dark CircleGeometry with low opacity, drawn before
  // depth-write so the ring stack above paints cleanly on top.
  const contactShadow = new THREE.Mesh(
    new THREE.CircleGeometry(PLAYER_RADIUS + 0.55, 32),
    new THREE.MeshBasicMaterial({
      color: CONTACT_SHADOW_COLOR,
      toneMapped: false,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    }),
  )
  contactShadow.rotation.x = -Math.PI / 2
  contactShadow.position.y = 0.02
  contactShadow.renderOrder = -1
  figure.add(contactShadow)

  // ---- Phase 3: layered role / state indicators ---------------------
  // Indicators live on three named sub-groups parented to the figure
  // root so the indicator system from Section 7 (base / user /
  // possession) is structurally legible and so the teaching overlay
  // can find / hide them later without rebuilding geometry. Layer
  // visibility is the contract; geometry is unchanged from Phase 2.
  //
  //   base       — team identity ring + inner outline. Always on.
  //                Never animated.
  //   user       — user-only halo + soft halo on the floor and the
  //                "YOU" chevron above the head. Visible only on the
  //                user-controlled player. Never animated.
  //   possession — warm-gold ball-handler band. Visible only on the
  //                ball-handler. Never animated.
  //
  // Pulse is reserved for the focus / feedback layers, which live on
  // the teaching overlay (per imperativeTeachingOverlay) rather than
  // on the player figure.
  const baseLayer = new THREE.Group()
  baseLayer.name = 'indicator-layer-base'
  const userLayer = new THREE.Group()
  userLayer.name = 'indicator-layer-user'
  userLayer.visible = isUser
  const possessionLayer = new THREE.Group()
  possessionLayer.name = 'indicator-layer-possession'
  possessionLayer.visible = hasBall
  // The user chevron has to ride the upper body so it follows the
  // crouch translation. Its own named sub-group keeps it discoverable
  // alongside the other user-layer pieces.
  const userHeadLayer = new THREE.Group()
  userHeadLayer.name = 'indicator-layer-user-head'
  userHeadLayer.visible = isUser

  // Possession ring — a warm-gold outer band only present on the
  // initial ball-handler. Sits OUTSIDE the team ring so both can be
  // read at a glance without one occluding the other.
  if (hasBall) {
    const possession = new THREE.Mesh(
      new THREE.RingGeometry(PLAYER_RADIUS + 0.55, PLAYER_RADIUS + 0.85, 48),
      new THREE.MeshBasicMaterial({
        color: POSSESSION_RING_COLOR,
        toneMapped: false,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.95,
      }),
    )
    possession.rotation.x = -Math.PI / 2
    possession.position.y = 0.045
    possessionLayer.add(possession)
  }

  // Floor disc — keeps the existing team-colored selection ring used
  // upstream by the 2D motion overlay so the renderer reads the same.
  // The user's ring is wider and brighter, with a faint outer halo for
  // an additional "this is YOU" cue from broadcast distance.
  const ringInner = PLAYER_RADIUS + 0.2
  const ringOuter = isUser ? PLAYER_RADIUS + 0.7 : PLAYER_RADIUS + 0.55
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(ringInner, ringOuter, 64),
    new THREE.MeshBasicMaterial({
      color: teamColor,
      toneMapped: false,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: isUser ? 1 : 0.85,
    }),
  )
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.05
  baseLayer.add(ring)

  // Inner ring outline — a thin bright ring just inside the team
  // ring. Adds a clean edge so the ring reads as a lit disc, not as
  // a fuzzy color blob.
  const innerOutline = new THREE.Mesh(
    new THREE.RingGeometry(ringInner - 0.07, ringInner, 64),
    new THREE.MeshBasicMaterial({
      color: '#FFFFFF',
      toneMapped: false,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.5,
    }),
  )
  innerOutline.rotation.x = -Math.PI / 2
  innerOutline.position.y = 0.052
  baseLayer.add(innerOutline)

  if (isUser) {
    // Outer halo — a wider, brighter mint band around the team ring
    // so the user's player reads even when the camera is pulled out.
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(ringOuter + 0.05, ringOuter + 0.6, 64),
      new THREE.MeshBasicMaterial({
        color: USER_COLOR,
        toneMapped: false,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.4,
      }),
    )
    halo.rotation.x = -Math.PI / 2
    halo.position.y = 0.046
    userLayer.add(halo)

    // Soft outer fade — a very faint, wide ring that creates a
    // "spotlight" feel under the user without being a hard edge.
    const softHalo = new THREE.Mesh(
      new THREE.RingGeometry(ringOuter + 0.65, ringOuter + 1.4, 64),
      new THREE.MeshBasicMaterial({
        color: USER_COLOR,
        toneMapped: false,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.16,
      }),
    )
    softHalo.rotation.x = -Math.PI / 2
    softHalo.position.y = 0.044
    userLayer.add(softHalo)

    // Floating "YOU" chevron — a small downward-pointing cone in mint
    // that hovers above the head. Parented to upperBody so it follows
    // the head when the user is in a defensive / denial crouch.
    const chevron = new THREE.Mesh(
      new THREE.ConeGeometry(0.42, 0.85, 24),
      new THREE.MeshBasicMaterial({
        color: USER_COLOR,
        toneMapped: false,
      }),
    )
    chevron.rotation.x = Math.PI
    chevron.position.set(0, HEAD_Y + HEAD_RADIUS + 1.1, 0)
    userHeadLayer.add(chevron)

    // Chevron outline — thin dark cone behind the mint cone so the
    // floating marker reads against the bright gym walls without
    // fading out.
    const chevronOutline = new THREE.Mesh(
      new THREE.ConeGeometry(0.5, 1.0, 24),
      new THREE.MeshBasicMaterial({
        color: '#062118',
        toneMapped: false,
        transparent: true,
        opacity: 0.7,
      }),
    )
    chevronOutline.rotation.x = Math.PI
    chevronOutline.position.set(0, HEAD_Y + HEAD_RADIUS + 1.1, 0)
    chevronOutline.renderOrder = -1
    userHeadLayer.add(chevronOutline)
  }

  // Attach indicator layers in z-order: base under user halo under
  // possession band so the warm-gold ball-handler ring is never
  // hidden by the team ring beneath it.
  figure.add(baseLayer)
  figure.add(userLayer)
  figure.add(possessionLayer)
  upperBody.add(userHeadLayer)

  // Public, named handle to the role-state layers so future code (e.g.
  // ball-handoff updates that flip possession after the scene mounts)
  // can `getPlayerLayers(figure).possession.visible = true` without
  // rebuilding any geometry. Stays `any`-typed via userData rather
  // than threading a new field through every player return type.
  const indicatorLayers: PlayerIndicatorLayers = {
    base: baseLayer,
    user: userLayer,
    userHead: userHeadLayer,
    possession: possessionLayer,
  }
  ;(figure.userData as Record<string, unknown>).indicatorLayers = indicatorLayers

  return figure
}

/**
 * Phase 3 — named handles to the role/state indicator layers attached
 * to a player figure. Caller-owned: the figure itself owns the
 * lifetime; this struct is a non-owning view into its sub-groups.
 *
 * Layer policy (per Section 7):
 *   base       — team identity, always on, never animated
 *   user       — user-only floor halos, visible iff isUser
 *   userHead   — user-only "YOU" chevron, parented to upper body so it
 *                follows the defensive / denial crouch translation
 *   possession — ball-handler ring, visible iff this player has the
 *                ball at scene-build time
 *
 * Pulse animation lives in the teaching overlay's focus / feedback
 * marks layer, not on these groups; do not animate them.
 */
export interface PlayerIndicatorLayers {
  base: THREE.Group
  user: THREE.Group
  userHead: THREE.Group
  possession: THREE.Group
}

/**
 * Phase 3 — returns the named indicator layer handles attached to a
 * player figure built by `buildPlayerFigure`, or `null` if the object
 * was not built by this module. Lookup is O(1) (userData read).
 */
export function getPlayerIndicatorLayers(
  figure: THREE.Object3D,
): PlayerIndicatorLayers | null {
  const layers = (figure.userData as Record<string, unknown>).indicatorLayers
  if (!layers || typeof layers !== 'object') return null
  const candidate = layers as Partial<PlayerIndicatorLayers>
  if (
    !candidate.base ||
    !candidate.user ||
    !candidate.userHead ||
    !candidate.possession
  ) {
    return null
  }
  return candidate as PlayerIndicatorLayers
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

  const surfaceTex = generateBasketballSurfaceTexture(384)

  const body = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_RADIUS, 36, 36),
    new THREE.MeshStandardMaterial({
      color: '#FFFFFF',
      map: surfaceTex,
      roughness: 0.72,
      metalness: 0,
    }),
  )
  body.castShadow = true
  body.receiveShadow = true
  group.add(body)

  // Soft contact shadow under the ball — a small dark disc that
  // grounds the ball to the floor without depending on the directional
  // light's shadow map. Cheap and always reads correctly.
  const ballShadow = new THREE.Mesh(
    new THREE.CircleGeometry(BALL_RADIUS * 1.2, 24),
    new THREE.MeshBasicMaterial({
      color: '#000000',
      toneMapped: false,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
    }),
  )
  ballShadow.rotation.x = -Math.PI / 2
  ballShadow.position.y = -BALL_RADIUS - 0.18
  ballShadow.renderOrder = -1
  group.add(ballShadow)

  // Subtle bright highlight halo — a faint orange ring around the
  // ball makes it pop from the broadcast camera so the eye finds the
  // ball even when it sits next to a player.
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_RADIUS * 1.45, 16, 16),
    new THREE.MeshBasicMaterial({
      color: '#FFB070',
      toneMapped: false,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
    }),
  )
  group.add(halo)

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
