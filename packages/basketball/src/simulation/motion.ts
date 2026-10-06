import { directionalSpeed, type Capability } from './capability'
import type { ExecutionInput } from '../domain/program'
import type { PlayerState, Point2 } from '../domain/types'
import { clamp, distance } from './interpreter'
const angleDelta = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b))
const velocityDirections = Array.from({ length: 12 }, (_, i) => [
  Math.cos((i * Math.PI) / 6),
  Math.sin((i * Math.PI) / 6),
])
/** Acceleration-bounded velocity search. No position projection/teleportation. */
export function advance(
  p: PlayerState,
  goal: Point2,
  speed: number,
  players: PlayerState[],
  config: ExecutionInput,
  capability: number,
  scratch: Float64Array,
  facing?: Point2,
  profile?: Capability,
): { next: PlayerState; contact: boolean; breach: boolean } {
  const { dt, acceleration, maxSpeed, bodyRadius, turnRate } = config.assumptions
  const accelerationScale = capability * (profile?.acceleration ?? 1),
    speedScale = capability * (profile?.speed ?? 1)
  const dx = goal.x - p.x,
    dz = goal.z - p.z,
    d = Math.hypot(dx, dz),
    aLimit = acceleration * dt * accelerationScale
  // Bodies that face something (defenders face the ball) are slower sideways and
  // backward. Movers without a facing target run forward by construction.
  const lateral = facing && profile ? profile.lateral : 1
  const topSpeed = maxSpeed * speedScale
  const along = (vx: number, vz: number) => {
    const m = Math.hypot(vx, vz)
    return m < 1e-9 || lateral >= 1 ? topSpeed : directionalSpeed(topSpeed, lateral, p.yaw, vx / m, vz / m)
  }
  const dirSpeed = d > 0 ? along(dx, dz) : topSpeed
  const cap = Math.min(speed, dirSpeed),
    desiredSpeed = Math.min(cap, Math.sqrt(Math.max(0, 2 * acceleration * accelerationScale * d)))
  const desiredX = d > 0.035 ? (dx / d) * desiredSpeed : 0,
    desiredZ = d > 0.035 ? (dz / d) * desiredSpeed : 0
  const bound = (index: number, vx: number, vz: number) => {
    let ax = vx - p.vx,
      az = vz - p.vz
    const delta = Math.hypot(ax, az)
    if (delta > aLimit) {
      ax *= aLimit / delta
      az *= aLimit / delta
    }
    scratch[index * 2] = p.vx + ax
    scratch[index * 2 + 1] = p.vz + az
  }
  bound(0, desiredX, desiredZ)
  bound(1, 0, 0)
  bound(2, p.vx, p.vz)
  for (let i = 0; i < 12; i++)
    bound(i + 3, p.vx + velocityDirections[i][0] * aLimit, p.vz + velocityDirections[i][1] * aLimit)
  let bestX = scratch[0],
    bestZ = scratch[1],
    bestCost = Infinity
  const proximity = bodyRadius * 2 + 0.12,
    proximitySquared = proximity * proximity
  for (let i = 0; i < 15; i++) {
    const vx = scratch[i * 2],
      vz = scratch[i * 2 + 1]
    if (Math.hypot(vx, vz) > along(vx, vz) + 1e-9) continue
    let cost = 0.16 * ((vx - desiredX) ** 2 + (vz - desiredZ) ** 2)
    const nextX = p.x + vx * dt,
      nextZ = p.z + vz * dt
    if (Math.abs(nextX) > 7.25 || nextZ < 0.4 || nextZ > 14) cost += 10000
    for (const other of players) {
      if (other.id === p.id) continue
      for (const tau of [dt, 0.15, 0.32]) {
        const gapX = p.x + vx * tau - other.x - other.vx * tau,
          gapZ = p.z + vz * tau - other.z - other.vz * tau
        const squared = gapX * gapX + gapZ * gapZ
        // Most pairs are metres apart. Reject them before the expensive norm.
        if (squared < proximitySquared) {
          const gap = Math.hypot(gapX, gapZ) - bodyRadius * 2
          cost += (tau === dt ? 900 : 28) * (0.12 - gap) ** 2
        }
      }
    }
    if (cost < bestCost) {
      bestCost = cost
      bestX = vx
      bestZ = vz
    }
  }
  const x = p.x + bestX * dt,
    z = p.z + bestZ * dt,
    moving = Math.hypot(bestX, bestZ)
  const yawTarget = facing
    ? Math.atan2(facing.x - p.x, facing.z - p.z)
    : moving > 0.15
      ? Math.atan2(bestX, bestZ)
      : p.yaw
  const next = {
    ...p,
    x,
    z,
    vx: bestX,
    vz: bestZ,
    yaw: p.yaw + clamp(angleDelta(yawTarget, p.yaw), -turnRate * dt, turnRate * dt),
    pose: { ...p.pose, phase: p.pose.phase + moving * dt * 4.2 },
  }
  return {
    next,
    contact: players.some(
      (other) =>
        other.id !== p.id &&
        distance(next, { x: other.x + other.vx * dt, z: other.z + other.vz * dt }) < bodyRadius * 2 - 0.03,
    ),
    breach: Math.abs(x) > 7.3 || z < 0.35 || z > 14.05,
  }
}

export function predictReceiver(
  p: PlayerState,
  goal: Point2,
  duration: number,
  speed: number,
  config: ExecutionInput,
  scratch: Float64Array,
): Point2 {
  let q = { ...p, pose: { ...p.pose } }
  const n = Math.ceil(duration / config.assumptions.dt)
  for (let i = 0; i < n; i++) q = advance(q, goal, speed, [q], config, 1, scratch).next
  return { x: q.x, z: q.z }
}
