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
import type { Scene3D } from '@/lib/scenario3d/scene'

const FLOOR_COLOR = '#C2823F'
const LINE_COLOR = '#FFFFFF'
const PAINT_COLOR = '#0050B4'
const BALL_COLOR = '#FF8A3D'
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

const PLAYER_HEIGHT = 6
const PLAYER_RADIUS = 1.2
const BALL_RADIUS = 0.8
const FLOOR_LIFT = 0
const LINE_LIFT = 0.05
const PLAYER_LIFT = 0.05

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

  // Players.
  for (const p of scene.players) {
    const color = p.isUser
      ? USER_COLOR
      : p.team === 'offense'
        ? OFFENSE_COLOR
        : DEFENSE_COLOR

    const playerGroup = new THREE.Group()
    playerGroup.position.set(p.start.x, PLAYER_LIFT, p.start.z)

    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(PLAYER_RADIUS, PLAYER_RADIUS, PLAYER_HEIGHT, 24),
      new THREE.MeshStandardMaterial({ color }),
    )
    body.position.y = PLAYER_HEIGHT / 2
    playerGroup.add(body)

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.7, 24, 24),
      new THREE.MeshStandardMaterial({ color: '#F4D9BC' }),
    )
    head.position.y = PLAYER_HEIGHT + 0.7
    playerGroup.add(head)

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(PLAYER_RADIUS + 0.2, PLAYER_RADIUS + 0.5, 32),
      new THREE.MeshBasicMaterial({
        color,
        toneMapped: false,
        side: THREE.DoubleSide,
      }),
    )
    ring.rotation.x = -Math.PI / 2
    ring.position.y = 0.04
    playerGroup.add(ring)

    root.add(playerGroup)
  }

  // Ball.
  const ballHolder = scene.ball.holderId
    ? scene.players.find((p) => p.id === scene.ball.holderId)
    : scene.players.find((p) => p.hasBall)
  const ballX = ballHolder?.start.x ?? scene.ball.start.x
  const ballZ = ballHolder?.start.z ?? scene.ball.start.z

  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_RADIUS, 24, 24),
    new THREE.MeshStandardMaterial({ color: BALL_COLOR }),
  )
  ball.position.set(ballX, BALL_RADIUS + 0.2, ballZ)
  root.add(ball)

  return root
}

/**
 * Disposes every geometry/material under the given object and its
 * descendants. Call before removing an imperative group from the scene
 * to prevent GPU memory leaks.
 */
export function disposeGroup(group: THREE.Object3D): void {
  group.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (mesh.geometry) mesh.geometry.dispose()
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined
    if (Array.isArray(mat)) {
      for (const m of mat) m.dispose()
    } else if (mat) {
      mat.dispose()
    }
  })
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
