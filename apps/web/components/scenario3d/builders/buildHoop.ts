import * as THREE from 'three'
import { COURT } from '@/lib/scenario3d/coords'
import { disposeObject3D } from './dispose'
import type { BuilderResult } from './types'

const RIM_COLOR = '#FF8A3D'
const BACKBOARD_COLOR = '#FBFBFD'
const POLE_COLOR = '#2A3344'

/**
 * Builds the hoop assembly: backboard, support pole, and rim. Packet 6
 * will replace this with glass backboard, padded stanchion, and a hanging
 * net mesh; the surrounding builder structure stays unchanged.
 */
export function buildHoop(): BuilderResult {
  const group = new THREE.Group()
  group.name = 'hoop'

  const backboard = new THREE.Mesh(
    new THREE.BoxGeometry(6, 3.6, 0.18),
    new THREE.MeshStandardMaterial({ color: BACKBOARD_COLOR }),
  )
  backboard.position.set(0, COURT.rimHeightFt + 1.4, -1.2)
  group.add(backboard)

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.22, COURT.rimHeightFt + 2.4, 12),
    new THREE.MeshStandardMaterial({ color: POLE_COLOR }),
  )
  pole.position.set(0, COURT.rimHeightFt / 2 + 1.2, -2.4)
  group.add(pole)

  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.85, 0.1, 12, 36),
    new THREE.MeshBasicMaterial({ color: RIM_COLOR, toneMapped: false }),
  )
  rim.position.set(0, COURT.rimHeightFt, 0)
  rim.rotation.x = Math.PI / 2
  group.add(rim)

  return { object: group, dispose: () => disposeObject3D(group) }
}
