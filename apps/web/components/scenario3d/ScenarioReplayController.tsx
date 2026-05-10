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
import {
  D4_PLUS_WRONG_DWELL_EXTENSION_MS,
  D4_PLUS_WRONG_DWELL_MIN_DIFFICULTY,
  PRE_CONSEQUENCE_DELAY_MS,
} from '@/lib/scenario3d/replayTeachingTimeline'
import { resolveFreezeTiming } from '@/lib/scenario3d/freezeFrameCognition'

export type ReplayMode = 'static' | 'intro' | 'answer'

/**
 * Phase D — replay phase enum. The legacy JSX controller in this file
 * still emits the original three (`idle | playing | done`) for scenes
 * without a freeze marker; the imperative `ReplayStateMachine` in
 * `imperativeScene.ts` extends the same enum with `setup | frozen |
 * consequence | replaying` for decoder scenes. Callers that switch on
 * this type should treat the legacy three as a subset.
 *
 * FR-6 — adds `cueRepaint`: the brief window after a consequence
 * leg ends (or a best-read pick fires) during which the renderer
 * holds motion and repaints the pre-answer cue cluster before the
 * answer-leg motion begins. The bridge maps it to overlay phase
 * `'pre'` so the cue lands one more time before the read plays.
 */
export type ReplayPhase =
  | 'idle'
  | 'setup'
  | 'playing'
  | 'frozen'
  | 'consequence'
  | 'cueRepaint'
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

/** Default pre-roll for the *first* leg (intro / direct answer). The
 *  consequence and answer legs use the FR-6 cadence below instead. */
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
  /** FR-6 — per-leg pre-delay. Defaults to PRE_DELAY_MS; the consequence
   *  / answer leg entry helpers override this to the §10.2 cadence. */
  const preDelayMsRef = useRef<number>(PRE_DELAY_MS)
  /** FR-6 — when the answer leg is entered via the cue-repaint hold, we
   *  record the entry path so the next-frame transition emits the
   *  correct phase ('replaying') only once motion actually starts. */
  const cueRepaintActiveRef = useRef<boolean>(false)
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
    preDelayMsRef.current = PRE_DELAY_MS
    cueRepaintActiveRef.current = false
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

    // Pack 2 Teaching-Quality F11 — check acceptable demos first so a
    // template that authored both a wrongDemo and an acceptableDemo
    // for the same choiceId routes to the acceptable branch (an
    // authoring conflict the scaffolder would otherwise allow). The
    // acceptableDemos array is keyed by choiceId of `acceptable`-
    // quality choices only (validated at materialize time), so this
    // lookup is safe.
    const acceptableDemo = scene.acceptableDemos.find(
      (d) => d.choiceId === pickedChoiceId,
    )
    const wrongDemo = scene.wrongDemos.find((d) => d.choiceId === pickedChoiceId)
    const consequenceDemo = acceptableDemo ?? wrongDemo
    if (consequenceDemo) {
      legRef.current = 'consequence'
      movementsRef.current = consequenceDemo.movements
      timelineRef.current = buildTimeline(scene, consequenceDemo.movements, {
        startOverrides: snapshotRef.current ?? undefined,
      })
      startedAtRef.current = null
      // FR-6 §10.2 — the wrong-choice tile flashes for ~80 ms before
      // the consequence leg starts moving. Same beat for an
      // acceptable-demo so the player gets equivalent acknowledgement
      // before the second-best read plays.
      preDelayMsRef.current = PRE_CONSEQUENCE_DELAY_MS
      cueRepaintActiveRef.current = false
      lastFiredCaptionRef.current = ''
      firedMovementsRef.current.clear()
      phaseRef.current = 'consequence'
      onPhase?.('consequence')
      if (consequenceDemo.caption) onCaption?.(consequenceDemo.caption)
    } else {
      // Best-read short-circuits silently. Any other choiceId reaching
      // here is a missing-wrongDemos authoring fault — emit a
      // breadcrumb (Sentry's nextjs auto-instruments console.warn) so
      // the canvas degrades gracefully without losing the signal.
      if (
        (scene.wrongDemos.length > 0 || scene.acceptableDemos.length > 0) &&
        typeof console !== 'undefined'
      ) {
        console.warn(
          '[scenario3d] no wrongDemos / acceptableDemos entry for choice; falling back to replay leg',
          {
            sceneId: scene.id,
            choiceId: pickedChoiceId,
            authoredWrongChoiceIds: scene.wrongDemos.map((d) => d.choiceId),
            authoredAcceptableChoiceIds: scene.acceptableDemos.map((d) => d.choiceId),
          },
        )
      }
      // FR-6 — best-read path holds the cue cluster for ~600 ms
      // before motion (§10.2 correct-path beat).
      enterReplayLegFromSnapshot('correct')
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
      startedAtRef.current = nowMs + preDelayMsRef.current
      // FR-6 — the consequence/answer entry helpers above set
      // `phaseRef.current` directly (and may emit 'cueRepaint' for
      // the answer leg). Don't clobber that — only emit the
      // phase-for-leg fallback when nothing more specific has
      // been set. This preserves pre-FR-6 behaviour for the intro
      // leg and the legacy 'answer' mode.
      if (phaseRef.current === 'idle') {
        const enterPhase: ReplayPhase = phaseForLeg(legRef.current)
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
      // idle players, matching Section 5.5. FR-6: hold the cue
      // cluster on screen for the wrong-path repaint window before
      // motion begins.
      enterReplayLegFromSnapshot('wrong')
      return
    }

    // FR-6 — once the answer leg's pre-delay window elapses, motion
    // has started; flip cueRepaint → replaying so the bridge can
    // swap pre-overlays out for post-overlays.
    if (
      legRef.current === 'answer' &&
      cueRepaintActiveRef.current &&
      elapsed >= 0 &&
      phaseRef.current === 'cueRepaint'
    ) {
      cueRepaintActiveRef.current = false
      phaseRef.current = 'replaying'
      onPhase?.('replaying')
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
    preDelayMsRef.current = PRE_DELAY_MS
    cueRepaintActiveRef.current = false
    phaseRef.current = 'idle'
    lastFiredCaptionRef.current = ''
    firedMovementsRef.current.clear()
    // The leg's movements + timeline stay as they are; the next useFrame
    // re-anchors `startedAt` and re-emits the leg's entry phase.
  }

  /** Enters the answer leg from the freeze snapshot.
   *
   *  FR-6 — when called with an explicit path, holds the world for
   *  the §10.2 cue-repaint window and emits the new `'cueRepaint'`
   *  phase first so the AuthoredOverlayBridge re-mounts the
   *  pre-answer cluster before motion begins. The transition to
   *  `'replaying'` happens exactly when motion starts (elapsed=0)
   *  inside `useFrame`.
   *
   *  Called without a path (e.g. "Show me again") preserves the
   *  pre-FR-6 contract: emits `'replaying'` immediately and uses
   *  the default 250 ms pre-delay.
   */
  function enterReplayLegFromSnapshot(path?: 'wrong' | 'correct') {
    const snapshot = snapshotRef.current
    legRef.current = 'answer'
    movementsRef.current = scene.answerDemo
    timelineRef.current = buildTimeline(scene, scene.answerDemo, {
      startOverrides: snapshot ?? undefined,
    })
    startedAtRef.current = null
    lastFiredCaptionRef.current = ''
    firedMovementsRef.current.clear()

    // Phase 3.1.4 runtime — pull per-scenario timing if the authored
    // scene supplied a timingOverrides block; otherwise the resolver
    // returns DEFAULT_FREEZE_TIMING (bit-identical to the legacy
    // CUE_REPAINT_HOLD_* constants). Resolved per-call so a scene
    // hot-swap during dev does not need a controller remount.
    const timing = resolveFreezeTiming(scene.timingOverrides)
    if (path === 'wrong') {
      // Pack 2 Teaching-Quality F8 — at effective difficulty ≥ 4, add
      // an extra dwell beat between the consequence ending and the
      // answer leg starting so the player has cognitive room to
      // absorb "why wrong" before "what was right" begins. D1-D3
      // path is unchanged (extension = 0). The extension is additive
      // on top of any per-scenario timingOverrides.cueRepaintHoldWrongMs.
      const d = scene.effectiveDifficulty
      const f8Extension =
        typeof d === 'number' && d >= D4_PLUS_WRONG_DWELL_MIN_DIFFICULTY
          ? D4_PLUS_WRONG_DWELL_EXTENSION_MS
          : 0
      preDelayMsRef.current = timing.cueRepaintHoldWrongMs + f8Extension
      cueRepaintActiveRef.current = true
      phaseRef.current = 'cueRepaint'
      onPhase?.('cueRepaint')
    } else if (path === 'correct') {
      preDelayMsRef.current = timing.cueRepaintHoldCorrectMs
      cueRepaintActiveRef.current = true
      phaseRef.current = 'cueRepaint'
      onPhase?.('cueRepaint')
    } else {
      preDelayMsRef.current = PRE_DELAY_MS
      cueRepaintActiveRef.current = false
      phaseRef.current = 'replaying'
      onPhase?.('replaying')
    }
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
