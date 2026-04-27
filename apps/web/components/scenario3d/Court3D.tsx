'use client'

import { useMemo } from 'react'
import * as THREE from 'three'
import { LinePrimitive3D } from './LinePrimitive3D'
import { COURT } from '@/lib/scenario3d/coords'

// Premium arena palette. Every visibility-critical surface uses
// meshBasicMaterial (unlit) so the court renders identically regardless
// of lighting state. This is the lesson from prior breakage: lit
// materials with `flat` tone mapping can render near-black on some
// devices. Unlit basic materials are guaranteed to paint at the literal
// sRGB color we set.
const FLOOR_COLOR = '#C2823F' // bright warm hardwood — guaranteed-visible
const FLOOR_DEEP_COLOR = '#5C3814' // outer rim of wood, sells gradient
const PAINT_COLOR = '#0050B4' // royal blue
const RESTRICTED_COLOR = '#0078D4'
const LINE_COLOR = '#FFFFFF'
const RIM_COLOR = '#FF8A3D'
const BACKBOARD_COLOR = '#FBFBFD'
const POLE_COLOR = '#2A3344'
const ARENA_DARK = '#04060C'
const ARENA_GLOW = '#1A2540'

// Y-stack: every decal lifts at least 0.02ft above the previous so depth
// precision never z-fights at glancing camera angles.
const Y_FLOOR = 0
const Y_FLOOR_GLOW = 0.02
const Y_PAINT = 0.04
const Y_PAINT_TRIM = 0.06
const Y_LINES = 0.08
const Y_LINES_HIGHLIGHT = 0.1
const Y_VIGNETTE = 0.12

interface Court3DProps {
  /** Optional vertical lift for the entire court group. */
  floorY?: number
}

/**
 * Half-court 3D model. Built from primitive meshes only — no GLTF, no
 * texture atlases, no async assets — so the court paints synchronously
 * on the very first frame the canvas mounts. All primary surfaces use
 * meshBasicMaterial so visibility never depends on lighting.
 */
export function Court3D({ floorY = 0 }: Court3DProps) {
  const halfW = COURT.halfWidthFt
  const halfL = COURT.halfLengthFt

  const arcPoints = useMemo(() => buildArc(COURT.threePointRadiusFt, Math.PI), [])
  const ftArcPoints = useMemo(() => buildArc(6, Math.PI), [])
  const restrictedArcPoints = useMemo(() => buildArc(4, Math.PI), [])

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

  const paintOutline = useMemo<[number, number, number][]>(() => {
    const px = COURT.paintWidthFt / 2
    const pz = COURT.freeThrowDistFt
    return [
      [-px, 0, 0],
      [-px, 0, pz],
      [px, 0, pz],
      [px, 0, 0],
    ]
  }, [])

  return (
    <group position={[0, floorY, 0]}>
      {/* Arena backdrop plane — sits behind the court, large but darker
          than the wood so the court reads as the focal element. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, courtCenterZ]}>
        <planeGeometry args={[halfW * 6, halfL * 3]} />
        <meshBasicMaterial color={ARENA_DARK} toneMapped={false} />
      </mesh>

      {/* Subtle arena glow patch around the court. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, courtCenterZ]}>
        <planeGeometry args={[halfW * 3, halfL * 1.7]} />
        <meshBasicMaterial color={ARENA_GLOW} transparent opacity={0.6} toneMapped={false} />
      </mesh>

      {/* Wood floor — bright basic material, guaranteed visible. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, Y_FLOOR, courtCenterZ]}>
        <planeGeometry args={[halfW * 2, halfL]} />
        <meshBasicMaterial color={FLOOR_COLOR} toneMapped={false} />
      </mesh>

      {/* Outer wood band — a darker rim that sells "spotlight on the play"
          without requiring lighting. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, Y_FLOOR + 0.005, courtCenterZ]}>
        <ringGeometry args={[halfW * 1.05, halfW * 1.55, 64]} />
        <meshBasicMaterial color={FLOOR_DEEP_COLOR} transparent opacity={0.7} toneMapped={false} />
      </mesh>

      {/* Soft glow patch under the rim. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, Y_FLOOR_GLOW, 0]}>
        <circleGeometry args={[10, 48]} />
        <meshBasicMaterial color={RIM_COLOR} transparent opacity={0.16} toneMapped={false} />
      </mesh>

      {/* Royal blue paint */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, Y_PAINT, COURT.freeThrowDistFt / 2]}
      >
        <planeGeometry args={[COURT.paintWidthFt, COURT.freeThrowDistFt]} />
        <meshBasicMaterial color={PAINT_COLOR} transparent opacity={0.92} toneMapped={false} />
      </mesh>

      {/* Restricted area arc fill */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, Y_PAINT_TRIM, 0]}
      >
        <ringGeometry args={[3.5, 4, 32, 1, -Math.PI / 2, Math.PI]} />
        <meshBasicMaterial color={RESTRICTED_COLOR} transparent opacity={0.7} toneMapped={false} />
      </mesh>

      {/* Court outline */}
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

      {/* Restricted area arc line */}
      <group rotation={[-Math.PI / 2, 0, 0]} position={[0, Y_LINES, 0]}>
        <LinePrimitive3D points={restrictedArcPoints} color={LINE_COLOR} opacity={0.85} />
      </group>

      {/* Half-court line at the back */}
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

      {/* Vignette ring around the court — fades the edges into the arena
          dark. Translucent basic material, no lighting required. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, Y_VIGNETTE, courtCenterZ]}>
        <ringGeometry args={[halfL * 0.72, halfL * 1.4, 80]} />
        <meshBasicMaterial color={ARENA_DARK} transparent opacity={0.45} toneMapped={false} />
      </mesh>

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
  const netPoints = useMemo<[number, number, number][]>(() => {
    const pts: [number, number, number][] = []
    const segments = 12
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2
      pts.push([Math.cos(angle) * 0.85, COURT.rimHeightFt, Math.sin(angle) * 0.85])
      pts.push([Math.cos(angle) * 0.55, COURT.rimHeightFt - 1.1, Math.sin(angle) * 0.55])
    }
    return pts
  }, [])

  return (
    <group>
      {/* Backboard */}
      <mesh position={[0, COURT.rimHeightFt + 1.4, -1.2]}>
        <boxGeometry args={[6, 3.6, 0.18]} />
        <meshBasicMaterial color={BACKBOARD_COLOR} toneMapped={false} />
      </mesh>
      {/* Backboard target square */}
      <mesh position={[0, COURT.rimHeightFt + 0.8, -1.1]}>
        <boxGeometry args={[2, 1.4, 0.04]} />
        <meshBasicMaterial color={RIM_COLOR} transparent opacity={0.85} toneMapped={false} />
      </mesh>
      {/* Pole behind the backboard */}
      <mesh position={[0, COURT.rimHeightFt / 2 + 1.2, -2.4]}>
        <cylinderGeometry args={[0.22, 0.22, COURT.rimHeightFt + 2.4, 12]} />
        <meshBasicMaterial color={POLE_COLOR} toneMapped={false} />
      </mesh>
      {/* Pole base */}
      <mesh position={[0, 0.2, -2.4]}>
        <cylinderGeometry args={[0.55, 0.7, 0.4, 16]} />
        <meshBasicMaterial color={POLE_COLOR} toneMapped={false} />
      </mesh>
      {/* Rim — bright orange torus, unlit. */}
      <mesh position={[0, COURT.rimHeightFt, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.85, 0.1, 12, 36]} />
        <meshBasicMaterial color={RIM_COLOR} toneMapped={false} />
      </mesh>
      {/* Net */}
      <NetLines points={netPoints} />
    </group>
  )
}

function NetLines({ points }: { points: [number, number, number][] }) {
  const line = useMemo(() => {
    const positions: number[] = []
    for (let i = 0; i < points.length; i += 2) {
      const a = points[i]
      const b = points[i + 1]
      if (!a || !b) continue
      positions.push(a[0], a[1], a[2], b[0], b[1], b[2])
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3),
    )
    const material = new THREE.LineBasicMaterial({
      color: '#FBFBFD',
      transparent: true,
      opacity: 0.7,
      toneMapped: false,
    })
    return new THREE.LineSegments(geometry, material)
  }, [points])
  return <primitive object={line} />
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
