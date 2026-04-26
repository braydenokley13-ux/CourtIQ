import type { CourtPoint } from './coords'
import type { Scene3D, SceneMovement } from './scene'

export interface ResolvedMovement {
  id: string
  playerId: string
  kind: SceneMovement['kind']
  from: CourtPoint
  to: CourtPoint
  startMs: number
  endMs: number
  caption?: string
}

export interface Timeline {
  totalMs: number
  movements: ResolvedMovement[]
  /** Index of movements grouped by playerId / "ball". */
  byPlayer: Map<string, ResolvedMovement[]>
}

const DEFAULT_DURATION_MS = 700

/**
 * Resolves a scene's movement list into a timeline that can be sampled by
 * elapsed milliseconds. Movements run in their declared order; each movement
 * starts after the previous one for the same player ends, plus its declared
 * `delayMs`.
 */
export function buildTimeline(scene: Scene3D, movements: SceneMovement[]): Timeline {
  const byPlayer = new Map<string, ResolvedMovement[]>()
  const resolved: ResolvedMovement[] = []
  let totalMs = 0

  // Track last known position per player (and the ball) so chained
  // movements know where to start from.
  const lastPosition = new Map<string, CourtPoint>()
  for (const p of scene.players) {
    lastPosition.set(p.id, p.start)
  }
  lastPosition.set('ball', resolveBallStart(scene))

  // Track the next available start time per player.
  const nextStart = new Map<string, number>()

  for (const movement of movements) {
    const duration = movement.durationMs ?? DEFAULT_DURATION_MS
    const delay = movement.delayMs ?? 0
    const baseStart = nextStart.get(movement.playerId) ?? 0
    const startMs = baseStart + delay
    const endMs = startMs + duration

    const from = lastPosition.get(movement.playerId) ?? { x: 0, z: 0 }

    const entry: ResolvedMovement = {
      id: movement.id,
      playerId: movement.playerId,
      kind: movement.kind,
      from,
      to: movement.to,
      startMs,
      endMs,
      caption: movement.caption,
    }
    resolved.push(entry)
    nextStart.set(movement.playerId, endMs)
    lastPosition.set(movement.playerId, movement.to)
    totalMs = Math.max(totalMs, endMs)

    const list = byPlayer.get(movement.playerId) ?? []
    list.push(entry)
    byPlayer.set(movement.playerId, list)
  }

  return { totalMs, movements: resolved, byPlayer }
}

export function resolveBallStart(scene: Scene3D): CourtPoint {
  if (scene.ball.holderId) {
    const holder = scene.players.find((p) => p.id === scene.ball.holderId)
    if (holder) return holder.start
  }
  return scene.ball.start
}

/**
 * Returns the player's interpolated position at elapsed `t` ms.
 *
 * If no movement applies at `t`, returns the most recent end position (or
 * the player's start if there have been no prior movements).
 */
export function samplePlayer(
  scene: Scene3D,
  timeline: Timeline,
  playerId: string,
  t: number,
): CourtPoint {
  const list = timeline.byPlayer.get(playerId)
  if (!list || list.length === 0) {
    if (playerId === 'ball') return resolveBallStart(scene)
    return scene.players.find((p) => p.id === playerId)?.start ?? { x: 0, z: 0 }
  }

  // Before any movement begins: use the very first movement's `from`.
  if (t <= list[0]!.startMs) {
    return list[0]!.from
  }

  // Find the segment that covers `t`, or the most recent ended one.
  let active: ResolvedMovement | undefined
  let last: ResolvedMovement | undefined
  for (const m of list) {
    if (m.startMs <= t && t <= m.endMs) {
      active = m
      break
    }
    if (m.endMs <= t) last = m
  }

  if (active) {
    const span = Math.max(1, active.endMs - active.startMs)
    const u = ease((t - active.startMs) / span)
    return lerp(active.from, active.to, u)
  }

  return last?.to ?? list[0]!.from
}

function lerp(a: CourtPoint, b: CourtPoint, u: number): CourtPoint {
  return {
    x: a.x + (b.x - a.x) * u,
    z: a.z + (b.z - a.z) * u,
  }
}

/** ease-in-out cubic, 0..1 */
function ease(u: number): number {
  if (u <= 0) return 0
  if (u >= 1) return 1
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2
}
