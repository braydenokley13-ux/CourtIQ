/**
 * V3 P3 — Decoder explanation system.
 *
 * Single source of truth for the player-facing decoder copy. Every
 * surface that names a decoder pulls from here so a kid sees the same
 * four-line read on the Pathway hub, the Pathway detail page, the
 * progress view, and the onboarding intro.
 *
 * Each entry answers four questions in order:
 *   - meaning : what the decoder names
 *   - watch   : what to look for in the play
 *   - matters : why it changes the outcome
 *   - example : a short, concrete play
 *
 * Tone: kid-readable but not childish. Basketball-first nouns. The same
 * copy gets re-used by the IntroCardsModal, the Pathway info popover,
 * and the progress view.
 */

import type { DecoderTag } from '../pathways/types'

export interface DecoderExplanation {
  tag: DecoderTag
  /** Player-facing display name. */
  label: string
  /** Single-line teaser used on chips / pills (≤ 56 chars). */
  oneLiner: string
  /** What this read actually names. */
  meaning: string
  /** Cue you watch for on the floor. */
  watch: string
  /** Why this read swings the play. */
  matters: string
  /** A concrete short example, in player voice. */
  example: string
}

const EXPLANATIONS: Record<DecoderTag, DecoderExplanation> = {
  BACKDOOR_WINDOW: {
    tag: 'BACKDOOR_WINDOW',
    label: 'Backdoor Window',
    oneLiner: 'Cut behind a defender who blocks the pass.',
    meaning:
      'When the defender denies the pass, the rim is wide open behind him. That is the window.',
    watch:
      'His hand and lead foot. The second they stab into the passing lane, the back-cut is open.',
    matters:
      'A denial turns into a layup. Aggressive defenders feed you the rim the moment you go behind them.',
    example:
      'You curl to the wing, his hand stabs into the lane — you plant, cut to the rim, hands up for the ball.',
  },
  EMPTY_SPACE_CUT: {
    tag: 'EMPTY_SPACE_CUT',
    label: 'Empty-Space Cut',
    oneLiner: 'Fill the spot a helper just left.',
    meaning:
      'Help shifts to the ball — the spot they leave is wide open. The cut goes there.',
    watch:
      'The help defender. The instant he commits to stop the drive, his man and his spot are yours.',
    matters:
      'A tough finish becomes an easy one. The driver gets a clean kick-out window when you cut on time.',
    example:
      'Your guard drives baseline; the corner help-defender steps over. You cut along the baseline with target hands.',
  },
  ADVANTAGE_OR_RESET: {
    tag: 'ADVANTAGE_OR_RESET',
    label: 'Advantage or Reset',
    oneLiner: 'Attack the closeout — or move the ball.',
    meaning:
      'On the catch you decide: take the closeout\'s edge, or move it. The worst answer is to hold the ball.',
    watch:
      'His feet on the closeout. High and out of control = drive. Balanced = pump and swing it.',
    matters:
      'Holding the ball after a closeout kills the offense. Quick decisions keep the defense rotating.',
    example:
      'You catch on the wing. He flies at you with both feet in the air — one hard dribble past, finish or kick.',
  },
  SKIP_THE_ROTATION: {
    tag: 'SKIP_THE_ROTATION',
    label: 'Skip the Rotation',
    oneLiner: 'Beat the help with the cross-court pass.',
    meaning:
      'Two defenders go to the ball — the shooter they left behind is one cross-court pass away.',
    watch:
      'Where the help came from. The defender who left a shooter is the one you skip past.',
    matters:
      'Skips turn a help rotation into an open three. They punish any defense that sends two to the ball.',
    example:
      'You drive middle, two help. The weak-side corner is empty — line drive across the lane to the open shooter.',
  },
  // Pack 2 entries — concise stand-ins so client surfaces (chip,
  // explainer card, train one-liner) render coherent player-facing
  // copy for READ_THE_COVERAGE / HUNT_THE_ADVANTAGE without falling
  // back to founder defaults. Final teaching content for these
  // decoders is owned by the DROP/HUNT pedagogy workstream and may
  // expand these fields. Voice rule matches the founders above.
  READ_THE_COVERAGE: {
    tag: 'READ_THE_COVERAGE',
    label: 'Read the Coverage',
    oneLiner: 'Read his coverage call before you commit.',
    meaning:
      'On a pick & roll the screen defender shows you the call. Decide before you turn the corner.',
    watch:
      'The screen defender — drop, switch, or blitz. His feet name the answer.',
    matters:
      'Reading the coverage early kills the rotation before it forms.',
    example:
      'You come off the screen; the big drops back — no help, you pull up.',
  },
  HUNT_THE_ADVANTAGE: {
    tag: 'HUNT_THE_ADVANTAGE',
    label: 'Hunt the Advantage',
    oneLiner: "First read isn't always the play — chain it.",
    meaning:
      'When help comes to stop the first read, the second window opens. Punish the help that arrived.',
    watch:
      'Where the help came from. That spot is the next attack.',
    matters:
      'Single reads stall once defenses rotate. Chained reads keep the advantage moving.',
    example:
      'Drive draws the corner help — kick to the open shooter on the wing.',
  },
}

export function getDecoderExplanation(tag: DecoderTag): DecoderExplanation {
  return EXPLANATIONS[tag]
}

export function getAllDecoderExplanations(): readonly DecoderExplanation[] {
  return [
    EXPLANATIONS.BACKDOOR_WINDOW,
    EXPLANATIONS.EMPTY_SPACE_CUT,
    EXPLANATIONS.ADVANTAGE_OR_RESET,
    EXPLANATIONS.SKIP_THE_ROTATION,
    EXPLANATIONS.READ_THE_COVERAGE,
    EXPLANATIONS.HUNT_THE_ADVANTAGE,
  ]
}

/**
 * Compact line used as a chip/pill subtitle. Shorter than `meaning`,
 * meant to fit under a label on a card without wrapping more than one
 * line on a phone.
 */
export function getDecoderOneLiner(tag: DecoderTag): string {
  return EXPLANATIONS[tag].oneLiner
}
