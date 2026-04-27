import * as THREE from 'three'
import { disposeObject3D } from './dispose'
import type { BuilderResult } from './types'

/**
 * Lighting rig for the imperative scene. Bright ambient + two directional
 * fills so MeshStandardMaterial surfaces (backboard, pole, players, ball)
 * are well-exposed; MeshBasicMaterial surfaces with `toneMapped: false`
 * are unaffected. Packet 5 will add shadow-casting key lights.
 */
export function buildLighting(): BuilderResult {
  const group = new THREE.Group()
  group.name = 'lighting'

  group.add(new THREE.AmbientLight(0xffffff, 1.4))

  const key = new THREE.DirectionalLight(0xffffff, 1.1)
  key.position.set(30, 60, 30)
  group.add(key)

  const fill = new THREE.DirectionalLight(0xcfe2ff, 0.6)
  fill.position.set(-20, 40, 10)
  group.add(fill)

  return { object: group, dispose: () => disposeObject3D(group) }
}
