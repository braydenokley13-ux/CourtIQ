'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { Court3D } from './Court3D'
import { SceneDebug3D } from './SceneDebug3D'
import { ScenarioScene3D } from './ScenarioScene3D'
import type { ReplayMode, ReplayPhase } from './ScenarioReplayController'
import { SceneMotionProvider } from './SceneMotionContext'
import { hasWebGL } from '@/lib/scenario3d/feature'
import { useReducedMotion } from '@/lib/scenario3d/useReducedMotion'
import { COURT } from '@/lib/scenario3d/coords'
import type { Scene3D } from '@/lib/scenario3d/scene'

interface Scenario3DCanvasProps {
  /** Mounted as the WebGL fallback when WebGL is unavailable. */
  fallback: React.ReactNode
  children?: React.ReactNode
  /** Optional className passed to the outer wrapper. */
  className?: string
  /** Optional explicit pixel height. Defaults to 280px. */
  height?: number
  /** Normalised scene to render. If omitted, only the empty court shows. */
  scene?: Scene3D | null
  /** Animation mode for the scene. */
  replayMode?: ReplayMode
  /** Bumping resets the active timeline. */
  resetCounter?: number
  onCaption?: (caption: string | undefined) => void
  onPhase?: (phase: ReplayPhase) => void
  showPaths?: boolean
}

// Background of the canvas. Slightly lifted off pure-black so the dark
// outer floor frame is still visible against it.
const CANVAS_BG = '#101521'

// Camera defaults — broadcast-style elevated angle that frames the entire
// half-court at typical mobile aspect ratios.
const CAMERA_POSITION: [number, number, number] = [0, 30, 60]
const CAMERA_LOOKAT: [number, number, number] = [0, 0, 16]
const CAMERA_FOV = 42

/**
 * Top-level wrapper that mounts the R3F <Canvas> for a scenario scene. Falls
 * back to the supplied 2D node only when WebGL is genuinely unavailable on
 * the device, or when the WebGL context is lost. 3D is the default — we do
 * not gate behind any feature flag.
 */
export function Scenario3DCanvas({
  fallback,
  children,
  className,
  height = 280,
  scene,
  replayMode = 'intro',
  resetCounter,
  onCaption,
  onPhase,
  showPaths,
}: Scenario3DCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [mode, setMode] = useState<'probing' | '3d' | 'fallback'>('probing')
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    setMode(hasWebGL() ? '3d' : 'fallback')
  }, [])

  if (mode === 'probing') {
    return (
      <div
        className={className}
        style={{ height, background: CANVAS_BG, minHeight: height }}
        aria-busy="true"
      >
        <div className="flex h-full items-center justify-center text-[11px] uppercase tracking-[1.5px] text-text-dim">
          Loading court…
        </div>
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
          gl.setClearColor(CANVAS_BG, 1)
          const dom = gl.domElement
          if (!dom) return
          dom.addEventListener(
            'webglcontextlost',
            (event) => {
              event.preventDefault()
              setMode('fallback')
            },
            { once: true },
          )
        }}
      >
        {/* Explicit scene background ensures the canvas paints even before
            the first lighting pass completes on slow devices. */}
        <color attach="background" args={[CANVAS_BG]} />
        <SceneMotionProvider reduced={reducedMotion}>
          <SceneLighting />
          <CameraTarget />
          <Court3D />
          <Suspense fallback={null}>
            {scene ? (
              <ScenarioScene3D
                key={scene.id}
                scene={scene}
                mode={replayMode}
                resetCounter={resetCounter}
                onCaption={onCaption}
                onPhase={onPhase}
                showPaths={showPaths}
              />
            ) : null}
            {children}
          </Suspense>
          <SceneDebug3D scene={scene ?? null} />
        </SceneMotionProvider>
      </Canvas>
    </div>
  )
}

function SceneLighting() {
  return (
    <>
      {/* Hemisphere fills shadows with a touch of arena cool light. */}
      <hemisphereLight args={['#D7E2F4', '#1A1408', 0.55]} />
      {/* Ambient lift so the warm hardwood reads on every device. */}
      <ambientLight intensity={0.95} color="#FFF1E0" />
      {/* Key light — warm spotlight over the rim, like an arena. */}
      <directionalLight
        intensity={1.4}
        color="#FFE4B5"
        position={[14, 32, 18]}
      />
      {/* Cool rim light from the half-court side keeps depth readable. */}
      <directionalLight intensity={0.5} color="#7EB6FF" position={[-22, 22, 36]} />
      {/* Tight rim glow under the hoop. */}
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
