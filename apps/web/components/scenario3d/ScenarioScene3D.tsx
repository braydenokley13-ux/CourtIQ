'use client'

import { PlayerMarker3D } from './PlayerMarker3D'
import { BallMarker3D } from './BallMarker3D'
import type { Scene3D } from '@/lib/scenario3d/scene'

interface ScenarioScene3DProps {
  scene: Scene3D
}

const PLAYER_HEIGHT = 0
const BALL_REST_Y = 0

/**
 * Renders the players and ball for a scene at their start positions. Phase
 * 4C only supports the static frame; movement animations land in Phase 4E.
 */
export function ScenarioScene3D({ scene }: ScenarioScene3DProps) {
  const ballHolder =
    scene.ball.holderId != null
      ? scene.players.find((p) => p.id === scene.ball.holderId)
      : scene.players.find((p) => p.hasBall)

  // If a holder is known, anchor the ball at their feet so it visually
  // matches their position regardless of the scene's authored ball point.
  const ballX = ballHolder?.start.x ?? scene.ball.start.x
  const ballZ = ballHolder?.start.z ?? scene.ball.start.z

  return (
    <group>
      {scene.players.map((player) => (
        <PlayerMarker3D
          key={player.id}
          position={[player.start.x, PLAYER_HEIGHT, player.start.z]}
          team={player.team}
          role={player.role}
          label={player.label}
          isUser={player.isUser}
          hasBall={player.hasBall}
          color={player.color}
        />
      ))}
      <BallMarker3D position={[ballX, BALL_REST_Y, ballZ]} />
    </group>
  )
}
