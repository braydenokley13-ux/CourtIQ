'use client'

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { Court3D } from './Court3D'
import { SceneDebug3D } from './SceneDebug3D'
import { ScenarioScene3D } from './ScenarioScene3D'
import type { ReplayMode, ReplayPhase } from './ScenarioReplayController'
import { SceneMotionProvider } from './SceneMotionContext'
import { hasWebGL, isDebug3D } from '@/lib/scenario3d/feature'
import { useReducedMotion } from '@/lib/scenario3d/useReducedMotion'
import { COURT } from '@/lib/scenario3d/coords'
import {
  createDebugSelfTestScene,
  createDefaultScene,
  type Scene3D,
} from '@/lib/scenario3d/scene'

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

// Tighter, broadcast-style angle. The camera sits high behind the
// half-court looking down at the free-throw line. Distance and FOV are
// tuned so a 50ft × 47ft half-court fills the canvas with a touch of
// margin even on narrow mobile aspect ratios.
const CAMERA_POSITION: [number, number, number] = [0, 32, 56]
const CAMERA_LOOKAT: [number, number, number] = [0, 0, 18]
const CAMERA_FOV = 44

/**
 * Top-level wrapper that mounts the R3F <Canvas> for a scenario scene. The
 * 3D scene IS the product — the real scene renders as the primary path and
 * we only fall back to the supplied 2D node when WebGL is genuinely
 * unavailable on the device or the WebGL context is lost. Errors thrown
 * inside the canvas are caught by Scenario3DErrorBoundary further up.
 *
 * `?debug3d=1` swaps in a self-test scene (5+5 players, ball, replay)
 * regardless of the supplied scenario, so the rendering path can be
 * exercised without depending on scenario data.
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
  const [runtimeError, setRuntimeError] = useState<string | null>(null)
  const [debugMode, setDebugMode] = useState(false)

  const reducedMotion = useReducedMotion()

  const visibleScene = useMemo(() => {
    if (debugMode) return createDebugSelfTestScene()
    return scene ?? createDefaultScene('default_3d_scene')
  }, [scene, debugMode])

  const sceneValidationStatus = useMemo(
    () => getSceneValidationStatus(visibleScene, scene, debugMode),
    [scene, visibleScene, debugMode],
  )

  useEffect(() => {
    setDebugMode(isDebug3D())
    const supported = hasWebGL()
    setWebglSupported(supported)
    setMode(supported ? '3d' : 'fallback')
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
        <CanvasDebugOverlay
          canvasMounted={canvasMounted}
          webglSupported={webglSupported}
          scenarioId={scene?.id}
          concept={concept}
          validationStatus={sceneValidationStatus}
          errorMessage={runtimeError}
          debugMode={debugMode}
        />
      </div>
    )
  }

  if (mode === 'fallback') {
    return <div className={className}>{fallback}</div>
  }

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
        camera={{ position: CAMERA_POSITION, fov: CAMERA_FOV, near: 0.1, far: 260 }}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
        style={{ width: '100%', height: '100%', display: 'block' }}
        onCreated={({ gl }) => {
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
            setCanvasMounted(true)
          } catch (error) {
            setRuntimeError(error instanceof Error ? error.message : 'Unknown WebGL error')
            setMode('fallback')
          }
        }}
      >
        {/* Scene background — slightly lighter than the page bg so the
            canvas reads as a discrete arena floor and not a void. */}
        <color attach="background" args={[CANVAS_BG]} />
        <SceneMotionProvider reduced={reducedMotion}>
          <SceneLighting />
          <CameraTarget />
          <Court3D />
          <ScenarioScene3D
            key={visibleScene.id}
            scene={visibleScene}
            mode={replayMode}
            resetCounter={resetCounter}
            onCaption={onCaption}
            onPhase={onPhase}
            showPaths={showPaths || debugMode}
          />
          <Suspense fallback={null}>{children}</Suspense>
          <SceneDebug3D scene={visibleScene} />
        </SceneMotionProvider>
      </Canvas>
      <CanvasDebugOverlay
        canvasMounted={canvasMounted}
        webglSupported={webglSupported}
        scenarioId={scene?.id}
        concept={concept}
        validationStatus={sceneValidationStatus}
        errorMessage={runtimeError}
        debugMode={debugMode}
      />
      {debugMode ? (
        <div className="pointer-events-none absolute right-2 top-2 rounded-full bg-brand/15 px-2 py-1 text-[10px] font-bold uppercase tracking-[1.5px] text-brand">
          debug3d self-test
        </div>
      ) : null}
    </div>
  )
}

interface CanvasDebugOverlayProps {
  canvasMounted: boolean
  webglSupported: boolean | null
  scenarioId?: string
  concept?: string
  validationStatus: string
  errorMessage: string | null
  debugMode: boolean
}

function CanvasDebugOverlay({
  canvasMounted,
  webglSupported,
  scenarioId,
  concept,
  validationStatus,
  errorMessage,
  debugMode,
}: CanvasDebugOverlayProps) {
  // In production, the overlay is only shown when ?debug3d=1 is set.
  if (process.env.NODE_ENV === 'production' && !debugMode) return null

  return (
    <div className="pointer-events-none absolute left-2 top-2 max-w-[92%] rounded-lg bg-bg-0/85 px-2 py-1 text-[10px] leading-snug text-text-dim">
      <div>canvas mounted: {canvasMounted ? 'yes' : 'no'}</div>
      <div>webgl supported: {webglSupported === null ? 'checking' : webglSupported ? 'yes' : 'no'}</div>
      <div>scenario: {scenarioId ?? 'none'}</div>
      <div>concept: {concept ?? 'none'}</div>
      <div>scene: {validationStatus}</div>
      <div>error: {errorMessage ?? 'none'}</div>
      {debugMode ? <div>mode: debug3d self-test</div> : null}
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

/**
 * Aims the default camera at a teaching-friendly point near the free throw
 * line so the rim sits at the back of the frame and the back-court action
 * stays comfortably in view.
 */
function CameraTarget() {
  const camera = useThree((state) => state.camera)
  useEffect(() => {
    camera.position.set(...CAMERA_POSITION)
    camera.lookAt(...CAMERA_LOOKAT)
    camera.updateMatrixWorld()
    camera.updateProjectionMatrix()
  }, [camera])
  return null
}

export type { Scene3D, ReplayMode, ReplayPhase }
