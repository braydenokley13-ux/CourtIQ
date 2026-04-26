'use client'

import { useMemo } from 'react'
import * as THREE from 'three'

/**
 * Dependency-free debug scene — used by ?debug3d=1 to prove the renderer,
 * camera, materials, and frame loop are wired correctly. Uses ONLY:
 *   - meshBasicMaterial (unlit, no lights required)
 *   - planeGeometry / boxGeometry / sphereGeometry / BufferGeometry lines
 *   - hard-coded positions at the origin
 *   - no Suspense, no async loaders, no textures, no fonts, no models
 *
 * If this paints in production, the renderer is healthy and any
 * non-debug scene rendering issue is in Court3D / ScenarioScene3D /
 * scenario data, not in the canvas pipeline.
 */
export function Debug3DScene() {
  const arrow = useMemo(() => buildLine([
    [0, 0.4, 0],
    [-6, 0.4, -4],
  ], '#FFFFFF'), [])

  return (
    <group>
      {/* Bright green floor at the origin */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[40, 30]} />
        <meshBasicMaterial color="#3BFF8F" />
      </mesh>

      {/* White outline around the floor */}
      <FloorOutline />

      {/* Red "YOU" cube */}
      <mesh position={[0, 1.5, 0]}>
        <boxGeometry args={[2, 3, 2]} />
        <meshBasicMaterial color="#FF4D6D" />
      </mesh>

      {/* Blue teammate */}
      <mesh position={[-6, 1.5, -4]}>
        <boxGeometry args={[2, 3, 2]} />
        <meshBasicMaterial color="#3B8FFF" />
      </mesh>

      {/* Yellow defender */}
      <mesh position={[6, 1.5, -4]}>
        <boxGeometry args={[2, 3, 2]} />
        <meshBasicMaterial color="#FFD60A" />
      </mesh>

      {/* Orange ball */}
      <mesh position={[0, 1.2, 5]}>
        <sphereGeometry args={[1, 24, 24]} />
        <meshBasicMaterial color="#FF8A3D" />
      </mesh>

      {/* Single white arrow line from "YOU" toward the teammate */}
      <primitive object={arrow} />

      {/* Origin marker — small pillar so we know the camera is looking at (0,0,0) */}
      <mesh position={[0, 0.01, 0]}>
        <cylinderGeometry args={[0.5, 0.5, 0.02, 24]} />
        <meshBasicMaterial color="#FFFFFF" />
      </mesh>
    </group>
  )
}

function FloorOutline() {
  const line = useMemo(
    () =>
      buildLine(
        [
          [-20, 0.05, -15],
          [20, 0.05, -15],
          [20, 0.05, 15],
          [-20, 0.05, 15],
          [-20, 0.05, -15],
        ],
        '#FFFFFF',
      ),
    [],
  )
  return <primitive object={line} />
}

function buildLine(points: [number, number, number][], color: string): THREE.Line {
  const geometry = new THREE.BufferGeometry().setFromPoints(
    points.map((p) => new THREE.Vector3(p[0], p[1], p[2])),
  )
  const material = new THREE.LineBasicMaterial({ color, toneMapped: false })
  return new THREE.Line(geometry, material)
}
