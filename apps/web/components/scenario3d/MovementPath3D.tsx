'use client'

import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useSceneMotion } from './SceneMotionContext'

interface MovementPath3DProps {
  from: [number, number]
  to: [number, number]
  color?: string
  /** When true, an arrowhead and destination marker are drawn. */
  arrow?: boolean
  /** Show a travelling pulse along the path. */
  pulse?: boolean
  /** Show a destination cone/ring stack at `to`. */
  destination?: boolean
  /** Optional thickness override for the tube (default 0.18). */
  thickness?: number
  /** Lateral curve magnitude (0..1) — 0 = straight, 0.4 = pronounced. */
  curve?: number
}

const DEFAULT_COLOR = '#3BFF9D'
const DEFAULT_DEEP = '#0A8C4E'
const PATH_Y = 0.16
const HEAD_LENGTH = 1.4
const HEAD_RADIUS = 0.55

/**
 * Curved replay path drawn flat over the floor, with an arrowhead, a
 * travelling pulse dot, and an obvious destination cone+ring stack at
 * the target. Used to show the correct movement after the user answers.
 */
export function MovementPath3D({
  from,
  to,
  color = DEFAULT_COLOR,
  arrow = true,
  pulse = true,
  destination = true,
  thickness = 0.18,
  curve = 0.18,
}: MovementPath3DProps) {
  const { reduced } = useSceneMotion()
  const dx = to[0] - from[0]
  const dz = to[1] - from[1]
  const length = Math.hypot(dx, dz)

  const curveObj = useMemo(() => {
    if (length < 0.05) return null
    const start = new THREE.Vector3(from[0], PATH_Y, from[1])
    const end = new THREE.Vector3(to[0], PATH_Y, to[1])
    // Lateral midpoint offset — gives the path a natural play-call arc
    // instead of a stiff straight line. Also lift the midpoint a touch
    // off the floor so the tube reads with depth.
    const dirX = dx / length
    const dirZ = dz / length
    const perpX = -dirZ
    const perpZ = dirX
    const offset = Math.min(length * curve, 6)
    const mid = new THREE.Vector3(
      (from[0] + to[0]) / 2 + perpX * offset,
      PATH_Y + 0.45,
      (from[1] + to[1]) / 2 + perpZ * offset,
    )
    return new THREE.QuadraticBezierCurve3(start, mid, end)
  }, [from, to, dx, dz, length, curve])

  const tubeGeom = useMemo(() => {
    if (!curveObj) return null
    return new THREE.TubeGeometry(curveObj, 48, thickness, 10, false)
  }, [curveObj, thickness])

  const haloGeom = useMemo(() => {
    if (!curveObj) return null
    return new THREE.TubeGeometry(curveObj, 48, thickness * 2.3, 10, false)
  }, [curveObj, thickness])

  // Pulse dot — a small sphere we slide along the curve every frame.
  const pulseRef = useRef<THREE.Mesh | null>(null)
  const tmp = useMemo(() => new THREE.Vector3(), [])
  useFrame((state) => {
    if (reduced || !pulse || !curveObj || !pulseRef.current) return
    const t = (state.clock.getElapsedTime() * 0.45) % 1
    curveObj.getPoint(t, tmp)
    pulseRef.current.position.set(tmp.x, tmp.y + 0.05, tmp.z)
    const s = 1 + Math.sin(state.clock.getElapsedTime() * 5) * 0.18
    pulseRef.current.scale.set(s, s, s)
  })

  // Arrowhead — a cone aligned with the curve's final tangent.
  const tipQuat = useMemo(() => {
    if (!curveObj) return new THREE.Quaternion()
    const tangent = curveObj.getTangent(1).normalize()
    const up = new THREE.Vector3(0, 1, 0)
    return new THREE.Quaternion().setFromUnitVectors(up, tangent)
  }, [curveObj])

  useEffect(() => {
    return () => {
      tubeGeom?.dispose()
      haloGeom?.dispose()
    }
  }, [tubeGeom, haloGeom])

  if (!curveObj || !tubeGeom || !haloGeom) return null

  return (
    <group>
      {/* Outer glow halo — translucent fat tube behind the main path. */}
      <mesh geometry={haloGeom}>
        <meshBasicMaterial color={color} transparent opacity={0.25} toneMapped={false} depthWrite={false} />
      </mesh>
      {/* Main path tube — bright and thick. */}
      <mesh geometry={tubeGeom}>
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      {/* Path inner bright stripe — the deep core color stacked on top. */}
      <mesh geometry={tubeGeom}>
        <meshBasicMaterial color={DEFAULT_DEEP} transparent opacity={0.35} toneMapped={false} />
      </mesh>

      {/* Travelling pulse dot. */}
      {pulse ? (
        <mesh ref={pulseRef}>
          <sphereGeometry args={[thickness * 1.6, 16, 16]} />
          <meshBasicMaterial color="#FFFFFF" toneMapped={false} />
        </mesh>
      ) : null}

      {/* Arrowhead at the destination tangent. */}
      {arrow && length > 0.6 ? (
        <mesh
          position={[
            to[0] - (dx / length) * HEAD_LENGTH * 0.4,
            PATH_Y + 0.25,
            to[1] - (dz / length) * HEAD_LENGTH * 0.4,
          ]}
          quaternion={tipQuat}
        >
          <coneGeometry args={[HEAD_RADIUS, HEAD_LENGTH, 16]} />
          <meshBasicMaterial color={color} toneMapped={false} />
        </mesh>
      ) : null}

      {/* Destination cone + glowing rings */}
      {destination ? <DestinationMarker3D position={[to[0], 0, to[1]]} color={color} /> : null}
    </group>
  )
}

interface DestinationMarker3DProps {
  position: [number, number, number]
  color: string
}

/**
 * Stack of expanding rings + a small inverted glow cone above the
 * destination. Reads as "go here" without needing any text.
 */
function DestinationMarker3D({ position, color }: DestinationMarker3DProps) {
  const { reduced } = useSceneMotion()
  const ringARef = useRef<THREE.Mesh | null>(null)
  const ringBRef = useRef<THREE.Mesh | null>(null)
  const beamRef = useRef<THREE.Mesh | null>(null)

  useFrame((state) => {
    if (reduced) return
    const t = state.clock.getElapsedTime()
    if (ringARef.current) {
      const u = (t * 0.6) % 1
      const s = 0.6 + u * 1.4
      ringARef.current.scale.set(s, s, 1)
      const m = ringARef.current.material as THREE.MeshBasicMaterial | undefined
      if (m) m.opacity = (1 - u) * 0.7
    }
    if (ringBRef.current) {
      const u = ((t + 0.5) * 0.6) % 1
      const s = 0.6 + u * 1.4
      ringBRef.current.scale.set(s, s, 1)
      const m = ringBRef.current.material as THREE.MeshBasicMaterial | undefined
      if (m) m.opacity = (1 - u) * 0.7
    }
    if (beamRef.current) {
      const m = beamRef.current.material as THREE.MeshBasicMaterial | undefined
      if (m) m.opacity = 0.55 + Math.sin(t * 3) * 0.15
    }
  })

  return (
    <group position={position}>
      {/* Solid base ring on the floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.18, 0]}>
        <ringGeometry args={[1.2, 1.45, 48]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      {/* Two expanding pulse rings */}
      <mesh ref={ringARef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.2, 0]}>
        <ringGeometry args={[1.55, 1.85, 48]} />
        <meshBasicMaterial color={color} transparent opacity={0.7} toneMapped={false} />
      </mesh>
      <mesh ref={ringBRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.22, 0]}>
        <ringGeometry args={[1.55, 1.85, 48]} />
        <meshBasicMaterial color={color} transparent opacity={0.5} toneMapped={false} />
      </mesh>
      {/* Glow column — narrow vertical beam that reads as "stand here" */}
      <mesh ref={beamRef} position={[0, 1.4, 0]}>
        <cylinderGeometry args={[0.18, 0.55, 2.8, 16, 1, true]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.55}
          toneMapped={false}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      {/* Inverted cone tip pointing down to the spot */}
      <mesh position={[0, 3.2, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.55, 1.4, 18]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
    </group>
  )
}
