'use client'

import { useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import type { Scene3D, SceneMovement } from '@/lib/scenario3d/scene'
import { buildTimeline, resolveBallStart, samplePlayer, type Timeline } from '@/lib/scenario3d/timeline'

export type ReplayMode = 'static' | 'intro' | 'answer'
export type ReplayPhase = 'idle' | 'playing' | 'done'

export interface ReplayHandle {
  /** Restart the current movement list from t=0. */
  reset(): void
}

interface ScenarioReplayControllerProps {
  scene: Scene3D
  mode: ReplayMode
  /** Refs for each player's group. The controller mutates `position`. */
  playerRefs: React.MutableRefObject<Map<string, THREE.Group>>
  ballRef: React.MutableRefObject<THREE.Group | null>
  /** Notifies the parent of phase / progress changes (idle → playing → done). */
  onPhase?: (phase: ReplayPhase) => void
  /** Captions emitted as the timeline crosses each movement's startMs. */
  onCaption?: (caption: string | undefined) => void
  /** Fires once per movement as it begins playing. */
  onMovement?: (movement: SceneMovement) => void
  /** External handle for parent-driven controls. */
  handleRef?: React.MutableRefObject<ReplayHandle | null>
  /** Force a one-shot reset on this counter change. */
  resetCounter?: number
}

const PRE_DELAY_MS = 250

/**
 * Drives per-frame position updates for player and ball groups based on the
 * scene's movement list. Renders nothing visible.
 */
export function ScenarioReplayController({
  scene,
  mode,
  playerRefs,
  ballRef,
  onPhase,
  onCaption,
  onMovement,
  handleRef,
  resetCounter,
}: ScenarioReplayControllerProps) {
  const movements = useMemo(
    () => (mode === 'answer' ? scene.answerDemo : mode === 'intro' ? scene.movements : []),
    [mode, scene],
  )
  const timeline: Timeline = useMemo(() => buildTimeline(scene, movements), [scene, movements])

  const startedAtRef = useRef<number | null>(null)
  const phaseRef = useRef<ReplayPhase>('idle')
  const lastFiredCaptionRef = useRef<string>('')
  const firedMovementsRef = useRef<Set<string>>(new Set())

  const [, force] = useState(0)
  useImperativeHandle(handleRef ?? { current: null }, () => ({
    reset() {
      startedAtRef.current = null
      phaseRef.current = 'idle'
      lastFiredCaptionRef.current = ''
      firedMovementsRef.current.clear()
      force((n) => n + 1)
    },
  }))

  // Reset when scene/mode/resetCounter changes.
  useEffect(() => {
    startedAtRef.current = null
    phaseRef.current = 'idle'
    lastFiredCaptionRef.current = ''
    firedMovementsRef.current.clear()
  }, [scene.id, mode, resetCounter])

  useFrame((state) => {
    if (mode === 'static' || timeline.totalMs === 0) {
      // Snap to start positions for everyone.
      snapToStart(scene, playerRefs, ballRef)
      if (phaseRef.current !== 'done') {
        phaseRef.current = 'done'
        onPhase?.('done')
      }
      return
    }

    if (startedAtRef.current === null) {
      startedAtRef.current = state.clock.getElapsedTime() * 1000 + PRE_DELAY_MS
      phaseRef.current = 'playing'
      onPhase?.('playing')
    }

    const elapsed = state.clock.getElapsedTime() * 1000 - startedAtRef.current
    const t = Math.max(0, Math.min(elapsed, timeline.totalMs))

    // Fire onMovement for each movement as it crosses its start time.
    if (onMovement) {
      for (const m of timeline.movements) {
        if (t >= m.startMs && !firedMovementsRef.current.has(m.id)) {
          firedMovementsRef.current.add(m.id)
          const original = movements.find((mm) => mm.id === m.id)
          if (original) onMovement(original)
        }
      }
    }

    // Update each player position from the sampled timeline.
    for (const player of scene.players) {
      const group = playerRefs.current.get(player.id)
      if (!group) continue
      const pos = samplePlayer(scene, timeline, player.id, t)
      group.position.set(pos.x, 0, pos.z)
    }
    if (ballRef.current) {
      const ballPos = samplePlayer(scene, timeline, 'ball', t)
      ballRef.current.position.set(ballPos.x, 0, ballPos.z)
    }

    // Captions: emit the active movement's caption once it starts.
    const active = timeline.movements.find((m) => t >= m.startMs && t <= m.endMs)
    const caption = active?.caption ?? ''
    if (caption !== lastFiredCaptionRef.current) {
      lastFiredCaptionRef.current = caption
      onCaption?.(caption || undefined)
    }

    if (elapsed >= timeline.totalMs && phaseRef.current !== 'done') {
      phaseRef.current = 'done'
      onPhase?.('done')
    }
  })

  return null
}

function snapToStart(
  scene: Scene3D,
  playerRefs: React.MutableRefObject<Map<string, THREE.Group>>,
  ballRef: React.MutableRefObject<THREE.Group | null>,
) {
  for (const player of scene.players) {
    const group = playerRefs.current.get(player.id)
    if (!group) continue
    group.position.set(player.start.x, 0, player.start.z)
  }
  if (ballRef.current) {
    const ball = resolveBallStart(scene)
    ballRef.current.position.set(ball.x, 0, ball.z)
  }
}
