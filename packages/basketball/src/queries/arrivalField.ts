import { defenderArrival } from './sharedArrival'
import type { ModelAssumptions, WorldFrame } from '../domain/types'

/** Samples of the same capability-aware modeled arrival query used by X-Ray.
 * The renderer interpolates this field; it does not own another motion model.
 * Rows run from far baseline toward the attacked baseline, matching floor UVs. */
export interface ArrivalField {
  width: number
  height: number
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number }
  seconds: number[]
}

export function sampleArrivalField(
  frame: WorldFrame,
  assumptions: ModelAssumptions,
  width = 33,
  height = 31,
): ArrivalField {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2 || width * height > 8192)
    throw new Error('Arrival sampling exceeds the supported grid budget.')
  const bounds = { minX: -7.62, maxX: 7.62, minZ: 0, maxZ: 14.326 }
  const defenders = frame.players.filter((player) => player.team === 'defense')
  const seconds: number[] = []
  for (let row = 0; row < height; row++)
    for (let column = 0; column < width; column++) {
      const target = {
        x: bounds.minX + (column / (width - 1)) * (bounds.maxX - bounds.minX),
        z: bounds.maxZ - (row / (height - 1)) * (bounds.maxZ - bounds.minZ),
      }
      seconds.push(defenders.reduce((best, player) => Math.min(best, defenderArrival(player, target, assumptions)), 99))
    }
  return { width, height, bounds, seconds }
}
