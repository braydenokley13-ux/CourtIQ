'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { PlayerMarker3D } from './PlayerMarker3D'
import { BallMarker3D } from './BallMarker3D'
import { MovementPath3D } from './MovementPath3D'
import {
  ScenarioReplayController,
  type ReplayMode,
  type ReplayPhase,
} from './ScenarioReplayController'
import type { Scene3D } from '@/lib/scenario3d/scene'

interface ScenarioScene3DProps {
  scene: Scene3D
  /** "static" = no animation. "intro" = play scene.movements. "answer" = play scene.answerDemo. */
  mode?: ReplayMode
  /** Bumping this restarts the active timeline. */
  resetCounter?: number
  /** Captions emitted as the timeline crosses each movement. */
  onCaption?: (caption: string | undefined) => void
  /** Phase callback (idle → playing → done). */
  onPhase?: (phase: ReplayPhase) => void
  /** Show MovementPath3D arrows for the active timeline. */
  showPaths?: boolean
}

const PLAYER_HEIGHT = 0
const BALL_REST_Y = 0

/**
 * Renders the players, ball, and (optionally) movement paths for a scene.
 * The ScenarioReplayController mutates per-player group positions each
 * frame so React state never thrashes during animation.
 */
export function ScenarioScene3D({
  scene,
  mode = 'static',
  resetCounter,
  onCaption,
  onPhase,
  showPaths,
}: ScenarioScene3DProps) {
  const playerRefs = useRef<Map<string, THREE.Group>>(new Map())
  const ballRef = useRef<THREE.Group | null>(null)

  // When the scene changes, drop stale refs so the new player set has a
  // fresh map.
  useEffect(() => {
    playerRefs.current = new Map()
  }, [scene.id])

  const ballHolder =
    scene.ball.holderId != null
      ? scene.players.find((p) => p.id === scene.ball.holderId)
      : scene.players.find((p) => p.hasBall)
  const ballStartX = ballHolder?.start.x ?? scene.ball.start.x
  const ballStartZ = ballHolder?.start.z ?? scene.ball.start.z

  const activeMovements =
    mode === 'answer' ? scene.answerDemo : mode === 'intro' ? scene.movements : []

  return (
    <group>
      <ScenarioReplayController
        scene={scene}
        mode={mode}
        playerRefs={playerRefs}
        ballRef={ballRef}
        onCaption={onCaption}
        onPhase={onPhase}
        resetCounter={resetCounter}
      />

      {showPaths && activeMovements.length > 0
        ? activeMovements.map((m) => {
            if (m.playerId === 'ball') {
              return null
            }
            const player = scene.players.find((p) => p.id === m.playerId)
            if (!player) return null
            const color = player.isUser ? '#FFD60A' : player.team === 'offense' ? '#3BE383' : '#FF4D6D'
            return (
              <MovementPath3D
                key={m.id}
                from={[player.start.x, player.start.z]}
                to={[m.to.x, m.to.z]}
                color={color}
              />
            )
          })
        : null}

      {scene.players.map((player) => (
        <group
          key={player.id}
          ref={(g) => {
            if (g) playerRefs.current.set(player.id, g)
            else playerRefs.current.delete(player.id)
          }}
          position={[player.start.x, PLAYER_HEIGHT, player.start.z]}
        >
          <PlayerMarker3D
            position={[0, 0, 0]}
            team={player.team}
            role={player.role}
            label={player.label}
            isUser={player.isUser}
            hasBall={player.hasBall}
            color={player.color}
          />
        </group>
      ))}

      <group ref={ballRef} position={[ballStartX, BALL_REST_Y, ballStartZ]}>
        <BallMarker3D position={[0, 0, 0]} />
      </group>
    </group>
  )
}
