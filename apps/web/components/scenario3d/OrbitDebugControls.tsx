'use client'

import { OrbitControls } from '@react-three/drei'

interface OrbitDebugControlsProps {
  target: [number, number, number]
}

/**
 * Wrapper around drei's OrbitControls. Lives in its own file so the
 * canvas baseline stays drei-free per the rendering-guarantees test —
 * this is opt-in via `?orbit=1` and only mounts when explicitly
 * requested for manual camera framing.
 */
export function OrbitDebugControls({ target }: OrbitDebugControlsProps) {
  return <OrbitControls enableDamping target={target} />
}
