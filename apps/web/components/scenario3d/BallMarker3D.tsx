'use client'

import { useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useSceneMotion } from './SceneMotionContext'

interface BallMarker3DProps {
  position: [number, number, number]
  /** Subtle bounce animation while idle. */
  idleBounce?: boolean
}

const BALL_COLOR = '#FFB070'
const BALL_DEEP = '#C04E0E'
const BALL_RADIUS = 0.85
const BALL_BASE_Y = BALL_RADIUS + 0.3

/**
 * Basketball marker. Bright orange sphere with a soft halo, two seam
 * lines and a floor shadow so the ball never gets visually lost on a
 * busy court. Bounces gently while idle. Unlit basic materials only.
 */
export function BallMarker3D({ position, idleBounce = true }: BallMarker3DProps) {
  const groupRef = useRef<THREE.Group | null>(null)
  const shadowRef = useRef<THREE.Mesh | null>(null)
  const { reduced } = useSceneMotion()

  useFrame((state) => {
    if (reduced || !idleBounce || !groupRef.current) return
    const t = state.clock.getElapsedTime()
    const lift = Math.abs(Math.sin(t * 2.6)) * 0.45
    groupRef.current.position.y = BALL_BASE_Y + lift
    if (shadowRef.current) {
      const material = shadowRef.current.material as THREE.MeshBasicMaterial | undefined
      if (material) material.opacity = 0.5 - lift * 0.4
      const s = 1 - lift * 0.4
      shadowRef.current.scale.set(s, s, 1)
    }
  })

  return (
    <group position={position}>
      {/* Floor shadow */}
      <mesh ref={shadowRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.13, 0]}>
        <circleGeometry args={[BALL_RADIUS * 1.1, 24]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.5} toneMapped={false} />
      </mesh>

      <group ref={groupRef} position={[0, BALL_BASE_Y, 0]}>
        {/* Halo so the ball reads from broadcast distance. */}
        <mesh>
          <sphereGeometry args={[BALL_RADIUS * 1.7, 20, 20]} />
          <meshBasicMaterial color={BALL_COLOR} transparent opacity={0.18} toneMapped={false} />
        </mesh>
        {/* Ball */}
        <mesh>
          <sphereGeometry args={[BALL_RADIUS, 32, 32]} />
          <meshBasicMaterial color={BALL_COLOR} toneMapped={false} />
        </mesh>
        {/* Seam line A (horizontal) */}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[BALL_RADIUS * 1.001, 0.025, 8, 36]} />
          <meshBasicMaterial color={BALL_DEEP} toneMapped={false} />
        </mesh>
        {/* Seam line B (vertical) */}
        <mesh>
          <torusGeometry args={[BALL_RADIUS * 1.001, 0.025, 8, 36]} />
          <meshBasicMaterial color={BALL_DEEP} toneMapped={false} />
        </mesh>
      </group>
    </group>
  )
}
