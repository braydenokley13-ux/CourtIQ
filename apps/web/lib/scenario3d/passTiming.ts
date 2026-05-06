/**
 * V6 Packet 3 — Pass timing helper.
 *
 * Pure data layer that maps a pass intent + cutter relationship to
 * deterministic launch and arrival timings (in ms). Used by:
 *
 *  - the V6 packet-7 family-specific tuning sweep, when revisiting
 *    `delayMs` / `durationMs` for `pass` and `skip_pass` movements
 *    in scenario JSON;
 *  - tests that pin the per-intent timing contract so future
 *    scenarios reuse a consistent rhythm without recomputing it
 *    per scene;
 *  - authoring tooling that wants a "what should this pass
 *    feel like?" reference without spinning a renderer.
 *
 * Hard contract:
 *   - Pure / deterministic. Same inputs -> same numbers, no time
 *     dependency, no randomness.
 *   - Always returns finite, non-negative integers.
 *   - No three / scene runtime imports.
 *
 * Design notes:
 *   - The helper expresses three timing dimensions per intent:
 *       1. `launchOffsetMs` — how long after the cutter starts
 *          the leg the passer should release. A back-cut's lead
 *          pass releases just *after* the cutter plants and
 *          explodes; a swing-back releases as the user pivots; a
 *          skip launches just after the user sees the help.
 *       2. `flightDurationMs` — how long the ball is in the air.
 *          Skip passes are the longest by floor distance, but the
 *          line drive shortens flight time so it feels snappy.
 *       3. `receiverSetOffsetMs` — when (relative to launch) the
 *          catcher should start their "ready to catch" lift. A
 *          negative value means the catcher pre-loads BEFORE the
 *          ball is released; zero means simultaneous; positive
 *          means after release.
 *   - These numbers reproduce the V6 audit's G-3 / G-4 fixes:
 *     each pass intent now has its own rhythm.
 */

/**
 * Pass intent — the *meaning* of the pass, not just the kind.
 * `lead_pass_back_cut` is a cutter-on-the-rim feed (BDW family);
 * `lead_pass_baseline` is an ESC drop-off; `swing_back` is the
 * AOR-03 reset; `skip_corner` / `skip_wing` are SKR weak-side
 * skips. The kind on the wire (`pass` vs `skip_pass`) follows
 * from the intent but is decided by the caller.
 */
export type PassIntent =
  | 'lead_pass_back_cut'
  | 'lead_pass_baseline'
  | 'pocket_pass_short'
  | 'swing_back'
  | 'skip_corner'
  | 'skip_wing'
  | 'kickout_wing'
  | 'kickout_corner'

export interface PassTimingProfile {
  /** ms after the cutter starts moving when the passer should release. */
  launchOffsetMs: number
  /** ms the ball spends in the air. */
  flightDurationMs: number
  /** ms relative to release that the receiver's "set" lift should start.
   *  Negative = before release. */
  receiverSetOffsetMs: number
}

const PROFILES: Record<PassIntent, PassTimingProfile> = {
  // BDW family — back-cut leads. The cutter plants and explodes
  // toward the rim before the ball releases so the lead pass
  // catches the cutter at the basket. Flight is medium (the
  // ball-handler reads the cut, then leads).
  lead_pass_back_cut: {
    launchOffsetMs: 460,
    flightDurationMs: 580,
    receiverSetOffsetMs: -120,
  },
  // ESC family — pocket / drop-off pass. Short throw to a cutter
  // already in the slash. The cutter is alive on the catch — the
  // hand-off is almost simultaneous with the slash arrival.
  pocket_pass_short: {
    launchOffsetMs: 360,
    flightDurationMs: 480,
    receiverSetOffsetMs: -100,
  },
  // ESC drive-and-kick to the dunker — short, quick, low arc.
  lead_pass_baseline: {
    launchOffsetMs: 330,
    flightDurationMs: 540,
    receiverSetOffsetMs: -100,
  },
  // AOR-03 reset — user catches, re-reads the closeout, swings
  // back to the passer. The "swing" ball flight is short because
  // it's a one-handed flick back to the slot.
  swing_back: {
    launchOffsetMs: 100,
    flightDurationMs: 580,
    receiverSetOffsetMs: -80,
  },
  // SKR family — weak-side corner skip. Long line drive; the
  // shooter pre-sets so the ball lands in their pocket.
  skip_corner: {
    launchOffsetMs: 220,
    flightDurationMs: 700,
    receiverSetOffsetMs: -180,
  },
  // SKR family — weak-side wing skip. Slightly shorter than the
  // corner; flatter line.
  skip_wing: {
    launchOffsetMs: 220,
    flightDurationMs: 660,
    receiverSetOffsetMs: -160,
  },
  // SKR / ESC kickout to wing — closer than a skip, comes off a
  // pivot, used after a drive collapses help.
  kickout_wing: {
    launchOffsetMs: 280,
    flightDurationMs: 560,
    receiverSetOffsetMs: -140,
  },
  // SKR / ESC kickout to strong corner.
  kickout_corner: {
    launchOffsetMs: 300,
    flightDurationMs: 580,
    receiverSetOffsetMs: -140,
  },
}

/**
 * Returns the deterministic timing profile for `intent`. Always
 * returns a fresh object so callers can tweak fields without
 * mutating the static table; the helper itself never mutates.
 */
export function getPassTimingProfile(intent: PassIntent): PassTimingProfile {
  const base = PROFILES[intent]
  return {
    launchOffsetMs: base.launchOffsetMs,
    flightDurationMs: base.flightDurationMs,
    receiverSetOffsetMs: base.receiverSetOffsetMs,
  }
}

/**
 * Convenience: returns the receiver "set" lift duration in ms
 * relative to the absolute timeline. Given the authored
 * `cutterStartMs` (when the cutter begins their move) and the
 * pass intent, computes the absolute ms the receiver-set lift
 * should run for so the ball arrives in the catcher's pocket on
 * the receiver's apex.
 *
 * Used by V6 Packet 3 / Packet 7 when authoring receiver_set
 * lifts inline in scenario JSON.
 */
export function computeReceiverSetMs(
  intent: PassIntent,
): { setStartMsAfterCutter: number; setDurationMs: number } {
  const p = getPassTimingProfile(intent)
  // The set lift runs from "receiver start" to "ball arrival",
  // which in absolute terms is from
  //   launchOffsetMs + receiverSetOffsetMs
  // to
  //   launchOffsetMs + flightDurationMs
  // The duration must be >= 80 ms (so the lift is visible at all)
  // and <= 350 ms (so it doesn't read as a slow stand-up).
  const setStart = p.launchOffsetMs + p.receiverSetOffsetMs
  const ballArrival = p.launchOffsetMs + p.flightDurationMs
  const rawDur = ballArrival - setStart
  const setDur = Math.max(80, Math.min(350, Math.round(rawDur / 50) * 50))
  return {
    setStartMsAfterCutter: setStart < 0 ? 0 : setStart,
    setDurationMs: setDur,
  }
}
