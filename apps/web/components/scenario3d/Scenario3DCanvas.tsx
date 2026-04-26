'use client'

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
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
 * Top-level wrapper that mounts the R3F <Canvas> for a scenario scene.
 *
 * Mounting flow:
 *   1. Synchronously check `hasWebGL()` during the first render — by the
 *      time this component runs we are already past the dynamic import (so
 *      `window` exists). This skips a previously-stuck "probing" state.
 *   2. Force a `resize` event after first paint so R3F re-measures the
 *      container in case the parent flexbox finished sizing late.
 *   3. Show an HTML "Loading court…" overlay until the first useFrame
 *      callback fires. If the overlay never disappears, the render loop
 *      never started — that's a definitive diagnosis we can act on.
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
  const [firstFrame, setFirstFrame] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const reducedMotion = useReducedMotion()

  // Synchronously decide once on the client. The dynamic import wrapper
  // already guarantees we are running on the client.
  const webglOk = useMemo(() => hasWebGL(), [])
  const debug = useMemo(() => isDebug3D(), [])

  // After mount, nudge the layout so R3F's internal ResizeObserver
  // re-measures. This rescues mobile cases where the parent flexbox/grid
  // had a 0-width measurement on the first observation. We also fire it
  // whenever fullscreen toggles so R3F resizes the backing buffer to
  // match the new viewport.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const id = window.setTimeout(() => {
      window.dispatchEvent(new Event('resize'))
    }, 50)
    return () => window.clearTimeout(id)
  }, [fullscreen])

  // ESC closes fullscreen. The browser's native Fullscreen API also
  // listens for ESC, so we sync our state with whatever the browser
  // decides.
  useEffect(() => {
    if (typeof document === 'undefined') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(false)
    }
    const onFs = () => {
      // If the browser exited fullscreen on its own (e.g. user pressed
      // ESC while we were in native fullscreen), drop our flag too.
      if (!document.fullscreenElement) setFullscreen(false)
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('fullscreenchange', onFs)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('fullscreenchange', onFs)
    }
  }, [])

  const toggleFullscreen = async () => {
    const next = !fullscreen
    setFullscreen(next)
    // Try the native Fullscreen API too — on supporting devices this
    // gives a true edge-to-edge view (mobile included). Failure is
    // non-fatal: we still show the in-page CSS overlay.
    if (typeof document === 'undefined') return
    try {
      if (next && containerRef.current && document.fullscreenEnabled) {
        await containerRef.current.requestFullscreen?.({ navigationUI: 'hide' })
      } else if (!next && document.fullscreenElement) {
        await document.exitFullscreen?.()
      }
    } catch {
      // Ignore — CSS fullscreen still works as a safe fallback.
    }
  }

  // One-shot startup log so we can confirm the component reached this
  // path on a real device. Cheap, no PII, fires once per mount.
  useEffect(() => {
    if (typeof console === 'undefined') return
    // eslint-disable-next-line no-console
    console.info('[scenario3d] mount', {
      webglOk,
      ua: typeof navigator !== 'undefined' ? navigator.userAgent : '?',
      scene: scene?.id ?? null,
    })
  }, [webglOk, scene?.id])

  if (!webglOk || contextLost) {
    return <div className={className}>{fallback}</div>
  }

  const wrapperStyle: React.CSSProperties = fullscreen
    ? {
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100dvh',
        zIndex: 60,
        background: CANVAS_BG,
        display: 'block',
        overflow: 'hidden',
      }
    : {
        height,
        minHeight: height,
        width: '100%',
        position: 'relative',
        background: CANVAS_BG,
        display: 'block',
        overflow: 'hidden',
      }

  return (
    <div ref={containerRef} className={className} style={wrapperStyle}>
      <Canvas
        // `flat` disables ACES Filmic tone mapping, which by default
        // crushes mid-tones in our dark UI to near-black. With NoToneMapping
        // the wood floor renders as the literal sRGB color we set.
        flat
        // Always render every frame. Some R3F config paths default to
        // "demand" which would skip frames if no event handlers attach.
        frameloop="always"
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
          if (typeof console !== 'undefined') {
            // eslint-disable-next-line no-console
            console.info('[scenario3d] gl created', {
              size: `${size.width}x${size.height}`,
              dpr: gl.getPixelRatio(),
              isWebGL2:
                'isWebGL2' in gl.capabilities ? gl.capabilities.isWebGL2 : undefined,
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
          <FirstFrameProbe onFirstFrame={() => setFirstFrame(true)} />
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

      {/* HTML overlay that's visible until R3F renders its first frame.
          If this never disappears, we know the render loop never started.
          Provides a real surface (not just clear color) so users always
          see *something* while the GL pipeline is warming up. */}
      {!firstFrame ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: CANVAS_BG,
            color: '#7E8AA1',
            font: '11px/1.4 ui-sans-serif, system-ui, sans-serif',
            letterSpacing: '1.5px',
            textTransform: 'uppercase',
            pointerEvents: 'none',
            zIndex: 1,
          }}
          aria-hidden="true"
        >
          {glReady ? 'Drawing court…' : 'Loading court…'}
        </div>
      ) : null}

      {/* Fullscreen toggle. Tap to immerse in the play, ESC or tap again
          to exit. Hidden until the first frame fires so it does not
          appear before the court is visible. */}
      {firstFrame ? (
        <button
          type="button"
          onClick={() => void toggleFullscreen()}
          aria-label={fullscreen ? 'Exit full screen court' : 'Enter full screen court'}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            zIndex: 5,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 36,
            height: 36,
            borderRadius: 10,
            border: '1px solid rgba(255,255,255,0.18)',
            background: 'rgba(10,11,14,0.55)',
            color: '#FBFBFD',
            cursor: 'pointer',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
          }}
        >
          {fullscreen ? <ExitFullscreenIcon /> : <EnterFullscreenIcon />}
        </button>
      ) : null}

      {fullscreen ? (
        <div
          style={{
            position: 'absolute',
            bottom: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 5,
            padding: '6px 12px',
            borderRadius: 999,
            background: 'rgba(10,11,14,0.65)',
            color: '#FBFBFD',
            font: '600 11px/1 ui-sans-serif, system-ui, sans-serif',
            letterSpacing: '1.2px',
            textTransform: 'uppercase',
            pointerEvents: 'none',
          }}
        >
          Press ESC or tap again to exit
        </div>
      ) : null}

      {debug ? (
        <DebugOverlay
          containerRef={containerRef}
          scene={scene ?? null}
          glReady={glReady}
          firstFrame={firstFrame}
        />
      ) : null}
    </div>
  )
}

function EnterFullscreenIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ExitFullscreenIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
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
 * Renders nothing — just listens for the first useFrame callback so the
 * outer component can hide the HTML "Loading court…" overlay. If the
 * render loop never starts, the overlay stays up: a clear, visible
 * signal that something is wrong with the pipeline.
 */
function FirstFrameProbe({ onFirstFrame }: { onFirstFrame: () => void }) {
  const fired = useRef(false)
  useFrame(() => {
    if (fired.current) return
    fired.current = true
    onFirstFrame()
    if (typeof console !== 'undefined') {
      // eslint-disable-next-line no-console
      console.info('[scenario3d] first frame rendered')
    }
  })
  return null
}

/**
 * Overlay shown only when `?debug3d=1` is in the URL. Reports container
 * size, scene id, gl readiness, and first-frame status so we can diagnose
 * blank-canvas issues on real devices in production.
 */
function DebugOverlay({
  containerRef,
  scene,
  glReady,
  firstFrame,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>
  scene: Scene3D | null
  glReady: boolean
  firstFrame: boolean
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
        background: 'rgba(0,0,0,0.7)',
        color: '#FFD60A',
        font: '11px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace',
        padding: '4px 6px',
        borderRadius: 4,
        pointerEvents: 'none',
        whiteSpace: 'pre',
      }}
    >
      {`3d ${size.w}x${size.h} gl:${glReady ? 'ok' : '…'} f1:${firstFrame ? 'ok' : '…'}\nscene:${scene?.id ?? '—'} p:${scene?.players.length ?? 0}`}
    </div>
  )
}

export type { Scene3D, ReplayMode, ReplayPhase }
