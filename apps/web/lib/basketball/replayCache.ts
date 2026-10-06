import { ENGINE_VERSION, PROBLEMS } from '@courtiq/basketball/scenario'
import { simulate } from '@courtiq/basketball/simulation'
import type { LabConfig, SimulationResult } from '@courtiq/basketball/types'

/** Small UI-only history cache. Search remains bounded independent worker work.
 * Frame count limits retained trajectories even when the motion clock changes. */
export const REPLAY_CACHE_LIMITS = Object.freeze({ entries: 3, frames: 800 } as const)
const cache = new Map<string, SimulationResult>()
let retainedFrames = 0,
  hits = 0,
  misses = 0

function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
  return value
}

/** Returns an immutable cached replay for an exact input. Every basketball
 * parameter/cue is part of the key; editing a coach rule creates a new world.
 * Call simulate directly when a caller needs to mutate its private result. */
export function simulateCached(config: LabConfig): SimulationResult {
  const problem = PROBLEMS.find((problem) => problem.id === config.problemId)
  const key = `${ENGINE_VERSION}:${problem?.version ?? 'missing'}:${JSON.stringify(config)}`
  const found = cache.get(key)
  if (found) {
    cache.delete(key)
    cache.set(key, found)
    hits++
    return found
  }
  misses++
  const result = simulate(config)
  if (result.frames.length > REPLAY_CACHE_LIMITS.frames) return result
  freeze(result)
  while (
    cache.size >= REPLAY_CACHE_LIMITS.entries ||
    retainedFrames + result.frames.length > REPLAY_CACHE_LIMITS.frames
  ) {
    const oldest = cache.keys().next().value as string
    retainedFrames -= cache.get(oldest)!.frames.length
    cache.delete(oldest)
  }
  cache.set(key, result)
  retainedFrames += result.frames.length
  return result
}

export function clearReplayCache(): void {
  cache.clear()
  retainedFrames = 0
  hits = 0
  misses = 0
}
export function replayCacheStats() {
  return { entries: cache.size, retainedFrames, hits, misses, limits: REPLAY_CACHE_LIMITS }
}
