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

/**
 * Basketball marker. A simple orange sphere with a faint vertical halo so it
 * is unmistakable on a busy floor.
 */
export function BallMarker3D({ position, idleBounce = true }: BallMarker3DProps) {
  const groupRef = useRef<THREE.Group | null>(null)
  const baseY = position[1]
  const { reduced } = useSceneMotion()

  useFrame((state) => {
    if (reduced || !idleBounce || !groupRef.current) return
    const t = state.clock.getElapsedTime()
    groupRef.current.position.y = baseY + Math.abs(Math.sin(t * 2.6)) * 0.18
  })

  return (
    <group ref={groupRef} position={position}>
      {/* Halo so the ball reads from a distance. */}
      <mesh position={[0, 0.9, 0]}>
        <sphereGeometry args={[1.3, 20, 20]} />
        <meshBasicMaterial color="#FF8A3D" transparent opacity={0.22} toneMapped={false} />
      </mesh>
      {/* Ball — oversized for mobile camera distance and unlit so it pops. */}
      <mesh position={[0, 0.9, 0]}>
        <sphereGeometry args={[0.85, 28, 28]} />
        <meshBasicMaterial color="#FF8A3D" toneMapped={false} />
      </mesh>
      {/* Floor shadow — lifted so it doesn't z-fight the floor decals. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.18, 0]}>
        <circleGeometry args={[0.95, 24]} />
        <meshBasicMaterial color="#000" transparent opacity={0.35} toneMapped={false} />
      </mesh>
    </group>
  )
}
