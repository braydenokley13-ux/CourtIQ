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
import type { Scene3D, SceneTeam } from '@/lib/scenario3d/scene'

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
 * Builds the full basketball scene as a single THREE.Group. Caller is
 * responsible for adding/removing it from the scene graph.
 */
export function buildBasketballGroup(scene: Scene3D): THREE.Group {
  const root = new THREE.Group()
  root.name = 'imperative-basketball'

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
  ball.position.set(ballX, BALL_RADIUS + 0.2, ballZ)
  root.add(ball)

  return root
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
