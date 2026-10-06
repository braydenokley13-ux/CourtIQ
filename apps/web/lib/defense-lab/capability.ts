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
    acceleration: p.acceleration ?? 1 - 0.12 * tall,
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

/** How far a defender's contest radius stretches against this receiver: own
 * length, and the height he gives up (or has) against the man he is contesting.
 * A 1.87 m guard on a 2.02 m roller covers much less than the nominal radius. */
export function contestScale(defender: { contest?: number; height: number }, receiverHeight: number): number {
  return (defender.contest ?? 1) * clamp(1 + (defender.height - receiverHeight) * 2, 0.85, 1.2)
}
