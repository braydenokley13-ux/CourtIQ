import { ballBodyClearance } from './analyticalGeometry'
import type { BallFlight, FlightStop, ModelAssumptions, PlayerState, Point3 } from './types'

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const lerp = (a: number, b: number, u: number) => a + (b - a) * u
/** All launched trajectories keep their release endpoints, including preview and replay. */
export function flightPosition(flight: BallFlight, t: number, gravity: number): Point3 {
  const duration = flight.end - flight.start, u = clamp((t - flight.start) / duration, 0, 1)
  return { x: lerp(flight.a.x, flight.b.x, u), z: lerp(flight.a.z, flight.b.z, u), y: lerp(flight.a.y, flight.b.y, u) + 0.5 * gravity * duration * duration * u * (1 - u) }
}

/** Interpolates only executed neighboring body states, never future policy. */
export function interpolateBody(a: PlayerState, b: PlayerState, u: number): PlayerState {
  const yaw = Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw))
  // Hand command/stance are discrete like frameAt. Interpolating a terminal
  // hand-lowering command backward into a stopped flight invents a new body.
  return { ...a, x: lerp(a.x, b.x, u), z: lerp(a.z, b.z, u), vx: lerp(a.vx, b.vx, u), vz: lerp(a.vz, b.vz, u), yaw: a.yaw + yaw * u, pose: { ...a.pose, hands: u >= 1 - 1e-9 ? b.pose.hands : a.pose.hands, jump: lerp(a.pose.jump, b.pose.jump, u), phase: lerp(a.pose.phase, b.pose.phase, u) } }
}

/** Conservative cheap rejection before constructing the articulated envelopes.
 * The bound exceeds the current model's shoulder + arm + palm extent. */
export function canReachBall(ball: Point3, player: PlayerState, assumptions: Pick<ModelAssumptions, 'bodyRadius' | 'ballRadius'>): boolean {
  const radius = player.height * 0.65 + assumptions.bodyRadius + assumptions.ballRadius
  return (ball.x - player.x) ** 2 + (ball.z - player.z) ** 2 <= radius * radius && ball.y >= player.pose.jump - assumptions.ballRadius && ball.y <= player.height * 1.4 + player.pose.jump + assumptions.ballRadius
}

/** At most 11 probes per supported motion step (dt <= 50 ms). Opposing
 * bodies stop an unresolved flight; contact response/foul rules are not modeled. */
export function firstFlightContact(flight: BallFlight, previous: PlayerState[], current: PlayerState[], from: number, to: number, assumptions: ModelAssumptions): FlightStop | null {
  const start = Math.max(from, flight.start + 0.005), end = Math.min(to, flight.end)
  if (end < start) return null
  const count = Math.max(1, Math.ceil((end - start) / 0.005 - 1e-9))
  for (let i = 0; i <= count; i++) {
    const at = start + (end - start) * i / count, u = to > from ? clamp((at - from) / (to - from), 0, 1) : 0
    const ball = flightPosition(flight, at, assumptions.gravity)
    for (let j = 0; j < previous.length; j++) {
      if (previous[j].team !== 'defense') continue
      const body = interpolateBody(previous[j], current[j] ?? previous[j], u)
      if (!canReachBall(ball, body, assumptions)) continue
      const closest = ballBodyClearance(ball, body, assumptions)
      if (closest.clearance < 0) return { flightStart: flight.start, at, playerId: body.id, part: closest.part, ball, point: closest.point, clearance: closest.clearance }
    }
  }
  return null
}

/** Authored receiving envelope. It is a support check, not a completion model.
 * Height scales arm reach; facing limits balls behind the torso; raised hands
 * and jump position bound supported height. No catch or jump is teleported. */
export function catchSupport(receiver: PlayerState, ball: Point3, assumptions: Pick<ModelAssumptions, 'bodyRadius' | 'ballRadius'>) {
  const dx = ball.x - receiver.x, dz = ball.z - receiver.z
  const forward = dx * Math.sin(receiver.yaw) + dz * Math.cos(receiver.yaw)
  const side = dx * Math.cos(receiver.yaw) - dz * Math.sin(receiver.yaw)
  const lateral = receiver.height * 0.38 + assumptions.bodyRadius * 0.35
  const longitudinal = receiver.height * (forward >= 0 ? 0.42 : 0.24) + assumptions.bodyRadius * 0.5
  const minHeight = receiver.pose.jump + receiver.height * 0.35 - assumptions.ballRadius
  const maxHeight = receiver.pose.jump + receiver.height * (0.8 + clamp(receiver.pose.hands, 0, 1) * 0.22) + assumptions.ballRadius
  return { reachable: (side / lateral) ** 2 + (forward / longitudinal) ** 2 <= 1 + 1e-9 && ball.y >= minHeight && ball.y <= maxHeight, horizontalError: Math.hypot(dx, dz), minHeight, maxHeight, lateralReach: lateral, forwardReach: longitudinal }
}
