/**
 * FR-8 Packet 3 — Basketball-ready rest delta.
 *
 * Pure data describing the small, deterministic offset that lifts
 * the GLB rig's bind pose from "asset rest" into a readable
 * basketball-ready stance:
 *
 *   - Slight knee bend (thighs pitched forward, shins tucked under).
 *   - Soft elbow at the side (forearm draped relative to the bind
 *     shoulder, not fully extended).
 *   - Arms close to the ribs (upperarm rotated inward).
 *   - Hips level — no lateral rock, the figure should still read as
 *     "standing", not "moving".
 *
 * Architecture lock:
 *   - Pure data + helpers. No THREE.js types in this module's
 *     surface; the consumer in `glbAthlete.ts` resolves the deltas
 *     to quaternions on its side.
 *   - Bind-relative offsets only. Authoring an "athletic stance" as
 *     near-identity quaternions blows up because the Quaternius rig
 *     bones are FAR from identity in bind. The renderer multiplies
 *     each delta into the audited bind quaternion, exactly the same
 *     way the existing clip library does.
 *   - Deterministic — the same input deltas always produce the same
 *     pose. No clocks, no random.
 *
 * Why this needs to be its own module:
 *   - Pre-FR-8 the rest delta was implicit inside
 *     `buildGlbIdleReadyClip`: the idle clip authored thigh -0.14,
 *     shin 0.08, etc. That worked AS LONG AS idle_ready was always
 *     playing. The moment another clip ran AND that clip didn't
 *     touch the lower body, the legs snapped back to bind — making
 *     the figure look like a mannequin while a non-leg clip played.
 *   - This module makes the rest delta first-class so the same
 *     numbers flow into:
 *       - the idle clip (already references it),
 *       - the procedural fallback (Packet 6),
 *       - the future "missing-clip" idle hold (Packet 5 ladder
 *         tier 2 — "GLB athlete + idle pose if the clip fails").
 */

/**
 * Bind-relative Euler delta for one bone (radians, XYZ order).
 * Multiplied INTO the bone's audited bind quaternion at apply time.
 */
export interface BoneEulerDelta {
  /** X-axis rotation in radians (pitch). */
  x: number
  /** Y-axis rotation in radians (yaw). */
  y: number
  /** Z-axis rotation in radians (roll). */
  z: number
}

/**
 * The named GLB bones the rest delta touches. Names follow the
 * Quaternius UAL2 / Unreal-style convention (lowercase + side
 * suffix) with `Head` (PascalCase) as the lone exception. Keys are
 * the logical (`leftThigh`) names from `GLB_BONE_MAP`; values are
 * the bind-relative deltas.
 */
export type AthleticPoseBoneKey =
  | 'leftThigh'
  | 'rightThigh'
  | 'leftShin'
  | 'rightShin'
  | 'leftUpperArm'
  | 'rightUpperArm'
  | 'leftForeArm'
  | 'rightForeArm'

/**
 * §5.6 / §7.10 — the audited "basketball ready" rest delta.
 *
 * Numbers are bind-relative Euler offsets in radians. The values
 * mirror the lower-body / arm offsets `buildGlbIdleReadyClip` had
 * baked into its tracks pre-FR-8; pulling them out of the clip and
 * into a named constant means every consumer (idle clip, fallback
 * idle hold, procedural figure) can read the same rest pose.
 *
 * Magnitudes are intentionally small:
 *   - thighs at -0.14 (≈ 8°) is a coach's "athletic stance" knee
 *     bend — visible at broadcast distance, not a squat.
 *   - shins at  +0.08 keeps the foot under the knee (no shin-over-
 *     toe collapse).
 *   - upper-arm Z 0.02 brings the arm INTO the rib instead of out
 *     to the side. The X term (pitch) is unused — the bind rotation
 *     already places the arm where it needs to be.
 *   - forearm at -0.42 holds a 24° elbow bend — soft but not slack.
 */
export const BASKETBALL_READY_REST_DELTA: Readonly<
  Record<AthleticPoseBoneKey, BoneEulerDelta>
> = Object.freeze({
  leftThigh: { x: -0.14, y: 0, z: 0 },
  rightThigh: { x: -0.14, y: 0, z: 0 },
  leftShin: { x: 0.08, y: 0, z: 0 },
  rightShin: { x: 0.08, y: 0, z: 0 },
  leftUpperArm: { x: 2.3, y: 0, z: 0.02 },
  rightUpperArm: { x: 2.3, y: 0, z: -0.02 },
  leftForeArm: { x: 0, y: -0.42, z: 0 },
  rightForeArm: { x: 0, y: -0.42, z: 0 },
})

/**
 * Bone keys ordered for stable iteration. `Object.keys` order is
 * spec-stable in modern JS but pinning the iteration order via this
 * array means tests can lock the per-bone behaviour without
 * depending on enumeration semantics.
 */
export const BASKETBALL_READY_BONE_KEYS: readonly AthleticPoseBoneKey[] = [
  'leftThigh',
  'rightThigh',
  'leftShin',
  'rightShin',
  'leftUpperArm',
  'rightUpperArm',
  'leftForeArm',
  'rightForeArm',
] as const

/**
 * Returns the delta for a bone, or null if the rest delta does not
 * touch that bone (hips, spine, head are intentionally untouched —
 * they are driven by per-clip motion or held at bind).
 *
 * Pure: same key → same delta object reference.
 */
export function getBasketballReadyDelta(
  key: AthleticPoseBoneKey,
): BoneEulerDelta {
  return BASKETBALL_READY_REST_DELTA[key]
}

/**
 * Audit invariants — the rest delta is "basketball ready", not
 * "moving": every magnitude must stay below 2.5 rad. The arm X
 * value (2.3) is the largest by design — it rotates the upperarm
 * from the bind T-pose-ish 45° into a near-vertical "arm at the
 * rib" pose. Beyond ~2.5 rad the arm passes through the torso.
 *
 * This constant is what the lock test reads to assert nothing
 * dodgy ships.
 */
export const BASKETBALL_READY_MAX_DELTA_RAD = 2.5
