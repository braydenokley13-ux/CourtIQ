/**
 * V2-B — Premium athletic motion curves.
 *
 * Adds three new deterministic time-warp curves that read as more
 * athletic than the existing easings without disturbing replay
 * determinism:
 *
 *   - `easeAthleticCutV2(u)`     — cuts / drives. Adds a tiny
 *                                   anticipation pre-load (the
 *                                   "load-the-feet" beat) before the
 *                                   explosive front-half, then settles
 *                                   on the spot.
 *   - `easeCloseoutV2(u)`        — defender closeouts. Steep accel
 *                                   into the closeout, sharp deceleration
 *                                   into a committed stop (no overrun).
 *   - `easeStopHardV2(u)`        — `stop_ball` reads. Late deceleration
 *                                   so the player arrives sharply with
 *                                   weight forward.
 *
 * It also owns the body-language helpers the imperative renderer
 * layers on top of those curves:
 *
 *   - `athleticMotionEnvelope(u)` — front-loaded 0 → 1 → 0 envelope
 *                                   that times secondary motion
 *                                   (forward lean, stride bob,
 *                                   cornering bank) against the
 *                                   explosive push, not the midpoint.
 *   - `rotationEffortScale(ft)`   — scales a help defender's rotation
 *                                   body english by travel distance,
 *                                   so a short slide stays controlled
 *                                   and a full help sprint leans.
 *
 * These curves are wired into `easeForKind` by default. The main
 * replay-determinism tests now pin the V2 sampled positions, so replay
 * remains deterministic while the visual read feels more athletic.
 *
 * Hard contract:
 *   - Pure, deterministic. The time-warp curves run f(0) = 0,
 *     f(1) = 1; `athleticMotionEnvelope` runs f(0) = 0, f(1) = 0.
 *   - Outputs clamped to [0, 1] regardless of input.
 *   - No randomness, no time-of-day dependency.
 */

/**
 * Anticipation-loaded explosive cut.
 *
 * Curve: small back-dip in the first 5% (the "load") followed by an
 * accelerated power curve that re-uses the existing smoothstep
 * post-warp so endpoints have zero derivative. The dip is bounded
 * tight (≤ 0.012) so the anticipation reads as weight-loading rather
 * than as the player actually moving backwards.
 *
 * Shape highlights (locked by tests):
 *   - f(0) = 0
 *   - f(0.05) ≤ 0   (tiny back-load — feet loading)
 *   - f(0.30) ≥ legacy easeOutAthletic(0.30)
 *   - f(0.7) > 0.85 (most of the cut is finished by 70% of duration)
 *   - f(1) = 1
 */
export function easeAthleticCutV2(u: number): number {
  if (u <= 0) return 0
  if (u >= 1) return 1
  // Anticipation window: 0..0.06. A small sin-shaped dip; the
  // amplitude is tight enough that a player only reads it as
  // foot-load, not actual reverse motion.
  if (u < 0.06) {
    const local = u / 0.06
    const dip = -0.012 * Math.sin(Math.PI * local)
    return clamp01(dip)
  }
  // Post-anticipation: a steeper power curve smoothed by smoothstep.
  // r = pow((u - 0.06) / 0.94, 0.62) — front-loads more aggressively
  // than the legacy 0.7 exponent, so the cut reads as decisive
  // immediately after the load.
  const r = Math.pow((u - 0.06) / 0.94, 0.62)
  return clamp01(r * r * (3 - 2 * r))
}

/**
 * Closeout: defender accelerates fast, then commits to a hard stop.
 *
 * Curve: aggressive front-load, then a deceleration tail that
 * concentrates the last 25% of the run in an arc that approaches
 * arrival nearly tangentially. The tail uses a quintic-style
 * smoothing so f'(1) → 0 — the defender does not overshoot.
 *
 * Shape highlights:
 *   - f(0) = 0, f(1) = 1
 *   - f(0.25) ≥ 0.42 (defender is ~42% of the way after a quarter
 *     of the time — closeouts are explosive)
 *   - f(0.75) ≥ 0.94 (almost arrived; final 25% is the brake)
 *   - f'(0) = 0     (smooth start, no twitch out of stance)
 *   - f'(1) = 0     (committed arrival, no jitter)
 */
export function easeCloseoutV2(u: number): number {
  if (u <= 0) return 0
  if (u >= 1) return 1
  // Front-loaded power curve (exponent 0.42 — much more aggressive
  // than the 0.7 athletic exponent). Then a quintic smoothstep so
  // the arrival has zero velocity.
  const r = Math.pow(u, 0.42)
  return clamp01(r * r * r * (10 + r * (-15 + r * 6)))
}

/**
 * Hard stop arrival. Used for `stop_ball`-style reads where the
 * player rushes into a contest then plants. Curve:
 *   - f(0..0.55) ≈ legacy ease-in-out cubic (consistent first half)
 *   - f(0.55..1) accelerates the brake so deceleration is felt sharply
 *     at the back of the segment.
 *
 * Shape highlights:
 *   - f(0) = 0, f(1) = 1
 *   - f(0.5) ≈ 0.5 (still symmetric at midpoint — the brake has
 *     not started)
 *   - f(0.85) ≥ 0.95 (the brake has done most of its work)
 *   - f'(1) = 0
 */
export function easeStopHardV2(u: number): number {
  if (u <= 0) return 0
  if (u >= 1) return 1
  if (u < 0.55) {
    // Standard ease-in-out cubic up to the brake point.
    return u < 0.5
      ? 4 * u * u * u
      : 1 - Math.pow(-2 * u + 2, 3) / 2
  }
  // From 0.55 onward, run an ease-out cubic over the local progress
  // (u - 0.55) / 0.45 so the brake decelerates quickly toward
  // arrival. The derivatives match the ease-in-out cubic's at the
  // 0.55 boundary so there is no velocity discontinuity.
  const base = 1 - Math.pow(-2 * 0.55 + 2, 3) / 2
  const local = (u - 0.55) / 0.45
  const inv = 1 - local
  const tail = 1 - inv * inv * inv
  return clamp01(base + (1 - base) * tail)
}

/**
 * The kinds of movement segments the V2 curve dispatcher knows about.
 * Mirrors the subset of `SceneMovementKind` the V2 curves actually
 * handle; other kinds fall through to the legacy dispatch.
 */
export type MovementCurveV2Kind =
  | 'cut'
  | 'back_cut'
  | 'baseline_sneak'
  | 'drive'
  | 'jab'
  | 'rip'
  | 'closeout'
  | 'stop_ball'

/**
 * Returns the V2 athletic curve for the named movement kind, or
 * `null` when the kind has no V2 override (caller should fall back
 * to the legacy curve). Pure dispatch.
 */
export function getPremiumCurveForKind(
  kind: string,
): ((u: number) => number) | null {
  switch (kind) {
    case 'cut':
    case 'back_cut':
    case 'baseline_sneak':
    case 'drive':
    case 'jab':
    case 'rip':
      return easeAthleticCutV2
    case 'closeout':
      return easeCloseoutV2
    case 'stop_ball':
      return easeStopHardV2
    default:
      return null
  }
}

/**
 * Athletic body-language envelope.
 *
 * Unlike the time-warp curves above (which run f(0)=0 → f(1)=1 and
 * remap a segment's *progress*), this is a 0 → 1 → 0 *modulation*
 * envelope: the imperative renderer multiplies a movement's secondary
 * motion — forward lean, stride bob, cornering bank — by it across the
 * segment's [0, 1] progress.
 *
 * The pre-final renderer modulated that body language with a symmetric
 * triangle peaking at u=0.5. That mistimed it: the V2 motion curves
 * are front-loaded (the figure explodes off the start and decelerates
 * into the destination), so a symmetric triangle left the figure
 * leaning hard *forward* while it was actually braking — reading as a
 * player tipping over on arrival rather than planting.
 *
 * This envelope is front-loaded to match. It rises fast to a peak at
 * `ENVELOPE_PEAK_U` (the explosive push) and decays smoothly to 0 by
 * arrival (the figure plants upright). Both halves are smoothstep, so
 * the envelope is C1-continuous — no kink at the peak, zero slope at
 * both endpoints, no twitch as a segment starts or ends.
 *
 * Contract:
 *   - f(0) = 0, f(1) = 0 — no body english bleeds into the idle
 *     frames on either side of the segment, and back-to-back segments
 *     blend seamlessly at the u=1 → u=0 seam.
 *   - f(`ENVELOPE_PEAK_U`) = 1.
 *   - 0 ≤ f(u) ≤ 1 for all u. Pure / deterministic.
 */
const ENVELOPE_PEAK_U = 0.3

export function athleticMotionEnvelope(u: number): number {
  if (!Number.isFinite(u) || u <= 0 || u >= 1) return 0
  if (u <= ENVELOPE_PEAK_U) {
    // Smoothstep 0 → 1 across the explosive push.
    const r = u / ENVELOPE_PEAK_U
    return r * r * (3 - 2 * r)
  }
  // Smoothstep 1 → 0 across the longer deceleration / plant tail.
  const r = (u - ENVELOPE_PEAK_U) / (1 - ENVELOPE_PEAK_U)
  const s = 1 - r
  return s * s * (3 - 2 * s)
}

/**
 * Help-rotation effort scale.
 *
 * A `rotation` segment covers everything from a short controlled
 * defensive slide to a full weak-side help sprint (low-man baseline
 * recover, lane tag). A fixed body-language peak would over-lean a
 * small slide or under-sell a sprint, so the renderer scales a
 * rotation's lean / bob / bank by how far the segment travels.
 *
 * Returns 0 for a short slide (≤ `ROTATION_SLIDE_FT` — the defender
 * stays upright and controlled) and ramps via smoothstep to 1 for a
 * sprint (≥ `ROTATION_SPRINT_FT`). Travel distance is a clean proxy
 * for effort here because authored rotation durations sit in a
 * narrow band.
 *
 * Pure / deterministic — depends only on the authored geometry.
 */
const ROTATION_SLIDE_FT = 2.5
const ROTATION_SPRINT_FT = 7.5

export function rotationEffortScale(distanceFt: number): number {
  if (!Number.isFinite(distanceFt) || distanceFt <= ROTATION_SLIDE_FT) {
    return 0
  }
  if (distanceFt >= ROTATION_SPRINT_FT) return 1
  const r =
    (distanceFt - ROTATION_SLIDE_FT) / (ROTATION_SPRINT_FT - ROTATION_SLIDE_FT)
  return r * r * (3 - 2 * r)
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}
