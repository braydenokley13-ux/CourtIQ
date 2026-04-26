'use client'

import dynamic from 'next/dynamic'
import type { ReactNode } from 'react'
import { Scenario3DErrorBoundary } from './Scenario3DErrorBoundary'
import type { Scene3D } from '@/lib/scenario3d/scene'
import type { ReplayMode, ReplayPhase } from './ScenarioReplayController'

const Scenario3DCanvasDynamic = dynamic(
  () => import('./Scenario3DCanvas').then((m) => m.Scenario3DCanvas),
  {
    ssr: false,
    loading: () => (
      <div
        className="flex h-[280px] w-full items-center justify-center bg-bg-1 text-xs text-text-dim"
        aria-busy="true"
      >
        Warming up the gym…
      </div>
    ),
  },
)

interface Scenario3DViewProps {
  fallback: ReactNode
  children?: ReactNode
  height?: number
  className?: string
  scene?: Scene3D | null
  concept?: string
  replayMode?: ReplayMode
  resetCounter?: number
  onCaption?: (caption: string | undefined) => void
  onPhase?: (phase: ReplayPhase) => void
  showPaths?: boolean
}

/**
 * Public entry point for the 3D scenario engine. SSR-safe: only loads the
 * R3F bundle on the client, after the page is hydrated. Wraps the canvas
 * in an error boundary so any rendering failure stays scoped to the court
 * surface instead of taking down the whole /train page.
 */
export function Scenario3DView(props: Scenario3DViewProps) {
  return (
    <Scenario3DErrorBoundary scenarioId={props.scene?.id}>
      <Scenario3DCanvasDynamic {...props} />
    </Scenario3DErrorBoundary>
  )
}
