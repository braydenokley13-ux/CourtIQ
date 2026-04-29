'use client'

import { useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import type { Scene3D, SceneMovement } from '@/lib/scenario3d/scene'
import {
  buildTimeline,
  resolveBallStart,
  samplePlayer,
  samplePositionsAt,
  type Timeline,
} from '@/lib/scenario3d/timeline'
import type { CourtPoint } from '@/lib/scenario3d/coords'

export type ReplayMode = 'static' | 'intro' | 'answer'

/**
 * Phase D — replay phase enum. The legacy JSX controller in this file
 * still emits the original three (`idle | playing | done`) for scenes
 * without a freeze marker; the imperative `ReplayStateMachine` in
 * `imperativeScene.ts` extends the same enum with `setup | frozen |
 * consequence | replaying` for decoder scenes. Callers that switch on
 * this type should treat the legacy three as a subset.
 */
export type ReplayPhase =
  | 'idle'
  | 'setup'
  | 'playing'
  | 'frozen'
  | 'consequence'
  | 'replaying'
  | 'done'

export interface ReplayHandle {
  /** Restart the current leg from t=0. */
  reset(): void
  /** From `done`, replays the answer-demo leg from the freeze snapshot. */
  showAgain(): void
}

/** Phase H — internal leg of the replay flow. The legacy 'intro'/'answer'
 *  modes map onto these; decoder scenarios cycle through all of
 *  intro → consequence (optional) → answer. */
type ReplayLeg = 'intro' | 'consequence' | 'answer'

interface ScenarioReplayControllerProps {
  scene: Scene3D
  mode: ReplayMode
  /** Refs for each player's group. The controller mutates `position`. */
  playerRefs: React.MutableRefObject<Map<string, THREE.Group>>
  ballRef: React.MutableRefObject<THREE.Group | null>
  /** Notifies the parent of phase / progress changes. */
  onPhase?: (phase: ReplayPhase) => void
  /** Captions emitted as the timeline crosses each movement's startMs. */
  onCaption?: (caption: string | undefined) => void
  /** Fires once per movement as it begins playing. */
  onMovement?: (movement: SceneMovement) => void
  /** External handle for parent-driven controls. */
  handleRef?: React.MutableRefObject<ReplayHandle | null>
  /** Force a one-shot reset on this counter change. From 'done' it
   *  replays the answer leg ("Show me again"); otherwise it restarts
   *  the active leg from t=0. */
  resetCounter?: number
  /**
   * Phase H — the user's picked choice. While `mode === 'intro'` and
   * the controller is in `frozen`, setting this triggers the
   * consequence → replay sequence:
   *   - if the scene has a `wrongDemos[choiceId]` entry, that leg plays
   *     first and the controller emits `'consequence'`, then the answer
   *     demo plays from the freeze snapshot;
   *   - otherwise (best-read), the controller short-circuits straight
   *     to `'replaying'` from the snapshot.
   * Treated as a one-shot — the controller consumes the id and ignores
   * subsequent identical values until reset.
   */
  pickedChoiceId?: string | null
}

const PRE_DELAY_MS = 250
const EMPTY_TIMELINE: Timeline = { totalMs: 0, movements: [], byPlayer: new Map() }

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
  pickedChoiceId,
}: ScenarioReplayControllerProps) {
  // Active leg + the timeline / movements driving it. Held in refs so
  // `useFrame` can read them per-tick without re-subscribing, and a
  // leg-swap effect can rebuild them in O(1) without re-rendering.
  const legRef = useRef<ReplayLeg>(mode === 'answer' ? 'answer' : 'intro')
  const movementsRef = useRef<SceneMovement[]>([])
  const timelineRef = useRef<Timeline>(EMPTY_TIMELINE)

  const startedAtRef = useRef<number | null>(null)
  const phaseRef = useRef<ReplayPhase>('idle')
  const lastFiredCaptionRef = useRef<string>('')
  const firedMovementsRef = useRef<Set<string>>(new Set())
  /** Phase H — positions captured at the moment freeze fires. Idle
   *  players in later legs render from this snapshot instead of
   *  `scene.players[*].start`. */
  const snapshotRef = useRef<Map<string, CourtPoint> | null>(null)
  const consumedChoiceRef = useRef<string | null>(null)

  // Initial movements + timeline for the controller's first leg. Memoised
  // off `mode` and `scene.id` so swapping scenarios builds a fresh
  // timeline exactly once. Decoder scenarios stay on `mode='intro'`
  // throughout — the leg machinery handles the consequence / answer
  // legs internally.
  const initialMovements = useMemo<SceneMovement[]>(() => {
    if (mode === 'static') return []
    return mode === 'answer' ? scene.answerDemo : scene.movements
  }, [mode, scene])

  const initialTimeline = useMemo(
    () => buildTimeline(scene, initialMovements),
    [scene, initialMovements],
  )

  const [, force] = useState(0)
  useImperativeHandle(handleRef ?? { current: null }, () => ({
    reset() {
      restartCurrentLeg()
      force((n) => n + 1)
    },
    showAgain() {
      enterReplayLegFromSnapshot()
      force((n) => n + 1)
    },
  }))

  // Reset state when scene/mode changes. `resetCounter` is handled in a
  // separate effect below so a bump doesn't tear down all the refs — it
  // either restarts the current leg or calls showAgain when in done.
  useEffect(() => {
    legRef.current = mode === 'answer' ? 'answer' : 'intro'
    movementsRef.current = initialMovements
    timelineRef.current = initialTimeline
    startedAtRef.current = null
    phaseRef.current = 'idle'
    lastFiredCaptionRef.current = ''
    firedMovementsRef.current.clear()
    snapshotRef.current = null
    consumedChoiceRef.current = null
  }, [scene.id, mode, initialMovements, initialTimeline])

  // resetCounter — restart the active leg, or replay from snapshot if
  // we're already in `done` (the "Show me again" affordance the train
  // page wires to its replay button).
  useEffect(() => {
    if (resetCounter === undefined) return
    if (phaseRef.current === 'done' && snapshotRef.current) {
      enterReplayLegFromSnapshot()
    } else {
      restartCurrentLeg()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetCounter])

  // pickedChoiceId — only honored while `frozen`. Records the choice and
  // dispatches the consequence leg (or short-circuits to the answer
  // leg) per Section 5.5 of the planning doc.
  useEffect(() => {
    if (!pickedChoiceId) return
    if (consumedChoiceRef.current === pickedChoiceId) return
    if (phaseRef.current !== 'frozen') return
    consumedChoiceRef.current = pickedChoiceId

    const wrongDemo = scene.wrongDemos.find((d) => d.choiceId === pickedChoiceId)
    if (wrongDemo) {
      legRef.current = 'consequence'
      movementsRef.current = wrongDemo.movements
      timelineRef.current = buildTimeline(scene, wrongDemo.movements, {
        startOverrides: snapshotRef.current ?? undefined,
      })
      startedAtRef.current = null
      lastFiredCaptionRef.current = ''
      firedMovementsRef.current.clear()
      phaseRef.current = 'consequence'
      onPhase?.('consequence')
      if (wrongDemo.caption) onCaption?.(wrongDemo.caption)
    } else {
      // Best-read short-circuits silently. Any other choiceId reaching
      // here is a missing-wrongDemos authoring fault — emit a
      // breadcrumb (Sentry's nextjs auto-instruments console.warn) so
      // the canvas degrades gracefully without losing the signal.
      if (scene.wrongDemos.length > 0 && typeof console !== 'undefined') {
        console.warn('[scenario3d] no wrongDemos entry for choice; falling back to replay leg', {
          sceneId: scene.id,
          choiceId: pickedChoiceId,
          authoredChoiceIds: scene.wrongDemos.map((d) => d.choiceId),
        })
      }
      enterReplayLegFromSnapshot()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedChoiceId, scene])

  // Phase D — when the active leg is the intro and the scene has an
  // authored freeze cue, clamp the visible t at that value and emit the
  // 'frozen' phase exactly once. Other legs always play to their end.
  const introFreezeCapMs =
    typeof scene.freezeAtMs === 'number' && scene.freezeAtMs >= 0
      ? Math.min(scene.freezeAtMs, initialTimeline.totalMs)
      : null

  useFrame((state) => {
    const nowMs = state.clock.getElapsedTime() * 1000

    if (mode === 'static' || timelineRef.current.totalMs === 0) {
      // Snap every player back to their authored start.
      snapToStart(scene, playerRefs, ballRef)
      if (phaseRef.current !== 'done') {
        phaseRef.current = 'done'
        onPhase?.('done')
      }
      return
    }

    if (startedAtRef.current === null) {
      startedAtRef.current = nowMs + PRE_DELAY_MS
      const enterPhase: ReplayPhase = phaseForLeg(legRef.current)
      if (phaseRef.current !== enterPhase) {
        phaseRef.current = enterPhase
        onPhase?.(enterPhase)
      }
    }

    const timeline = timelineRef.current
    const movements = movementsRef.current
    const elapsed = nowMs - startedAtRef.current
    const cap =
      legRef.current === 'intro' && introFreezeCapMs !== null
        ? introFreezeCapMs
        : timeline.totalMs
    const t = Math.max(0, Math.min(elapsed, cap))

    // Fire onMovement edges as movements cross their start time.
    if (onMovement) {
      for (const m of timeline.movements) {
        if (t >= m.startMs && !firedMovementsRef.current.has(m.id)) {
          firedMovementsRef.current.add(m.id)
          const original = movements.find((mm) => mm.id === m.id)
          if (original) onMovement(original)
        }
      }
    }

    // Update each player position from the sampled timeline. Idle
    // players (no entry in `byPlayer`) honor the freeze snapshot when
    // one exists so consequence / replay legs do not snap defenders
    // back to their original starts.
    const overrides = snapshotRef.current
    for (const player of scene.players) {
      const group = playerRefs.current.get(player.id)
      if (!group) continue
      const pos = samplePlayer(scene, timeline, player.id, t, overrides)
      group.position.set(pos.x, 0, pos.z)
    }
    if (ballRef.current) {
      const ballPos = samplePlayer(scene, timeline, 'ball', t, overrides)
      ballRef.current.position.set(ballPos.x, 0, ballPos.z)
    }

    // Captions: emit the active movement's caption once it starts.
    const active = timeline.movements.find((m) => t >= m.startMs && t <= m.endMs)
    const caption = active?.caption ?? ''
    if (caption !== lastFiredCaptionRef.current) {
      lastFiredCaptionRef.current = caption
      onCaption?.(caption || undefined)
    }

    // Transitions
    if (
      legRef.current === 'intro' &&
      introFreezeCapMs !== null &&
      elapsed >= introFreezeCapMs &&
      phaseRef.current !== 'frozen' &&
      phaseRef.current !== 'done'
    ) {
      // Snapshot the visible pose so consequence + answer legs resume
      // from the frozen positions instead of the authored starts.
      snapshotRef.current = samplePositionsAt(scene, timeline, t)
      phaseRef.current = 'frozen'
      onPhase?.('frozen')
      return
    }

    if (
      legRef.current === 'consequence' &&
      elapsed >= timeline.totalMs &&
      phaseRef.current === 'consequence'
    ) {
      // Consequence finished — snap to the freeze snapshot and play the
      // answer demo. The answer leg always honors snapshot overrides for
      // idle players, matching Section 5.5.
      enterReplayLegFromSnapshot()
      return
    }

    if (
      elapsed >= timeline.totalMs &&
      (legRef.current === 'answer' || (legRef.current === 'intro' && introFreezeCapMs === null)) &&
      phaseRef.current !== 'done'
    ) {
      phaseRef.current = 'done'
      onPhase?.('done')
    }
  })

  // ---- helpers ----

  function restartCurrentLeg() {
    startedAtRef.current = null
    phaseRef.current = 'idle'
    lastFiredCaptionRef.current = ''
    firedMovementsRef.current.clear()
    // The leg's movements + timeline stay as they are; the next useFrame
    // re-anchors `startedAt` and re-emits the leg's entry phase.
  }

  function enterReplayLegFromSnapshot() {
    const snapshot = snapshotRef.current
    legRef.current = 'answer'
    movementsRef.current = scene.answerDemo
    timelineRef.current = buildTimeline(scene, scene.answerDemo, {
      startOverrides: snapshot ?? undefined,
    })
    startedAtRef.current = null
    lastFiredCaptionRef.current = ''
    firedMovementsRef.current.clear()
    phaseRef.current = 'replaying'
    onPhase?.('replaying')
  }

  return null
}

function phaseForLeg(leg: ReplayLeg): ReplayPhase {
  if (leg === 'consequence') return 'consequence'
  if (leg === 'answer') return 'replaying'
  return 'playing'
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
