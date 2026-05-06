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
      'A backdoor window is the open space behind your defender when he steps up to deny the pass.',
    watch:
      'Watch his hand and lead foot. If they cut off the passing lane, the lane to the rim just opened behind him.',
    matters:
      'Backdoors turn a denied pass into a layup. They beat aggressive overplays and reset the offense.',
    example:
      'You curl to the wing, your defender shoots his hand into the lane — you plant, cut to the rim, ask for the ball with your hands up.',
  },
  EMPTY_SPACE_CUT: {
    tag: 'EMPTY_SPACE_CUT',
    label: 'Empty-Space Cut',
    oneLiner: 'Fill the spot a helper just left.',
    meaning:
      'An empty-space cut is a baseline (or 45) cut into the area a help defender just abandoned to stop the ball.',
    watch:
      'Watch the help defender. Once he steps in to stop the drive, his man — and his spot — are wide open.',
    matters:
      'Cutting into empty space gives the driver a clean kick-out and turns a tough finish into an easy two.',
    example:
      'Your teammate drives baseline; the corner help-defender steps over. You cut along the baseline and show target hands.',
  },
  ADVANTAGE_OR_RESET: {
    tag: 'ADVANTAGE_OR_RESET',
    label: 'Advantage or Reset',
    oneLiner: 'Attack the closeout — or move the ball.',
    meaning:
      'Advantage or reset is the read on the catch: either you have an edge to take, or you don\'t — and you swing it.',
    watch:
      'Watch the closeout\'s feet. High and out of control = drive. Low and balanced = pump and swing.',
    matters:
      'Holding the ball after a closeout kills the offense. Deciding fast keeps the defense rotating.',
    example:
      'You catch on the wing. Defender flies at you with both feet in the air — one hard dribble past him, finish or kick.',
  },
  SKIP_THE_ROTATION: {
    tag: 'SKIP_THE_ROTATION',
    label: 'Skip the Rotation',
    oneLiner: 'Beat the help with the cross-court pass.',
    meaning:
      'A skip is the cross-court pass that beats a rotating defense — you skip a defender to find the open shooter.',
    watch:
      'Watch where the help came from. The defender who left a shooter is the one you skip past.',
    matters:
      'Skips turn a help-rotation into an open three. They punish defenses that send two to the ball.',
    example:
      'You drive middle, two help. You see the weak-side corner is empty — line drive across the lane to the open shooter.',
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
