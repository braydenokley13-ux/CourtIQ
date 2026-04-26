'use client'

import { useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { LabelSprite } from './LabelSprite'
import { useSceneMotion } from './SceneMotionContext'

export type PlayerTeam = 'offense' | 'defense'
export type PlayerRole = 'user' | 'teammate' | 'defender' | 'ball_handler' | 'help' | 'rotater'

const TEAM_COLOR: Record<PlayerTeam, string> = {
  offense: '#3BFF8F',
  defense: '#FF4D6D',
}

const USER_COLOR = '#FFD60A'

const BODY_HEIGHT = 4.0
const BODY_RADIUS_TOP = 0.85
const BODY_RADIUS_BOTTOM = 1.0
const HEAD_RADIUS = 0.7

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
 * 3D marker for a player. Visually:
 *   - cylinder body (jersey color)
 *   - sprite label with a 2D-canvas texture (synchronous, no font load)
 *   - ground ring (yellow for "you", orange for ball handler, optional pulse)
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
  const fill = color ?? (isUser ? USER_COLOR : TEAM_COLOR[team])
  const ringRef = useRef<THREE.Mesh | null>(null)
  const pulseRef = useRef<THREE.Mesh | null>(null)
  const { reduced } = useSceneMotion()

  useFrame((state) => {
    if (reduced) return
    if (active && pulseRef.current) {
      const t = state.clock.getElapsedTime()
      const s = 1 + Math.sin(t * 3) * 0.18
      pulseRef.current.scale.set(s, s, 1)
      const material = pulseRef.current.material as THREE.MeshBasicMaterial | undefined
      if (material) {
        material.opacity = 0.18 + Math.sin(t * 3) * 0.1
      }
    }
    if (isUser && ringRef.current) {
      // gentle rotation on the "you" indicator
      ringRef.current.rotation.z += 0.012
    }
  })

  return (
    <group position={position}>
      {/* Footprint ring — well above the floor decals to avoid z-fighting. */}
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.15, 0]}>
        <ringGeometry args={[1.2, 1.55, 48]} />
        <meshBasicMaterial
          color={isUser ? USER_COLOR : fill}
          transparent
          opacity={isUser ? 0.98 : 0.55}
          toneMapped={false}
        />
      </mesh>

      {/* Active pulse ring */}
      {active ? (
        <mesh ref={pulseRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.17, 0]}>
          <ringGeometry args={[1.7, 2.7, 48]} />
          <meshBasicMaterial color={fill} transparent opacity={0.3} toneMapped={false} />
        </mesh>
      ) : null}

      {/* Possession ring */}
      {hasBall ? <PossessionRing color="#FF8A3D" /> : null}

      {/* Body — taller cylinder, unlit so the jersey color is unmistakable. */}
      <mesh position={[0, BODY_HEIGHT / 2 + 0.2, 0]}>
        <cylinderGeometry
          args={[BODY_RADIUS_TOP, BODY_RADIUS_BOTTOM, BODY_HEIGHT, 20]}
        />
        <meshBasicMaterial color={fill} toneMapped={false} />
      </mesh>

      {/* Head */}
      <mesh position={[0, BODY_HEIGHT + 0.4, 0]}>
        <sphereGeometry args={[HEAD_RADIUS, 20, 20]} />
        <meshBasicMaterial color={fill} toneMapped={false} />
      </mesh>

      {/* Label sprite (camera-facing). Uses a CanvasTexture, so it's
          synchronous and never suspends. */}
      {label ? (
        <LabelSprite
          text={label}
          position={[0, BODY_HEIGHT + 1.6, 0]}
          scale={1.1}
          color={isUser ? '#1A1400' : '#FBFBFD'}
          bg={isUser ? fill : 'rgba(10,11,14,0.85)'}
        />
      ) : null}
    </group>
  )
}

function PossessionRing({ color }: { color: string }) {
  const ref = useRef<THREE.Mesh | null>(null)
  const { reduced } = useSceneMotion()
  useFrame((state) => {
    if (reduced || !ref.current) return
    const t = state.clock.getElapsedTime()
    ref.current.rotation.z = t * 0.4
  })
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.18, 0]}>
      <ringGeometry args={[1.7, 1.95, 48]} />
      <meshBasicMaterial color={color} transparent opacity={0.9} toneMapped={false} />
    </mesh>
  )
}
