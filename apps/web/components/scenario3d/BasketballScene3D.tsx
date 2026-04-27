'use client'

import { useMemo } from 'react'
import * as THREE from 'three'
import { COURT } from '@/lib/scenario3d/coords'
import type { Scene3D } from '@/lib/scenario3d/scene'

/**
 * Stripped-down "show a basketball scene NOW" renderer. Built from raw
 * primitives only — cylinders for players, a sphere for the ball, line
 * segments for the court — under bright ambient + directional lights.
 * Players are taller and fatter than reality on purpose: visibility is
 * the only goal at this phase.
 *
 * Replaces the layered `Court3D` + `ScenarioScene3D` stack with a single
 * dependency-light component so we can prove the basketball scene reaches
 * the user, then layer realism back on once it does.
 */

const FLOOR_COLOR = '#C2823F'
const LINE_COLOR = '#FFFFFF'
const PAINT_COLOR = '#0050B4'
const BALL_COLOR = '#FF8A3D'
const RIM_COLOR = '#FF8A3D'
const BACKBOARD_COLOR = '#FBFBFD'
const POLE_COLOR = '#2A3344'
const OFFENSE_COLOR = '#5DB4FF'
const DEFENSE_COLOR = '#FF5C72'
const USER_COLOR = '#3BFF9D'

const PLAYER_HEIGHT = 6
const PLAYER_RADIUS = 1.2
const BALL_RADIUS = 0.8
const FLOOR_LIFT = 0
const LINE_LIFT = 0.05
const PLAYER_LIFT = 0.05

interface BasketballScene3DProps {
  scene: Scene3D
}

export function BasketballScene3D({ scene }: BasketballScene3DProps) {
  const halfW = COURT.halfWidthFt
  const halfL = COURT.halfLengthFt
  const courtCenterZ = halfL / 2 - 0.5

  const arcPoints = useMemo(() => buildArc(COURT.threePointRadiusFt, Math.PI), [])
  const ftArcPoints = useMemo(() => buildArc(6, Math.PI), [])

  const ballHolder = scene.ball.holderId
    ? scene.players.find((p) => p.id === scene.ball.holderId)
    : scene.players.find((p) => p.hasBall)
  const ballX = ballHolder?.start.x ?? scene.ball.start.x
  const ballZ = ballHolder?.start.z ?? scene.ball.start.z

  return (
    <group>
      {/* Bright lights so any material renders clearly. */}
      <ambientLight intensity={1.4} color="#FFFFFF" />
      <directionalLight position={[30, 60, 30]} intensity={1.1} color="#FFFFFF" />
      <directionalLight position={[-20, 40, 10]} intensity={0.6} color="#CFE2FF" />

      {/* Wood floor — bright + unlit for guaranteed visibility. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, FLOOR_LIFT, courtCenterZ]}>
        <planeGeometry args={[halfW * 2, halfL]} />
        <meshBasicMaterial color={FLOOR_COLOR} toneMapped={false} />
      </mesh>

      {/* Royal blue paint */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, FLOOR_LIFT + 0.02, COURT.freeThrowDistFt / 2]}
      >
        <planeGeometry args={[COURT.paintWidthFt, COURT.freeThrowDistFt]} />
        <meshBasicMaterial color={PAINT_COLOR} toneMapped={false} />
      </mesh>

      {/* Court outline — thick white tube lines so they read at any zoom. */}
      <CourtLines halfW={halfW} halfL={halfL} />
      <ArcLine points={arcPoints} y={LINE_LIFT} />
      <ArcLine points={ftArcPoints} y={LINE_LIFT} z={COURT.freeThrowDistFt} />

      {/* Hoop: pole + backboard + rim. */}
      <Hoop />

      {/* Players — tall, brightly-colored cylinders. */}
      {scene.players.map((p) => {
        const color = p.isUser
          ? USER_COLOR
          : p.team === 'offense'
            ? OFFENSE_COLOR
            : DEFENSE_COLOR
        return (
          <group key={p.id} position={[p.start.x, PLAYER_LIFT, p.start.z]}>
            <mesh position={[0, PLAYER_HEIGHT / 2, 0]}>
              <cylinderGeometry
                args={[PLAYER_RADIUS, PLAYER_RADIUS, PLAYER_HEIGHT, 24]}
              />
              <meshStandardMaterial color={color} />
            </mesh>
            {/* Head sphere */}
            <mesh position={[0, PLAYER_HEIGHT + 0.7, 0]}>
              <sphereGeometry args={[0.7, 24, 24]} />
              <meshStandardMaterial color="#F4D9BC" />
            </mesh>
            {/* Floor footprint ring so the team color reads from above too. */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
              <ringGeometry args={[PLAYER_RADIUS + 0.2, PLAYER_RADIUS + 0.5, 32]} />
              <meshBasicMaterial color={color} toneMapped={false} />
            </mesh>
          </group>
        )
      })}

      {/* Ball — bright orange sphere, lifted slightly so it reads above the
          court regardless of the holder's position. */}
      <mesh position={[ballX, BALL_RADIUS + 0.2, ballZ]}>
        <sphereGeometry args={[BALL_RADIUS, 24, 24]} />
        <meshStandardMaterial color={BALL_COLOR} />
      </mesh>
    </group>
  )
}

function CourtLines({ halfW, halfL }: { halfW: number; halfL: number }) {
  const segments = useMemo<[THREE.Vector3, THREE.Vector3][]>(() => {
    const baselineZ = 0
    const sidelineL = halfL
    return [
      [new THREE.Vector3(-halfW, LINE_LIFT, baselineZ), new THREE.Vector3(halfW, LINE_LIFT, baselineZ)],
      [new THREE.Vector3(halfW, LINE_LIFT, baselineZ), new THREE.Vector3(halfW, LINE_LIFT, sidelineL)],
      [new THREE.Vector3(halfW, LINE_LIFT, sidelineL), new THREE.Vector3(-halfW, LINE_LIFT, sidelineL)],
      [new THREE.Vector3(-halfW, LINE_LIFT, sidelineL), new THREE.Vector3(-halfW, LINE_LIFT, baselineZ)],
      // Paint
      [new THREE.Vector3(-COURT.paintWidthFt / 2, LINE_LIFT, 0), new THREE.Vector3(-COURT.paintWidthFt / 2, LINE_LIFT, COURT.freeThrowDistFt)],
      [new THREE.Vector3(COURT.paintWidthFt / 2, LINE_LIFT, 0), new THREE.Vector3(COURT.paintWidthFt / 2, LINE_LIFT, COURT.freeThrowDistFt)],
      [new THREE.Vector3(-COURT.paintWidthFt / 2, LINE_LIFT, COURT.freeThrowDistFt), new THREE.Vector3(COURT.paintWidthFt / 2, LINE_LIFT, COURT.freeThrowDistFt)],
    ]
  }, [halfW, halfL])

  return (
    <group>
      {segments.map((seg, i) => (
        <TubeLine key={i} start={seg[0]} end={seg[1]} />
      ))}
    </group>
  )
}

function TubeLine({ start, end }: { start: THREE.Vector3; end: THREE.Vector3 }) {
  const dir = useMemo(() => new THREE.Vector3().subVectors(end, start), [start, end])
  const length = dir.length()
  const mid = useMemo(
    () => new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5),
    [start, end],
  )
  const quat = useMemo(() => {
    const up = new THREE.Vector3(0, 1, 0)
    const q = new THREE.Quaternion()
    q.setFromUnitVectors(up, dir.clone().normalize())
    return q
  }, [dir])

  return (
    <mesh position={mid} quaternion={quat}>
      <cylinderGeometry args={[0.18, 0.18, length, 8]} />
      <meshBasicMaterial color={LINE_COLOR} toneMapped={false} />
    </mesh>
  )
}

function ArcLine({
  points,
  y,
  z = 0,
}: {
  points: [number, number, number][]
  y: number
  z?: number
}) {
  return (
    <group rotation={[-Math.PI / 2, 0, 0]} position={[0, y, z]}>
      {points.map((p, i) => {
        const next = points[i + 1]
        if (!next) return null
        const start = new THREE.Vector3(p[0], p[1], p[2])
        const end = new THREE.Vector3(next[0], next[1], next[2])
        const dir = new THREE.Vector3().subVectors(end, start)
        const length = dir.length()
        const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5)
        const up = new THREE.Vector3(0, 1, 0)
        const quat = new THREE.Quaternion().setFromUnitVectors(up, dir.clone().normalize())
        return (
          <mesh key={i} position={mid} quaternion={quat}>
            <cylinderGeometry args={[0.14, 0.14, length, 6]} />
            <meshBasicMaterial color={LINE_COLOR} toneMapped={false} />
          </mesh>
        )
      })}
    </group>
  )
}

function Hoop() {
  return (
    <group>
      {/* Backboard */}
      <mesh position={[0, COURT.rimHeightFt + 1.4, -1.2]}>
        <boxGeometry args={[6, 3.6, 0.18]} />
        <meshStandardMaterial color={BACKBOARD_COLOR} />
      </mesh>
      {/* Pole */}
      <mesh position={[0, COURT.rimHeightFt / 2 + 1.2, -2.4]}>
        <cylinderGeometry args={[0.22, 0.22, COURT.rimHeightFt + 2.4, 12]} />
        <meshStandardMaterial color={POLE_COLOR} />
      </mesh>
      {/* Rim */}
      <mesh position={[0, COURT.rimHeightFt, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.85, 0.1, 12, 36]} />
        <meshBasicMaterial color={RIM_COLOR} toneMapped={false} />
      </mesh>
    </group>
  )
}

function buildArc(radius: number, sweep: number): [number, number, number][] {
  const segments = 64
  const pts: [number, number, number][] = []
  const start = -sweep / 2
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const angle = start + t * sweep
    pts.push([Math.sin(angle) * radius, Math.cos(angle) * radius, 0])
  }
  return pts
}
