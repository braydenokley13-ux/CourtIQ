/**
 * V1 Premiumization — Movement Profile.
 *
 * Pure data layer that maps an AnimationIntent (or movement kind +
 * team) to the deterministic motion characteristics the renderer
 * uses to make running/cutting feel grounded:
 *
 *   - `easeName`        — which time-warp curve to apply within a
 *                          segment so the player accelerates and
 *                          settles like a basketball athlete instead
 *                          of a constant-velocity CG figure.
 *   - `bodyLeanDeg`     — small body lean toward direction of travel.
 *                          Capped at a few degrees so the figure
 *                          never tips. Zero for stationary intents.
 *   - `headingFollowS`  — yaw smoothing time-constant override (in
 *                          seconds). Smaller numbers = snappier turn,
 *                          larger = softer. Defenders react faster
 *                          than offense, but cutters explode and
 *                          settle on the spot.
 *   - `groundednessFactor` — multiplier on the renderer's foot-plant
 *                          dampening. Stationary intents push to 1
 *                          (rooted), moving offense to 0.85
 *                          (athletic, planted footwork), moving
 *                          defense to 0.95 (slides stay glued).
 *
 * These values are deterministic and depend only on the intent and
 * team. The renderer reads them once per movement segment and uses
 * them inside its existing per-frame loop — no new rAF, no new
 * THREE objects, no schema migration.
 *
 * Hard contract:
 *   - Pure function. Same intent → same profile, byte-identical.
 *   - Never returns null. Every AnimationIntent has a profile.
 *   - Stationary intents always have `bodyLeanDeg === 0` and
 *     `easeName === 'easeInOutCubic'` so a paused / settled player
 *     never visibly drifts.
 */

import {
  getIntentMotionClass,
  type AnimationIntent,
  type IntentMotionClass,
} from './animationIntent'
import type { SceneMovement, SceneTeam } from './scene'
import { getMovementKindIntent } from './animationIntent'

/**
 * Names of the time-warp curves the renderer's `easeForKind`
 * dispatch table understands. Kept as a string union so the
 * profile tests can pin the dispatch without bringing in the curve
 * implementations.
 */
export type MovementEaseName =
  | 'easeInOutCubic'
  | 'easeOutAthletic'
  | 'easeOutDefenseSlide'

export interface MovementProfile {
  /** The motion class this profile belongs to (cached for callers). */
  motionClass: IntentMotionClass
  /** Which curve to apply inside the segment. */
  easeName: MovementEaseName
  /**
   * Forward body lean (in degrees) the renderer can apply during the
   * accelerating phase of the cut. Capped tight so the figure never
   * looks unstable.
   */
  bodyLeanDeg: number
  /**
   * Yaw smoothing time-constant override (seconds). Lower values make
   * the body's heading snap to the cut direction faster; higher
   * values let it settle.
   */
  headingFollowS: number
  /**
   * Foot-plant grounding factor in [0, 1]. 1 = fully rooted (stationary
   * intents); 0.85 = athletic moving offense (foot strike feel); 0.95
   * = defensive slides (foot stays connected to floor).
   */
  groundednessFactor: number
}

const STATIONARY_PROFILE: MovementProfile = Object.freeze({
  motionClass: 'stationary',
  easeName: 'easeInOutCubic',
  bodyLeanDeg: 0,
  headingFollowS: 0.18,
  groundednessFactor: 1,
})

const MOVING_OFFENSE_PROFILE: MovementProfile = Object.freeze({
  motionClass: 'moving-offense',
  easeName: 'easeOutAthletic',
  bodyLeanDeg: 4,
  headingFollowS: 0.16,
  groundednessFactor: 0.88,
})

const MOVING_DEFENSE_PROFILE: MovementProfile = Object.freeze({
  motionClass: 'moving-defense',
  easeName: 'easeOutDefenseSlide',
  bodyLeanDeg: 1.5,
  headingFollowS: 0.13,
  groundednessFactor: 0.96,
})

/**
 * Per-intent overrides on top of the motion-class default. The
 * default already gets us 90% of the way; these refine the small
 * number of intents whose feel diverges from their class.
 *
 * - BACK_CUT / EMPTY_SPACE_CUT — explosive cuts, lean further forward.
 * - JAB_OR_RIP — stationary in motion-class (no translation), but the
 *    feet should still feel weighted, so groundedness drops a touch
 *    while heading follows quickly.
 * - CLOSEOUT — defender accelerating forward, lean a hair further than
 *    a slide, head tracks the receiver fast.
 * - PASS_FOLLOWTHROUGH — momentary moving-offense, but the lean is
 *    tiny because the player is releasing, not driving.
 */
const INTENT_OVERRIDES: Partial<
  Record<AnimationIntent, Partial<MovementProfile>>
> = {
  BACK_CUT: { bodyLeanDeg: 6, headingFollowS: 0.14 },
  EMPTY_SPACE_CUT: { bodyLeanDeg: 5, headingFollowS: 0.15 },
  JAB_OR_RIP: { headingFollowS: 0.14, groundednessFactor: 0.92 },
  CLOSEOUT: { bodyLeanDeg: 3, headingFollowS: 0.11 },
  PASS_FOLLOWTHROUGH: { bodyLeanDeg: 1, headingFollowS: 0.16 },
  SLIDE_RECOVER: { headingFollowS: 0.13, bodyLeanDeg: 1 },
}

/**
 * Returns the deterministic motion profile for an animation intent.
 * Reads the intent's motion class, picks the class default, then
 * applies any per-intent override.
 */
export function getMovementProfile(intent: AnimationIntent): MovementProfile {
  const motionClass = getIntentMotionClass(intent)
  const base =
    motionClass === 'stationary'
      ? STATIONARY_PROFILE
      : motionClass === 'moving-offense'
        ? MOVING_OFFENSE_PROFILE
        : MOVING_DEFENSE_PROFILE
  const override = INTENT_OVERRIDES[intent]
  if (!override) return base
  return Object.freeze({ ...base, ...override })
}

/**
 * Convenience: derive a profile straight from a movement kind + team.
 * Used by the renderer's per-segment loop where the intent context
 * isn't known directly. Falls through to `getMovementKindIntent` so
 * the existing decoder-agnostic mapping stays the source of truth.
 */
export function getMovementProfileForKind(
  kind: SceneMovement['kind'],
  team: SceneTeam,
): MovementProfile {
  const intent = getMovementKindIntent(kind, team)
  return getMovementProfile(intent)
}

/**
 * Defensive slide ease. Symmetric ease-in-out flavored slightly to
 * the back end so a slide reads as "set, slide, settle" instead of
 * the linear glide that came out of plain ease-in-out at higher
 * playback rates. Pure function, deterministic.
 *
 * Curve: smoothstep(u) with a small back-load at u≈0.65 so the foot
 * has clearly committed before the player arrives. Stays inside
 * [0, 1] with f(0) = 0, f(1) = 1, f'(0) = f'(1) = 0.
 */
export function easeOutDefenseSlide(u: number): number {
  if (u <= 0) return 0
  if (u >= 1) return 1
  // smoothstep + a single cosine bias toward the back third.
  const s = u * u * (3 - 2 * u)
  const back = 0.05 * Math.sin(Math.PI * u) * (u - 0.5)
  const v = s + back
  return v < 0 ? 0 : v > 1 ? 1 : v
}

/**
 * Resolves the named ease curve into a runnable function.
 * `easeInOutCubic` and `easeOutAthletic` are owned by `timeline.ts`
 * (the renderer's existing source-of-truth dispatcher); this resolver
 * is provided so any consumer that wants a profile-driven curve
 * without re-importing the timeline module gets a deterministic
 * function back. The renderer itself still calls
 * `easeForKind` from `timeline.ts` for the per-kind dispatch — this
 * resolver is for tests and any future consumer that wants pure
 * "intent → curve" without going through the kind table.
 */
export function resolveEase(
  name: MovementEaseName,
): (u: number) => number {
  switch (name) {
    case 'easeOutDefenseSlide':
      return easeOutDefenseSlide
    case 'easeOutAthletic':
      return (u: number) => {
        if (u <= 0) return 0
        if (u >= 1) return 1
        const r = Math.pow(u, 0.7)
        return r * r * (3 - 2 * r)
      }
    case 'easeInOutCubic':
      return (u: number) => {
        if (u <= 0) return 0
        if (u >= 1) return 1
        return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2
      }
  }
}

/**
 * Lean direction helper. Given a (dx, dz) heading, returns a
 * normalized lean axis the renderer can use to tip the body forward.
 * Returns null when the heading magnitude is below the eps floor —
 * callers should fall through to the default upright pose.
 */
export function bodyLeanAxis(
  dx: number,
  dz: number,
  epsSq = 0.04,
): { x: number; z: number } | null {
  const mag2 = dx * dx + dz * dz
  if (!Number.isFinite(mag2) || mag2 < epsSq) return null
  const mag = Math.sqrt(mag2)
  return { x: dx / mag, z: dz / mag }
}
