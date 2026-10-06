import type { RoleId } from './types'

/** Per-player physical profile. Every value is a multiplier on the shared
 * model assumption, so ModelAssumptions still describe a baseline athlete. */
export interface Capability {
  /** Top speed factor. */
  speed: number
  /** Acceleration factor. */
  acceleration: number
  /** Share of straight-ahead speed available sideways or backpedaling. */
  lateral: number
  /** Scales the modelled contest radius (length, hands, closeout lunge). */
  contest: number
}
export interface CapabilityInput { height: number; role?: RoleId; speed?: number; acceleration?: number; lateral?: number; reach?: number }
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

/** Defaults come from height only: a 1.86 m guard is the quick baseline and a
 * 2.03 m big is slower, much slower sideways, and covers more with his length. */
export function resolveCapability(p: CapabilityInput): Capability {
  const tall = clamp((p.height - 1.86) / 0.17, 0, 1)
  return {
    speed: p.speed ?? 1 - 0.1 * tall,
    acceleration: p.acceleration ?? 1 - 0.03 * tall,
    lateral: p.lateral ?? 0.84 - 0.16 * tall,
    contest: p.reach ?? 0.97 + 0.2 * tall,
  }
}

/** Largest speed (m/s) along a unit direction given the facing angle. Facing
 * forward is the full cap; sideways and backward are `lateral` of it. */
export function directionalSpeed(cap: number, lateral: number, yaw: number, dirX: number, dirZ: number): number {
  const forward = dirX * Math.sin(yaw) + dirZ * Math.cos(yaw), side = dirX * Math.cos(yaw) - dirZ * Math.sin(yaw)
  const lf = forward >= 0 ? 1 : lateral, ls = lateral
  return cap / Math.sqrt((forward / lf) ** 2 + (side / ls) ** 2 || 1)
}

const RIM = { x: 0, z: 1.575 }
export interface ReceiverRef { height: number; x?: number; z?: number }
/** How far a defender's contest radius stretches against this receiver: own
 * length, and the height he gives up (or has) against the man he is contesting.
 * A shorter defender who is BEHIND a taller receiver (on the rim side of him, the
 * receiver between him and the basket) is sealed: he cannot reach over, so his
 * radius collapses. Standing between the receiver and the rim is not penalised
 * as hard. A bare number is the receiver's height only (no seal geometry). */
export function contestScale(defender: { contest?: number; height: number; x?: number; z?: number }, receiver: number | ReceiverRef): number {
  const ref: ReceiverRef = typeof receiver === 'number' ? { height: receiver } : receiver
  const gap = defender.height - ref.height
  const known = defender.x !== undefined && defender.z !== undefined && ref.x !== undefined && ref.z !== undefined
  const behind = known && Math.hypot(defender.x! - RIM.x, defender.z! - RIM.z) > Math.hypot(ref.x! - RIM.x, ref.z! - RIM.z) + 0.15
  const scale = behind && gap <= -0.08 ? clamp(1 + gap * 3.5, 0.5, 1) : clamp(1 + gap * 2, 0.85, 1.2)
  return (defender.contest ?? 1) * scale
}
