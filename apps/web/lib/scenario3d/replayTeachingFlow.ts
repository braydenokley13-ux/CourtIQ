/**
 * FR-6 — Replay teaching flow simulator.
 *
 * Pure helper that models the phase progression `ScenarioReplayController`
 * runs when the user picks an answer. The JSX controller implements
 * the same logic against React refs and the R3F render loop; this
 * helper takes the same inputs (the scene's wrongDemos list, a
 * choice id, a tick of elapsed wall-clock samples) and emits the
 * deterministic phase sequence the controller would emit, so the
 * test suite can verify the contract without spinning up a Canvas.
 *
 * Architecture lock:
 *   - Pure functions. No React, no THREE.js, no clocks, no scene
 *     reads beyond the explicit inputs.
 *   - Same inputs always produce the same outputs.
 *   - The helper does not mutate its inputs.
 *
 * Reference: §10.2 of `docs/courtiq-3d-film-room-system-plan.md`,
 * `ScenarioReplayController.enterReplayLegFromSnapshot`.
 */

import {
  CUE_REPAINT_HOLD_CORRECT_MS,
  CUE_REPAINT_HOLD_WRONG_MS,
  PRE_CONSEQUENCE_DELAY_MS,
} from './replayTeachingTimeline'

/** Subset of `ReplayPhase` the leg-flow helper emits. */
export type FlowPhase =
  | 'frozen'
  | 'consequence'
  | 'cueRepaint'
  | 'replaying'
  | 'done'

export interface FlowEvent {
  /** Wall-clock time at which the controller emits the phase. */
  atMs: number
  phase: FlowPhase
}

export interface FlowInput {
  /** Wall-clock time at which `pickChoice` fires. */
  pickedAtMs: number
  /** Whether the picked choiceId resolves to a `wrongDemos[]` entry. */
  isWrongChoice: boolean
  /** Total duration of the consequence leg. Ignored on the correct
   *  path. The wrong path holds motion for this long after
   *  PRE_CONSEQUENCE_DELAY_MS. */
  consequenceLegMs: number
  /** Total duration of the answer leg from motion start to end. */
  answerLegMs: number
}

/**
 * Simulates the phase events the JSX controller would emit for a
 * single pick, in chronological order. The output always begins with
 * a `'frozen'` event at `pickedAtMs` (representing the moment the
 * pick fires while the controller is in `frozen`) so callers can
 * verify the entire sequence including the entry condition.
 *
 * Sequences:
 *
 *   wrong:   frozen → consequence → cueRepaint → replaying → done
 *   correct: frozen → cueRepaint  → replaying  → done
 *
 * Phase deltas:
 *
 *   wrong:
 *     frozen      at pickedAtMs
 *     consequence at pickedAtMs + PRE_CONSEQUENCE_DELAY_MS
 *     cueRepaint  at consequence end
 *     replaying   at cueRepaint + CUE_REPAINT_HOLD_WRONG_MS
 *     done        at replaying + answerLegMs
 *
 *   correct:
 *     frozen      at pickedAtMs
 *     cueRepaint  at pickedAtMs (controller flips synchronously)
 *     replaying   at cueRepaint + CUE_REPAINT_HOLD_CORRECT_MS
 *     done        at replaying + answerLegMs
 */
export function simulateReplayFlow(input: FlowInput): FlowEvent[] {
  const events: FlowEvent[] = []
  const { pickedAtMs, isWrongChoice, consequenceLegMs, answerLegMs } = input

  events.push({ atMs: pickedAtMs, phase: 'frozen' })

  let cueRepaintAt: number
  let consequenceAt: number | null = null
  if (isWrongChoice) {
    consequenceAt = pickedAtMs + PRE_CONSEQUENCE_DELAY_MS
    events.push({ atMs: consequenceAt, phase: 'consequence' })
    cueRepaintAt = consequenceAt + consequenceLegMs
    events.push({ atMs: cueRepaintAt, phase: 'cueRepaint' })
  } else {
    cueRepaintAt = pickedAtMs
    events.push({ atMs: cueRepaintAt, phase: 'cueRepaint' })
  }

  const repaintHold = isWrongChoice
    ? CUE_REPAINT_HOLD_WRONG_MS
    : CUE_REPAINT_HOLD_CORRECT_MS
  const replayingAt = cueRepaintAt + repaintHold
  events.push({ atMs: replayingAt, phase: 'replaying' })

  const doneAt = replayingAt + answerLegMs
  events.push({ atMs: doneAt, phase: 'done' })

  return events
}

/**
 * Total wall-clock budget from `pickChoice` firing to the `done`
 * phase, given the same inputs as `simulateReplayFlow`. Useful for
 * the FR-6 success-criteria assertions ("wrong path < 4 s, correct
 * path < 2 s").
 */
export function totalReplayDurationMs(input: FlowInput): number {
  const events = simulateReplayFlow(input)
  const last = events[events.length - 1]!
  return last.atMs - input.pickedAtMs
}

// ---------------------------------------------------------------------------
// Pack 2 (3.1.4) — HUNT chained-freeze pre-pick simulator.
//
// The flow above models the post-pick reaction (consequence → cueRepaint
// → answer-leg). HUNT scenarios add a *pre-pick* chain: beat 1 freeze
// → cognition hold → inter-beat unfreeze (controller emits
// `'consequence'` so the bridge mounts `consequenceOverlays`) → beat 2
// freeze. The user's pick happens at beat 2, after which the post-pick
// flow above plays out unchanged.
//
// `simulateHuntPrePickFlow` returns the deterministic phase sequence
// the controller emits during the pre-pick chain. Same inputs always
// produce the same outputs; no scene, no timeline, no clock dependency.
// ---------------------------------------------------------------------------

export type HuntPrePickPhase = 'frozen-beat-1' | 'consequence' | 'frozen-beat-2'

export interface HuntPrePickEvent {
  /** Wall-clock time at which the controller emits the phase. */
  atMs: number
  phase: HuntPrePickPhase
  /** 0 for beat 1; 1 for beat 2. `consequence` is the inter-beat
   *  unfreeze and carries the *outgoing* beat index (0). */
  beatIndex: 0 | 1
}

export interface HuntPrePickInput {
  /** Wall-clock at scene start (mode='intro' first useFrame). Use the
   *  legacy PRE_DELAY_MS as the pre-roll before motion begins. */
  startedAtMs: number
  /** Authored `freezeAtMs` for beat 1, in ms relative to motion start. */
  firstFreezeAtMs: number
  /** Authored `secondFreezeAtMs` (resolved from `beatSpec.secondBeat`)
   *  for beat 2, in ms relative to motion start. Must be strictly
   *  greater than `firstFreezeAtMs`. */
  secondFreezeAtMs: number
  /** Cognition hold for beat 1, in ms. Resolved from
   *  `scene.timingOverrides` or the module default. */
  cognitionHoldMs: number
}

/**
 * Simulates the controller's pre-pick phase emissions for a HUNT
 * chained scene. Output sequence is always:
 *
 *   `frozen-beat-1` at `startedAtMs + firstFreezeAtMs`
 *   `consequence`   at `startedAtMs + firstFreezeAtMs + cognitionHoldMs`
 *   `frozen-beat-2` at `startedAtMs + firstFreezeAtMs + cognitionHoldMs +
 *                       (secondFreezeAtMs - firstFreezeAtMs)`
 *                 = `startedAtMs + cognitionHoldMs + secondFreezeAtMs`
 *
 * The inter-beat duration is `secondFreezeAtMs - firstFreezeAtMs`
 * (the authored gap between the two freezes); the cognition hold is
 * additive on top because motion is paused for that window.
 */
export function simulateHuntPrePickFlow(input: HuntPrePickInput): HuntPrePickEvent[] {
  const { startedAtMs, firstFreezeAtMs, secondFreezeAtMs, cognitionHoldMs } = input
  const beat1At = startedAtMs + firstFreezeAtMs
  const consequenceAt = beat1At + cognitionHoldMs
  const interBeatDurationMs = secondFreezeAtMs - firstFreezeAtMs
  const beat2At = consequenceAt + interBeatDurationMs
  return [
    { atMs: beat1At, phase: 'frozen-beat-1', beatIndex: 0 },
    { atMs: consequenceAt, phase: 'consequence', beatIndex: 0 },
    { atMs: beat2At, phase: 'frozen-beat-2', beatIndex: 1 },
  ]
}

/**
 * Total wall-clock budget from scene start to beat-2 freeze entry —
 * the moment the user can pick. Single source of truth for HUNT pacing
 * tests so the lower bound (beat-2 freeze) is auditable against the
 * 4000 ms cognition-hold ceiling enforced by `timingOverridesSchema`.
 */
export function huntPrePickDurationMs(input: HuntPrePickInput): number {
  const events = simulateHuntPrePickFlow(input)
  return events[events.length - 1]!.atMs - input.startedAtMs
}
