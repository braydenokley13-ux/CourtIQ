'use client'

import { useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { LabelSprite } from './LabelSprite'
import { useSceneMotion } from './SceneMotionContext'

export type PlayerTeam = 'offense' | 'defense'
export type PlayerRole = 'user' | 'teammate' | 'defender' | 'ball_handler' | 'help' | 'rotater'

const TEAM_COLOR: Record<PlayerTeam, string> = {
  offense: '#3BE383',
  defense: '#FF4D6D',
}

const USER_COLOR = '#FFD60A'

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
      {/* Footprint ring */}
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <ringGeometry args={[1.05, 1.35, 36]} />
        <meshBasicMaterial
          color={isUser ? USER_COLOR : fill}
          transparent
          opacity={isUser ? 0.95 : 0.35}
        />
      </mesh>

      {/* Active pulse ring */}
      {active ? (
        <mesh ref={pulseRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
          <ringGeometry args={[1.4, 2.2, 36]} />
          <meshBasicMaterial color={fill} transparent opacity={0.25} />
        </mesh>
      ) : null}

      {/* Possession ring */}
      {hasBall ? <PossessionRing color="#FF8A3D" /> : null}

      {/* Body */}
      <mesh position={[0, 1.6, 0]} castShadow>
        <cylinderGeometry args={[0.7, 0.85, 3.2, 16]} />
        <meshStandardMaterial color={fill} roughness={0.5} metalness={0.05} />
      </mesh>

      {/* Head */}
      <mesh position={[0, 3.55, 0]} castShadow>
        <sphereGeometry args={[0.55, 16, 16]} />
        <meshStandardMaterial color={fill} roughness={0.45} metalness={0.05} />
      </mesh>

      {/* Label — sprite is camera-facing by definition, so we don't need
          drei's <Billboard> wrapper. Using a CanvasTexture sprite rather
          than drei's <Text> avoids the suspended Roboto font fetch that
          crashes the canvas in production. */}
      {label ? (
        <LabelSprite
          text={label}
          position={[0, 4.6, 0]}
          scale={0.9}
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
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
      <ringGeometry args={[1.5, 1.7, 36]} />
      <meshBasicMaterial color={color} transparent opacity={0.85} />
    </mesh>
  )
}
