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
