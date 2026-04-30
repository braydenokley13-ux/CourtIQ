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

export interface BuildTimelineOptions {
  /**
   * Phase D — overrides each player's "start position" for this leg.
   * The consequence and replay legs of the state machine resume from the
   * freeze snapshot, not from the scene's authored player.start. Pass a
   * map of `playerId → CourtPoint` (and optionally `ball → CourtPoint`)
   * to seed the chained-movement math from the snapshot positions
   * instead of `scene.players[*].start` / `resolveBallStart(scene)`.
   * Missing entries fall back to the scene defaults.
   */
  startOverrides?: ReadonlyMap<string, CourtPoint>
}

/**
 * Resolves a scene's movement list into a timeline that can be sampled by
 * elapsed milliseconds. Movements run in their declared order; each movement
 * starts after the previous one for the same player ends, plus its declared
 * `delayMs`.
 */
export function buildTimeline(
  scene: Scene3D,
  movements: SceneMovement[],
  options?: BuildTimelineOptions,
): Timeline {
  const byPlayer = new Map<string, ResolvedMovement[]>()
  const resolved: ResolvedMovement[] = []
  let totalMs = 0

  // Track last known position per player (and the ball) so chained
  // movements know where to start from.
  const lastPosition = new Map<string, CourtPoint>()
  for (const p of scene.players) {
    lastPosition.set(p.id, options?.startOverrides?.get(p.id) ?? p.start)
  }
  lastPosition.set('ball', options?.startOverrides?.get('ball') ?? resolveBallStart(scene))

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
 *
 * Phase H — `overrides` lets the consequence and replay legs hold idle
 * players (anyone with no movement in this leg) at the freeze snapshot
 * instead of snapping them back to `scene.players[*].start`. The
 * override map is keyed by playerId / 'ball' the same way as
 * `buildTimeline.startOverrides`.
 */
export function samplePlayer(
  scene: Scene3D,
  timeline: Timeline,
  playerId: string,
  t: number,
  overrides?: ReadonlyMap<string, CourtPoint> | null,
): CourtPoint {
  const list = timeline.byPlayer.get(playerId)
  if (!list || list.length === 0) {
    const override = overrides?.get(playerId)
    if (override) return override
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
    const u = easeForKind(active.kind, (t - active.startMs) / span)
    return lerp(active.from, active.to, u)
  }

  return last?.to ?? list[0]!.from
}

/**
 * Phase D — snapshots every player (plus 'ball') at elapsed `t` ms by
 * delegating to `samplePlayer` for each known mover. Returns a map keyed
 * by playerId / 'ball'. The state machine uses this to capture the
 * frozen pose, then feeds the snapshot back into `buildTimeline` via
 * `startOverrides` so the consequence and replay legs resume from the
 * freeze pose rather than the scene's authored start positions.
 */
export function samplePositionsAt(
  scene: Scene3D,
  timeline: Timeline,
  t: number,
  overrides?: ReadonlyMap<string, CourtPoint> | null,
): Map<string, CourtPoint> {
  const snapshot = new Map<string, CourtPoint>()
  for (const p of scene.players) {
    snapshot.set(p.id, samplePlayer(scene, timeline, p.id, t, overrides))
  }
  snapshot.set('ball', samplePlayer(scene, timeline, 'ball', t, overrides))
  return snapshot
}

function lerp(a: CourtPoint, b: CourtPoint, u: number): CourtPoint {
  return {
    x: a.x + (b.x - a.x) * u,
    z: a.z + (b.z - a.z) * u,
  }
}

/** ease-in-out cubic, 0..1. Symmetric S-curve; the safe default for
 *  defensive rotations, closeouts, drifts, and lift / settle steps. */
function ease(u: number): number {
  if (u <= 0) return 0
  if (u >= 1) return 1
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2
}

/** ease-out cubic, 0..1. Front-loaded: fast acceleration off the
 *  starting position, deceleration into arrival. Reads as a decisive
 *  basketball cut / drive / jab — the player explodes out, settles
 *  on the spot. Used for the "explosive" movement kinds below. */
function easeOutCubic(u: number): number {
  if (u <= 0) return 0
  if (u >= 1) return 1
  const inv = 1 - u
  return 1 - inv * inv * inv
}

/** Phase K — front-weighted athletic ease for explosive moves. The
 *  pre-Phase-K `easeOutCubic` had peak velocity at u=0 (f'(0)=3),
 *  which made cuts feel like the player teleported off their idle
 *  pose into the move — the "robotic snap" called out in the BDW-01
 *  screenshot QA. This curve is `smoothstep(u^0.7)`: applying the
 *  forward time-warp `u^0.7` first (front-loads the action) then
 *  smoothing through `r^2*(3-2r)` so both endpoints have zero
 *  derivative. Result:
 *    - f(0) = 0, f(1) = 1
 *    - f'(0) = 0 (smooth start, no snap from idle)
 *    - f'(1) = 0 (smooth arrival, settles on the spot)
 *    - f(0.25) ≈ 0.130 (still front-loaded relative to ease-in-out
 *      cubic's 0.0625 at the same u, so the move still reads as
 *      decisive)
 *    - f(0.5) ≈ 0.670 (front-loaded relative to symmetric 0.5)
 *  Back-to-back segments blend at u=1 → u=0 without a velocity
 *  discontinuity, which is what eliminates the segment-seam stutter.
 */
function easeOutAthletic(u: number): number {
  if (u <= 0) return 0
  if (u >= 1) return 1
  const r = Math.pow(u, 0.7)
  return r * r * (3 - 2 * r)
}

/** Phase C / C3 — pick the eased curve for a movement kind. Cuts /
 *  drives / jabs / rips / baseline_sneak / stop_ball get ease-out so
 *  they feel like a player making a move; defensive movements
 *  (rotation, closeout) keep the symmetric ease-in-out so a defender
 *  sliding into help reads as smooth, not panicked. `pass` on a
 *  player is a release flick — short and not visually a translation,
 *  so it stays on ease-in-out. Authored JSON timings are unchanged;
 *  this only redistributes WITHIN each segment. Exported so movement
 *  tests can pin the dispatch table without rebuilding a full scene.
 */
export function easeForKind(
  kind: SceneMovement['kind'],
  u: number,
): number {
  switch (kind) {
    case 'cut':
    case 'back_cut':
    case 'baseline_sneak':
    case 'drive':
    case 'jab':
    case 'rip':
    case 'stop_ball':
      // Phase K — switched from easeOutCubic to easeOutAthletic so
      // the player accelerates from rest instead of starting at peak
      // velocity. Same arrival profile (zero velocity at u=1) so the
      // "settle on the spot" feel is preserved.
      return easeOutAthletic(u)
    default:
      return ease(u)
  }
}

// `easeOutCubic` is preserved for any future call sites that want the
// old explosive-but-snappy curve (e.g. ball arc Y). The active dispatch
// in `easeForKind` no longer references it directly.
void easeOutCubic
