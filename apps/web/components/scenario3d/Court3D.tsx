'use client'

import { useMemo } from 'react'
import { Line } from '@react-three/drei'
import { COURT } from '@/lib/scenario3d/coords'

const FLOOR_COLOR = '#0E1117'
const FLOOR_INNER_COLOR = '#161B24'
const LINE_COLOR = '#E6ECF5'
const PAINT_COLOR = '#162B22'
const RIM_COLOR = '#FF8A3D'

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
      {/* Court floor (extends past lines for visual padding) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[halfW * 2 + 6, halfL + 6]} />
        <meshStandardMaterial color={FLOOR_COLOR} roughness={0.95} metalness={0.05} />
      </mesh>

      {/* Inner play surface */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, halfL / 2 - 0.5]}>
        <planeGeometry args={[halfW * 2, halfL]} />
        <meshStandardMaterial color={FLOOR_INNER_COLOR} roughness={1} metalness={0} />
      </mesh>

      {/* Paint */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.005, (COURT.paintLengthFt - 4) / 2]}
      >
        <planeGeometry args={[COURT.paintWidthFt, COURT.paintLengthFt - 4]} />
        <meshStandardMaterial color={PAINT_COLOR} roughness={1} metalness={0} />
      </mesh>

      {/* Court outline */}
      <Line points={outline} color={LINE_COLOR} lineWidth={2} transparent opacity={0.9} />

      {/* Paint outline */}
      <Line points={paintOutline} color={LINE_COLOR} lineWidth={2} transparent opacity={0.9} />

      {/* Three-point arc */}
      <group rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.013, 0]}>
        <Line points={arcPoints} color={LINE_COLOR} lineWidth={2} transparent opacity={0.85} />
      </group>

      {/* Three-point straight corner lines */}
      <CornerThree halfW={halfW} />

      {/* Free-throw arc */}
      <group rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.014, COURT.freeThrowDistFt]}>
        <Line points={ftArcPoints} color={LINE_COLOR} lineWidth={1.5} transparent opacity={0.65} />
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
        lineWidth={2}
        transparent
        opacity={0.85}
      />
      <Line
        points={[
          [xCorner, 0.013, 0],
          [xCorner, 0.013, cornerZ],
        ]}
        color={LINE_COLOR}
        lineWidth={2}
        transparent
        opacity={0.85}
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
        <meshStandardMaterial color="#FBFBFD" transparent opacity={0.92} />
      </mesh>
      {/* Backboard target square */}
      <mesh position={[0, COURT.rimHeightFt + 0.6, -1.1]}>
        <boxGeometry args={[2, 1.4, 0.02]} />
        <meshBasicMaterial color={RIM_COLOR} transparent opacity={0.25} />
      </mesh>
      {/* Pole */}
      <mesh position={[0, COURT.rimHeightFt / 2, -2]}>
        <cylinderGeometry args={[0.18, 0.18, COURT.rimHeightFt, 12]} />
        <meshStandardMaterial color="#1E2330" />
      </mesh>
      {/* Rim */}
      <mesh position={[0, COURT.rimHeightFt, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.75, 0.06, 8, 28]} />
        <meshStandardMaterial color={RIM_COLOR} emissive={RIM_COLOR} emissiveIntensity={0.4} />
      </mesh>
      {/* Rim glow on the floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[2.5, 32]} />
        <meshBasicMaterial color={RIM_COLOR} transparent opacity={0.1} />
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
