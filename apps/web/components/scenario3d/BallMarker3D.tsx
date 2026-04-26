'use client'

import { useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'

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

  useFrame((state) => {
    if (!idleBounce || !groupRef.current) return
    const t = state.clock.getElapsedTime()
    groupRef.current.position.y = baseY + Math.abs(Math.sin(t * 2.6)) * 0.18
  })

  return (
    <group ref={groupRef} position={position}>
      {/* Halo to keep the ball visible from a distance */}
      <mesh position={[0, 0.4, 0]}>
        <sphereGeometry args={[0.55, 16, 16]} />
        <meshBasicMaterial color="#FF8A3D" transparent opacity={0.18} />
      </mesh>
      {/* Ball */}
      <mesh position={[0, 0.5, 0]} castShadow>
        <sphereGeometry args={[0.4, 24, 24]} />
        <meshStandardMaterial
          color="#FF8A3D"
          roughness={0.45}
          metalness={0.1}
          emissive="#3A1A06"
          emissiveIntensity={0.2}
        />
      </mesh>
      {/* Floor shadow */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[0.45, 24]} />
        <meshBasicMaterial color="#000" transparent opacity={0.35} />
      </mesh>
    </group>
  )
}
