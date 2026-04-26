'use client'

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { Court3D } from './Court3D'
import { SceneDebug3D } from './SceneDebug3D'
import { ScenarioScene3D } from './ScenarioScene3D'
import type { ReplayMode, ReplayPhase } from './ScenarioReplayController'
import { SceneMotionProvider } from './SceneMotionContext'
import { hasWebGL } from '@/lib/scenario3d/feature'
import { useReducedMotion } from '@/lib/scenario3d/useReducedMotion'
import { COURT } from '@/lib/scenario3d/coords'
import { createDefaultScene, type Scene3D } from '@/lib/scenario3d/scene'

interface Scenario3DCanvasProps {
  /** Mounted as the WebGL fallback when WebGL is unavailable. */
  fallback: React.ReactNode
  children?: React.ReactNode
  /** Optional className passed to the outer wrapper. */
  className?: string
  /** Optional explicit pixel height. Defaults to 280px. */
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

const CANVAS_BG = '#101521'

const CAMERA_POSITION: [number, number, number] = [0, 30, 60]
const CAMERA_LOOKAT: [number, number, number] = [0, 0, 16]
const CAMERA_FOV = 42

/**
 * Top-level wrapper that mounts the R3F <Canvas> for a scenario scene. The
 * R3F scene IS the product — we render the real scene as the primary path
 * and only fall through to the supplied 2D node when WebGL is genuinely
 * unavailable on the device or the WebGL context is lost at runtime. Errors
 * thrown inside the canvas are caught by Scenario3DErrorBoundary further up.
 */
export function Scenario3DCanvas({
  fallback,
  children,
  className,
  height = 280,
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

  const reducedMotion = useReducedMotion()

  const visibleScene = useMemo(
    () => scene ?? createDefaultScene('default_3d_scene'),
    [scene],
  )

  const sceneValidationStatus = useMemo(
    () => getSceneValidationStatus(visibleScene, scene),
    [scene, visibleScene],
  )

  useEffect(() => {
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
        // `flat` disables ACES Filmic tone mapping, which by default
        // crushes mid-tones in our dark UI to near-black. With NoToneMapping
        // the wood floor renders as the literal sRGB color we set.
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
            // Mark mount AFTER GL setup so the proof-of-life state only
            // flips when the renderer is actually usable.
            setCanvasMounted(true)
          } catch (error) {
            setRuntimeError(error instanceof Error ? error.message : 'Unknown WebGL error')
            setMode('fallback')
          }
        }}
      >
        {/* Explicit scene background ensures the canvas paints even before
            the first lighting pass completes on slow devices. */}
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
            showPaths={showPaths}
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
      />
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
}

function CanvasDebugOverlay({
  canvasMounted,
  webglSupported,
  scenarioId,
  concept,
  validationStatus,
  errorMessage,
}: CanvasDebugOverlayProps) {
  if (process.env.NODE_ENV === 'production') return null

  return (
    <div className="pointer-events-none absolute left-2 top-2 max-w-[92%] rounded-lg bg-bg-0/85 px-2 py-1 text-[10px] leading-snug text-text-dim">
      <div>canvas mounted: {canvasMounted ? 'yes' : 'no'}</div>
      <div>webgl supported: {webglSupported === null ? 'checking' : webglSupported ? 'yes' : 'no'}</div>
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
): string {
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
      <hemisphereLight args={['#D7E2F4', '#1A1408', 0.55]} />
      <ambientLight intensity={0.95} color="#FFF1E0" />
      <directionalLight intensity={1.4} color="#FFE4B5" position={[14, 32, 18]} />
      <directionalLight intensity={0.5} color="#7EB6FF" position={[-22, 22, 36]} />
      <pointLight
        position={[0, COURT.rimHeightFt + 4, 0]}
        intensity={9}
        distance={20}
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
