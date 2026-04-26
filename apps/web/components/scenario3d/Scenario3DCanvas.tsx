'use client'

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { Court3D } from './Court3D'
import { Debug3DScene } from './Debug3DScene'
import { SceneDebug3D } from './SceneDebug3D'
import { ScenarioScene3D } from './ScenarioScene3D'
import type { ReplayMode, ReplayPhase } from './ScenarioReplayController'
import { SceneMotionProvider } from './SceneMotionContext'
import { hasWebGL, isDebug3D } from '@/lib/scenario3d/feature'
import { useReducedMotion } from '@/lib/scenario3d/useReducedMotion'
import { COURT } from '@/lib/scenario3d/coords'
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

const CANVAS_BG = '#0E1626'

// Production camera. Broadcast-style angle that frames the half-court.
const CAMERA_POSITION: [number, number, number] = [0, 32, 56]
const CAMERA_LOOKAT: [number, number, number] = [0, 0, 18]
const CAMERA_FOV = 44

// Debug self-test camera. Aimed straight at the origin with a wide FOV
// so any object placed near (0, 0, 0) is guaranteed to be visible.
const DEBUG_CAMERA_POSITION: [number, number, number] = [0, 24, 30]
const DEBUG_CAMERA_LOOKAT: [number, number, number] = [0, 0, 0]
const DEBUG_CAMERA_FOV = 45

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
  const [mode, setMode] = useState<'probing' | '3d' | 'fallback'>('probing')
  const [webglSupported, setWebglSupported] = useState<boolean | null>(null)
  const [canvasMounted, setCanvasMounted] = useState(false)
  const [rendererCreated, setRendererCreated] = useState(false)
  const [runtimeError, setRuntimeError] = useState<string | null>(null)
  const [debugMode, setDebugMode] = useState(false)

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
    setDebugMode(debug)
    const supported = hasWebGL()
    setWebglSupported(supported)
    setMode(supported ? '3d' : 'fallback')
    if (typeof console !== 'undefined') {
      // eslint-disable-next-line no-console
      console.info('[scenario3d] mount probe', {
        webglSupported: supported,
        debugMode: debug,
        sceneId: scene?.id ?? null,
        playerCount: visibleScene.players.length,
      })
    }
    // visibleScene/scene intentionally omitted — we only want the probe to
    // run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (mode === 'probing') {
    return (
      <div
        className={className}
        style={{ height, background: CANVAS_BG, minHeight: height, position: 'relative' }}
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
        />
      </div>
    )
  }

  const cameraPosition = debugMode ? DEBUG_CAMERA_POSITION : CAMERA_POSITION
  const cameraLookAt = debugMode ? DEBUG_CAMERA_LOOKAT : CAMERA_LOOKAT
  const cameraFov = debugMode ? DEBUG_CAMERA_FOV : CAMERA_FOV

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        height,
        minHeight: height,
        width: '100%',
        position: 'relative',
        background: CANVAS_BG,
        display: 'block',
        overflow: 'hidden',
      }}
    >
      <Canvas
        // `flat` disables ACES Filmic tone mapping so unlit basic materials
        // render at the literal sRGB color we set, not crushed to black.
        flat
        // We drive frames manually via the ManualLoop component below so
        // we never depend on R3F's internal scheduler. On affected
        // device/build combinations the auto-scheduler simply never
        // started, leaving the canvas dark forever.
        frameloop="never"
        dpr={[1, 2]}
        camera={{ position: cameraPosition, fov: cameraFov, near: 0.1, far: 1000 }}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
        style={{ width: '100%', height: '100%', display: 'block' }}
        onCreated={({ gl, size }) => {
          try {
            gl.setClearColor(CANVAS_BG, 1)
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
            if (typeof console !== 'undefined') {
              // eslint-disable-next-line no-console
              console.info('[scenario3d] canvas onCreated', {
                width: size.width,
                height: size.height,
                debugMode,
              })
            }
          } catch (error) {
            setRuntimeError(error instanceof Error ? error.message : 'Unknown WebGL error')
            setMode('fallback')
          }
        }}
      >
        <color attach="background" args={[CANVAS_BG]} />
        <CameraTarget position={cameraPosition} lookAt={cameraLookAt} />
        <ManualLoop />

        {debugMode ? (
          <Debug3DScene />
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
        playerCount={visibleScene.players.length}
      />

      {debugMode ? (
        <div className="pointer-events-none absolute right-2 top-2 rounded-full bg-brand/15 px-2 py-1 text-[10px] font-bold uppercase tracking-[1.5px] text-brand">
          debug3d self-test
        </div>
      ) : null}
    </div>
  )
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
  playerCount: number
}

/**
 * Small HTML overlay that surfaces canvas/renderer/WebGL state. Shown in
 * development on every mount, and in production whenever `?debug3d=1` is
 * set so we can diagnose deployed rendering issues without DevTools.
 */
function CanvasDiagnostics({
  canvasMounted,
  rendererCreated,
  webglSupported,
  scenarioId,
  concept,
  validationStatus,
  errorMessage,
  debugMode,
  playerCount,
}: CanvasDiagnosticsProps) {
  if (process.env.NODE_ENV === 'production' && !debugMode) return null

  return (
    <div className="pointer-events-none absolute left-2 top-2 max-w-[92%] rounded-lg bg-bg-0/85 px-2 py-1 text-[10px] leading-snug text-text-dim">
      <div>canvas mounted: {canvasMounted ? 'yes' : 'no'}</div>
      <div>renderer created: {rendererCreated ? 'yes' : 'no'}</div>
      <div>webgl supported: {webglSupported === null ? 'checking' : webglSupported ? 'yes' : 'no'}</div>
      <div>mode: {debugMode ? 'debug self-test' : 'scenario'}</div>
      <div>players: {playerCount}</div>
      <div>scenario: {scenarioId ?? 'none'}</div>
      <div>concept: {concept ?? 'none'}</div>
      <div>scene: {validationStatus}</div>
      <div>error: {errorMessage ?? 'none'}</div>
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

function SceneLighting() {
  return (
    <>
      <hemisphereLight args={['#D7E2F4', '#1A1408', 0.6]} />
      <ambientLight intensity={1.05} color="#FFF1E0" />
      <directionalLight intensity={1.5} color="#FFE4B5" position={[14, 32, 18]} />
      <directionalLight intensity={0.6} color="#7EB6FF" position={[-22, 22, 36]} />
      <pointLight
        position={[0, COURT.rimHeightFt + 4, 0]}
        intensity={12}
        distance={22}
        color="#FF8A3D"
      />
    </>
  )
}

interface CameraTargetProps {
  position: [number, number, number]
  lookAt: [number, number, number]
}

/**
 * Forces the camera position and lookAt every render. Without this the
 * camera defaults to looking at (0, 0, 0), which can hide the scene at
 * unusual aspect ratios.
 */
function CameraTarget({ position, lookAt }: CameraTargetProps) {
  const camera = useThree((state) => state.camera)
  const size = useThree((state) => state.size)
  useEffect(() => {
    camera.position.set(position[0], position[1], position[2])
    camera.lookAt(lookAt[0], lookAt[1], lookAt[2])
    camera.updateMatrixWorld()
    camera.updateProjectionMatrix()
  }, [camera, position, lookAt])
  return null
}

/**
 * Manual frame loop. We deliberately set `frameloop="never"` on the
 * <Canvas> so R3F's internal auto-scheduler is bypassed — that scheduler
 * has been observed to never start on certain R3F-9 + React-19 +
 * Next-15 production builds, leaving the canvas dark forever even though
 * `onCreated` ran successfully.
 *
 * Instead, we drive frames ourselves with `requestAnimationFrame` and
 * inline the three steps R3F's internal `update()` would have run:
 *   1. advance the THREE.Clock
 *   2. invoke every useFrame subscriber registered against THIS root
 *   3. call `gl.render(scene, camera)`
 *
 * We deliberately do NOT call R3F's exported `advance()` because that
 * function walks the package-level `_roots` Set — and Next's chunking can
 * end up with two instances of `@react-three/fiber` (one in the page
 * chunk, one in the dynamic import). Imported `advance()` then walks an
 * empty `_roots` from the wrong instance. Reading state from the live
 * `useThree` context is instance-agnostic.
 *
 * Renders nothing.
 */
type R3FInternalState = {
  clock: { getDelta: () => number; oldTime: number; elapsedTime: number }
  internal: {
    subscribers: Array<{
      ref: { current: (state: unknown, delta: number) => void }
      store: { getState: () => unknown }
    }>
    priority: number
  }
  gl: { render: (scene: unknown, camera: unknown) => void }
  scene: unknown
  camera: unknown
}

function ManualLoop() {
  const state = useThree() as unknown as R3FInternalState

  useEffect(() => {
    if (typeof window === 'undefined') return
    let rafId = 0
    let running = true
    const tick = (timestamp: number) => {
      if (!running) return
      try {
        // 1. Clock tick. R3F's update() updates `oldTime` then `elapsedTime`
        //    when frameloop is 'never'.
        const tSec = timestamp / 1000
        const delta = Math.max(0, tSec - state.clock.elapsedTime)
        state.clock.oldTime = state.clock.elapsedTime
        state.clock.elapsedTime = tSec

        // 2. Fire every useFrame subscriber. Iterating by index because
        //    new subscribers can be added/removed mid-iteration on
        //    suspense boundaries.
        const subs = state.internal.subscribers
        for (let i = 0; i < subs.length; i++) {
          const s = subs[i]
          if (!s) continue
          try {
            s.ref.current(s.store.getState(), delta)
          } catch {
            // one bad subscriber must not break the rest of the frame
          }
        }

        // 3. Render the scene. Skip when an effect-composer has taken
        //    render priority (priority > 0).
        if (!state.internal.priority && state.gl.render) {
          state.gl.render(state.scene, state.camera)
        }
      } catch {
        // never let a single-frame error kill the loop
      }
      rafId = window.requestAnimationFrame(tick)
    }
    rafId = window.requestAnimationFrame(tick)
    return () => {
      running = false
      window.cancelAnimationFrame(rafId)
    }
  }, [state])
  return null
}

export type { Scene3D, ReplayMode, ReplayPhase }
