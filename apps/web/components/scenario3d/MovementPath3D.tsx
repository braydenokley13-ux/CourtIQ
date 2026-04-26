'use client'

import { useMemo } from 'react'
import { LinePrimitive3D } from './LinePrimitive3D'

interface MovementPath3DProps {
  from: [number, number]
  to: [number, number]
  color?: string
  /** 0..1 — how much of the path is currently drawn. */
  progress?: number
  /** Render an arrowhead at the destination. */
  arrow?: boolean
  /** If true, the body of the line is dimmed to imply a teaching dashed path. */
  dashed?: boolean
}

const DEFAULT_COLOR = '#FFD60A'
const Y = 0.05
const HEAD_LENGTH = 1.1
const HEAD_WIDTH = 0.55

/**
 * Arrow drawn flat on the floor between two points on the court. Used for
 * cuts, rotations and passes. Backed by the native three.js line primitive
 * so it cannot disappear under bundler shake.
 */
export function MovementPath3D({
  from,
  to,
  color = DEFAULT_COLOR,
  progress = 1,
  arrow = true,
  dashed,
}: MovementPath3DProps) {
  const dx = to[0] - from[0]
  const dz = to[1] - from[1]
  const length = Math.hypot(dx, dz)

  const fromX = from[0]
  const fromZ = from[1]
  const toX = to[0]
  const toZ = to[1]

  const bodyPoints = useMemo<Array<[number, number, number]>>(() => {
    const end: [number, number, number] = [
      fromX + dx * progress,
      Y,
      fromZ + dz * progress,
    ]
    return [[fromX, Y, fromZ], end]
  }, [fromX, fromZ, dx, dz, progress])

  const head = useMemo<Array<[number, number, number]> | null>(() => {
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
      <LinePrimitive3D
        points={bodyPoints}
        color={color}
        opacity={dashed ? 0.72 : 0.95}
      />
      {head ? (
        <LinePrimitive3D points={head} color={color} opacity={0.95} />
      ) : null}
    </group>
  )
}
