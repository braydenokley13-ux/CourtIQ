/**
 * V2-C — Cinematic Camera Transitions.
 *
 * Pure data layer that maps a camera mode change (`from → to`) to the
 * eased-time constant the renderer's `CameraController.tick` should
 * use during the transition. The controller already converges on the
 * target with a frame-rate-independent `1 - exp(-dt/τ)` curve; this
 * module owns the τ choice so different cuts feel intentional:
 *
 *   - "incidental" transitions (broadcast → broadcast on scenario
 *     swap, follow → broadcast as the ball settles) stay snappy at
 *     the current 0.18s baseline so the user does not notice them.
 *
 *   - "teaching" transitions (broadcast → teaching-angle on freeze,
 *     teaching-angle → player-read-angle on replay) ride a slower
 *     0.30 – 0.42s curve so the cut reads as an intentional
 *     editorial choice — a coach pausing the tape, then re-angling
 *     the play.
 *
 *   - "lift" transitions (any → top-down-coach-board) ride a 0.46s
 *     curve so the overhead reveal feels like a slow boom-up rather
 *     than a snap.
 *
 *   - "return" transitions (any teaching preset → broadcast / auto
 *     after the answer demo finishes) sit between the two: 0.24s.
 *
 * The numbers are deliberately quiet — this is feel, not motion.
 *
 * Hard contract:
 *   - Pure function. Same `(from, to)` pair → same τ, byte-identical.
 *   - Always returns a finite, positive number in [0.10, 0.60].
 *     A bad input (e.g. unknown mode) falls back to the legacy 0.18s.
 *   - `from === to` returns the legacy baseline (no transition).
 */

import type { CameraMode } from '@/components/scenario3d/imperativeScene'

/**
 * Legacy time constant the controller used before V2-C. Kept as the
 * fallback so any tuple the policy table does not name explicitly is
 * byte-identical to pre-V2 behaviour.
 */
export const LEGACY_CAMERA_EASE_S = 0.18

/**
 * Hard floor / ceiling. The frame-rate-independent ease never produces
 * an instantaneous snap below ~0.08s of dt, but the controller does
 * also call `snapNext()` to force an immediate jump on first build /
 * scenario swap. Values outside [0.10, 0.60] are clamped so a typo in
 * the table cannot stall the camera (>0.6s feels broken) or skip the
 * transition entirely (<0.1s reads as a cut).
 */
const MIN_EASE_S = 0.1
const MAX_EASE_S = 0.6

/** The four FR-4 teaching presets, plus legacy `replay`. */
const TEACHING_PRESETS = new Set<CameraMode>([
  'teaching-angle',
  'player-read-angle',
  'help-defense-angle',
  'replay',
])

const TOP_DOWN_PRESETS = new Set<CameraMode>([
  'top-down-coach-board',
  'tactical',
])

const BASE_PRESETS = new Set<CameraMode>(['broadcast', 'auto', 'follow'])

/**
 * Returns the ease time constant (seconds) the controller should use
 * for the given mode transition. Pure function.
 *
 * The intent is not "match every cut perfectly" — it is to give the
 * teaching cut a hair more weight than an incidental cut so the
 * freeze frame and the replay reveal feel composed. Tests pin the
 * monotonicity ("teaching cuts are always slower than incidental
 * cuts") rather than the exact decimals so future tuning has room.
 */
export function getCameraTransitionEaseS(
  from: CameraMode,
  to: CameraMode,
  context?: CameraTransitionContext,
): number {
  if (!isCameraMode(from) || !isCameraMode(to)) return LEGACY_CAMERA_EASE_S
  // Pack 2 (3.1.4) — chained-freeze bridge overrides the legacy
  // identity behaviour: beat 1 → beat 2 with the same preset returns
  // a deliberate settle ease so the second freeze reads as composed.
  if (context?.chainedFreezeBridge && from === to) {
    return clamp(CHAINED_FREEZE_BRIDGE_EASE_S)
  }
  if (from === to) return LEGACY_CAMERA_EASE_S

  // Top-down lifts (overhead reveal). Any → top-down or top-down →
  // any reads as a boom; ride the slowest curve.
  if (TOP_DOWN_PRESETS.has(to) || TOP_DOWN_PRESETS.has(from)) {
    return clamp(0.46)
  }

  // Teaching-cut path.
  //   - base → teaching: composed pause, 0.40s.
  //   - teaching → teaching (e.g. teaching-angle → player-read-angle
  //     on the freeze→replay edge): controlled pivot, 0.32s.
  //   - teaching → base (return after answer demo): quick exit, 0.24s.
  if (TEACHING_PRESETS.has(to)) {
    if (BASE_PRESETS.has(from)) return clamp(0.4)
    if (TEACHING_PRESETS.has(from)) return clamp(0.32)
    return clamp(0.32)
  }
  if (TEACHING_PRESETS.has(from)) {
    return clamp(0.24)
  }

  // base → base. Default snappy 0.18s.
  return LEGACY_CAMERA_EASE_S
}

/**
 * Bucket label the transition table maps to. Surfaced separately so
 * tests can pin the policy without depending on the exact τ value.
 *
 * Pack 2 (3.1.4) — `chained-freeze-bridge` was added for HUNT
 * scenarios where the camera bridges from beat 1 to beat 2 across
 * the inter-beat unfreeze. When both freezes use the same camera
 * preset (the common case), `from === to` would otherwise collapse
 * to `instant` (legacy 0.18s, no perceivable transition); the
 * bridge kind elevates the same-preset case to a deliberate ~0.36s
 * settle so the second freeze reads as a re-arrival rather than a
 * blink. Callers signal HUNT context by passing
 * `{ chainedFreezeBridge: true }` to the pure helpers below.
 */
export type CameraTransitionKind =
  | 'instant'
  | 'incidental'
  | 'teach-in'
  | 'teach-pivot'
  | 'teach-out'
  | 'top-down-lift'
  | 'chained-freeze-bridge'

export interface CameraTransitionContext {
  /** Pack 2 (3.1.4) — set true when the camera is bridging from a
   *  HUNT first-beat freeze to a second-beat freeze. Lets the helper
   *  return a deliberate settle ease even when both beats use the
   *  same preset. Default false (= legacy behavior). */
  chainedFreezeBridge?: boolean
}

/**
 * Pack 2 (3.1.4) — ease constant for the chained-freeze bridge. Sits
 * between `teach-pivot` (0.32s) and `teach-in` (0.40s): the camera is
 * not moving between presets but it IS holding through a beat
 * transition, so the ease should read as composed. Tuning rationale
 * lives in the design doc (HUNT_DECODER_DESIGN.md §3.3).
 */
const CHAINED_FREEZE_BRIDGE_EASE_S = 0.36

export function getCameraTransitionKind(
  from: CameraMode,
  to: CameraMode,
  context?: CameraTransitionContext,
): CameraTransitionKind {
  if (!isCameraMode(from) || !isCameraMode(to)) return 'incidental'
  // Pack 2 (3.1.4) — chained-freeze bridge takes precedence over the
  // identity case so beat 1 → beat 2 with the same preset still reads
  // as a deliberate cut. Non-identity bridges (e.g. teaching-angle →
  // player-read-angle on beat 2) fall through to the existing
  // teach-pivot path; the bridge label is reserved for the same-preset
  // case where the legacy table would have returned `instant`.
  if (context?.chainedFreezeBridge && from === to) return 'chained-freeze-bridge'
  if (from === to) return 'instant'
  if (TOP_DOWN_PRESETS.has(to) || TOP_DOWN_PRESETS.has(from)) {
    return 'top-down-lift'
  }
  if (TEACHING_PRESETS.has(to)) {
    if (BASE_PRESETS.has(from)) return 'teach-in'
    if (TEACHING_PRESETS.has(from)) return 'teach-pivot'
    return 'teach-pivot'
  }
  if (TEACHING_PRESETS.has(from)) return 'teach-out'
  return 'incidental'
}

/**
 * Type guard so an externally-supplied string (e.g. a stale URL
 * `?camera=` value) cannot crash the controller. Mirrors the
 * `CAMERA_MODES` literal union from `imperativeScene`; duplicating
 * it here keeps this file THREE-free and SSR-safe.
 */
function isCameraMode(value: unknown): value is CameraMode {
  return (
    value === 'auto' ||
    value === 'broadcast' ||
    value === 'tactical' ||
    value === 'follow' ||
    value === 'replay' ||
    value === 'teaching-angle' ||
    value === 'player-read-angle' ||
    value === 'help-defense-angle' ||
    value === 'top-down-coach-board'
  )
}

function clamp(n: number): number {
  if (!Number.isFinite(n)) return LEGACY_CAMERA_EASE_S
  if (n < MIN_EASE_S) return MIN_EASE_S
  if (n > MAX_EASE_S) return MAX_EASE_S
  return n
}
