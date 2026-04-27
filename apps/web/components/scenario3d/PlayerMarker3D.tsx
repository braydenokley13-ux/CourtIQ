'use client'

import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { LabelSprite } from './LabelSprite'
import { useSceneMotion } from './SceneMotionContext'

export type PlayerTeam = 'offense' | 'defense'
export type PlayerRole = 'user' | 'teammate' | 'defender' | 'ball_handler' | 'help' | 'rotater'

// Spec palette — same family as the standalone scene reference. Top is
// brighter (jersey), bottom is darker (shorts) so capsules read as players,
// not pills.
const TEAM_COLOR_TOP: Record<PlayerTeam, string> = {
  offense: '#5DB4FF',
  defense: '#FF5C72',
}
const TEAM_COLOR_BOTTOM: Record<PlayerTeam, string> = {
  offense: '#1F5BB8',
  defense: '#9C1830',
}
const USER_COLOR_TOP = '#3BFF9D'
const USER_COLOR_BOTTOM = '#0A8C4E'
const HEAD_TONE = '#F4D9BC' // neutral skin tone so heads don't read as jerseys

// Player dimensions in feet.
const BODY_RADIUS = 0.85
const BODY_LENGTH = 3.6 // capsule cylinder length (between cap centres)
const SHORTS_HEIGHT = 1.6
const HEAD_RADIUS = 0.6
const HEAD_OFFSET = 0.7
const FOOT_Y = 0.06

const USER_BODY_RADIUS = 0.95
const USER_BODY_LENGTH = 4.0

export interface PlayerMarker3DProps {
  position: [number, number, number]
  team: PlayerTeam
  role?: PlayerRole | string
  label?: string
  /** Highlights the marker that represents the user. */
  isUser?: boolean
  /** Adds a possession indicator ring at the player's feet. */
  hasBall?: boolean
  /** Subtle pulse to draw the eye to the active read. */
  active?: boolean
  /** Color override (rare; teams should usually win). */
  color?: string
}

/**
 * Capsule-based player marker. Visually:
 *   - capsule "jersey" (top color) + cylinder "shorts" (darker bottom)
 *   - sphere head in a neutral skin tone
 *   - foot ring on the floor (yellow for ball handler, green for YOU)
 *   - YOU adds a slowly pulsing halo and a brighter footprint
 *   - label pill above the head (rendered via CanvasTexture sprite)
 */
export function PlayerMarker3D({
  position,
  team,
  label,
  isUser,
  hasBall,
  active,
  color,
}: PlayerMarker3DProps) {
  const top = color ?? (isUser ? USER_COLOR_TOP : TEAM_COLOR_TOP[team])
  const bottom = isUser ? USER_COLOR_BOTTOM : TEAM_COLOR_BOTTOM[team]
  const radius = isUser ? USER_BODY_RADIUS : BODY_RADIUS
  const length = isUser ? USER_BODY_LENGTH : BODY_LENGTH
  const totalHeight = length + radius * 2
  const haloRef = useRef<THREE.Mesh | null>(null)
  const ringRef = useRef<THREE.Mesh | null>(null)
  const groupRef = useRef<THREE.Group | null>(null)
  const { reduced } = useSceneMotion()

  const labelBg = useMemo(() => {
    if (isUser) return USER_COLOR_TOP
    if (team === 'offense') return 'rgba(15,32,68,0.92)'
    return 'rgba(56,12,22,0.92)'
  }, [isUser, team])
  const labelColor = isUser ? '#04221A' : '#FBFBFD'

  useFrame((state) => {
    if (reduced) return
    const t = state.clock.getElapsedTime()
    if (isUser && haloRef.current) {
      const s = 1 + Math.sin(t * 2.6) * 0.12
      haloRef.current.scale.set(s, s, 1)
      const material = haloRef.current.material as THREE.MeshBasicMaterial | undefined
      if (material) material.opacity = 0.35 + Math.sin(t * 2.6) * 0.12
    }
    if ((isUser || active) && ringRef.current) {
      ringRef.current.rotation.z += 0.012
    }
    if (isUser && groupRef.current) {
      // Tiny vertical bob keeps the YOU player feeling alive.
      groupRef.current.position.y = Math.sin(t * 1.4) * 0.05
    }
  })

  return (
    <group position={position}>
      {/* Foot footprint ring — sits on the floor decals. */}
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, FOOT_Y, 0]}>
        <ringGeometry args={[radius + 0.25, radius + 0.55, 48]} />
        <meshBasicMaterial
          color={isUser ? USER_COLOR_TOP : top}
          transparent
          opacity={isUser ? 1 : 0.55}
          toneMapped={false}
        />
      </mesh>

      {/* YOU pulsing halo */}
      {isUser ? (
        <mesh ref={haloRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, FOOT_Y + 0.01, 0]}>
          <ringGeometry args={[radius + 0.7, radius + 1.7, 64]} />
          <meshBasicMaterial color={USER_COLOR_TOP} transparent opacity={0.45} toneMapped={false} />
        </mesh>
      ) : null}

      {/* Possession ring (for the player currently holding the ball) */}
      {hasBall ? <PossessionRing color="#FFB070" radius={radius + 0.35} /> : null}

      {/* Player body group — capsule jersey on top, cylinder shorts below. */}
      <group ref={groupRef}>
        {/* Shorts (lower cylinder) */}
        <mesh position={[0, radius + SHORTS_HEIGHT / 2, 0]}>
          <cylinderGeometry args={[radius * 0.95, radius * 1.05, SHORTS_HEIGHT, 24]} />
          <meshLambertMaterial color={bottom} />
        </mesh>

        {/* Jersey (capsule body sitting on top of the shorts) */}
        <mesh position={[0, radius + SHORTS_HEIGHT + length / 2, 0]}>
          <capsuleGeometry args={[radius, length - SHORTS_HEIGHT, 6, 20]} />
          <meshLambertMaterial color={top} />
        </mesh>

        {/* Jersey highlight strip — a thin band at the chest so capsules
            read as players from broadcast distance. */}
        <mesh position={[0, radius + SHORTS_HEIGHT + length * 0.55, 0]}>
          <cylinderGeometry args={[radius * 1.04, radius * 1.04, 0.25, 24, 1, true]} />
          <meshBasicMaterial color="#FFFFFF" transparent opacity={0.18} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>

        {/* Head */}
        <mesh position={[0, totalHeight + HEAD_OFFSET, 0]}>
          <sphereGeometry args={[HEAD_RADIUS, 24, 24]} />
          <meshLambertMaterial color={HEAD_TONE} />
        </mesh>

        {/* Label pill — anchored above the head. */}
        {label ? (
          <LabelSprite
            text={label}
            position={[0, totalHeight + HEAD_OFFSET + 1.4, 0]}
            scale={isUser ? 1.4 : 1.05}
            color={labelColor}
            bg={labelBg}
          />
        ) : null}
      </group>
    </group>
  )
}

function PossessionRing({ color, radius }: { color: string; radius: number }) {
  const ref = useRef<THREE.Mesh | null>(null)
  const { reduced } = useSceneMotion()
  useFrame((state) => {
    if (reduced || !ref.current) return
    ref.current.rotation.z = state.clock.getElapsedTime() * 0.45
  })
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, FOOT_Y + 0.02, 0]}>
      <ringGeometry args={[radius + 0.6, radius + 0.85, 48, 1, 0, Math.PI * 1.5]} />
      <meshBasicMaterial color={color} transparent opacity={0.95} toneMapped={false} />
    </mesh>
  )
}
