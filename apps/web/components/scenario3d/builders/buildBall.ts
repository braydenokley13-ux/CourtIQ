import * as THREE from 'three'
import type { Scene3D } from '@/lib/scenario3d/scene'
import { disposeObject3D } from './dispose'
import type { BuilderResult } from './types'

const BALL_COLOR = '#FF8A3D'
export const BALL_RADIUS = 0.8

/**
 * Places the basketball at the holder's position when one is named in
 * the scenario, otherwise at the explicit ball coordinates. Packet 9
 * replaces the plain sphere with a textured/seamed basketball; the
 * positioning logic here stays untouched (it is part of the scenario
 * data flow).
 */
export function buildBall(scene: Scene3D): BuilderResult {
  const group = new THREE.Group()
  group.name = 'ball'

  const holder = scene.ball.holderId
    ? scene.players.find((p) => p.id === scene.ball.holderId)
    : scene.players.find((p) => p.hasBall)
  const ballX = holder?.start.x ?? scene.ball.start.x
  const ballZ = holder?.start.z ?? scene.ball.start.z

  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_RADIUS, 24, 24),
    new THREE.MeshStandardMaterial({ color: BALL_COLOR }),
  )
  ball.position.set(ballX, BALL_RADIUS + 0.2, ballZ)
  ball.castShadow = true
  ball.receiveShadow = true
  group.add(ball)

  return { object: group, dispose: () => disposeObject3D(group) }
}
