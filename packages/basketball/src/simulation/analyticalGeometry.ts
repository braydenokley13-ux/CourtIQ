import type { ModelAssumptions, PlayerState, Point3 } from '../domain/types'

export interface BodyCapsule {
  part: string
  a: Point3
  b: Point3
  radius: number
}
const add = (a: Point3, b: Point3): Point3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z })
const scale = (a: Point3, v: number): Point3 => ({ x: a.x * v, y: a.y * v, z: a.z * v })
const subtract = (a: Point3, b: Point3): Point3 => add(a, scale(b, -1))
const dot = (a: Point3, b: Point3) => a.x * b.x + a.y * b.y + a.z * b.z
const unit = (v: Point3) => scale(v, 1 / (Math.hypot(v.x, v.y, v.z) || 1))
const clamp = (v: number, low: number, high: number) => Math.max(low, Math.min(high, v))

export function segmentDistance(point: Point3, a: Point3, b: Point3) {
  const segment = subtract(b, a)
  const t = clamp(dot(subtract(point, a), segment) / (dot(segment, segment) || 1), 0, 1)
  const closest = add(a, scale(segment, t))
  return { distance: Math.hypot(point.x - closest.x, point.y - closest.y, point.z - closest.z), point: closest, t }
}

/** SEAM's articulated analytical envelopes, separate from the athlete mesh.
 * Proportions/pose are authored approximations, not measured human biomechanics. */
export function bodyCapsules(player: PlayerState, assumptions: Pick<ModelAssumptions, 'bodyRadius'>): BodyCapsule[] {
  const height = player.height
  const right = { x: Math.cos(player.yaw), y: 0, z: -Math.sin(player.yaw) }
  const forward = { x: Math.sin(player.yaw), y: 0, z: Math.cos(player.yaw) }
  const base = { x: player.x, y: player.pose.jump, z: player.z }
  const bend = player.pose.stance === 'defend' ? 0.09 : 0.045
  const local = (x: number, y: number, z = 0) =>
    add(base, add(scale(right, x), add({ x: 0, y, z: 0 }, scale(forward, z))))
  const hip = local(0, height * (0.52 - bend), -0.035)
  const neck = local(0, height * (0.84 - bend * 0.6), 0.035)
  const head = local(0, height * (0.925 - bend * 0.6), 0.055)
  const radiusScale = assumptions.bodyRadius / 0.28
  const capsules: BodyCapsule[] = [
    { part: 'torso', a: hip, b: neck, radius: 0.19 * radiusScale },
    { part: 'head', a: head, b: head, radius: 0.128 * radiusScale },
  ]
  for (const side of [-1, 1]) {
    const prefix = side < 0 ? 'left' : 'right'
    const shoulder = local(side * height * 0.141, height * (0.795 - bend * 0.65), 0.015)
    const angle = -0.9 + 2.26 * clamp(player.pose.hands, 0, 1)
    const wrist = add(
      shoulder,
      scale(
        add(
          scale(right, side * Math.cos(angle) * 0.86),
          add(scale(forward, Math.cos(angle) * 0.51), { x: 0, y: Math.sin(angle), z: 0 }),
        ),
        height * 0.323,
      ),
    )
    const elbow = add(add(shoulder, scale(subtract(wrist, shoulder), 0.5)), scale(forward, -height * 0.045))
    const palm = add(wrist, scale(unit(subtract(wrist, elbow)), 0.075))
    const swing = Math.sin(player.pose.phase + (side < 0 ? 0 : Math.PI))
    const speed = Math.hypot(player.vx, player.vz)
    const ankle = local(
      side * height * (player.team === 'defense' ? 0.14 : 0.092),
      height * 0.045 + Math.max(0, swing) * Math.min(0.095, speed * 0.024),
      swing * Math.min(0.22, speed * 0.065) + 0.05,
    )
    const legHip = local(side * height * 0.072, height * (0.51 - bend), -0.045)
    const knee = add(add(legHip, scale(subtract(ankle, legHip), 0.5)), scale(forward, height * 0.035))
    capsules.push(
      { part: `${prefix} upper arm`, a: shoulder, b: elbow, radius: 0.068 * radiusScale },
      { part: `${prefix} forearm`, a: elbow, b: wrist, radius: 0.06 * radiusScale },
      { part: `${prefix} palm`, a: wrist, b: palm, radius: 0.055 * radiusScale },
      { part: `${prefix} thigh`, a: legHip, b: knee, radius: 0.095 * radiusScale },
      { part: `${prefix} shin`, a: knee, b: ankle, radius: 0.075 * radiusScale },
    )
  }
  return capsules
}

export function ballBodyClearance(
  ball: Point3,
  player: PlayerState,
  assumptions: Pick<ModelAssumptions, 'bodyRadius' | 'ballRadius'>,
) {
  let best = { clearance: Infinity, point: ball, part: 'none' }
  for (const capsule of bodyCapsules(player, assumptions)) {
    const closest = segmentDistance(ball, capsule.a, capsule.b)
    const clearance = closest.distance - capsule.radius - assumptions.ballRadius
    if (clearance < best.clearance) best = { clearance, point: closest.point, part: capsule.part }
  }
  return best
}
