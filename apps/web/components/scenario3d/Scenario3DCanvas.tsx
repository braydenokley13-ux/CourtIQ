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
  useEffect(() => {
    camera.position.set(position[0], position[1], position[2])
    camera.lookAt(lookAt[0], lookAt[1], lookAt[2])
    camera.updateMatrixWorld()
    camera.updateProjectionMatrix()
  }, [camera, position, lookAt])
  return null
}

export type { Scene3D, ReplayMode, ReplayPhase }
