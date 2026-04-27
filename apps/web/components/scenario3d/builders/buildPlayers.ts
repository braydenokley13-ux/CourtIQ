import * as THREE from 'three'
import type { Scene3D } from '@/lib/scenario3d/scene'
import { disposeObject3D } from './dispose'
import type { BuilderResult } from './types'

const OFFENSE_COLOR = '#5DB4FF'
const DEFENSE_COLOR = '#FF5C72'
const USER_COLOR = '#3BFF9D'
const HEAD_COLOR = '#F4D9BC'

export const PLAYER_HEIGHT = 6
export const PLAYER_RADIUS = 1.2
export const PLAYER_LIFT = 0.05

/**
 * Builds one cylinder-and-sphere stand-in per scenario player. Packet 8
 * will replace this with proper humanoid geometry; until then, visibility
 * is the only goal. Each player gets a colored ground ring so role
 * (offense / defense / user) is readable from any camera.
 */
export function buildPlayers(scene: Scene3D): BuilderResult {
  const group = new THREE.Group()
  group.name = 'players'

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
      new THREE.MeshStandardMaterial({ color: HEAD_COLOR }),
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

    group.add(playerGroup)
  }

  return { object: group, dispose: () => disposeObject3D(group) }
}
