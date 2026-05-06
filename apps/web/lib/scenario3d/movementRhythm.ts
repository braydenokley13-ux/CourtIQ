/**
 * V6 Packet 2 — Movement Rhythm Helper.
 *
 * Pure data layer that maps a defender role + cue kind to a
 * deterministic *reaction-lag* in milliseconds. Used by:
 *
 *  - scenario JSON tuning sweeps (V6 Packet 2/7) to set authored
 *    `delayMs` values that vary per defender role instead of the
 *    flat 200/250 ms reaction time the v0 seeds shipped with;
 *  - tests that pin the rhythm contract so future scenarios that
 *    reuse these values stay consistent.
 *
 * Hard contract:
 *   - Pure / deterministic. Same role + cue → same number, no
 *     randomness, no time-of-day dependency.
 *   - Always returns a finite, non-negative integer.
 *   - No imports of three / scene runtime — this module is a static
 *     numeric lookup so a scenario authoring tool (or a JSON
 *     migration script) can use it without spinning a renderer.
 *
 * Design notes:
 *   - Roles are taken from the founder-v0 `defense.role` strings
 *     (`on_ball`, `denying_wing_defender`, `weak_corner_low_man_helper`,
 *     etc) so the helper can be applied to existing scenes without
 *     renaming roles.
 *   - The "cue" parameter abstracts what the defender is reacting
 *     to: a `lift` from offense (slow read), a `drive` (fast read),
 *     a `pass` (committed-rotation read).
 *   - Numbers are tuned to reproduce the cinematic difference
 *     called out in the V6 audit:
 *       * On-ball defenders react fastest (they were already
 *         engaged when the ball moved — ~80-130 ms).
 *       * Denial / top-lock defenders react fast on a lift (the
 *         denial *creates* the cue — ~150-220 ms) but slow on a
 *         drive (they are committed to the off-ball read — ~280 ms).
 *       * Help / low-man rotators react slowest because they have
 *         to read the ball-handler's threat first — ~280-380 ms.
 *       * Closeout defenders are even slower at the launch (they
 *         are in help position one-pass-away) — ~340-420 ms.
 */

/**
 * Defender roles supported by the rhythm helper. Mirrors the
 * `role` strings present in the founder-v0 seed JSON. Falls
 * through to a sensible default for unknown roles so a future
 * scenario can use a custom role without crashing the helper.
 */
export type DefenderRole =
  | 'on_ball'
  | 'denying_wing_defender'
  | 'denying_wing_defender_top_lock'
  | 'weak_wing_defender'
  | 'weak_corner_defender'
  | 'low_man'
  | 'wing_defender_helping'
  | 'weak_corner_low_man_helper'
  | 'strong_corner_defender'
  | 'screen_defender'

/**
 * What the defender is reacting to. The same role reads
 * different cues with different latencies — the audit calls out
 * that flat 200 ms across every situation reads as "everyone
 * moves on the same metronome."
 */
export type ReactionCue =
  | 'offense_lift' // off-ball offense lifts to a catch spot
  | 'offense_drive' // ball-handler drives downhill
  | 'offense_back_cut' // off-ball offense plants and back-cuts
  | 'offense_jab' // ball-handler triple-threat read
  | 'pass_release' // ball leaves the passer's hand
  | 'pass_arrival' // ball arrives at the catcher

interface ReactionLagInput {
  role: DefenderRole | (string & {})
  cue: ReactionCue
}

/**
 * Per-role baseline reaction lag (ms). The deterministic
 * "everyone is ready" floor the helper applies before the cue
 * modifier.
 */
const ROLE_BASE_LAG_MS: Record<DefenderRole, number> = {
  on_ball: 110,
  denying_wing_defender: 210,
  denying_wing_defender_top_lock: 220,
  weak_wing_defender: 260,
  weak_corner_defender: 270,
  low_man: 320,
  wing_defender_helping: 360,
  weak_corner_low_man_helper: 360,
  strong_corner_defender: 250,
  screen_defender: 180,
}

/**
 * Per-cue modifier added to the role baseline. Negative numbers
 * pull the reaction earlier (the cue is "loud" — easy to read);
 * positive numbers push it later (the cue is "quiet" — defender
 * has to commit to a read first).
 */
const CUE_MODIFIER_MS: Record<ReactionCue, number> = {
  offense_lift: 0, // baseline. lift is the canonical "read me" cue.
  offense_drive: 60, // drive forces a help decision before a slide.
  offense_back_cut: -40, // explosion off the lift; defender has to scramble.
  offense_jab: 20, // brief read window — defender needs a beat.
  pass_release: 80, // committed rotation only after release.
  pass_arrival: -60, // the catch-and-shoot cushion is read on arrival.
}

const FALLBACK_BASE_MS = 230

/**
 * Returns the deterministic reaction-lag (ms) a defender of
 * `role` should authored at when reacting to `cue`. Always a
 * non-negative integer. Pure / deterministic.
 *
 * Unknown roles fall through to a 230 ms baseline so the helper
 * keeps working when a new defender role lands in a future
 * scenario.
 */
export function getReactionLagMs(input: ReactionLagInput): number {
  const base =
    (ROLE_BASE_LAG_MS as Record<string, number>)[input.role] ??
    FALLBACK_BASE_MS
  const modifier = CUE_MODIFIER_MS[input.cue]
  const total = Math.round(base + modifier)
  return total < 0 ? 0 : total
}

/**
 * Per-role duration scale for `closeout` / `rotation` segments.
 *
 * Used to break the v0 pattern where every defender ran at the
 * same `durationMs` regardless of how far they had to come from.
 * A help-side rotation cannot finish in the same time a wing
 * closeout takes; the scale below captures that.
 *
 * The renderer doesn't read this directly today — scenario JSON
 * is the source of truth for `durationMs`. The helper is for
 * authoring sweeps (V6 Packet 7) and tests that want to pin the
 * relative pacing without re-deriving it per scenario.
 */
const ROLE_CLOSEOUT_SCALE: Record<DefenderRole, number> = {
  on_ball: 0.85,
  denying_wing_defender: 0.95,
  denying_wing_defender_top_lock: 0.95,
  weak_wing_defender: 1.05,
  weak_corner_defender: 1.05,
  low_man: 1.15,
  wing_defender_helping: 1.2,
  weak_corner_low_man_helper: 1.2,
  strong_corner_defender: 1.0,
  screen_defender: 0.9,
}

/**
 * Returns a multiplicative scale (≈ 0.85 .. 1.20) the authoring
 * sweep applies to closeout / rotation `durationMs` based on the
 * defender's role. The scale is centered on 1.0 so the existing
 * scenario timings remain a sensible default when the helper is
 * not consulted.
 */
export function getRoleCloseoutScale(
  role: DefenderRole | (string & {}),
): number {
  const scale = (ROLE_CLOSEOUT_SCALE as Record<string, number>)[role]
  return typeof scale === 'number' && Number.isFinite(scale) && scale > 0
    ? scale
    : 1.0
}

/**
 * Convenience: applies the closeout scale to a base duration in
 * milliseconds, rounding to the nearest 50 ms so the output stays
 * "round-ish" the way authored JSON values are. Bounded at 250 ms
 * minimum / 2000 ms maximum.
 */
export function scaleCloseoutDurationMs(
  baseMs: number,
  role: DefenderRole | (string & {}),
): number {
  const safe = Number.isFinite(baseMs) && baseMs > 0 ? baseMs : 600
  const raw = safe * getRoleCloseoutScale(role)
  const snapped = Math.round(raw / 50) * 50
  if (snapped < 250) return 250
  if (snapped > 2000) return 2000
  return snapped
}
