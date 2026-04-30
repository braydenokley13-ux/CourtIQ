'use client'

import { useEffect, useRef } from 'react'
import { Scenario3DView } from '@/components/scenario3d/Scenario3DView'
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
export function ScenePreviewClient({ scenario, fullscreen }: ScenePreviewClientProps) {
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
    // Mark as ready after the canvas has had a couple of frames to
    // stabilise. The screenshot harness waits on this attribute.
    const t = window.setTimeout(() => {
      wrapperRef.current?.setAttribute('data-scene-ready', '1')
    }, 1500)
    return () => window.clearTimeout(t)
  }, [scene?.id])

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
      </header>
      <div style={{ padding: '0 16px 16px' }}>
        <div style={{ position: 'relative', width: '100%', height: 720 }}>
          <Scenario3DView
            fallback={<div style={{ padding: 24 }}>WebGL not available.</div>}
            scene={scene}
            concept={concept}
            replayMode="intro"
            height={720}
          />
        </div>
      </div>
    </main>
  )
}
