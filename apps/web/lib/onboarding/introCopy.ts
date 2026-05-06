/**
 * V3 P2 — first-time onboarding copy.
 *
 * Pure helpers for the four-card "Welcome to CourtIQ" intro that runs
 * once on /home for a brand-new player (attemptsCount === 0) and can
 * be re-opened from the home menu. Keeping the strings here means the
 * tests can assert on them without mounting React, and the same copy
 * can be re-used by a marketing landing page later.
 *
 * Tone: premium, basketball-first, no cheese. One idea per card.
 */

export type IntroCardId =
  | 'welcome'
  | 'decoders'
  | 'pathways'
  | 'film-room'
  | 'start'

export interface IntroCard {
  id: IntroCardId
  eyebrow: string
  title: string
  body: string
  /** Short bullet list — keep to 3 max so a card never becomes a wall. */
  bullets?: readonly string[]
  /** Player-voice CTA label — only set on the final card. */
  ctaLabel?: string
}

/**
 * Three short cards + a "start" card. Each card lands ONE idea so the
 * walkthrough teaches by orientation, not by reading. The user can
 * jump into a rep from card 1 — concepts get revealed in the rep
 * itself, not pre-loaded as a tutorial.
 *
 *   1. What CourtIQ is — watch, freeze, pick.
 *   2. What you train — the four reads, named.
 *   3. How you progress — Pathway → Boss → Final Mix.
 *   4. Start.
 */
export const INTRO_CARDS: readonly IntroCard[] = [
  {
    id: 'welcome',
    eyebrow: 'CourtIQ',
    title: 'Watch the play. Pick the read.',
    body:
      'Basketball IQ is how fast you see what should happen next. We train it the way you train a jumper — one rep at a time.',
    bullets: [
      'Real play freezes at the read.',
      'You pick. You see what would have happened.',
    ],
  },
  {
    id: 'decoders',
    eyebrow: 'The four reads',
    title: 'Recognize the pattern. Win the play.',
    body:
      'CourtIQ starts with the four reads that show up every possession.',
    bullets: [
      'Backdoor Window · cut behind the defender.',
      'Empty-Space Cut · fill the spot help just left.',
      'Advantage or Reset · attack the closeout or move it.',
      'Skip the Rotation · cross-court past the help.',
    ],
  },
  {
    id: 'pathways',
    eyebrow: 'Your route',
    title: 'Pathway → Boss → Final Mix.',
    body:
      'A Pathway is a chapter map. Each chapter teaches one read, ends with a Boss, and stacks toward the Final Mix — where you read plays with no labels on screen.',
  },
  {
    id: 'start',
    eyebrow: 'Ready',
    title: 'Run your first rep.',
    body:
      'Foundation is your starting Pathway. About 25 minutes total. The first read is two taps away.',
    ctaLabel: 'Start Foundation',
  },
] as const

/** Player-voice headline shown on the home page when the intro hasn't
 *  been seen yet. Coaching-voice; not a "tutorial" pitch. */
export const INTRO_HOME_BANNER = {
  eyebrow: 'New here',
  title: 'See how CourtIQ trains your reads.',
  body: '30 seconds. Then your first rep.',
  ctaLabel: 'Watch',
  skipLabel: 'Skip',
} as const

/** Header copy for the modal/sheet that wraps the cards. */
export const INTRO_FRAME_COPY = {
  closeLabel: 'Skip walkthrough',
  prevLabel: 'Back',
  nextLabel: 'Next',
  finalLabel: 'Got it',
} as const

export function getIntroCard(id: IntroCardId): IntroCard {
  const found = INTRO_CARDS.find((c) => c.id === id)
  if (!found) {
    throw new Error(`Unknown intro card id: ${id}`)
  }
  return found
}

/** Total cards — exported so a stepper can render dots without
 *  importing the full array. */
export const INTRO_CARD_COUNT = INTRO_CARDS.length
