'use client'

import type { ReactNode } from 'react'
import { Scenario3DCanvas } from './Scenario3DCanvas'
import { Scenario3DErrorBoundary } from './Scenario3DErrorBoundary'
import type { Scene3D } from '@/lib/scenario3d/scene'
import type { ReplayMode, ReplayPhase } from './ScenarioReplayController'

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
 * surface instead of taking down the whole /train page. Adds the broadcast
 * HUD chrome (REPLAY badge, scenario chip) outside the WebGL canvas so it
 * stays crisp on every device.
 */
export function Scenario3DView(props: Scenario3DViewProps) {
  const isReplay = props.replayMode === 'answer'
  return (
    <Scenario3DErrorBoundary scenarioId={props.scene?.id}>
      <div className="relative h-full w-full">
        <Scenario3DCanvas {...props} />
        {/* Top-left scenario chip — quietly orients the user. */}
        {props.concept ? (
          <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 rounded-full border border-white/10 bg-black/55 px-3 py-1 text-[10px] font-bold uppercase tracking-[1.5px] text-white/85 backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-[#3BFF9D] shadow-[0_0_6px_#3BFF9D]" />
            {props.concept}
          </div>
        ) : null}
        {/* Top-right REPLAY badge — pulses while the answer plays back. */}
        {isReplay ? (
          <div className="pointer-events-none absolute right-3 top-3 flex items-center gap-1.5 rounded-full border border-[#3BFF9D]/50 bg-[#062118]/85 px-3 py-1 text-[10px] font-bold uppercase tracking-[1.5px] text-[#3BFF9D] backdrop-blur-sm">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#3BFF9D]/70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#3BFF9D]" />
            </span>
            Replay
          </div>
        ) : null}
      </div>
    </Scenario3DErrorBoundary>
  )
}
