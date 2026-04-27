/* =============================================================================
 * RENDERER SAFETY BASELINE — imperative-only contract.
 *
 * This module is the load-bearing safety net for the entire scenario
 * renderer. Every critical visual (court, paint, lines, hoop, players,
 * ball, lighting) is constructed here with vanilla THREE primitives and
 * mounted by `Scenario3DCanvas` directly into THREE.Scene — bypassing
 * the R3F reconciler entirely.
 *
 * Why imperative-only:
 *   - R3F v9 + React 19 + Next 15 silently drops <Canvas> children in
 *     production (THREE.Scene.children stays at 0).
 *   - useFrame subscribers are not consistently invoked.
 *   - The reconciler cannot be trusted to mount, update, or animate
 *     scene geometry in this stack.
 *
 * Hard rules for every future packet (see docs/courtiq-realistic-renderer-plan.md):
 *   - All visual upgrades MUST be added to a builder in this file (or a
 *     sibling builder module under scene/builders/) and called from
 *     `buildBasketballGroup`. Never declare critical visuals as JSX.
 *   - NEVER use useFrame for playback, animation, camera, or any
 *     per-frame logic. Animation runs from the parent-level
 *     requestAnimationFrame loop in `Scenario3DCanvas.tsx`.
 *   - Every geometry/material/texture allocated here must be disposed
 *     in `disposeGroup` (or its callers) on unmount. Imperative scene
 *     mutation makes GPU leaks easy.
 *   - Builders must remain side-effect free apart from constructing and
 *     returning THREE objects — no React, no global state, no scene-graph
 *     mutation outside the returned group.
 * =============================================================================
 */

import * as THREE from 'three'
import { COURT } from '@/lib/scenario3d/coords'
import type { Scene3D } from '@/lib/scenario3d/scene'

const FLOOR_COLOR = '#C2823F'
const LINE_COLOR = '#FFFFFF'
const PAINT_COLOR = '#0050B4'
const BALL_COLOR = '#FF8A3D'
const RIM_COLOR = '#FF8A3D'
const BACKBOARD_COLOR = '#FBFBFD'
const POLE_COLOR = '#2A3344'
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

  // Hoop.
  const backboard = new THREE.Mesh(
    new THREE.BoxGeometry(6, 3.6, 0.18),
    new THREE.MeshStandardMaterial({ color: BACKBOARD_COLOR }),
  )
  backboard.position.set(0, COURT.rimHeightFt + 1.4, -1.2)
  root.add(backboard)

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.22, COURT.rimHeightFt + 2.4, 12),
    new THREE.MeshStandardMaterial({ color: POLE_COLOR }),
  )
  pole.position.set(0, COURT.rimHeightFt / 2 + 1.2, -2.4)
  root.add(pole)

  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.85, 0.1, 12, 36),
    new THREE.MeshBasicMaterial({ color: RIM_COLOR, toneMapped: false }),
  )
  rim.position.set(0, COURT.rimHeightFt, 0)
  rim.rotation.x = Math.PI / 2
  root.add(rim)

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
