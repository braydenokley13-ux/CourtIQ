'use client'

import { useMemo } from 'react'
import { Line } from '@react-three/drei'
import { COURT } from '@/lib/scenario3d/coords'

// Hardwood-like palette: distinctly lighter than the page background
// (#101521) so the court is undeniably visible. The earlier near-black
// floor was the root cause of the "blank dark box" rendering bug. We use
// meshBasicMaterial for the floor surfaces so they render at full
// intensity regardless of lighting setup or tone mapping.
const FLOOR_OUTER_COLOR = '#222A3A' // dark slate frame around the court
const FLOOR_INNER_COLOR = '#C97C3F' // warm hardwood
const FLOOR_INNER_EDGE_COLOR = '#5A361F' // dark wood ring at the boundary
const LINE_COLOR = '#FFFFFF'
const PAINT_COLOR = '#3F8463' // warm green paint, clearly distinct from wood
const RIM_COLOR = '#FF8A3D'
const BACKBOARD_COLOR = '#FBFBFD'
const POLE_COLOR = '#3A4254'

interface Court3DProps {
  /** Lift floor slightly above origin to reduce z-fighting with line decals. */
  floorY?: number
}

/**
 * Half-court 3D model. Built from primitive meshes so we never need a GLTF
 * download. All lines are drawn through drei's <Line>.
 */
export function Court3D({ floorY = 0 }: Court3DProps) {
  const halfW = COURT.halfWidthFt
  const halfL = COURT.halfLengthFt

  const arcPoints = useMemo(() => buildArc(COURT.threePointRadiusFt, Math.PI), [])
  const ftArcPoints = useMemo(() => buildArc(6, Math.PI), [])

  const outline = useMemo<[number, number, number][]>(
    () => [
      [-halfW, 0.01, 0],
      [halfW, 0.01, 0],
      [halfW, 0.01, halfL],
      [-halfW, 0.01, halfL],
      [-halfW, 0.01, 0],
    ],
    [halfW, halfL],
  )

  const paintOutline = useMemo<[number, number, number][]>(() => {
    const px = COURT.paintWidthFt / 2
    const pz = COURT.paintLengthFt - 4
    return [
      [-px, 0.012, 0],
      [-px, 0.012, pz],
      [px, 0.012, pz],
      [px, 0.012, 0],
    ]
  }, [])

  return (
    <group position={[0, floorY, 0]}>
      {/* Outer dark frame — extends past the play surface for context.
          Centered along the half-court so it covers from z≈-4 to z≈51. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, halfL / 2 - 0.5]}>
        <planeGeometry args={[halfW * 2 + 12, halfL + 10]} />
        <meshBasicMaterial color={FLOOR_OUTER_COLOR} />
      </mesh>

      {/* Wood-tone outer ring (slightly recessed, helps the inner court pop). */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.0008, halfL / 2 - 0.5]}>
        <planeGeometry args={[halfW * 2 + 4, halfL + 4]} />
        <meshBasicMaterial color={FLOOR_INNER_EDGE_COLOR} />
      </mesh>

      {/* Inner play surface — warm hardwood. Unlit so it always reads. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, halfL / 2 - 0.5]}>
        <planeGeometry args={[halfW * 2, halfL]} />
        <meshBasicMaterial color={FLOOR_INNER_COLOR} />
      </mesh>

      {/* Paint */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.005, (COURT.paintLengthFt - 4) / 2]}
      >
        <planeGeometry args={[COURT.paintWidthFt, COURT.paintLengthFt - 4]} />
        <meshBasicMaterial color={PAINT_COLOR} />
      </mesh>

      {/* Court outline */}
      <Line points={outline} color={LINE_COLOR} lineWidth={3} transparent opacity={1} />

      {/* Paint outline */}
      <Line points={paintOutline} color={LINE_COLOR} lineWidth={3} transparent opacity={1} />

      {/* Three-point arc */}
      <group rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.013, 0]}>
        <Line points={arcPoints} color={LINE_COLOR} lineWidth={3} transparent opacity={1} />
      </group>

      {/* Three-point straight corner lines */}
      <CornerThree halfW={halfW} />

      {/* Free-throw arc */}
      <group rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.014, COURT.freeThrowDistFt]}>
        <Line points={ftArcPoints} color={LINE_COLOR} lineWidth={2.5} transparent opacity={0.95} />
      </group>

      {/* Backboard + rim */}
      <Hoop />
    </group>
  )
}

function CornerThree({ halfW }: { halfW: number }) {
  const cornerZ = 14
  const xCorner = halfW - 3
  return (
    <>
      <Line
        points={[
          [-xCorner, 0.013, 0],
          [-xCorner, 0.013, cornerZ],
        ]}
        color={LINE_COLOR}
        lineWidth={3}
        transparent
        opacity={1}
      />
      <Line
        points={[
          [xCorner, 0.013, 0],
          [xCorner, 0.013, cornerZ],
        ]}
        color={LINE_COLOR}
        lineWidth={3}
        transparent
        opacity={1}
      />
    </>
  )
}

function Hoop() {
  return (
    <group>
      {/* Backboard */}
      <mesh position={[0, COURT.rimHeightFt + 1, -1.2]}>
        <boxGeometry args={[6, 3.5, 0.18]} />
        <meshBasicMaterial color={BACKBOARD_COLOR} />
      </mesh>
      {/* Backboard target square */}
      <mesh position={[0, COURT.rimHeightFt + 0.6, -1.1]}>
        <boxGeometry args={[2, 1.4, 0.02]} />
        <meshBasicMaterial color={RIM_COLOR} transparent opacity={0.55} />
      </mesh>
      {/* Pole */}
      <mesh position={[0, COURT.rimHeightFt / 2, -2]}>
        <cylinderGeometry args={[0.22, 0.22, COURT.rimHeightFt, 12]} />
        <meshBasicMaterial color={POLE_COLOR} />
      </mesh>
      {/* Rim */}
      <mesh position={[0, COURT.rimHeightFt, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.75, 0.07, 10, 32]} />
        <meshBasicMaterial color={RIM_COLOR} />
      </mesh>
      {/* Rim glow on the floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[3, 32]} />
        <meshBasicMaterial color={RIM_COLOR} transparent opacity={0.22} />
      </mesh>
    </group>
  )
}

function buildArc(radius: number, sweep: number): [number, number, number][] {
  const segments = 96
  const pts: [number, number, number][] = []
  const start = -sweep / 2
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const angle = start + t * sweep
    pts.push([Math.sin(angle) * radius, Math.cos(angle) * radius, 0])
  }
  return pts
}
