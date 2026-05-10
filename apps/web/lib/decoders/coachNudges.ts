/**
 * V3 P10 P5 — coach attention nudges.
 *
 * Pure helpers that map each decoder tag to a short "watch this" cue
 * surfaced under the canvas during the pre-freeze WATCH phase. The
 * cue points at WHERE TO LOOK, never the action — the read is still
 * something the player has to make. Examples:
 *
 *   "Eyes on his hand."         (BACKDOOR_WINDOW)
 *   "Eyes on the help defender." (EMPTY_SPACE_CUT)
 *
 * Surfacing rules (handled by the caller):
 *   - decoder scenario only (legacy 2D fixtures get nothing)
 *   - first scenario of the session only — keeps the nudge from being
 *     repetitive on a 5-pack
 *   - hidden on first-rep cold-start (chrome is intentionally stripped)
 *   - hidden in boss / mixed challenge modes (those are tests, not
 *     guided practice)
 *   - fades the moment the scene reaches its freeze marker — the read
 *     is the player's now
 *
 * Tone: short. No verbs about what to do. Just where to look.
 */

import type { DecoderTag } from '../pathways/types'

const NUDGES: Record<DecoderTag, string> = {
  BACKDOOR_WINDOW: 'Eyes on his hand.',
  EMPTY_SPACE_CUT: 'Eyes on the help defender.',
  ADVANTAGE_OR_RESET: 'Watch his feet on the closeout.',
  SKIP_THE_ROTATION: 'Watch where the help comes from.',
  READ_THE_COVERAGE: 'Eyes on the screen defender.',
  HUNT_THE_ADVANTAGE: "Eyes on the help defender's hips.",
}

export function getCoachNudge(tag: DecoderTag): string {
  return NUDGES[tag]
}

export interface CoachNudgeVisibility {
  decoderTag: DecoderTag | null
  scenarioIndex: number
  isFirstRep: boolean
  isChallengeMode: boolean
  /** True once the scene has reached its freeze marker. The nudge
   *  fades on freeze so the read is the player's. */
  frozen: boolean
}

export function shouldShowCoachNudge(input: CoachNudgeVisibility): boolean {
  if (!input.decoderTag) return false
  if (input.isFirstRep) return false
  if (input.isChallengeMode) return false
  if (input.frozen) return false
  return input.scenarioIndex === 0
}
