'use client'

import { useEffect, useRef, useState } from 'react'
import { Scenario3DView } from '@/components/scenario3d/Scenario3DView'
import {
  GLB_ATHLETE_PREVIEW_DEV_OVERRIDE_KEY,
  IMPORTED_CLOSEOUT_DEV_OVERRIDE_KEY,
} from '@/components/scenario3d/imperativeScene'
import { useScenarioSceneData } from '@/lib/scenario3d/useScenarioSceneData'
import type { CourtState } from '@/components/court'

interface ScenePreviewClientProps {
  scenario: {
    id: string
    prompt: string
    court_state: unknown
    concept_tags: string[]
    user_role?: string
    scene?: unknown
    decoder_tag?: string | null
  }
  fullscreen: boolean
  /**
   * P1.7 — when true, set the runtime override window globals so
   * `imperativeScene.isGlbAthletePreviewActive()` returns `true`.
   * Server-side gated by `?glb=1`. Dev-only: the dev-preview route
   * already 404s in production, so the override never reaches a
   * production user.
   */
  enableGlbAthletePreview: boolean
  /**
   * P1.7 — when true, set the runtime override window globals so
   * `imperativeScene.isImportedCloseoutClipActive()` returns `true`.
   * Server-side gated by `?closeout=1`. Layered on top of the GLB
   * override — has no effect when the GLB override is off (the
   * imported closeout path only runs inside the GLB athlete builder).
   */
  enableImportedCloseoutClip: boolean
}

/**
 * Phase F0 — minimal /dev/scene-preview client. Mounts only the
 * Scenario3DView so the screenshot harness captures the same 3D
 * surface that ships in /train, without the surrounding decoder UI
 * that would dominate the frame in QA shots.
 *
 * `data-scene-ready` flips to "1" once the canvas has had time to
 * settle, so Playwright can wait for it instead of guessing with a
 * timeout.
 */
export function ScenePreviewClient({
  scenario,
  fullscreen,
  enableGlbAthletePreview,
  enableImportedCloseoutClip,
}: ScenePreviewClientProps) {
  // P1.7 — set the dev-only override window globals BEFORE
  // anything mounts the 3D canvas. Using a `useState` initialiser
  // (not a `useEffect`) so the writes happen during the render
  // pass, before the child Scenario3DView's mount effects run.
  // Server-side renders are guarded with `typeof window`; the
  // initialiser runs once per component mount, never twice.
  useState(() => {
    if (typeof window === 'undefined') return null
    const w = window as unknown as Record<string, unknown>
    if (enableGlbAthletePreview) {
      w[GLB_ATHLETE_PREVIEW_DEV_OVERRIDE_KEY] = true
    }
    if (enableImportedCloseoutClip) {
      w[IMPORTED_CLOSEOUT_DEV_OVERRIDE_KEY] = true
    }
    return null
  })

  // P1.7 — when the GLB / closeout overrides are on, block the
  // canvas mount until both preload promises resolve. This avoids
  // the cold-mount placeholder regression: the figure builder runs
  // for the first time after both caches are warm, so the very
  // first rendered frame uses the real GLB rig + real closeout
  // clip instead of falling back to procedural / synthetic. When
  // neither override is on, this state flips to `true` immediately
  // and the canvas mounts with no extra wait.
  const [assetsReady, setAssetsReady] = useState(
    !enableGlbAthletePreview && !enableImportedCloseoutClip,
  )

  useEffect(() => {
    if (!enableGlbAthletePreview && !enableImportedCloseoutClip) return
    let cancelled = false
    const tasks: Array<Promise<unknown>> = []
    // Local dynamic imports keep the dev-only preload code out of
    // the production bundle's static dep graph.
    if (enableGlbAthletePreview) {
      tasks.push(
        import('@/components/scenario3d/glbAthlete').then((mod) =>
          mod.loadGlbAthleteAsset().catch(() => null),
        ),
      )
    }
    if (enableImportedCloseoutClip) {
      tasks.push(
        import('@/components/scenario3d/glbAthlete').then((mod) =>
          mod.preloadImportedCloseoutClip().catch(() => null),
        ),
      )
    }
    Promise.all(tasks).finally(() => {
      if (cancelled) return
      setAssetsReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [enableGlbAthletePreview, enableImportedCloseoutClip])

  const scene = useScenarioSceneData({
    id: scenario.id,
    court_state: scenario.court_state as CourtState | null,
    scene: scenario.scene,
    user_role: scenario.user_role,
    concept_tags: scenario.concept_tags,
  })

  const wrapperRef = useRef<HTMLDivElement>(null)
  const concept = scenario.concept_tags?.join(' · ') || scenario.id

  useEffect(() => {
    if (!assetsReady) return
    // Mark as ready after the canvas has had a couple of frames to
    // stabilise. The screenshot harness waits on this attribute.
    const t = window.setTimeout(() => {
      wrapperRef.current?.setAttribute('data-scene-ready', '1')
    }, 1500)
    return () => window.clearTimeout(t)
  }, [scene?.id, assetsReady])

  useEffect(() => {
    if (!fullscreen) return
    // Defer until the canvas has rendered so the toggle finds the
    // mounted button. The dev-only flow is purely for screenshots,
    // so click without user-gesture rules don't apply (Playwright
    // synthesises a real gesture).
    const t = window.setTimeout(() => {
      const btn = document.querySelector<HTMLButtonElement>(
        'button[aria-label="Enter fullscreen"]',
      )
      btn?.click()
    }, 1800)
    return () => window.clearTimeout(t)
  }, [fullscreen])

  return (
    <main
      ref={wrapperRef}
      data-scene-ready="0"
      style={{
        minHeight: '100vh',
        background: '#08090C',
        color: '#E7ECF3',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <header
        style={{
          padding: '12px 16px',
          fontSize: 13,
          opacity: 0.7,
          letterSpacing: '0.04em',
        }}
      >
        DEV PREVIEW · {scenario.id} — auth bypassed for QA only
        {enableGlbAthletePreview ? ' · glb=on' : ''}
        {enableImportedCloseoutClip ? ' · closeout=on' : ''}
      </header>
      <div style={{ padding: '0 16px 16px' }}>
        <div style={{ position: 'relative', width: '100%', height: 720 }}>
          {assetsReady ? (
            <Scenario3DView
              fallback={<div style={{ padding: 24 }}>WebGL not available.</div>}
              scene={scene}
              concept={concept}
              replayMode="intro"
              height={720}
            />
          ) : (
            <div
              data-scene-asset-preload="1"
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: 0.6,
                fontSize: 13,
                letterSpacing: '0.04em',
              }}
            >
              loading GLB assets…
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
