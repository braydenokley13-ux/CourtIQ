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

function isDebug3D(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return new URLSearchParams(window.location.search).has('debug3d')
  } catch {
    return false
  }
}

/**
 * Top-level wrapper that mounts the R3F <Canvas> for a scenario scene. Falls
 * back to the supplied 2D node only when WebGL is genuinely unavailable on
 * the device, or when the WebGL context is lost. 3D is the default — we do
 * not gate behind any feature flag.
 *
 * Mounting flow:
 *   1. Synchronously check `hasWebGL()` during the first render — by the
 *      time this component runs we are already past the dynamic import (so
 *      `window` exists). This skips a previously-stuck "probing" state.
 *   2. Force a `resize` event after first paint so R3F re-measures the
 *      container in case the parent flexbox finished sizing late.
 */
export function Scenario3DCanvas({
  fallback,
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
  const [contextLost, setContextLost] = useState(false)
  const [glReady, setGlReady] = useState(false)
  const reducedMotion = useReducedMotion()

  // Synchronously decide once on the client. The dynamic import wrapper
  // already guarantees we are running on the client.
  const webglOk = useMemo(() => hasWebGL(), [])
  const debug = useMemo(() => isDebug3D(), [])

  // After mount, nudge the layout so R3F's internal ResizeObserver
  // re-measures. This rescues mobile cases where the parent flexbox/grid
  // had a 0-width measurement on the first observation.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const id = window.setTimeout(() => {
      window.dispatchEvent(new Event('resize'))
    }, 50)
    return () => window.clearTimeout(id)
  }, [])

  if (!webglOk || contextLost) {
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
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: 'high-performance',
          preserveDrawingBuffer: false,
          failIfMajorPerformanceCaveat: false,
        }}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          position: 'absolute',
          inset: 0,
        }}
        onCreated={({ gl, size }) => {
          gl.setClearColor(CANVAS_BG, 1)
          gl.clear()
          setGlReady(true)
          if (debug) {
            // eslint-disable-next-line no-console
            console.log('[scenario3d] gl created', {
              size: `${size.width}x${size.height}`,
              dpr: gl.getPixelRatio(),
              capabilities: {
                isWebGL2: 'isWebGL2' in gl.capabilities ? gl.capabilities.isWebGL2 : undefined,
                maxTextures: gl.capabilities.maxTextures,
              },
            })
          }
          const dom = gl.domElement
          if (!dom) return
          dom.addEventListener(
            'webglcontextlost',
            (event) => {
              event.preventDefault()
              if (typeof console !== 'undefined') {
                console.warn('[scenario3d] WebGL context lost — falling back to 2D')
              }
              setContextLost(true)
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
          </Suspense>
          <SceneDebug3D scene={scene ?? null} />
        </SceneMotionProvider>
      </Canvas>
      {debug ? (
        <DebugOverlay
          containerRef={containerRef}
          scene={scene ?? null}
          glReady={glReady}
        />
      ) : null}
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
  const size = useThree((state) => state.size)
  useEffect(() => {
    camera.position.set(...CAMERA_POSITION)
    camera.lookAt(...CAMERA_LOOKAT)
    if ('aspect' in camera) {
      ;(camera as { aspect: number }).aspect = size.width / Math.max(1, size.height)
    }
    camera.updateMatrixWorld()
    camera.updateProjectionMatrix()
  }, [camera, size.width, size.height])
  return null
}

/**
 * Overlay shown only when `?debug3d=1` is in the URL. Reports container
 * size, scene id, and gl readiness so we can diagnose blank-canvas issues
 * on real devices in production.
 */
function DebugOverlay({
  containerRef,
  scene,
  glReady,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>
  scene: Scene3D | null
  glReady: boolean
}) {
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => {
      const r = el.getBoundingClientRect()
      setSize({ w: Math.round(r.width), h: Math.round(r.height) })
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [containerRef])

  return (
    <div
      style={{
        position: 'absolute',
        top: 6,
        left: 6,
        zIndex: 10,
        background: 'rgba(0,0,0,0.6)',
        color: '#FFD60A',
        font: '11px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace',
        padding: '4px 6px',
        borderRadius: 4,
        pointerEvents: 'none',
        whiteSpace: 'pre',
      }}
    >
      {`3d ${size.w}x${size.h} gl:${glReady ? 'ok' : '…'}\nscene:${scene?.id ?? '—'} p:${scene?.players.length ?? 0}`}
    </div>
  )
}

export type { Scene3D, ReplayMode, ReplayPhase }
