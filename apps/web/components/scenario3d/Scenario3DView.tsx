'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { Scenario3DCanvas } from './Scenario3DCanvas'
import { Scenario3DErrorBoundary } from './Scenario3DErrorBoundary'
import type { Scene3D } from '@/lib/scenario3d/scene'
import type { ReplayMode, ReplayPhase } from './ScenarioReplayController'
import type { CameraMode } from './imperativeScene'
import { getCameraMode } from '@/lib/scenario3d/feature'
import type { QualityMode } from '@/lib/scenario3d/quality'
import { PremiumOverlay, type PlaybackRate } from './PremiumOverlay'

interface Scenario3DViewProps {
  fallback: ReactNode
  children?: ReactNode
  height?: number
  className?: string
  scene?: Scene3D | null
  concept?: string
  replayMode?: ReplayMode
  resetCounter?: number
  onCaption?: (caption: string | undefined) => void
  onPhase?: (phase: ReplayPhase) => void
  showPaths?: boolean
  /** Forward to the canvas for capability-aware rendering. Defaults to
   *  'auto', which picks a tier from the device's hardware signals and
   *  may auto-degrade at runtime via the in-loop FPS guard. */
  quality?: QualityMode
  /**
   * Phase G — opts the canvas into the full Court3D + ScenarioScene3D
   * tree, which mounts the JSX `ScenarioReplayController` and emits
   * `onPhase('frozen')` when the authored freeze marker is reached.
   * `/train` passes this for decoder scenarios so the question UI can
   * mount on the freeze edge. Legacy callers omit it and stay on the
   * default path (URL `?simple=` still wins when explicit).
   */
  forceFullPath?: boolean
  /**
   * Phase H — drives the consequence + best-read replay flow on the
   * full path. The train page sets this to the choice id the user
   * picked at freeze; the canvas forwards it to
   * `ScenarioReplayController` which dispatches the wrongDemo leg
   * (or short-circuits to the answer leg for best-read choices).
   */
  pickedChoiceId?: string | null
}

/**
 * Public entry point for the 3D scenario engine. SSR-safe: only loads the
 * R3F bundle on the client, after the page is hydrated. Wraps the canvas
 * in an error boundary so any rendering failure stays scoped to the court
 * surface instead of taking down the whole /train page.
 *
 * Owns the user-facing premium overlay (scenario chip, replay controls,
 * speed selector, camera selector, optional path toggle). Overlay state
 * lives at this layer so the WebGL canvas below stays narrowly focused
 * on imperative rendering and the parent caller can remain unaware that
 * the overlay exists.
 */
export function Scenario3DView(props: Scenario3DViewProps) {
  const {
    showPaths: showPathsProp,
    resetCounter: resetCounterProp = 0,
    replayMode = 'intro',
  } = props

  // Camera mode: prefer the URL `?camera=` value on first mount, then
  // user's selector takes over. Defaults to 'auto' (existing fit-to-scene
  // framing). This mirrors the precedence the canvas itself applied
  // before Packet 12, so deep links keep working.
  const [cameraMode, setCameraMode] = useState<CameraMode>('auto')
  useEffect(() => {
    const urlMode = getCameraMode()
    if (urlMode) setCameraMode(urlMode)
  }, [])

  const [playbackRate, setPlaybackRate] = useState<PlaybackRate>(1)
  const [paused, setPaused] = useState(false)

  // Local restart counter folds in the parent's resetCounter so the
  // overlay's restart button and the parent's "Show me again" button
  // both drive the same MotionController.reset() path.
  const [restartTick, setRestartTick] = useState(0)
  const compositeResetCounter = resetCounterProp + restartTick

  // Reset playback state whenever the upstream replay mode changes
  // (e.g. user advances to the next scenario, or the answer demo
  // begins). Speed is preserved so the user's selection survives, but
  // the timeline restarts and pause clears so they don't get a frozen
  // canvas after a scenario swap.
  useEffect(() => {
    setPaused(false)
  }, [replayMode, resetCounterProp])

  // Local override for the path toggle. When the user has touched it,
  // honor their choice. Otherwise fall back to the parent's prop (which
  // currently defaults paths on during the answer demo).
  const [pathOverride, setPathOverride] = useState<boolean | null>(null)
  useEffect(() => {
    setPathOverride(null)
  }, [replayMode, resetCounterProp])
  const showPaths = pathOverride ?? showPathsProp ?? false

  // Packet E (renderer-polish, learning overlays). The toggle now
  // surfaces whenever the active replay mode has movements OR the scene
  // has at least one defender — the imperative teaching overlay can
  // build defender pressure cues and spacing labels even when there are
  // no movements, so showing the toggle is genuinely useful in static
  // scenes too. We still hide it for empty scenes so the chrome stays
  // clean when there is nothing to teach.
  const hasAnswerPaths = (props.scene?.answerDemo?.length ?? 0) > 0
  const hasIntroPaths = (props.scene?.movements?.length ?? 0) > 0
  const hasDefenders = !!props.scene?.players?.some((p) => p.team === 'defense')
  const pathsAvailable =
    (replayMode === 'answer' && hasAnswerPaths) ||
    (replayMode === 'intro' && (hasIntroPaths || hasDefenders)) ||
    hasAnswerPaths

  return (
    <Scenario3DErrorBoundary scenarioId={props.scene?.id}>
      <div className="relative h-full w-full">
        <Scenario3DCanvas
          {...props}
          replayMode={replayMode}
          resetCounter={compositeResetCounter}
          cameraMode={cameraMode}
          playbackRate={playbackRate}
          paused={paused}
          showPaths={showPaths}
        />
        <PremiumOverlay
          concept={props.concept}
          replayMode={replayMode}
          cameraMode={cameraMode}
          onCameraModeChange={setCameraMode}
          playbackRate={playbackRate}
          onPlaybackRateChange={setPlaybackRate}
          paused={paused}
          onPausedChange={setPaused}
          onRestart={() => {
            setPaused(false)
            setRestartTick((n) => n + 1)
          }}
          showPaths={showPaths}
          onShowPathsChange={(next) => setPathOverride(next)}
          pathsAvailable={pathsAvailable}
        />
      </div>
    </Scenario3DErrorBoundary>
  )
}
