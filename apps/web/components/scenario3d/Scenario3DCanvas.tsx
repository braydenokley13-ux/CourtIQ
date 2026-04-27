'use client'

/* =============================================================================
 * RENDERER SAFETY BASELINE — imperative-only contract.
 *
 * The R3F reconciler (R3F v9 + React 19 + Next 15) is UNRELIABLE in this
 * stack. Symptoms observed in production:
 *   - <Canvas> children silently dropped (THREE.Scene.children stays at 0).
 *   - useFrame subscribers never fire even with frameloop="always".
 *   - Mount/unmount can leave a black canvas with no geometry.
 *
 * Hard rules for every future packet (see docs/courtiq-realistic-renderer-plan.md):
 *   - CRITICAL VISUALS (court, hoop, players, ball, lighting) MUST be built
 *     imperatively against the underlying THREE.Scene. See `imperativeScene.ts`.
 *   - DO NOT rely on JSX scene children inside <Canvas> for anything visible.
 *     The JSX <BasketballScene3D> rendered below is a redundant duplicate; if
 *     R3F drops it, the imperative builder still paints the same scene.
 *   - DO NOT use useFrame for playback, physics, camera, or any per-frame
 *     render logic. Drive frames from the parent-level requestAnimationFrame
 *     loop in this file (see the rAF effect below). useFrame may run in
 *     dev — it cannot be trusted in production.
 *   - Treat <Canvas> as a renderer host only. The scene graph is owned by us.
 *   - Manual dispose: every imperative geometry/material/texture must be
 *     released on unmount via `disposeGroup`.
 *
 * Diagnostics confirm the contract is holding:
 *   - parentLoopStats.children = scene.children.length each frame.
 *   - Console logs "[scenario3d] parent loop frame N" every 120 frames.
 *   - Console logs "[scenario3d] imperative scene mounted" with object count.
 * =============================================================================
 */

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
  disposeGroup,
  fitCameraToScene,
} from './imperativeScene'
import {
  hasWebGL,
  isAutoFitCamera,
  isDebug3D,
  isEmergencyScene,
  isOrbitDebug,
  isSimpleScene,
} from '@/lib/scenario3d/feature'
import { useReducedMotion } from '@/lib/scenario3d/useReducedMotion'
import { createDefaultScene, type Scene3D } from '@/lib/scenario3d/scene'

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
}: Scenario3DCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  // Refs into the THREE objects R3F creates. Captured in onCreated so a
  // parent-level rAF loop can drive rendering even if R3F's reconciler
  // never mounts any of the <Canvas> children (in which case no
  // useFrame, no useEffect-from-Canvas-child, no animation at all).
  const glRef = useRef<THREE.WebGLRenderer | null>(null)
  const threeSceneRef = useRef<THREE.Scene | null>(null)
  const threeCameraRef = useRef<THREE.Camera | null>(null)
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

  const reducedMotion = useReducedMotion()

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
    const tick = () => {
      if (!running) return
      const gl = glRef.current
      const threeScene = threeSceneRef.current
      const cam = threeCameraRef.current
      if (gl && threeScene && cam) {
        try {
          cam.updateMatrixWorld()
          gl.render(threeScene, cam)
          frame++
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
  }, [mode])

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
        const group = buildBasketballGroup(visibleScene)
        threeScene.add(group)
        mounted = group

        const sizeEl = glRef.current?.domElement
        const aspect =
          sizeEl && sizeEl.clientHeight > 0
            ? sizeEl.clientWidth / sizeEl.clientHeight
            : 1
        if ('isPerspectiveCamera' in cam && (cam as THREE.PerspectiveCamera).isPerspectiveCamera) {
          fitCameraToScene(cam as THREE.PerspectiveCamera, visibleScene, aspect)
        }

        if (typeof console !== 'undefined') {
          // eslint-disable-next-line no-console
          console.info('[scenario3d] imperative scene mounted', {
            objects: group.children.length,
            sceneId: visibleScene.id,
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
    }
  }, [mode, visibleScene, emergencyMode, debugMode, simpleMode])

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
    return (
      <div className={className} style={{ position: 'relative' }}>
        {fallback}
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
        dpr={[1, 2]}
        camera={{ position: cameraPosition, fov: cameraFov, near: 0.1, far: 1000 }}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
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
  // Diagnostics overlay: ALWAYS-ON in this build until the 3D scene is
  // confirmed working in production. Pass ?nodebug=1 to hide (e.g.
  // for screenshots). Without this overlay we have no way to tell
  // from a Vercel deploy what's happening inside the canvas.
  let hideOverlay = false
  if (typeof window !== 'undefined') {
    try {
      hideOverlay = new URLSearchParams(window.location.search).get('nodebug') === '1'
    } catch {
      hideOverlay = false
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
