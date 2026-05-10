'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { PlayerMarker3D } from './PlayerMarker3D'
import { BallMarker3D } from './BallMarker3D'
import { MovementPath3D } from './MovementPath3D'
import {
  ScenarioReplayController,
  type ReplayMode,
  type ReplayPhase,
} from './ScenarioReplayController'
import { TeachingOverlayController, type OverlayPhase } from './imperativeTeachingOverlay'
import { useReducedMotion } from '@/lib/scenario3d/useReducedMotion'
import type { Scene3D } from '@/lib/scenario3d/scene'
import {
  applyOverlayLevel,
  DEFAULT_OVERLAY_LEVEL,
  isOverlaySuppressed,
  type OverlayLevel,
} from '@/lib/scenario3d/overlayLevel'
import {
  TEACHING_LABEL_FADE_IN_MS,
  getDecoderTeachingLabel,
} from '@/lib/scenario3d/replayTeachingTimeline'

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
  /**
   * Phase H — drives the consequence + best-read replay flow. Forwarded
   * to `ScenarioReplayController`; while the controller is in `frozen`,
   * setting this kicks off the consequence leg (or short-circuits to
   * the answer leg for best-read choices).
   */
  pickedChoiceId?: string | null
  /**
   * FR-5 §9.2 — Pathways-driven overlay intensity. Forwarded to
   * `AuthoredOverlayBridge` which projects the scene's overlay arrays
   * through `applyOverlayLevel` before mounting them. Default
   * `'beginner'` mounts the full cluster — pre-FR-5 behavior.
   */
  overlayLevel?: OverlayLevel
}

const PLAYER_HEIGHT = 0
const BALL_REST_Y = 0

const USER_PATH_COLOR = '#3BFF9D'
const OFFENSE_PATH_COLOR = '#5DB4FF'
const DEFENSE_PATH_COLOR = '#FF5C72'
const BALL_PATH_COLOR = '#FFB070'

/**
 * Renders the players, ball, and (optionally) movement paths for a scene.
 * The ScenarioReplayController mutates per-player group positions each
 * frame so React state never thrashes during animation.
 *
 * Path display is curated to match the spec: a single active correct-move
 * path at a time, with the destination marker. When multiple movements
 * exist on the active timeline, only the user's movement (or the first
 * non-ball movement) gets the full destination marker; supporting moves
 * draw thinner paths so the eye still goes to the answer.
 */
export function ScenarioScene3D({
  scene,
  mode = 'static',
  resetCounter,
  onCaption,
  onPhase,
  showPaths,
  pickedChoiceId,
  overlayLevel = DEFAULT_OVERLAY_LEVEL,
}: ScenarioScene3DProps) {
  const playerRefs = useRef<Map<string, THREE.Group>>(new Map())
  const ballRef = useRef<THREE.Group | null>(null)
  // Phase H — track the controller's emitted phase locally so the
  // authored-overlay bridge can flip pre/post visibility in lockstep
  // with the replay state machine. Parent listeners still receive the
  // phase through the existing `onPhase` callback.
  const [replayPhase, setReplayPhase] = useState<ReplayPhase>('idle')
  const handlePhase = (next: ReplayPhase) => {
    setReplayPhase(next)
    onPhase?.(next)
  }
  // Pack 2 (3.1.4) — beat index for HUNT chained scenes. The bridge
  // swaps the pre-overlay set on beat 2 from `preAnswerOverlays` to
  // `secondBeatPreAnswerOverlays` when this transitions 0 → 1. Pack 1
  // scenes never advance past 0; they see no behavior change.
  const [beatIndex, setBeatIndex] = useState<0 | 1>(0)
  // Reset beat index whenever the scene swaps; prevents a stale beat-2
  // overlay set from leaking into a fresh scenario load.
  useEffect(() => {
    setBeatIndex(0)
  }, [scene.id])

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

  // Pick the headline movement for "destination" treatment: prefer the user's
  // first non-ball movement, otherwise the first non-ball movement.
  const headlineMovementId = (() => {
    const userPlayer = scene.players.find((p) => p.isUser)
    if (userPlayer) {
      const userMove = activeMovements.find(
        (m) => m.playerId === userPlayer.id,
      )
      if (userMove) return userMove.id
    }
    const firstNonBall = activeMovements.find((m) => m.playerId !== 'ball')
    return firstNonBall?.id
  })()

  return (
    <group>
      <ScenarioReplayController
        scene={scene}
        mode={mode}
        playerRefs={playerRefs}
        ballRef={ballRef}
        onCaption={onCaption}
        onPhase={handlePhase}
        resetCounter={resetCounter}
        pickedChoiceId={pickedChoiceId}
        onBeatIndex={setBeatIndex}
      />

      {/* Phase H — authored pre/post overlay bridge. Mounts a heuristic-free
          TeachingOverlayController inside the JSX scene tree so decoder
          scenarios on the full path get layered post-answer reveals.
          FR-5 — `overlayLevel` controls how much of the authored cluster
          actually mounts.
          Pack 2 (3.1.4) — `beatIndex` is forwarded so the bridge can
          swap pre-overlays for HUNT beat 2. */}
      <AuthoredOverlayBridge
        scene={scene}
        replayPhase={replayPhase}
        overlayLevel={overlayLevel}
        beatIndex={beatIndex}
      />

      {showPaths && activeMovements.length > 0
        ? activeMovements.map((m) => {
            if (m.playerId === 'ball') {
              return (
                <MovementPath3D
                  key={m.id}
                  from={[ballStartX, ballStartZ]}
                  to={[m.to.x, m.to.z]}
                  color={BALL_PATH_COLOR}
                  pulse
                  arrow
                  destination={false}
                  thickness={0.14}
                />
              )
            }
            const player = scene.players.find((p) => p.id === m.playerId)
            if (!player) return null
            const isHeadline = m.id === headlineMovementId
            const color = player.isUser
              ? USER_PATH_COLOR
              : player.team === 'offense'
                ? OFFENSE_PATH_COLOR
                : DEFENSE_PATH_COLOR
            return (
              <MovementPath3D
                key={m.id}
                from={[player.start.x, player.start.z]}
                to={[m.to.x, m.to.z]}
                color={color}
                pulse={isHeadline}
                arrow
                destination={isHeadline}
                thickness={isHeadline ? 0.22 : 0.12}
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
            active={player.isUser}
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

/**
 * Phase H — JSX bridge that wraps the imperative `TeachingOverlayController`
 * in heuristic-free mode so decoder scenarios on the full Court3D +
 * ScenarioScene3D path get the same authored pre/post overlays the
 * imperative simple-mode path has shipped since Phase E.
 *
 * The controller attaches its overlay group to the R3F scene root via
 * `useThree`; the overlay mounts on first render, swaps the authored
 * primitives in `setAuthoredOverlays`, flips visibility on `replayPhase`
 * (frozen → 'pre'; consequence/replaying/done → 'post'), and disposes
 * GPU resources on unmount.
 */
function AuthoredOverlayBridge({
  scene,
  replayPhase,
  overlayLevel,
  beatIndex = 0,
}: {
  scene: Scene3D
  replayPhase: ReplayPhase
  overlayLevel: OverlayLevel
  /** Pack 2 (3.1.4) — when 1, the bridge mounts
   *  `secondBeatPreAnswerOverlays` / `secondBeatPostAnswerOverlays`
   *  in place of the primary overlay arrays. Pack 1 scenes always
   *  pass 0 (and the secondBeat arrays are empty anyway). */
  beatIndex?: 0 | 1
}) {
  const root = useThree((s) => s.scene as unknown as THREE.Group)
  const ctrlRef = useRef<TeachingOverlayController | null>(null)
  // FR-7 — bumped every time we install a new controller so the
  // phase-sync effect below re-runs and reapplies the current
  // `replayPhase` against the freshly built controller. Without
  // this, changing `overlayLevel` mid-phase (QA dropdown, Pathways
  // mode swap) rebuilds the controller but leaves it parked at
  // its default `'hidden'` phase, which silently hides every
  // authored overlay until the next phase transition.
  const [ctrlEpoch, setCtrlEpoch] = useState(0)
  const reduced = useReducedMotion()

  // FR-5 — project the scene's authored overlay arrays through the
  // level filter on every (scene.id × overlayLevel) change. The filter
  // is pure so the result memo lets the rebuild effect below depend
  // on the filtered shape rather than re-invoking the filter inline.
  //
  // Pack 2 (3.1.2) — `consequenceOverlays` is filtered alongside the
  // pre/post arrays; the filter currently passes consequence through
  // unchanged (it does not have its own per-tier suppression rule),
  // so the bridge feeds the raw scene array. When a per-tier rule
  // lands later, extend `applyOverlayLevel` rather than the bridge.
  // Memoized so the rebuild effect's dep array stays stable across
  // renders that don't change the underlying scene field.
  const consequenceOverlays = useMemo(
    () => scene.consequenceOverlays ?? [],
    [scene.consequenceOverlays],
  )

  // Pack 2 (3.1.4) — pick the active pre/post overlay set based on
  // beat index. On beat 2, prefer the secondBeat arrays when authored;
  // fall back to the primary arrays when the secondBeat arrays are
  // empty so authors can opt into "beat 2 reuses beat 1 overlays".
  const activePreAnswer = useMemo(() => {
    const secondBeatPreAnswer = scene.secondBeatPreAnswerOverlays ?? []
    return beatIndex === 1 && secondBeatPreAnswer.length > 0
      ? secondBeatPreAnswer
      : scene.preAnswerOverlays
  }, [beatIndex, scene.secondBeatPreAnswerOverlays, scene.preAnswerOverlays])
  const activePostAnswer = useMemo(() => {
    const secondBeatPostAnswer = scene.secondBeatPostAnswerOverlays ?? []
    return beatIndex === 1 && secondBeatPostAnswer.length > 0
      ? secondBeatPostAnswer
      : scene.postAnswerOverlays
  }, [beatIndex, scene.secondBeatPostAnswerOverlays, scene.postAnswerOverlays])

  const filtered = useMemo(
    () =>
      applyOverlayLevel({
        preAnswer: activePreAnswer,
        postAnswer: activePostAnswer,
        level: overlayLevel,
        // Pack 2 Teaching-Quality F6 — promote the decoder's primary
        // cue kind through the priority sort so a tight cap (advanced
        // = 1) cannot drop the cue identifying the decoder.
        decoderTag: scene.decoderTag,
      }),
    [overlayLevel, activePreAnswer, activePostAnswer, scene.decoderTag],
  )

  useEffect(() => {
    if (!root) return
    const ctrl = new TeachingOverlayController(scene, 'intro', root, {
      reduced,
      heuristic: false,
    })
    ctrl.setAuthoredOverlays(filtered.preAnswer, filtered.postAnswer, consequenceOverlays)
    // FR-5 — suppressed levels (Boss / 'none') keep the controller
    // mounted so phase callbacks still no-op cleanly, but with the
    // overlay group hidden so nothing renders.
    ctrl.setVisible(!isOverlaySuppressed(overlayLevel))
    ctrlRef.current = ctrl
    // FR-7 — trigger the phase-sync effect to reapply the current
    // replayPhase against the new controller. The phase-sync effect
    // is the single source of truth for overlay phase + teaching
    // label state, so we bump an epoch counter rather than
    // duplicating that logic inline here.
    setCtrlEpoch((e) => e + 1)
    return () => {
      ctrl.dispose()
      ctrlRef.current = null
    }
    // Rebuild only on scene swap or filter result swap; phase changes
    // flow through setPhase below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene.id, filtered, overlayLevel, consequenceOverlays])

  useEffect(() => {
    const ctrl = ctrlRef.current
    if (!ctrl) return
    // FR-6 — `cueRepaint` is the brief window between consequence
    // end / best-read pick and the start of answer-leg motion. We
    // re-paint the pre-answer cluster so the cue lands one more
    // time before the read plays.
    //
    // Pack 2 (3.1.2) — `consequence` controller phase routes to the
    // new `'consequence'` overlay phase WHEN the scene authors a
    // non-empty `consequenceOverlays` set; otherwise it falls back
    // to `'post'` so Pack 1 wrong-demo legs (which have no
    // consequence overlays authored) keep their existing visual
    // treatment bit-identical.
    const hasConsequenceOverlays = consequenceOverlays.length > 0
    const overlayPhase: OverlayPhase =
      replayPhase === 'frozen' || replayPhase === 'cueRepaint'
        ? 'pre'
        : replayPhase === 'consequence'
          ? hasConsequenceOverlays
            ? 'consequence'
            : 'post'
          : replayPhase === 'replaying' || replayPhase === 'done'
            ? 'post'
            : 'hidden'
    ctrl.setPhase(overlayPhase)

    // FR-6 — end-of-rep teaching label. Mounts on `done` and
    // anchors above the cue role's player position; clears on
    // scene swap (the rebuild effect's cleanup also disposes via
    // `ctrl.dispose()`, so this is defense in depth) or whenever
    // the user re-enters the rep (idle / setup / playing).
    if (replayPhase === 'done' && scene.decoderTag) {
      const label = getDecoderTeachingLabel(scene.decoderTag)
      const anchorPlayer = pickTeachingLabelAnchor(scene, label.anchorRole)
      if (anchorPlayer) {
        ctrl.setTeachingLabel({
          text: label.text,
          anchor: { x: anchorPlayer.x, z: anchorPlayer.z },
          fadeDurationMs: TEACHING_LABEL_FADE_IN_MS,
          targetOpacity: 1,
        })
      }
    } else if (replayPhase === 'idle' || replayPhase === 'setup' || replayPhase === 'playing') {
      // The user is re-entering the rep — drop any stale label so
      // the next rep doesn't show last rep's chip.
      if (ctrl.hasTeachingLabel()) ctrl.clearTeachingLabel()
    }
    // ctrlEpoch is intentionally in the dep list — it bumps when
    // the rebuild effect installs a new controller so we reapply
    // the current phase without waiting for `replayPhase` to change.
  }, [replayPhase, scene, ctrlEpoch])

  useFrame((state) => {
    ctrlRef.current?.tick(state.clock.getElapsedTime() * 1000)
  })

  return null
}

/**
 * FR-6 — picks a court point above which the end-of-rep teaching
 * label should hover. The plan's §9.4 anchor rule is "above the
 * cue", and across all four founder families the cue's payoff
 * lands on the user's figure (cutter / receiver / open shooter /
 * skip target). We anchor at the user's starting position so the
 * label is deterministic regardless of where the answer leg
 * deposits the user — and it stays inside the freeze framing the
 * cueRepaint phase already centred on the user.
 *
 * Returns null when the scene has no user player (legacy /
 * synthetic scenes); the bridge no-ops in that case.
 */
function pickTeachingLabelAnchor(
  scene: Scene3D,
  _role: 'cutter' | 'receiver' | 'open_player' | 'helper_defender' | 'closeout_defender' | 'deny_defender',
): { x: number; z: number } | null {
  const user = scene.players.find((p) => p.isUser)
  if (user) return { x: user.start.x, z: user.start.z }
  const firstOffense = scene.players.find((p) => p.team === 'offense')
  if (firstOffense) return { x: firstOffense.start.x, z: firstOffense.start.z }
  return null
}
