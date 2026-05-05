'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Scenario3DCanvas } from './Scenario3DCanvas'
import { Scenario3DErrorBoundary } from './Scenario3DErrorBoundary'
import type { Scene3D } from '@/lib/scenario3d/scene'
import type { ReplayMode, ReplayPhase } from './ScenarioReplayController'
import { isGlbAthletePreviewActive, type CameraMode } from './imperativeScene'
import { getCameraMode } from '@/lib/scenario3d/feature'
import type { QualityMode } from '@/lib/scenario3d/quality'
import { PremiumOverlay, type PlaybackRate } from './PremiumOverlay'
import { loadGlbAthleteAsset } from './glbAthlete'
import type { CameraAssist } from '@/lib/scenario3d/cameraPresets'
import type { OverlayLevel } from '@/lib/scenario3d/overlayLevel'

// FR-2 Packet 1 — module-level GLB asset preload.
//
// Why module-level instead of inside an effect: this file is the
// canonical entry point for the 3D engine, imported by `/train` and
// `/dev/scenario-preview` the moment the page bundle evaluates. A
// module-level call fires while React is still building the initial
// render tree — strictly earlier than any `useEffect` inside
// `Scenario3DCanvas`, so by the time the canvas's imperative scene-
// build effect runs the GLTFLoader cache is far more likely to be
// warm. Combined with the load-on-mount inside `Scenario3DCanvas`,
// this removes the cold-cache "procedural-then-GLB" flicker on the
// very first scenario of a session without changing any rendering
// behaviour for users who never visit the canvas.
//
// Gated on `isGlbAthletePreviewActive()` so a build with the env flag
// off never pays the 1.4 MB asset fetch. SSR is skipped via the
// `typeof window` guard inside `loadGlbAthleteAsset` itself.
if (typeof window !== 'undefined' && isGlbAthletePreviewActive()) {
  void loadGlbAthleteAsset()
}

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
  /**
   * FR-4 §8.9 — how aggressively the renderer should help with the
   * freeze framing. Forwarded to `Scenario3DCanvas` so the decoder-
   * aware dispatcher can pick the right preset per replay phase.
   * The Pathways layer chooses; the renderer just respects the prop.
   * Default `'partial'` keeps the pre-FR-4 broadcast-through-freeze
   * behaviour for /train while still earning a teaching replay.
   */
  cameraAssist?: CameraAssist
  /**
   * FR-5 §9.2 — how much overlay help the same scene should mount.
   * `'beginner'` mounts the full 3-overlay cluster, `'advanced'`
   * mounts the cue overlay only, `'none'` (Boss Challenge) mounts
   * nothing, `'review'` (Film Room Review) mounts everything
   * authored. Pathways chooses; the renderer just respects the
   * prop. Default omitted so existing call sites preserve the
   * pre-FR-5 behaviour (full cluster) via the controller-side
   * default.
   */
  overlayLevel?: OverlayLevel
  /**
   * V1 UX completion — interaction overlay slot. Render-prop that is
   * mounted INSIDE the fullscreen target wrapper so callers can
   * surface page-level UI (e.g. /train's choice cards) inside the
   * fullscreen viewport. The callback receives the live fullscreen
   * state so the caller can vary the layout — typically a compact
   * bottom-anchored row in fullscreen and `null` (or unmounted) when
   * the page-layout copy already handles it. `null` callback /
   * `null` return = nothing rendered, preserving every legacy call
   * site's behaviour.
   */
  renderFullscreenOverlay?: (state: { isFullscreen: boolean }) => ReactNode
  /**
   * V1 UX completion — observer for fullscreen state. Fires whenever
   * the renderer enters or leaves fullscreen so the parent can
   * coordinate layout (e.g. hide its in-page choice cards while the
   * fullscreen overlay version is showing). Optional; legacy callers
   * can ignore the prop entirely.
   */
  onFullscreenChange?: (isFullscreen: boolean) => void
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
  // FR-4 Packet 6 — explicit "user has chosen a camera" flag. Flips
  // the moment the dropdown is touched OR the URL `?camera=` carried
  // a value. The Canvas reads this to decide whether the FR-4
  // dispatcher should drive freeze/replay framing or stay out of the
  // user's way (§8.6: "We do not interrupt manual control").
  // Resets when the scene id changes — §8.6 says manual override
  // applies to "that scene" and resumes on the next scenario.
  const [manualCameraOverride, setManualCameraOverride] = useState(false)
  useEffect(() => {
    const urlMode = getCameraMode()
    if (urlMode) {
      setCameraMode(urlMode)
      setManualCameraOverride(true)
    }
  }, [])
  // Reset manual override on scenario swap so the dispatcher can
  // resume on the next scene. Read scene.id from props directly to
  // avoid duplicating the prop into local state.
  const sceneId = props.scene?.id ?? null
  useEffect(() => {
    setManualCameraOverride(false)
  }, [sceneId])

  // Wrap the dropdown's onChange so picking ANY option (including
  // 're-picking auto' as a deliberate revert) marks the camera as
  // user-controlled for the rest of the scene.
  const handleCameraModeChange = useCallback((next: CameraMode) => {
    setCameraMode(next)
    setManualCameraOverride(true)
  }, [])

  const [playbackRate, setPlaybackRate] = useState<PlaybackRate>(1)
  const [paused, setPaused] = useState(false)

  // Phase D — fullscreen film room mode. The container ref is the
  // element we promote to fullscreen; state tracks whether the browser
  // is currently in fullscreen so the overlay button can show the
  // correct icon and aria-label. All Fullscreen API access is SSR-guarded.
  const containerRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  // V1 UX completion — surface fullscreen state changes to the parent
  // so callers like /train can hide their in-page choice cards while
  // the renderFullscreenOverlay copy is showing. Stored in a ref so we
  // don't have to add the callback to the listener-effect's dep array
  // (re-installing a fullscreenchange listener every render would
  // miss browser-fired transitions).
  const onFullscreenChangeRef = useRef(props.onFullscreenChange)
  useEffect(() => {
    onFullscreenChangeRef.current = props.onFullscreenChange
  }, [props.onFullscreenChange])

  useEffect(() => {
    if (typeof document === 'undefined') return
    const el = containerRef.current
    if (!el) return
    const onChange = () => {
      const next = !!document.fullscreenElement
      setIsFullscreen(next)
      onFullscreenChangeRef.current?.(next)
      // Phase K — kick the renderer's ResizeObserver and the
      // imperative camera's per-frame `setAspect` so the new viewport
      // size is applied on the next paint instead of waiting for the
      // R3F internal observer to coalesce. Without this, Safari has
      // been observed to leave the canvas at its embedded size for a
      // few hundred milliseconds after the fullscreen transition,
      // producing the "court in a narrow top band" symptom.
      if (typeof window !== 'undefined') {
        window.requestAnimationFrame(() => {
          window.dispatchEvent(new Event('resize'))
        })
      }
    }
    el.addEventListener('fullscreenchange', onChange)
    return () => el.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggleFullscreen = useCallback(() => {
    if (typeof document === 'undefined') return
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(() => {
        // Fullscreen request denied (e.g., not triggered by user gesture
        // in some browsers, or iframe sandboxing). Silently ignore.
      })
    } else {
      document.exitFullscreen().catch(() => {
        // Exit can fail if fullscreen was already left by another means.
      })
    }
  }, [])

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
  //
  // Phase B / B2 — depend on `compositeResetCounter` instead of just
  // `resetCounterProp` so the in-canvas Restart button (which bumps
  // `restartTick`) and the parent's "Show me again" CTA (which bumps
  // `resetCounterProp`) reset the same overlay state. Before this,
  // Restart cleared `paused` only because `onRestart` did it
  // explicitly, and never cleared `pathOverride` at all — leaving the
  // two affordances behaviorally divergent.
  useEffect(() => {
    setPaused(false)
  }, [replayMode, compositeResetCounter])

  // Local override for the path toggle. When the user has touched it,
  // honor their choice. Otherwise fall back to the parent's prop (which
  // currently defaults paths on during the answer demo).
  const [pathOverride, setPathOverride] = useState<boolean | null>(null)
  useEffect(() => {
    setPathOverride(null)
  }, [replayMode, compositeResetCounter])
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
      {/* Phase L — fullscreen target + flex-column shell. The outer div
          becomes the browser's fullscreen element; the global CSS
          (`:fullscreen` rule in globals.css) flips it to
          `display: flex; flex-direction: column` so the canvas wrapper
          inside (marked with `data-fullscreen-fill`) can take all
          available column space via `flex: 1 1 auto`. This avoids the
          Phase K race where `[data-fullscreen='true']` attached one
          frame late and left the canvas stuck at its embedded height
          inside a 100vh shell.
          Inline `display: contents` is intentionally NOT used — we
          want the wrapper to participate in layout so its children
          fill via flex. */}
      <div
        ref={containerRef}
        data-fullscreen={isFullscreen ? 'true' : undefined}
        className="relative h-full w-full"
      >
        <Scenario3DCanvas
          {...props}
          replayMode={replayMode}
          resetCounter={compositeResetCounter}
          cameraMode={cameraMode}
          cameraManualOverride={manualCameraOverride}
          playbackRate={playbackRate}
          paused={paused}
          showPaths={showPaths}
          height={isFullscreen ? undefined : props.height}
        />
        <PremiumOverlay
          concept={props.concept}
          replayMode={replayMode}
          cameraMode={cameraMode}
          onCameraModeChange={handleCameraModeChange}
          playbackRate={playbackRate}
          onPlaybackRateChange={setPlaybackRate}
          paused={paused}
          onPausedChange={setPaused}
          onRestart={() => {
            // Phase B / B2 — bump the local restart tick so
            // `compositeResetCounter` advances. The shared reset
            // effect above clears `paused` and `pathOverride` for
            // both this path and the parent's "Show me again" path.
            setRestartTick((n) => n + 1)
          }}
          showPaths={showPaths}
          onShowPathsChange={(next) => setPathOverride(next)}
          pathsAvailable={pathsAvailable}
          isFullscreen={isFullscreen}
          onFullscreenToggle={toggleFullscreen}
          hasInteractionOverlay={!!props.renderFullscreenOverlay && isFullscreen}
        />
        {/* V1 UX completion — fullscreen interaction slot. Mounts
            inside the fullscreen target wrapper so the overlay sits
            inside the browser's fullscreen viewport. We only call the
            render-prop while `isFullscreen` is true so the page-level
            (non-fullscreen) layout keeps owning the in-page copy. The
            slot sits at the bottom of the fullscreen target above
            PremiumOverlay's transport pill — bottom-anchored,
            pointer-events-auto, with `pb` chosen so the overlay
            never overlaps the pill (38px inset + ~52px pill +
            ~22px gap = ~112px on tall viewports). On short viewports
            (mobile landscape ≤ 480px), we tighten the gap so the
            overlay does not crowd more than ~40% of the screen
            height. The `safe-area-inset-bottom` env() guards iOS
            home-indicator overlap. */}
        {props.renderFullscreenOverlay && isFullscreen ? (
          <div
            data-fullscreen-interaction-overlay="1"
            className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center px-3 sm:px-4"
            style={{
              paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 96px)',
            }}
          >
            <div className="pointer-events-auto w-full max-w-[1100px]">
              {props.renderFullscreenOverlay({ isFullscreen })}
            </div>
          </div>
        ) : null}
      </div>
    </Scenario3DErrorBoundary>
  )
}
