/**
 * V2-D — Overlay Choreography.
 *
 * Pure data layer that maps an ordered list of overlay primitives to
 * staggered reveal timings so the freeze frame and answer-replay
 * choreographies do not paint every cue at the same instant.
 *
 * The pre-V2 overlay controller emitted every primitive simultaneously
 * (after the renderer's existing fade-in). From a teaching standpoint
 * that washed the freeze frame in detail; the eye could not tell which
 * cue was the headline read. This helper assigns each primitive a
 * `delayMs` and `durationMs` so the cluster reveals in three beats:
 *
 *   1. Anchor cues (the central read — defender vision cone, the
 *      cutting lane, the closing defender). Appear immediately.
 *   2. Supporting cues (open-space regions, secondary lanes,
 *      passing options). Appear ~120ms later.
 *   3. Auxiliary cues (decorations — pulses, micro-labels). Appear
 *      ~240ms later.
 *
 * The stagger is intentionally tight so the cluster is fully present
 * within ~500ms of the freeze edge. Long staggers feel laggy.
 *
 * Hard contract:
 *   - Pure function. Same input → byte-identical timeline.
 *   - Always finite, non-negative delays / durations.
 *   - Empty input returns an empty timeline.
 *   - Idempotent: feeding the helper its own output (mapped back to
 *     primitives) returns the same timing structure.
 */

import type { OverlayPrimitive } from './schema'

/**
 * Choreography role buckets. The dispatcher inside `roleForPrimitive`
 * picks the right bucket for each primitive kind; tests pin the
 * mapping so a new primitive cannot silently land at the back of the
 * stagger.
 */
export type OverlayChoreographyRole = 'anchor' | 'support' | 'auxiliary'

/** Defaults the helper applies. Pure constants so tests can pin them. */
export const OVERLAY_CHOREOGRAPHY_DEFAULTS = Object.freeze({
  /** Delay (ms) for anchor primitives. */
  anchorDelayMs: 0,
  /** Delay (ms) for support primitives. */
  supportDelayMs: 120,
  /** Delay (ms) for auxiliary primitives. */
  auxiliaryDelayMs: 240,
  /** Per-primitive index spread (ms) inside the same role bucket so a
   *  burst of three "support" overlays does not mount on the same
   *  frame. Capped at 3 spreads per bucket so a wide cluster never
   *  pushes the auxiliary tail past the renderer's existing fade-out. */
  withinBucketSpreadMs: 40,
  withinBucketSpreadCap: 3,
  /** Default reveal duration the renderer should fade primitives in
   *  over. The existing renderer already applies its own per-primitive
   *  fade; this value is the recommendation surface so a future
   *  consumer can drive a uniform feel. */
  defaultDurationMs: 280,
})

export interface OverlayChoreographyEntry {
  /** Original primitive, untouched. The helper never rewrites the
   *  primitive itself — it only adds timing metadata around it. */
  primitive: OverlayPrimitive
  /** Reveal delay (ms) relative to the phase entry. Always >= 0. */
  delayMs: number
  /** Reveal duration (ms). The renderer treats this as a fade-in
   *  recommendation; primitives with their own duration override
   *  it. */
  durationMs: number
  /** Role bucket the primitive landed in. Surfaced so consumers can
   *  log / debug the decision. */
  role: OverlayChoreographyRole
  /** Stable index inside the input list. Surfaced to make the
   *  output deterministic for tests that pin order without relying
   *  on `Object.is` identity. */
  inputIndex: number
}

export interface ChoreographyOptions {
  anchorDelayMs?: number
  supportDelayMs?: number
  auxiliaryDelayMs?: number
  withinBucketSpreadMs?: number
  withinBucketSpreadCap?: number
  defaultDurationMs?: number
}

/**
 * Builds a staggered reveal timeline. The order of returned entries
 * matches the input order so a renderer that maps the input array
 * to scene objects 1:1 can correlate by index.
 */
export function buildChoreography(
  primitives: readonly OverlayPrimitive[],
  options: ChoreographyOptions = {},
): OverlayChoreographyEntry[] {
  if (primitives.length === 0) return []
  const opts = { ...OVERLAY_CHOREOGRAPHY_DEFAULTS, ...options }

  // Per-role running indexes — used to compute the within-bucket spread.
  const counters: Record<OverlayChoreographyRole, number> = {
    anchor: 0,
    support: 0,
    auxiliary: 0,
  }

  const out: OverlayChoreographyEntry[] = []
  for (let i = 0; i < primitives.length; i++) {
    const prim = primitives[i]!
    const role = roleForPrimitive(prim)
    const baseDelay =
      role === 'anchor'
        ? opts.anchorDelayMs
        : role === 'support'
          ? opts.supportDelayMs
          : opts.auxiliaryDelayMs
    const idx = counters[role]
    const spread = Math.min(idx, opts.withinBucketSpreadCap) * opts.withinBucketSpreadMs
    counters[role] = idx + 1
    out.push({
      primitive: prim,
      delayMs: clampNonNegative(baseDelay + spread),
      durationMs: clampNonNegative(opts.defaultDurationMs),
      role,
      inputIndex: i,
    })
  }
  return out
}

/**
 * Maps a single overlay primitive to its role bucket. Tests pin the
 * mapping so a new primitive added without an entry here surfaces as
 * a deterministic 'auxiliary' (the safest fall-through — it stays
 * out of the way of the headline read).
 */
export function roleForPrimitive(
  primitive: OverlayPrimitive,
): OverlayChoreographyRole {
  // The schema discriminator is `kind`. Anchors are the central
  // teaching cues that read first; supports add context; auxiliaries
  // decorate.
  switch (primitive.kind) {
    // Anchors — the headline read. Defender stance + the pass /
    // drive line that the user is being asked to identify. These
    // mount first so the eye lands on the central read before the
    // supporting context arrives.
    case 'defender_vision_cone':
    case 'defender_hip_arrow':
    case 'defender_foot_arrow':
    case 'defender_chest_line':
    case 'drive_cut_preview':
      return 'anchor'

    // Supports — secondary spatial context. Lanes, open-space
    // regions, the hand-in-lane stance cue, the help pulse beat.
    case 'passing_lane_open':
    case 'passing_lane_blocked':
    case 'defender_hand_in_lane':
    case 'open_space_region':
    case 'help_pulse':
      return 'support'

    // Auxiliaries — decoration. Labels and timing pulses dress the
    // freeze with copy / rhythm but never carry the headline read.
    case 'label':
    case 'timing_pulse':
      return 'auxiliary'

    default:
      return 'auxiliary'
  }
}

function clampNonNegative(n: number): number {
  if (!Number.isFinite(n)) return 0
  if (n < 0) return 0
  return n
}
