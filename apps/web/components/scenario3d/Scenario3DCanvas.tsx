'use client'

import { useEffect, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { Court3D } from './Court3D'
import { hasWebGL, is3DDisabled } from '@/lib/scenario3d/feature'
import { COURT } from '@/lib/scenario3d/coords'

interface Scenario3DCanvasProps {
  /** Mounted as the WebGL fallback when WebGL is unavailable. */
  fallback: React.ReactNode
  children?: React.ReactNode
  /** Optional className passed to the outer wrapper. */
  className?: string
  /** Optional explicit pixel height. Defaults to a 3:2 aspect of width. */
  height?: number
}

/**
 * Top-level wrapper that mounts the R3F <Canvas> for a scenario scene. Falls
 * back to the supplied 2D node when WebGL is unavailable, the user has
 * disabled 3D, or the WebGL context is lost.
 */
export function Scenario3DCanvas({
  fallback,
  children,
  className,
  height = 280,
}: Scenario3DCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [mode, setMode] = useState<'probing' | '3d' | 'fallback'>('probing')

  useEffect(() => {
    if (is3DDisabled()) {
      setMode('fallback')
      return
    }
    setMode(hasWebGL() ? '3d' : 'fallback')
  }, [])

  if (mode === 'probing') {
    return (
      <div
        className={className}
        style={{ height, background: '#0A0B0E' }}
        aria-busy="true"
      />
    )
  }

  if (mode === 'fallback') {
    return <div className={className}>{fallback}</div>
  }

  return (
    <div ref={containerRef} className={className} style={{ height, position: 'relative' }}>
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [0, 36, 50], fov: 38, near: 0.1, far: 220 }}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          gl.setClearColor('#0A0B0E', 1)
          gl.domElement.addEventListener(
            'webglcontextlost',
            (event) => {
              event.preventDefault()
              setMode('fallback')
            },
            { once: true },
          )
        }}
      >
        <SceneLighting />
        <CameraTarget />
        <Court3D />
        {children}
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
