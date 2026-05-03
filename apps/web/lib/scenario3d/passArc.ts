/**
 * P2.5 — Reusable, deterministic pass / catch primitives.
 *
 * The CourtIQ ball is a teaching visual, not a physics simulation.
 * Every pass must:
 *  - travel a clean readable arc
 *  - resolve to the same path on every replay (deterministic)
 *  - stay finite (no NaN / Infinity from degenerate inputs)
 *  - never mutate scenario data
 *  - never drive player movement (scenario data owns x/z/t)
 *
 * The helpers here are extracted from the ball-arc math that previously
 * lived inline inside `imperativeScene.MotionController.applyBall` so
 * other scenario types (BDW backdoor, ESC empty-space, SKR skip,
 * AOR closeout / swing, future drive-and-kick) can reuse the same
 * primitives without each renderer re-deriving its own arc curve.
 */
import type { CourtPoint } from './coords'
import type { SceneMovement, Scene3D } from './scene'
import { samplePlayer, type Timeline } from './timeline'

/**
 * Apex multipliers expressed as `peakFt = dist * mult` (clamped).
 *
 *  - `pass` — standard chest / lead pass. Reads as a basketball pass.
 *  - `skip_pass` — line drive across the floor. Stays low so the
 *    cross-court read does not look like a lazy lob.
 *
 * Floor / ceiling guarantee the apex stays inside the gym shell on the
 * broadcast camera and does not pop above the passer's shoulder on a
 * 3-ft hand-off.
 */
export const BALL_PEAK_MULT_PASS = 0.25
export const BALL_PEAK_MULT_SKIP = 0.1
export const BALL_PEAK_MIN_FT = 0.7
export const BALL_PEAK_MAX_FT = 7.0

export type PassKind = Extract<SceneMovement['kind'], 'pass' | 'skip_pass'>

/** Clamp helper. Mirrors the inline `clamp01` used in imperativeScene. */
function clamp01(u: number): number {
  if (!Number.isFinite(u)) return 0
  if (u <= 0) return 0
  if (u >= 1) return 1
  return u
}

/** Symmetric ease-in-out cubic. Same curve used for the planar pass
 *  interpolation so the parabolic Y arc lines up with the visual
 *  midpoint of the throw. Pure / deterministic. */
export function easeInOutCubic(u: number): number {
  const x = clamp01(u)
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
}

/**
 * Returns the apex height (in feet, above ground) for a pass of
 * `distFt` feet of the given `kind`. Pure and deterministic — same
 * inputs always return the same number, with no randomness.
 *
 * Defensive: a non-finite `distFt` collapses to the floor so a corrupt
 * timeline can never leak NaN into the renderer.
 */
export function computeReadablePassArcPeak(
  distFt: number,
  kind: PassKind = 'pass',
): number {
  const safeDist = Number.isFinite(distFt) && distFt > 0 ? distFt : 0
  const mult = kind === 'skip_pass' ? BALL_PEAK_MULT_SKIP : BALL_PEAK_MULT_PASS
  return Math.min(BALL_PEAK_MAX_FT, Math.max(BALL_PEAK_MIN_FT, safeDist * mult))
}

export interface PassArcInput {
  from: CourtPoint
  to: CourtPoint
  /** Normalised progress along the pass, 0..1 (will be clamped). */
  u: number
  kind?: PassKind
}

/**
 * Samples the ball's `(x, height, z)` along a pass at parameter `u`.
 *
 *  - `x` / `z` interpolate linearly with the eased curve.
 *  - `height` is a parabola whose apex aligns with the eased mid-flight
 *    (eased(u)=0.5), peaked at `computeReadablePassArcPeak(dist, kind)`.
 *  - `height` is "above the ball's resting plane" — callers add their
 *    own `baseBallY` so the renderer can stay in scene-space.
 *
 * Pure, deterministic, finite-safe. Does NOT read or mutate the scene.
 *
 * Reused by:
 *  - `imperativeScene.MotionController.applyBall` (BDW, ESC, SKR, AOR)
 *  - tests that pin the arc shape against a known peak
 *  - future scenarios that want to render a pass-arc preview overlay
 */
export function samplePassArc(input: PassArcInput): {
  x: number
  height: number
  z: number
} {
  const fromX = Number.isFinite(input.from.x) ? input.from.x : 0
  const fromZ = Number.isFinite(input.from.z) ? input.from.z : 0
  const toX = Number.isFinite(input.to.x) ? input.to.x : fromX
  const toZ = Number.isFinite(input.to.z) ? input.to.z : fromZ
  const eased = easeInOutCubic(input.u)
  const x = fromX + (toX - fromX) * eased
  const z = fromZ + (toZ - fromZ) * eased
  const dist = Math.hypot(toX - fromX, toZ - fromZ)
  const peak = computeReadablePassArcPeak(dist, input.kind ?? 'pass')
  // Parabola peaked at eased=0.5: 4 * eased * (1 - eased) ∈ [0, 1].
  const height = peak * 4 * eased * (1 - eased)
  return { x, height, z }
}

/**
 * Returns the live court position of the ball-handler at release time.
 *
 * The pass timeline captures `from` statically when the timeline is
 * built, which is correct as long as the holder hasn't moved since the
 * last leg started. If a future scenario lets the holder drive a step
 * before passing (BDW slot reversal, AOR swing-after-step), the pass
 * would otherwise visibly teleport from the stale snapshot to the
 * holder's current position. This helper resolves the holder's
 * sampled position at the exact release time so the renderer can
 * choose to override `from` if it drifts more than a small tolerance.
 *
 * Pure: reads the timeline / scene, never mutates.
 */
export function resolvePassReleaseAnchor(
  scene: Scene3D,
  timeline: Timeline,
  holderId: string | null,
  releaseMs: number,
  overrides?: ReadonlyMap<string, CourtPoint> | null,
): CourtPoint | null {
  if (!holderId) return null
  return samplePlayer(scene, timeline, holderId, releaseMs, overrides)
}

/**
 * Returns the live court position of the most plausible catcher at the
 * pass arrival time. The MotionController already does a closest-player
 * lookup for possession transfer; this exposes the same lookup as a
 * pure helper so renderers and tests can ask "where will the cutter be
 * when the ball gets there?" without re-implementing the math.
 *
 * Returns `null` if the scene has no players, so callers can fall back
 * to the authored `pass.to` for synthetic / smoke scenes.
 */
export function resolvePassCatchAnchor(
  scene: Scene3D,
  timeline: Timeline,
  target: CourtPoint,
  arrivalMs: number,
  overrides?: ReadonlyMap<string, CourtPoint> | null,
): { playerId: string; point: CourtPoint } | null {
  let bestId: string | null = null
  let bestPoint: CourtPoint | null = null
  let bestDist = Number.POSITIVE_INFINITY
  for (const p of scene.players) {
    const pos = samplePlayer(scene, timeline, p.id, arrivalMs, overrides)
    const dx = pos.x - target.x
    const dz = pos.z - target.z
    const d = dx * dx + dz * dz
    if (d < bestDist) {
      bestDist = d
      bestId = p.id
      bestPoint = pos
    }
  }
  if (!bestId || !bestPoint) return null
  return { playerId: bestId, point: bestPoint }
}
