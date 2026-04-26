'use client'

import { useMemo } from 'react'
import { LinePrimitive3D } from './LinePrimitive3D'
import { COURT } from '@/lib/scenario3d/coords'

// Visibility-first palette. The dark-on-dark wood + slate-frame layered
// approach used previously suffered from depth-buffer z-fighting because
// every floor plane sat within ~0.001ft of the next. Here we use ONE bright
// floor and lift every decal (paint, lines, hoop ground glow) by clearly
// distinguishable y values so the GPU's depth precision cannot blend them.
const FLOOR_COLOR = '#D9905A' // bright premium wood, pops on dark bg
const PAINT_COLOR = '#1F4D8A' // deep navy paint
const PAINT_KEY_COLOR = '#FFD60A' // accent at the rim's top of the key
const LINE_COLOR = '#FFFFFF'
const RIM_COLOR = '#FF8A3D'
const BACKBOARD_COLOR = '#FBFBFD'
const POLE_COLOR = '#3A4254'

// Y-stack layout. Each layer is at least 0.02ft above the previous so we
// never z-fight, even at glancing camera angles or 24-bit depth buffers.
const Y_FLOOR = 0
const Y_FLOOR_GLOW = 0.02
const Y_PAINT = 0.04
const Y_PAINT_TOP_OF_KEY = 0.06
const Y_LINES = 0.08
const Y_LINES_HIGHLIGHT = 0.1

interface Court3DProps {
  /** Optional vertical lift for the entire court group. */
  floorY?: number
}

/**
 * Half-court 3D model. Built from primitive meshes only — no GLTF, no
 * texture atlases, no async assets — so the court paints synchronously
 * on the very first frame the canvas mounts.
 */
export function Court3D({ floorY = 0 }: Court3DProps) {
  const halfW = COURT.halfWidthFt
  const halfL = COURT.halfLengthFt

  const arcPoints = useMemo(() => buildArc(COURT.threePointRadiusFt, Math.PI), [])
  const ftArcPoints = useMemo(() => buildArc(6, Math.PI), [])

  const courtCenterZ = halfL / 2 - 0.5

  const outline = useMemo<[number, number, number][]>(
    () => [
      [-halfW, 0, 0],
      [halfW, 0, 0],
      [halfW, 0, halfL],
      [-halfW, 0, halfL],
      [-halfW, 0, 0],
    ],
    [halfW, halfL],
  )

  const paintOutline = useMemo<Array<[number, number, number]>>(() => {
    const px = COURT.paintWidthFt / 2
    const pz = COURT.paintLengthFt - 4
    return [
      [-px, 0, 0],
      [-px, 0, pz],
      [px, 0, pz],
      [px, 0, 0],
    ]
  }, [])

  return (
    <group position={[0, floorY, 0]}>
      {/* Floor — single, bright, unlit. This IS the court surface. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, Y_FLOOR, courtCenterZ]}>
        <planeGeometry args={[halfW * 2, halfL]} />
        <meshBasicMaterial color={FLOOR_COLOR} toneMapped={false} />
      </mesh>

      {/* Soft glow patch under the rim — adds depth without z-fighting risk. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, Y_FLOOR_GLOW, 0]}>
        <circleGeometry args={[8, 48]} />
        <meshBasicMaterial color={RIM_COLOR} transparent opacity={0.18} toneMapped={false} />
      </mesh>

      {/* Paint */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, Y_PAINT, (COURT.paintLengthFt - 4) / 2]}
      >
        <planeGeometry args={[COURT.paintWidthFt, COURT.paintLengthFt - 4]} />
        <meshBasicMaterial color={PAINT_COLOR} toneMapped={false} />
      </mesh>

      {/* Top-of-key accent — the area between the FT line and the arc. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, Y_PAINT_TOP_OF_KEY, COURT.freeThrowDistFt + 0.5]}
      >
        <ringGeometry args={[5.95, 6.05, 64, 1, -Math.PI / 2, Math.PI]} />
        <meshBasicMaterial color={PAINT_KEY_COLOR} transparent opacity={0.8} toneMapped={false} />
      </mesh>

      {/* Court outline — glowing white. Doubled with a translucent halo
          line for "neon" depth without z-fighting. */}
      <group position={[0, Y_LINES, 0]}>
        <LinePrimitive3D points={outline} color={LINE_COLOR} />
      </group>
      <group position={[0, Y_LINES_HIGHLIGHT, 0]}>
        <LinePrimitive3D points={outline} color={LINE_COLOR} opacity={0.35} />
      </group>

      {/* Paint outline */}
      <group position={[0, Y_LINES, 0]}>
        <LinePrimitive3D points={paintOutline} color={LINE_COLOR} />
      </group>

      {/* Three-point arc */}
      <group rotation={[-Math.PI / 2, 0, 0]} position={[0, Y_LINES, 0]}>
        <LinePrimitive3D points={arcPoints} color={LINE_COLOR} />
      </group>
      <group rotation={[-Math.PI / 2, 0, 0]} position={[0, Y_LINES_HIGHLIGHT, 0]}>
        <LinePrimitive3D points={arcPoints} color={LINE_COLOR} opacity={0.35} />
      </group>

      {/* Three-point straight corner lines */}
      <group position={[0, Y_LINES, 0]}>
        <CornerThree halfW={halfW} />
      </group>

      {/* Free-throw arc */}
      <group rotation={[-Math.PI / 2, 0, 0]} position={[0, Y_LINES, COURT.freeThrowDistFt]}>
        <LinePrimitive3D points={ftArcPoints} color={LINE_COLOR} opacity={0.95} />
      </group>

      {/* Half-court line (visual frame at the back of the court). */}
      <group position={[0, Y_LINES, 0]}>
        <LinePrimitive3D
          points={[
            [-halfW, 0, halfL],
            [halfW, 0, halfL],
          ]}
          color={LINE_COLOR}
          opacity={0.85}
        />
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
      <LinePrimitive3D
        points={[
          [-xCorner, 0, 0],
          [-xCorner, 0, cornerZ],
        ]}
        color={LINE_COLOR}
      />
      <LinePrimitive3D
        points={[
          [xCorner, 0, 0],
          [xCorner, 0, cornerZ],
        ]}
        color={LINE_COLOR}
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
        <meshBasicMaterial color={BACKBOARD_COLOR} toneMapped={false} />
      </mesh>
      {/* Backboard target square */}
      <mesh position={[0, COURT.rimHeightFt + 0.6, -1.1]}>
        <boxGeometry args={[2, 1.4, 0.02]} />
        <meshBasicMaterial color={RIM_COLOR} transparent opacity={0.7} toneMapped={false} />
      </mesh>
      {/* Pole */}
      <mesh position={[0, COURT.rimHeightFt / 2, -2]}>
        <cylinderGeometry args={[0.22, 0.22, COURT.rimHeightFt, 12]} />
        <meshBasicMaterial color={POLE_COLOR} toneMapped={false} />
      </mesh>
      {/* Rim */}
      <mesh position={[0, COURT.rimHeightFt, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.85, 0.1, 12, 36]} />
        <meshBasicMaterial color={RIM_COLOR} toneMapped={false} />
      </mesh>
    </group>
  )
}

function buildArc(radius: number, sweep: number): Array<[number, number, number]> {
  const segments = 96
  const pts: Array<[number, number, number]> = []
  const start = -sweep / 2
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const angle = start + t * sweep
    pts.push([Math.sin(angle) * radius, Math.cos(angle) * radius, 0])
  }
  return pts
}
