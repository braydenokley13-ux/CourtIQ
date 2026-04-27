import * as THREE from 'three'
import { COURT } from '@/lib/scenario3d/coords'
import { disposeObject3D } from './dispose'
import { addArcLineSegments, buildTubeLine } from './primitives'
import type { BuilderResult } from './types'

const FLOOR_COLOR = '#C2823F'
const LINE_COLOR = '#FFFFFF'
const PAINT_COLOR = '#0050B4'

const FLOOR_LIFT = 0
const LINE_LIFT = 0.05
const LINE_RADIUS = 0.18
const ARC_SEGMENT_RADIUS = 0.14

/**
 * Builds the court surface: floor plane, painted key, court outline,
 * paint lines, three-point arc, and free-throw arc. Packets 3 and 4
 * will upgrade hardwood/markings inside this builder without touching
 * the rest of the scene graph.
 */
export function buildCourt(): BuilderResult {
  const group = new THREE.Group()
  group.name = 'court'

  const halfW = COURT.halfWidthFt
  const halfL = COURT.halfLengthFt
  const courtCenterZ = halfL / 2 - 0.5

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(halfW * 2, halfL),
    new THREE.MeshBasicMaterial({ color: FLOOR_COLOR, toneMapped: false }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.position.set(0, FLOOR_LIFT, courtCenterZ)
  group.add(floor)

  const paint = new THREE.Mesh(
    new THREE.PlaneGeometry(COURT.paintWidthFt, COURT.freeThrowDistFt),
    new THREE.MeshBasicMaterial({ color: PAINT_COLOR, toneMapped: false }),
  )
  paint.rotation.x = -Math.PI / 2
  paint.position.set(0, FLOOR_LIFT + 0.02, COURT.freeThrowDistFt / 2)
  group.add(paint)

  const halfPaintW = COURT.paintWidthFt / 2
  const outlineSegments: Array<[THREE.Vector3, THREE.Vector3]> = [
    [new THREE.Vector3(-halfW, LINE_LIFT, 0), new THREE.Vector3(halfW, LINE_LIFT, 0)],
    [new THREE.Vector3(halfW, LINE_LIFT, 0), new THREE.Vector3(halfW, LINE_LIFT, halfL)],
    [new THREE.Vector3(halfW, LINE_LIFT, halfL), new THREE.Vector3(-halfW, LINE_LIFT, halfL)],
    [new THREE.Vector3(-halfW, LINE_LIFT, halfL), new THREE.Vector3(-halfW, LINE_LIFT, 0)],
    [
      new THREE.Vector3(-halfPaintW, LINE_LIFT, 0),
      new THREE.Vector3(-halfPaintW, LINE_LIFT, COURT.freeThrowDistFt),
    ],
    [
      new THREE.Vector3(halfPaintW, LINE_LIFT, 0),
      new THREE.Vector3(halfPaintW, LINE_LIFT, COURT.freeThrowDistFt),
    ],
    [
      new THREE.Vector3(-halfPaintW, LINE_LIFT, COURT.freeThrowDistFt),
      new THREE.Vector3(halfPaintW, LINE_LIFT, COURT.freeThrowDistFt),
    ],
  ]
  for (const [start, end] of outlineSegments) {
    group.add(buildTubeLine(start, end, LINE_RADIUS, LINE_COLOR))
  }

  // Three-point arc (around the rim) and free-throw arc.
  addArcLineSegments(
    group,
    COURT.threePointRadiusFt,
    Math.PI,
    LINE_LIFT,
    0,
    LINE_COLOR,
    ARC_SEGMENT_RADIUS,
  )
  addArcLineSegments(
    group,
    6,
    Math.PI,
    LINE_LIFT,
    COURT.freeThrowDistFt,
    LINE_COLOR,
    ARC_SEGMENT_RADIUS,
  )

  return { object: group, dispose: () => disposeObject3D(group) }
}
