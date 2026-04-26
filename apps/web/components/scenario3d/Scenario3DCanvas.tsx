'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { Court3D } from './Court3D'
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
        style={{ height, background: '#0A0B0E', minHeight: height }}
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
      style={{ height, minHeight: height, position: 'relative' }}
    >
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [0, 36, 50], fov: 38, near: 0.1, far: 220 }}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          gl.setClearColor('#0A0B0E', 1)
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
        </SceneMotionProvider>
      </Canvas>
    </div>
  )
}

function SceneLighting() {
  return (
    <>
      <ambientLight intensity={0.55} color="#D7E2F4" />
      <directionalLight
        intensity={0.9}
        color="#FFE0B0"
        position={[12, 28, 16]}
      />
      <directionalLight intensity={0.25} color="#7EB6FF" position={[-18, 18, 30]} />
      {/* Subtle hoop fill */}
      <pointLight
        position={[0, COURT.rimHeightFt + 4, 0]}
        intensity={6}
        distance={14}
        color="#FF8A3D"
      />
    </>
  )
}

/**
 * Aims the default camera at a teaching-friendly point near the free throw
 * line so the rim sits at the back of the frame.
 */
function CameraTarget() {
  const camera = useThree((state) => state.camera)
  useEffect(() => {
    camera.lookAt(0, 4, COURT.freeThrowDistFt - 6)
    camera.updateProjectionMatrix()
  }, [camera])
  return null
}

export type { Scene3D, ReplayMode, ReplayPhase }
