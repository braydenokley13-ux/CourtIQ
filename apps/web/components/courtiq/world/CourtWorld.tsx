'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { WorldCallbacks, WorldScene } from './types'
import type { WorldRuntime } from './WorldRuntime'

/** Thin React shell around the imperative runtime. Children render into the
 * label layer; any element with data-anchor="<PlayerId>|pt:x,z" is pinned to
 * the court every frame by the runtime (no React re-render per frame). */
export default function CourtWorld({ scene, callbacks, children, onRuntime }: { scene: WorldScene; callbacks: WorldCallbacks; children?: ReactNode; onRuntime?(r: WorldRuntime | null): void }) {
  const host = useRef<HTMLDivElement>(null)
  const labels = useRef<HTMLDivElement>(null)
  const runtime = useRef<WorldRuntime | null>(null)
  const latest = useRef(callbacks); latest.current = callbacks
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    void import('./WorldRuntime').then(({ WorldRuntime }) => {
      if (cancelled || !host.current) return
      try {
        const proxy: WorldCallbacks = {
          onSelect: (...a) => latest.current.onSelect?.(...a),
          onHover: (...a) => latest.current.onHover?.(...a),
          onMove: (...a) => latest.current.onMove?.(...a),
          onTagDepth: (...a) => latest.current.onTagDepth?.(...a),
          onCameraMode: (...a) => latest.current.onCameraMode?.(...a),
          onReady: (...a) => latest.current.onReady?.(...a),
          onStats: (...a) => latest.current.onStats?.(...a),
        }
        runtime.current = new WorldRuntime(host.current, proxy)
        runtime.current.setLabelLayer(labels.current)
        runtime.current.setScene(sceneRef.current)
        onRuntime?.(runtime.current)
      } catch {
        setFailed(true)
      }
    })
    return () => { cancelled = true; runtime.current?.dispose(); runtime.current = null; onRuntime?.(null) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sceneRef = useRef(scene); sceneRef.current = scene
  useEffect(() => { runtime.current?.setScene(scene) }, [scene])

  return (
    <div ref={host} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }} data-world={failed ? 'unavailable' : 'webgl'}>
      {failed && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#9fb0bf', font: '500 15px system-ui' }}>3D is unavailable on this device. Your answers and teaching still work.</div>}
      <div ref={labels} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2 }}>{children}</div>
    </div>
  )
}
