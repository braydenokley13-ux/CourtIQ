/**
 * FR-6 — Replay teaching timeline.
 *
 * Pure helper for the replay-leg cadence and the per-decoder teaching
 * label that closes a rep. The replay state machine is correct; this
 * module owns the *timing constants* the renderer uses to pace the
 * teaching beats — cue repaint, answer leg start, end-of-rep label,
 * done hold — so they live in one auditable place rather than being
 * scattered across the JSX controller and the imperative twin.
 *
 * Architecture lock:
 *   - Pure functions + constants. No THREE.js, no clocks, no scene
 *     reads beyond the typed `DecoderTag`.
 *   - Same inputs always produce the same outputs.
 *   - These are the contract values FR-6 tests pin. Changing one
 *     here is a deliberate timing decision; the test suite catches
 *     silent regressions.
 *
 * Reference: §10.2 of `docs/courtiq-3d-film-room-system-plan.md`.
 */

import type { DecoderTag } from './schema'

// ---------------------------------------------------------------------------
// Cue repaint hold — the brief window after the consequence leg ends (or
// the best-read pick fires) during which the renderer keeps the
// pre-answer cluster on screen and motion is held. Lets the cue land
// one more time before the answer leg shows the read.
// ---------------------------------------------------------------------------

/** Wrong path: §10.2 says "Cue overlays repaint 1500–1700 ms" then
 *  "Answer leg starts 1900 ms". 200 ms paint + 200 ms hold = 400 ms.
 *  The renderer holds motion for this long after consequence ends. */
export const CUE_REPAINT_HOLD_WRONG_MS = 400

/** Best-read path: §10.2 says "Cue overlays repaint 200 ms" then
 *  "Answer leg starts 600 ms". The 80 ms quick reset is folded in;
 *  the renderer holds motion for this long after the best-read
 *  pick fires. */
export const CUE_REPAINT_HOLD_CORRECT_MS = 600

// ---------------------------------------------------------------------------
// Choice → leg-start delays. The plan separates "choice locked in" from
// "consequence leg starts" / "quick reset to snapshot" by a small beat
// so the choice-lock animation reads before the world starts moving
// again. The renderer's existing `PRE_DELAY_MS` covers this on the
// JSX controller; we surface the same number here so the imperative
// twin and the tests can pin it.
// ---------------------------------------------------------------------------

/** §10.2 — "Consequence leg starts 80 ms" after the wrong choice. */
export const PRE_CONSEQUENCE_DELAY_MS = 80

/** §10.2 — "Quick reset to snapshot 80 ms" after a correct choice. */
export const PRE_BESTREAD_DELAY_MS = 80

// ---------------------------------------------------------------------------
// End-of-rep teaching label.
//   - Fades in when the answer leg ends.
//   - Stays visible through the `done` hold, then fades on the next
//     scenario / restart.
// ---------------------------------------------------------------------------

/** §9.4 / §10.2 — "fades over 500 ms, never bouncy." */
export const TEACHING_LABEL_FADE_IN_MS = 500

/** §10.2 — "Done +700 ms: CTA: 'Next' or 'Why?'". The renderer
 *  holds the teaching label visible for at least this long so the
 *  player has time to read it before the parent UI swaps in the
 *  CTA tray. */
export const DONE_HOLD_MS = 700

// ---------------------------------------------------------------------------
// Per-decoder teaching label.
//
// Section 10.6 / 9.4: one chip, max five words, decoder-specific. The
// label voice is "teaching, not narration": the imperative form names
// the lesson without telling the player what they should have done in
// this exact rep.
// ---------------------------------------------------------------------------

export interface TeachingLabel {
  /** Short imperative — "Read the denial." / "Punish the help." */
  text: string
  /** The court anchor the label hovers above. We resolve this on the
   *  caller side from the scene's player table; this helper just
   *  names the role so the renderer's existing label primitive can
   *  paint at the right point. */
  anchorRole:
    | 'cutter'
    | 'receiver'
    | 'open_player'
    | 'helper_defender'
    | 'closeout_defender'
    | 'deny_defender'
}

const LABELS: Readonly<Record<DecoderTag, TeachingLabel>> = Object.freeze({
  BACKDOOR_WINDOW: { text: 'Read the denial.', anchorRole: 'cutter' },
  EMPTY_SPACE_CUT: { text: 'Cut into empty space.', anchorRole: 'cutter' },
  ADVANTAGE_OR_RESET: { text: 'Read the closeout.', anchorRole: 'receiver' },
  SKIP_THE_ROTATION: { text: 'Punish the help.', anchorRole: 'open_player' },
})

export function getDecoderTeachingLabel(
  decoder: DecoderTag,
): TeachingLabel {
  return LABELS[decoder]
}

// ---------------------------------------------------------------------------
// Top-level cadence summary. Two bundles — one per leg path — that
// pin the contract values for the FR-6 test suite. The numbers below
// are intentionally redundant with the constants above; the tests use
// the bundle so a typo in one place trips the whole assertion.
// ---------------------------------------------------------------------------

export interface ReplayCadence {
  /** Beat 1 — between "choice locked in" and the first motion beat
   *  of the active leg. */
  preLegDelayMs: number
  /** Beat 2 — between leg motion start (or zero, on the correct
   *  path) and the moment the answer leg's motion starts.  On the
   *  wrong path this is the consequence leg duration + repaint hold;
   *  on the correct path this is just the repaint hold. */
  cueRepaintHoldMs: number
  /** Beat 3 — held visible after the answer leg ends, before the
   *  CTA tray takes over. */
  doneHoldMs: number
}

const WRONG_CADENCE: ReplayCadence = Object.freeze({
  preLegDelayMs: PRE_CONSEQUENCE_DELAY_MS,
  cueRepaintHoldMs: CUE_REPAINT_HOLD_WRONG_MS,
  doneHoldMs: DONE_HOLD_MS,
})

const CORRECT_CADENCE: ReplayCadence = Object.freeze({
  preLegDelayMs: PRE_BESTREAD_DELAY_MS,
  cueRepaintHoldMs: CUE_REPAINT_HOLD_CORRECT_MS,
  doneHoldMs: DONE_HOLD_MS,
})

export function getReplayCadence(path: 'wrong' | 'correct'): ReplayCadence {
  return path === 'wrong' ? WRONG_CADENCE : CORRECT_CADENCE
}
