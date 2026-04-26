'use client'

import dynamic from 'next/dynamic'
import type { ReactNode } from 'react'

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
}

/**
 * Public entry point for the 3D scenario engine. SSR-safe: only loads the
 * R3F bundle on the client, after the page is hydrated.
 */
export function Scenario3DView(props: Scenario3DViewProps) {
  return <Scenario3DCanvasDynamic {...props} />
}
