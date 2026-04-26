'use client'

import { useMemo } from 'react'
import { Line } from '@react-three/drei'

interface MovementPath3DProps {
  from: [number, number]
  to: [number, number]
  color?: string
  /** 0..1 — how much of the path is currently drawn. */
  progress?: number
  /** Render an arrowhead at the destination. */
  arrow?: boolean
  /** If true, the body of the line is dashed. */
  dashed?: boolean
}

const DEFAULT_COLOR = '#FFD60A'
const Y = 0.05
const HEAD_LENGTH = 1.1
const HEAD_WIDTH = 0.55

/**
 * Arrow drawn flat on the floor between two points on the court. Used for
 * cuts, rotations and passes.
 */
export function MovementPath3D({
  from,
  to,
  color = DEFAULT_COLOR,
  progress = 1,
  arrow = true,
  dashed = false,
}: MovementPath3DProps) {
  const dx = to[0] - from[0]
  const dz = to[1] - from[1]
  const length = Math.hypot(dx, dz)

  const fromX = from[0]
  const fromZ = from[1]
  const toX = to[0]
  const toZ = to[1]

  const bodyPoints = useMemo<[number, number, number][]>(() => {
    const end: [number, number, number] = [
      fromX + dx * progress,
      Y,
      fromZ + dz * progress,
    ]
    return [[fromX, Y, fromZ], end]
  }, [fromX, fromZ, dx, dz, progress])

  const head = useMemo<[number, number, number][] | null>(() => {
    if (!arrow || progress < 0.95 || length < 0.6) return null
    const dirX = dx / length
    const dirZ = dz / length
    const perpX = -dirZ
    const perpZ = dirX
    const baseX = toX - dirX * HEAD_LENGTH
    const baseZ = toZ - dirZ * HEAD_LENGTH
    const wingA: [number, number, number] = [
      baseX + perpX * HEAD_WIDTH,
      Y,
      baseZ + perpZ * HEAD_WIDTH,
    ]
    const wingB: [number, number, number] = [
      baseX - perpX * HEAD_WIDTH,
      Y,
      baseZ - perpZ * HEAD_WIDTH,
    ]
    const tip: [number, number, number] = [toX, Y, toZ]
    return [wingA, tip, wingB]
  }, [arrow, progress, length, toX, toZ, dx, dz])

  if (length < 0.05) return null

  return (
    <group>
      <Line
        points={bodyPoints}
        color={color}
        lineWidth={dashed ? 1.5 : 2.5}
        dashed={dashed}
        dashSize={0.6}
        gapSize={0.4}
        transparent
        opacity={0.95}
      />
      {head ? (
        <Line points={head} color={color} lineWidth={3} transparent opacity={0.95} />
      ) : null}
    </group>
  )
}
