'use client'

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { AutoFitCamera } from './AutoFitCamera'
import { BasketballScene3D } from './BasketballScene3D'
import { Court3D } from './Court3D'
import { Debug3DScene } from './Debug3DScene'
import { EmergencyScene3D } from './EmergencyScene3D'
import { OrbitDebugControls } from './OrbitDebugControls'
import { SceneDebug3D } from './SceneDebug3D'
import { ScenarioScene3D } from './ScenarioScene3D'
import type { ReplayMode, ReplayPhase } from './ScenarioReplayController'
import { SceneMotionProvider } from './SceneMotionContext'
import {
  buildBasketballGroup,
  CameraController,
  disposeGroup,
  fitCameraToScene,
  MotionController,
  type CameraMode,
} from './imperativeScene'
import {
  getCameraMode,
  hasWebGL,
  isAutoFitCamera,
  isDebug3D,
  isEmergencyScene,
  isOrbitDebug,
  isSimpleScene,
} from '@/lib/scenario3d/feature'
import { useReducedMotion } from '@/lib/scenario3d/useReducedMotion'
import { createDefaultScene, type Scene3D } from '@/lib/scenario3d/scene'
import {
  getQualityModeFromUrl,
  resolveQualitySettings,
  settingsForTier,
  type QualityMode,
  type QualitySettings,
  type QualityTier,
} from '@/lib/scenario3d/quality'

interface Scenario3DCanvasProps {
  /** Mounted as the WebGL fallback when WebGL is unavailable. */
  fallback: React.ReactNode
  children?: React.ReactNode
  /** Optional className passed to the outer wrapper. */
  className?: string
  /** Optional explicit pixel height. Defaults to 320px. */
  height?: number
  /** Normalised scene to render. If omitted, the built-in default is used. */
  scene?: Scene3D | null
  /** Human-readable concept tag(s), shown in dev-only canvas diagnostics. */
  concept?: string
  /** Animation mode for the scene. */
  replayMode?: ReplayMode
  /** Bumping resets the active timeline. */
  resetCounter?: number
  onCaption?: (caption: string | undefined) => void
  onPhase?: (phase: ReplayPhase) => void
  showPaths?: boolean
  /**
   * Optional camera preset override. Wins over the `?camera=` URL
   * param when both are set. Defaults to `'auto'` so the existing
   * fit-to-scene framing keeps working without any caller change.
   */
  cameraMode?: CameraMode
  /** Optional playback rate (0.25x..4x). Defaults to 1. */
  playbackRate?: number
  /** Optional pause flag. Defaults to false (playing). */
  paused?: boolean
  /**
   * Quality mode override. Defaults to 'auto', which delegates to the
   * device-capability heuristic in `lib/scenario3d/quality.ts`. Pass
   * 'low' / 'medium' / 'high' to pin the tier explicitly. The runtime
   * FPS guard may still degrade from 'high' or 'medium' to a lower tier
   * if sustained low FPS is detected.
   */
  quality?: QualityMode
  /** Notified once the resolved tier becomes known (and again whenever
   *  the FPS guard auto-degrades it). Useful for surfacing the active
   *  tier in dev diagnostics. */
  onQualityChange?: (tier: QualityTier) => void
}

// Mid-tone gray. While the rebuild is in flight we deliberately do NOT
// use near-black: a black canvas + a black-rendered scene is
// indistinguishable from "no scene at all". Gray makes invisibility
// impossible to miss.
const CANVAS_BG = '#3F4756'
const EMERGENCY_BG = '#4A5568'

// Production camera. Sits above and behind half-court, tilted down
// toward the basket. Generous FOV so the entire half-court fits on
// every aspect ratio (especially mobile portrait). The slight x-offset
// gives the broadcast feel without sacrificing framing.
//
// Phase 3 widened this: camera moves further back and higher with a
// wider FOV so a half-court (50ft x 47ft) full of 6ft player cylinders
// is comfortably in frame even on a 280px-tall canvas.
const CAMERA_POSITION: [number, number, number] = [0, 50, 70]
const CAMERA_LOOKAT: [number, number, number] = [0, 5, 22]
const CAMERA_FOV = 55

// Debug self-test camera. Aimed straight at the origin with a wide FOV
// so any object placed near (0, 0, 0) is guaranteed to be visible.
const DEBUG_CAMERA_POSITION: [number, number, number] = [0, 24, 30]
const DEBUG_CAMERA_LOOKAT: [number, number, number] = [0, 0, 0]
const DEBUG_CAMERA_FOV = 45

// Emergency camera. Hardcoded at (0, 30, 30) looking straight at origin
// with a generous 60° FOV — guarantees any object placed near (0, *, 0)
// is in frame regardless of coordinate scale.
const EMERGENCY_CAMERA_POSITION: [number, number, number] = [0, 30, 30]
const EMERGENCY_CAMERA_LOOKAT: [number, number, number] = [0, 0, 0]
const EMERGENCY_CAMERA_FOV = 60

/**
 * Top-level wrapper that mounts the R3F <Canvas> for a scenario scene. The
 * 3D scene IS the product — the real scene renders as the primary path
 * and we only fall back to the supplied 2D node when WebGL is genuinely
 * unavailable on the device, or the GL context is lost. Errors thrown
 * inside the canvas are caught by Scenario3DErrorBoundary further up.
 *
 * `?debug3d=1` short-circuits the entire scenario pipeline and renders a
 * dependency-free debug scene with a guaranteed-visible camera. If the
 * debug scene paints in production but the regular scene does not, the
 * problem is in scenario data / scene composition, not the renderer.
 */
export function Scenario3DCanvas({
  fallback,
  children,
  className,
  height = 320,
  scene,
  concept,
  replayMode = 'intro',
  resetCounter,
  onCaption,
  onPhase,
  showPaths,
  cameraMode: cameraModeProp,
  playbackRate,
  paused,
  quality = 'auto',
  onQualityChange,
}: Scenario3DCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  // Refs into the THREE objects R3F creates. Captured in onCreated so a
  // parent-level rAF loop can drive rendering even if R3F's reconciler
  // never mounts any of the <Canvas> children (in which case no
  // useFrame, no useEffect-from-Canvas-child, no animation at all).
  const glRef = useRef<THREE.WebGLRenderer | null>(null)
  const threeSceneRef = useRef<THREE.Scene | null>(null)
  const threeCameraRef = useRef<THREE.Camera | null>(null)
  // Owns broadcast/tactical/follow/replay/auto framing. Created once
  // per imperative scene mount and torn down with the same group so
  // it never outlives the canvas it was aimed at.
  const cameraControllerRef = useRef<CameraController | null>(null)
  // Owns deterministic player + ball motion for the imperative scene.
  // Same lifetime as the imperative scene group: rebuilt on scene/mode
  // change, ticked from the parent rAF loop, cleared on unmount.
  const motionControllerRef = useRef<MotionController | null>(null)
  const [mode, setMode] = useState<'probing' | '3d' | 'fallback'>('probing')
  const [webglSupported, setWebglSupported] = useState<boolean | null>(null)
  const [canvasMounted, setCanvasMounted] = useState(false)
  const [rendererCreated, setRendererCreated] = useState(false)
  const [runtimeError, setRuntimeError] = useState<string | null>(null)
  const [debugMode, setDebugMode] = useState(false)
  const [emergencyMode, setEmergencyMode] = useState(false)
  const [orbitMode, setOrbitMode] = useState(false)
  const [simpleMode, setSimpleMode] = useState(true)
  const [autoFitMode, setAutoFitMode] = useState(true)
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number } | null>(null)
  const [dpr, setDpr] = useState<number | null>(null)
  const [cameraStats, setCameraStats] = useState<CameraStats | null>(null)
  const [parentLoopStats, setParentLoopStats] = useState<{
    frames: number
    children: number
  } | null>(null)
  const [cameraModeState, setCameraModeState] = useState<CameraMode>('auto')
  // Resolved quality settings. Server-render starts on a pessimistic
  // 'medium' default so SSR markup matches; the first client-side
  // effect below replaces it with a real device-capability resolve
  // (or honors the explicit ?quality= URL override / prop).
  const [qualitySettings, setQualitySettings] = useState<QualitySettings>(
    () => settingsForTier('medium'),
  )

  const reducedMotion = useReducedMotion()

  // Resolved camera mode: prop wins over URL param wins over 'auto'.
  const activeCameraMode: CameraMode = cameraModeProp ?? cameraModeState

  const visibleScene = useMemo(
    () => scene ?? createDefaultScene('default_3d_scene'),
    [scene],
  )

  const sceneValidationStatus = useMemo(
    () => getSceneValidationStatus(visibleScene, scene, debugMode),
    [scene, visibleScene, debugMode],
  )

  useEffect(() => {
    const debug = isDebug3D()
    const emergency = isEmergencyScene()
    const orbit = isOrbitDebug()
    const simple = isSimpleScene()
    const autofit = isAutoFitCamera()
    setDebugMode(debug)
    setEmergencyMode(emergency)
    setOrbitMode(orbit)
    setSimpleMode(simple)
    setAutoFitMode(autofit)
    const urlMode = getCameraMode()
    if (urlMode) setCameraModeState(urlMode)
    const supported = hasWebGL()
    setWebglSupported(supported)
    setMode(supported ? '3d' : 'fallback')
    if (typeof console !== 'undefined') {
      // eslint-disable-next-line no-console
      console.info('[scenario3d] mount probe', {
        webglSupported: supported,
        debugMode: debug,
        emergencyMode: emergency,
        sceneId: scene?.id ?? null,
        playerCount: visibleScene.players.length,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Resolve quality settings on mount and whenever the prop changes.
  // URL `?quality=` wins over the resolved auto-tier so a tester can
  // pin the renderer to e.g. 'low' from a query string. The FPS guard
  // below may further downgrade the resolved tier at runtime.
  useEffect(() => {
    const urlMode = getQualityModeFromUrl()
    const effectiveMode: QualityMode = urlMode ?? quality
    const resolved = resolveQualitySettings(effectiveMode)
    setQualitySettings(resolved)
    onQualityChange?.(resolved.tier)
  }, [quality, onQualityChange])

  // Mirror the active settings into a ref so the rAF loop can read the
  // latest quality without re-subscribing every time it changes (which
  // would tear down and recreate the loop). The FPS guard further
  // mutates this ref-and-state pair when it auto-degrades.
  const qualityRef = useRef<QualitySettings>(qualitySettings)
  useEffect(() => {
    qualityRef.current = qualitySettings
    // Push the new pixel-ratio cap into the live renderer immediately —
    // R3F reads `dpr` on Canvas creation; later changes need a manual
    // setPixelRatio so the FPS guard can take effect without a remount.
    const gl = glRef.current
    if (gl) {
      const target = Math.min(
        qualitySettings.maxPixelRatio,
        typeof window !== 'undefined' && typeof window.devicePixelRatio === 'number'
          ? window.devicePixelRatio
          : 1,
      )
      try {
        gl.setPixelRatio(target)
        setDpr(target)
      } catch {
        /* renderer torn down between effect and apply */
      }
    }
  }, [qualitySettings])

  // Parent-level rAF render driver. Polls glRef each frame and, once the
  // canvas has been created, calls gl.render(scene, camera) directly.
  // This loop is OWNED BY THE PARENT COMPONENT, not by a child of
  // <Canvas>, so it fires even when R3F's reconciler fails to mount any
  // Canvas children (the failure mode that produces a black canvas with
  // a working bg color but no geometry).
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (mode !== '3d') return
    let rafId = 0
    let running = true
    let frame = 0
    // FPS guard state — local to this rAF loop so it dies with it.
    // Tracks a rolling count of "slow" frames (>33ms). When the window
    // is full of slow frames we downgrade the tier exactly once.
    let lastFrameAt = 0
    let slowFrames = 0
    let measuredFrames = 0
    let degradeCooldownFrames = 0
    // Skip the first ~30 frames so initial mount work (geometry build,
    // texture upload, font/JIT warmup) cannot trick the guard.
    const FPS_GUARD_WARMUP = 30
    const FPS_GUARD_WINDOW = 120 // ~2s @ 60fps
    const FPS_SLOW_FRAME_MS = 33 // <30fps
    const FPS_SLOW_FRACTION = 0.6 // 60% of the window
    const tick = () => {
      if (!running) return
      const gl = glRef.current
      const threeScene = threeSceneRef.current
      const cam = threeCameraRef.current
      if (gl && threeScene && cam) {
        try {
          // Drive the camera controller from the same parent rAF loop
          // we already trust to render. Skip when the user is manually
          // orbiting (drei OrbitControls) so the controller does not
          // fight a human dragger. Aspect is read fresh each frame so
          // resize is automatic.
          const ctrl = cameraControllerRef.current
          if (ctrl && !orbitMode &&
              (cam as THREE.PerspectiveCamera).isPerspectiveCamera) {
            const dom = gl.domElement
            if (dom && dom.clientHeight > 0) {
              ctrl.setAspect(dom.clientWidth / dom.clientHeight)
            }
            ctrl.tick(cam as THREE.PerspectiveCamera)
          } else {
            cam.updateMatrixWorld()
          }
          // Drive imperative motion immediately after the camera tick
          // so the rendered frame sees consistent player/ball
          // transforms at the same instant the camera evaluates them.
          // Uses the same rAF loop — no extra timer, no useFrame.
          const motion = motionControllerRef.current
          if (motion) motion.tick(performance.now())
          gl.render(threeScene, cam)
          frame++

          // FPS guard — measures frame deltas without per-frame React
          // state updates. Only flips state when a tier downgrade
          // actually fires, and at most once until the cooldown clears.
          const nowFrame = performance.now()
          if (lastFrameAt !== 0 && qualityRef.current.fpsGuardEnabled) {
            const dt = nowFrame - lastFrameAt
            if (frame > FPS_GUARD_WARMUP) {
              measuredFrames++
              if (dt > FPS_SLOW_FRAME_MS) slowFrames++
              if (degradeCooldownFrames > 0) degradeCooldownFrames--
              if (
                measuredFrames >= FPS_GUARD_WINDOW &&
                degradeCooldownFrames === 0
              ) {
                const slowFraction = slowFrames / measuredFrames
                if (slowFraction >= FPS_SLOW_FRACTION) {
                  const cur = qualityRef.current.tier
                  const next: QualityTier | null =
                    cur === 'high' ? 'medium' : cur === 'medium' ? 'low' : null
                  if (next) {
                    const nextSettings = settingsForTier(next)
                    qualityRef.current = nextSettings
                    setQualitySettings(nextSettings)
                    onQualityChange?.(next)
                    // eslint-disable-next-line no-console
                    console.info('[scenario3d] fps guard degraded tier', {
                      from: cur,
                      to: next,
                      slowFraction: slowFraction.toFixed(2),
                    })
                  }
                }
                // Reset window regardless so we don't immediately retry.
                slowFrames = 0
                measuredFrames = 0
                degradeCooldownFrames = FPS_GUARD_WINDOW
              }
            }
          }
          lastFrameAt = nowFrame

          if (frame === 1 || frame % 60 === 0) {
            setParentLoopStats({ frames: frame, children: threeScene.children.length })
          }
          if (frame === 1 || frame % 120 === 0) {
            // eslint-disable-next-line no-console
            console.info('[scenario3d] parent loop frame', frame, {
              children: threeScene.children.length,
              camPos: (cam as THREE.PerspectiveCamera).position.toArray(),
            })
          }
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error('[scenario3d] parent loop error', error)
        }
      }
      rafId = window.requestAnimationFrame(tick)
    }
    rafId = window.requestAnimationFrame(tick)
    return () => {
      running = false
      window.cancelAnimationFrame(rafId)
    }
    // onQualityChange and setQualitySettings are intentionally omitted —
    // including them would tear down and recreate the rAF loop on every
    // parent re-render. We accept a slightly stale onQualityChange
    // closure for the telemetry call inside the FPS guard; the visible
    // tier is still pushed into qualitySettings via the React setter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, orbitMode])

  // IMPERATIVE SCENE BUILDER. Bypasses R3F's reconciler entirely. We
  // discovered the reconciler silently dropped every <Canvas> child in
  // production (THREE.Scene.children stayed at 0 even after 400+ frames
  // of the parent rAF loop running). Building the scene with vanilla
  // THREE primitives and adding it to threeSceneRef.current directly is
  // immune to that failure mode.
  //
  // Polls for the THREE refs every animation frame until they're set,
  // then builds the scene once and aims the camera. Rebuilds when the
  // input scene changes.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (mode !== '3d') return

    let cancelled = false
    let mounted: THREE.Group | null = null
    let pollId = 0

    const tryMount = () => {
      if (cancelled) return
      const threeScene = threeSceneRef.current
      const cam = threeCameraRef.current
      if (!threeScene || !cam) {
        pollId = window.requestAnimationFrame(tryMount)
        return
      }

      // Build geometry imperatively for non-debug, non-emergency, simple-mode
      // scenes — that's the production path we're trying to fix.
      if (!emergencyMode && !debugMode && simpleMode) {
        let result: ReturnType<typeof buildBasketballGroup>
        try {
          result = buildBasketballGroup(visibleScene)
        } catch (error) {
          // A failed scene build leaves the canvas empty — flip to the
          // 2D fallback instead so the user never sees a blank rectangle.
          // eslint-disable-next-line no-console
          console.error('[scenario3d] imperative scene build failed', error)
          setRuntimeError(
            error instanceof Error ? error.message : 'Scene build failed',
          )
          setMode('fallback')
          return
        }
        threeScene.add(result.root)
        mounted = result.root

        const sizeEl = glRef.current?.domElement
        const aspect =
          sizeEl && sizeEl.clientHeight > 0
            ? sizeEl.clientWidth / sizeEl.clientHeight
            : 1
        if ('isPerspectiveCamera' in cam && (cam as THREE.PerspectiveCamera).isPerspectiveCamera) {
          // Initial fit-to-scene so frame zero is correct even if the
          // controller's first tick hasn't run yet.
          fitCameraToScene(cam as THREE.PerspectiveCamera, visibleScene, aspect)
          // Hand the camera over to the controller. It snaps to its
          // current mode's target on the next parent rAF tick, so any
          // delta from fitCameraToScene above is invisible.
          const controller = new CameraController(visibleScene, aspect, CAMERA_FOV)
          controller.setMode(activeCameraMode)
          controller.snapNext()
          cameraControllerRef.current = controller
        }

        // Imperative motion controller — deterministic player + ball
        // playback driven from the same parent rAF loop the camera
        // already rides on. Anchors itself on the next tick so motion
        // begins from the moment the scene appears, not from canvas
        // creation.
        const motion = new MotionController(
          visibleScene,
          replayMode,
          result.players,
          result.ball,
          result.ballBaseY,
        )
        // Replay any non-default playback prop so a scene that mounts
        // with the user already at e.g. 2x or paused honors that state
        // from frame zero. The dedicated effects below handle later
        // changes; this just covers the initial mount race.
        if (playbackRate !== undefined && playbackRate !== 1) {
          motion.setPlaybackRate(playbackRate)
        }
        if (paused) {
          motion.setPaused(true)
        }
        motionControllerRef.current = motion

        if (typeof console !== 'undefined') {
          // eslint-disable-next-line no-console
          console.info('[scenario3d] imperative scene mounted', {
            objects: result.root.children.length,
            players: result.players.size,
            sceneId: visibleScene.id,
            cameraMode: activeCameraMode,
            replayMode,
          })
        }
      }
    }

    pollId = window.requestAnimationFrame(tryMount)
    return () => {
      cancelled = true
      window.cancelAnimationFrame(pollId)
      if (mounted) {
        const threeScene = threeSceneRef.current
        if (threeScene) threeScene.remove(mounted)
        disposeGroup(mounted)
        mounted = null
      }
      // Drop the controllers alongside the group so they never point
      // at a stale camera/scene/group.
      cameraControllerRef.current = null
      motionControllerRef.current = null
    }
    // activeCameraMode is intentionally NOT in the dep array — pushing
    // mode changes through a separate effect avoids tearing down and
    // rebuilding the entire scene on every camera switch. The motion
    // controller, in contrast, depends on replayMode (the timeline it
    // resolves changes when mode changes), so replayMode IS a dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, visibleScene, emergencyMode, debugMode, simpleMode, replayMode])

  // Push live camera-mode changes into the existing controller. No
  // scene rebuild — just a target recompute, so the next parent rAF
  // tick eases toward the new framing.
  useEffect(() => {
    const ctrl = cameraControllerRef.current
    if (ctrl) ctrl.setMode(activeCameraMode)
  }, [activeCameraMode])

  // Push scene-data changes into the controller so follow mode (and
  // auto-fit) update when the scenario swaps players or ball-holder.
  useEffect(() => {
    const ctrl = cameraControllerRef.current
    if (ctrl) ctrl.setScene(visibleScene)
  }, [visibleScene])

  // External replay reset: when the parent bumps resetCounter, drop
  // the motion controller's playback anchor so the timeline restarts
  // from t=0 on the next parent rAF tick. The scene rebuild path
  // already covers scene/mode changes, so this handles the
  // "play again" button case without remounting the geometry.
  useEffect(() => {
    motionControllerRef.current?.reset()
  }, [resetCounter])

  // Push playback-rate / pause changes into the existing motion
  // controller. No scene rebuild — setPlaybackRate rebases startedAt
  // so the currently visible t does not jump. Defaults preserve the
  // pre-Packet-12 behavior when callers omit the new props.
  useEffect(() => {
    motionControllerRef.current?.setPlaybackRate(playbackRate ?? 1)
  }, [playbackRate])

  useEffect(() => {
    motionControllerRef.current?.setPaused(paused ?? false)
  }, [paused])

  if (mode === 'probing') {
    return (
      <div
        className={className}
        style={{ height, background: '#3F4756', minHeight: height, position: 'relative' }}
        aria-busy="true"
      >
        <div className="flex h-full items-center justify-center text-[11px] uppercase tracking-[1.5px] text-text-dim">
          Loading court…
        </div>
        <CanvasDiagnostics
          canvasMounted={canvasMounted}
          rendererCreated={rendererCreated}
          webglSupported={webglSupported}
          scenarioId={scene?.id}
          concept={concept}
          validationStatus={sceneValidationStatus}
          errorMessage={runtimeError}
          debugMode={debugMode}
          playerCount={visibleScene.players.length}
          width={canvasSize?.width}
          height={canvasSize?.height}
        />
      </div>
    )
  }

  if (mode === 'fallback') {
    // Two distinct fallback reasons: WebGL is genuinely unavailable
    // (very old browsers, hardware acceleration disabled), or the 3D
    // setup raised at runtime (context lost, onCreated threw). The
    // user-visible chip differentiates them so a player on a working
    // browser sees a clear "3D unavailable" badge instead of silently
    // sliding into a degraded 2D experience.
    const fallbackReason: 'no-webgl' | 'runtime-error' = runtimeError
      ? 'runtime-error'
      : 'no-webgl'
    return (
      <div className={className} style={{ position: 'relative' }}>
        {fallback}
        <FallbackBadge reason={fallbackReason} message={runtimeError} />
        <CanvasDiagnostics
          canvasMounted={canvasMounted}
          rendererCreated={rendererCreated}
          webglSupported={webglSupported}
          scenarioId={scene?.id}
          concept={concept}
          validationStatus={sceneValidationStatus}
          errorMessage={runtimeError}
          debugMode={debugMode}
          playerCount={visibleScene.players.length}
          width={canvasSize?.width}
          height={canvasSize?.height}
        />
      </div>
    )
  }

  // Emergency wins if active. Otherwise debug. Otherwise production.
  const cameraPosition = emergencyMode
    ? EMERGENCY_CAMERA_POSITION
    : debugMode
      ? DEBUG_CAMERA_POSITION
      : CAMERA_POSITION
  const cameraLookAt = emergencyMode
    ? EMERGENCY_CAMERA_LOOKAT
    : debugMode
      ? DEBUG_CAMERA_LOOKAT
      : CAMERA_LOOKAT
  const cameraFov = emergencyMode
    ? EMERGENCY_CAMERA_FOV
    : debugMode
      ? DEBUG_CAMERA_FOV
      : CAMERA_FOV
  const activeBg = emergencyMode ? EMERGENCY_BG : CANVAS_BG
  // True when the imperative CameraController is the rightful owner of
  // camera framing — same gate as the imperative-scene mount effect.
  const controllerActive = !emergencyMode && !debugMode && simpleMode

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        height,
        minHeight: height,
        width: '100%',
        position: 'relative',
        background: activeBg,
        display: 'block',
        overflow: 'hidden',
      }}
    >
      <Canvas
        // `flat` disables ACES Filmic tone mapping so unlit basic materials
        // render at the literal sRGB color we set, not crushed to black.
        flat
        // R3F's default 'always' scheduler. The previous fix used
        // `frameloop="never"` + a custom ManualLoop that pulled subscribers
        // out of `state.internal.subscribers` — but that internal shape
        // changed in R3F v9, so subscribers never fired and gl.render()
        // was never called. Result: the canvas mounted, the bg color
        // applied, but no geometry ever drew. Trusting the default
        // scheduler restores normal rendering on every device.
        frameloop="always"
        dpr={[1, qualitySettings.maxPixelRatio]}
        camera={{ position: cameraPosition, fov: cameraFov, near: 0.1, far: 1000 }}
        gl={{
          antialias: qualitySettings.antialias,
          alpha: false,
          powerPreference:
            qualitySettings.tier === 'low' ? 'low-power' : 'high-performance',
        }}
        style={{ width: '100%', height: '100%', display: 'block' }}
        onCreated={({ gl, size, scene: createdScene, camera: createdCamera }) => {
          try {
            gl.setClearColor(activeBg, 1)

            const dom = gl.domElement
            if (dom) {
              dom.addEventListener(
                'webglcontextlost',
                (event) => {
                  event.preventDefault()
                  setRuntimeError('WebGL context was lost')
                  setMode('fallback')
                },
                { once: true },
              )
            }
            setRendererCreated(true)
            setCanvasMounted(true)
            setCanvasSize({ width: size.width, height: size.height })
            try {
              setDpr(gl.getPixelRatio())
            } catch {
              setDpr(null)
            }

            // Capture refs so the parent-level rAF loop can drive
            // gl.render even when R3F's reconciler never mounts the
            // Canvas children (in which case the Canvas-child
            // RenderHeartbeat component would never run either).
            glRef.current = gl as THREE.WebGLRenderer
            threeSceneRef.current = createdScene as THREE.Scene
            threeCameraRef.current = createdCamera as THREE.Camera

            // Set scene.background imperatively — <color attach="background">
            // is also a reconciler-dependent Canvas child, so we cannot rely
            // on it.
            ;(createdScene as THREE.Scene).background = new THREE.Color(activeBg)

            // CRITICAL: aim the camera before the first render. The
            // declarative `camera={{ position }}` prop only sets
            // position — no lookAt — so the default camera stares flat
            // toward -Z from y=50, missing all geometry which sits at
            // y=0..8 below. <CameraTarget> / <AutoFitCamera> set lookAt
            // via useEffect, but those effects fire AFTER the first
            // RenderHeartbeat tick paints. Aiming here guarantees the
            // very first frame is correct, independent of React.
            const cam = createdCamera as THREE.PerspectiveCamera
            cam.position.set(cameraPosition[0], cameraPosition[1], cameraPosition[2])
            cam.lookAt(cameraLookAt[0], cameraLookAt[1], cameraLookAt[2])
            cam.updateMatrixWorld()
            cam.updateProjectionMatrix()

            // Force one explicit render now so the very first frame
            // shows geometry, even if the scheduler is broken.
            try {
              gl.render(createdScene as THREE.Scene, cam)
            } catch (e) {
              if (typeof console !== 'undefined') {
                // eslint-disable-next-line no-console
                console.error('[scenario3d] explicit first-frame render failed', e)
              }
            }

            if (typeof console !== 'undefined') {
              // eslint-disable-next-line no-console
              console.info('[scenario3d] canvas onCreated', {
                width: size.width,
                height: size.height,
                debugMode,
                emergencyMode,
                children: (createdScene as THREE.Scene).children.length,
                camPos: cam.position.toArray(),
                camLookAt: cameraLookAt,
              })
            }
          } catch (error) {
            setRuntimeError(error instanceof Error ? error.message : 'Unknown WebGL error')
            setMode('fallback')
          }
        }}
      >
        <color attach="background" args={[activeBg]} />
        {orbitMode ? (
          <OrbitDebugControls
            target={[cameraLookAt[0], cameraLookAt[1], cameraLookAt[2]]}
          />
        ) : controllerActive ? (
          // The imperative CameraController owns framing here, so the
          // JSX AutoFitCamera / CameraTarget paths stay out of the way
          // to avoid two systems writing the same camera per frame.
          null
        ) : autoFitMode && !emergencyMode && !debugMode ? (
          <AutoFitCamera scene={visibleScene} />
        ) : (
          <CameraTarget
            position={cameraPosition}
            lookAt={cameraLookAt}
            enableSway={!debugMode && !emergencyMode && !reducedMotion}
          />
        )}
        <CameraDiagnosticsProbe onChange={setCameraStats} />
        <RenderHeartbeat />

        {emergencyMode ? (
          <EmergencyScene3D />
        ) : debugMode ? (
          <Debug3DScene />
        ) : simpleMode ? (
          <BasketballScene3D scene={visibleScene} />
        ) : (
          <SceneMotionProvider reduced={reducedMotion}>
            <SceneLighting />
            <Court3D />
            <ScenarioScene3D
              key={visibleScene.id}
              scene={visibleScene}
              mode={replayMode}
              resetCounter={resetCounter}
              onCaption={onCaption}
              onPhase={onPhase}
              showPaths={showPaths}
            />
            <Suspense fallback={null}>{children}</Suspense>
            <SceneDebug3D scene={visibleScene} />
          </SceneMotionProvider>
        )}
      </Canvas>

      <CanvasDiagnostics
        canvasMounted={canvasMounted}
        rendererCreated={rendererCreated}
        webglSupported={webglSupported}
        scenarioId={scene?.id}
        concept={concept}
        validationStatus={sceneValidationStatus}
        errorMessage={runtimeError}
        debugMode={debugMode}
        emergencyMode={emergencyMode}
        playerCount={visibleScene.players.length}
        width={canvasSize?.width}
        height={canvasSize?.height}
        dpr={dpr}
        cameraStats={cameraStats}
        parentLoopStats={parentLoopStats}
      />

      {debugMode ? (
        <div className="pointer-events-none absolute right-2 top-2 rounded-full bg-brand/15 px-2 py-1 text-[10px] font-bold uppercase tracking-[1.5px] text-brand">
          debug3d self-test
        </div>
      ) : null}
      {emergencyMode ? (
        <div className="pointer-events-none absolute right-2 top-2 rounded-full bg-yellow-400/25 px-2 py-1 text-[10px] font-bold uppercase tracking-[1.5px] text-yellow-300">
          emergency render
        </div>
      ) : null}
    </div>
  )
}

interface CameraStats {
  position: [number, number, number]
  fov: number
  childCount: number
  firstChildKind: string | null
  firstChildPosition: [number, number, number] | null
}

interface CanvasDiagnosticsProps {
  canvasMounted: boolean
  rendererCreated: boolean
  webglSupported: boolean | null
  scenarioId?: string
  concept?: string
  validationStatus: string
  errorMessage: string | null
  debugMode: boolean
  emergencyMode?: boolean
  playerCount: number
  width?: number
  height?: number
  dpr?: number | null
  cameraStats?: CameraStats | null
  parentLoopStats?: { frames: number; children: number } | null
}

function CanvasDiagnostics({
  canvasMounted,
  rendererCreated,
  webglSupported,
  scenarioId,
  concept,
  validationStatus,
  errorMessage,
  debugMode,
  emergencyMode,
  playerCount,
  width,
  height,
  dpr,
  cameraStats,
  parentLoopStats,
}: CanvasDiagnosticsProps) {
  // Diagnostics overlay: HIDDEN BY DEFAULT now that the imperative
  // scene has been confirmed reliable in production. Pass ?debug=1
  // to surface the renderer telemetry when investigating an issue.
  // Errors still render unconditionally below so users see actual
  // failures even when the panel is hidden.
  let hideOverlay = true
  if (typeof window !== 'undefined') {
    try {
      const params = new URLSearchParams(window.location.search)
      hideOverlay = params.get('debug') !== '1' && params.get('nodebug') !== '0'
    } catch {
      hideOverlay = true
    }
  }

  if (errorMessage) {
    return (
      <div className="pointer-events-none absolute bottom-2 left-2 max-w-[92%] rounded-lg bg-red-900/80 px-2 py-1 font-mono text-[10px] leading-snug text-white">
        scene error: {errorMessage}
      </div>
    )
  }

  if (hideOverlay) return null

  const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(1) : '–')
  const renderMode = emergencyMode
    ? 'emergency'
    : debugMode
      ? 'debug self-test'
      : 'scenario'

  return (
    <div className="pointer-events-none absolute bottom-2 left-2 max-w-[60%] rounded-lg bg-black/75 px-2 py-1 font-mono text-[9px] leading-snug text-white/85">
      <div>canvas mounted: {canvasMounted ? 'yes' : 'no'}</div>
      <div>renderer created: {rendererCreated ? 'yes' : 'no'}</div>
      <div>webgl: {webglSupported === null ? 'checking' : webglSupported ? 'yes' : 'no'}</div>
      <div>size: {width ?? '–'}×{height ?? '–'} @ dpr {dpr ?? '–'}</div>
      <div>mode: {renderMode}</div>
      <div>players: {playerCount}</div>
      <div>scene: {validationStatus}</div>
      <div>scenario: {scenarioId ?? 'none'}</div>
      {concept ? <div>concept: {concept}</div> : null}
      <div>
        parent loop: {parentLoopStats ? `${parentLoopStats.frames}f` : 'idle'} /
        children: {parentLoopStats ? parentLoopStats.children : '–'}
      </div>
      {cameraStats ? (
        <>
          <div>
            cam: {fmt(cameraStats.position[0])}, {fmt(cameraStats.position[1])},{' '}
            {fmt(cameraStats.position[2])} @ fov {fmt(cameraStats.fov)}
          </div>
          <div>
            children: {cameraStats.childCount} / first:{' '}
            {cameraStats.firstChildKind ?? '–'}
            {cameraStats.firstChildPosition
              ? ` (${fmt(cameraStats.firstChildPosition[0])}, ${fmt(
                  cameraStats.firstChildPosition[1],
                )}, ${fmt(cameraStats.firstChildPosition[2])})`
              : ''}
          </div>
        </>
      ) : null}
    </div>
  )
}

/**
 * Always-visible chip surfaced when the canvas is in fallback mode so
 * users (and Sentry-watching engineers) immediately see why the 2D
 * court is showing instead of the 3D scene. Distinct copy for the
 * "WebGL not available on this device" path vs the "3D scene crashed at
 * runtime" path so the chip carries diagnostic value without being
 * alarming for users on legitimately-old browsers.
 */
function FallbackBadge({
  reason,
  message,
}: {
  reason: 'no-webgl' | 'runtime-error'
  message: string | null
}) {
  const label = reason === 'no-webgl' ? '2D mode' : '3D unavailable'
  const detail =
    reason === 'no-webgl'
      ? 'WebGL not supported on this device'
      : message ?? 'Scene failed to load'
  const accent =
    reason === 'no-webgl' ? 'border-white/15 text-white/85' : 'border-heat/50 text-heat'
  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-none absolute right-2 top-2 max-w-[80%] rounded-full border bg-black/70 px-3 py-1 text-[10px] font-bold uppercase tracking-[1.5px] backdrop-blur-md ${accent}`}
      title={detail}
    >
      <span className="mr-1">●</span>
      {label}
    </div>
  )
}

function getSceneValidationStatus(
  visibleScene: Scene3D,
  inputScene: Scene3D | null | undefined,
  debugMode: boolean,
): string {
  if (debugMode) return 'debug self-test'
  if (!inputScene) return 'missing input, using default'

  const hasPlayers = visibleScene.players.length > 0
  const hasFinitePlayers = visibleScene.players.every(
    (player) => Number.isFinite(player.start.x) && Number.isFinite(player.start.z),
  )
  const ballIsFinite =
    Number.isFinite(visibleScene.ball.start.x) && Number.isFinite(visibleScene.ball.start.z)

  if (hasPlayers && hasFinitePlayers && ballIsFinite) return 'valid'
  return 'invalid, using safe values'
}

/**
 * Minimal lighting rig. Every visibility-critical surface uses
 * meshBasicMaterial (unlit), so lighting here is purely decorative and
 * cannot make the scene go black. We keep a bright ambient + hemisphere
 * fill so any future lit material (e.g. backboard) still renders well.
 */
function SceneLighting() {
  return (
    <>
      <ambientLight intensity={1.2} color="#FFF1E0" />
      <hemisphereLight args={['#D7E2F4', '#1A1408', 0.6]} />
    </>
  )
}

interface CameraTargetProps {
  position: [number, number, number]
  lookAt: [number, number, number]
  enableSway?: boolean
}

/**
 * Locks the camera to a broadcast frame every render. Optionally adds an
 * extremely subtle horizontal sway inside the R3F render loop so the scene
 * doesn't feel statically posed.
 */
/**
 * Lives inside the <Canvas> and pushes camera + scene-graph snapshots back
 * to the parent every ~250ms via a state-setter callback. Throttled so the
 * React tree doesn't re-render every frame.
 */
function CameraDiagnosticsProbe({
  onChange,
}: {
  onChange: (stats: CameraStats) => void
}) {
  const camera = useThree((s) => s.camera)
  const scene = useThree((s) => s.scene)
  const lastEmit = useRef(0)

  useFrame(() => {
    const now = performance.now()
    if (now - lastEmit.current < 250) return
    lastEmit.current = now

    const cam = camera as THREE.PerspectiveCamera
    const children = scene.children
    let firstObjectKind: string | null = null
    let firstObjectPos: [number, number, number] | null = null
    for (const child of children) {
      if (child.type === 'AmbientLight' || child.type === 'DirectionalLight' ||
          child.type === 'HemisphereLight' || child.type === 'PerspectiveCamera') {
        continue
      }
      firstObjectKind = child.type
      firstObjectPos = [child.position.x, child.position.y, child.position.z]
      break
    }

    onChange({
      position: [cam.position.x, cam.position.y, cam.position.z],
      fov: 'fov' in cam ? (cam.fov as number) : NaN,
      childCount: children.length,
      firstChildKind: firstObjectKind,
      firstChildPosition: firstObjectPos,
    })
  })

  return null
}

/**
 * Belt-and-suspenders render driver. Even with `frameloop="always"`, on
 * some environments (specific R3F + React 19 + Next 15 builds, or when
 * Next's chunking ends up with two R3F instances after a dynamic import)
 * the default scheduler does not actually paint, leaving the canvas
 * black despite the renderer being created and the bg color set.
 *
 * This component sets up its own `requestAnimationFrame` loop in a
 * `useEffect` and imperatively calls `gl.render(scene, camera)` plus
 * `camera.updateMatrixWorld()` every frame. It is fully independent of
 * `useFrame` subscribers, so it paints even when those are dead. If R3F
 * is also painting, we render twice per frame — that is wasteful but
 * not visually wrong, and is a strictly safer trade-off than a black
 * canvas.
 *
 * Logs a heartbeat to the console every 60 frames so we can confirm
 * from any browser session that frames are actually being driven.
 */
function RenderHeartbeat() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)

  useEffect(() => {
    if (typeof window === 'undefined') return
    let rafId = 0
    let running = true
    let frame = 0
    const tick = () => {
      if (!running) return
      try {
        camera.updateMatrixWorld()
        gl.render(scene, camera)
        frame++
        if (frame === 1 || frame % 60 === 0) {
          // eslint-disable-next-line no-console
          console.info('[scenario3d] heartbeat frame', frame, {
            children: scene.children.length,
            camPos: camera.position.toArray(),
          })
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[scenario3d] heartbeat error', error)
      }
      rafId = window.requestAnimationFrame(tick)
    }
    rafId = window.requestAnimationFrame(tick)
    return () => {
      running = false
      window.cancelAnimationFrame(rafId)
    }
  }, [gl, scene, camera])

  return null
}

function CameraTarget({ position, lookAt, enableSway = false }: CameraTargetProps) {
  const camera = useThree((state) => state.camera)
  const target = useMemo(() => new THREE.Vector3(...lookAt), [lookAt])
  const baseX = position[0]

  useEffect(() => {
    camera.position.set(position[0], position[1], position[2])
    camera.lookAt(target)
    camera.updateMatrixWorld()
    camera.updateProjectionMatrix()
  }, [camera, position, target])

  useFrame((state) => {
    if (!enableSway) return
    const sway = Math.sin(state.clock.getElapsedTime() * 0.18) * 0.55
    camera.position.x = baseX + sway
    camera.lookAt(target)
  })

  return null
}


export type { Scene3D, ReplayMode, ReplayPhase }
