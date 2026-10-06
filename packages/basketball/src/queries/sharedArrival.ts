import { contestScale, directionalSpeed, type ReceiverRef } from '../simulation/capability'
import type { ModelAssumptions, PlayerState, Point2 } from '../domain/types'

const distance = (a: Point2, b: Point2) => Math.hypot(a.x - b.x, a.z - b.z)
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value))

/** Piecewise constant-acceleration travel estimate, with a capped velocity.
 * Negative projection includes reversal. This is not a screened-route proof. */
export function travelTime(
  distanceRemaining: number,
  initialSpeed: number,
  acceleration: number,
  maxSpeed: number,
): number {
  if (distanceRemaining <= 0) return 0
  if (!(acceleration > 0) || !(maxSpeed > 0)) return Infinity
  const velocity = clamp(initialSpeed, -maxSpeed, maxSpeed)
  const capTime = (maxSpeed - velocity) / acceleration
  const capDistance = velocity * capTime + (acceleration * capTime * capTime) / 2
  if (distanceRemaining <= capDistance)
    return (Math.sqrt(velocity * velocity + 2 * acceleration * distanceRemaining) - velocity) / acceleration
  return capTime + (distanceRemaining - capDistance) / maxSpeed
}

type Mover = Pick<PlayerState, 'x' | 'z' | 'vx' | 'vz'> &
  Partial<Pick<PlayerState, 'speed' | 'acceleration' | 'lateral' | 'yaw'>>

export function estimateArrival(
  player: Mover,
  target: Point2,
  assumptions: Pick<ModelAssumptions, 'acceleration' | 'maxSpeed' | 'reactionDelay'>,
  influenceRadius = 0,
  remainingReaction = assumptions.reactionDelay,
) {
  const gap = distance(player, target)
  if (gap <= influenceRadius) return 0
  const projectedSpeed = gap ? ((target.x - player.x) * player.vx + (target.z - player.z) * player.vz) / gap : 0
  let cap = assumptions.maxSpeed * (player.speed ?? 1)
  if (player.lateral !== undefined && player.yaw !== undefined && gap)
    cap = directionalSpeed(cap, player.lateral, player.yaw, (target.x - player.x) / gap, (target.z - player.z) / gap)
  return (
    Math.max(0, remainingReaction) +
    travelTime(gap - influenceRadius, projectedSpeed, assumptions.acceleration * (player.acceleration ?? 1), cap)
  )
}

/** A defender's modeled time to contest a target: own capability, own reach. */
export function defenderArrival(
  player: PlayerState,
  target: Point2,
  assumptions: ModelAssumptions,
  remainingReaction = assumptions.reactionDelay,
  receiver?: ReceiverRef,
) {
  const scale = receiver === undefined ? (player.contest ?? 1) : contestScale(player, receiver)
  return estimateArrival(player, target, assumptions, assumptions.contestRadius * scale, remainingReaction)
}
