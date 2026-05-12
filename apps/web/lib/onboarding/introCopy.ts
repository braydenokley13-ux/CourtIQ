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
 *   3. The journey — Learn → Train → Test (Boss) → Master (Final Mix).
 *   4. Start.
 */
export const INTRO_CARDS: readonly IntroCard[] = [
  {
    id: 'welcome',
    eyebrow: 'CourtIQ',
    title: 'Watch the play. Pick what to do.',
    body:
      "Basketball IQ is just knowing what to do next, fast. We teach it like a video game — one play at a time.",
    bullets: [
      'A real play freezes right before the big choice.',
      'You pick. We show you if you were right.',
    ],
  },
  {
    id: 'decoders',
    eyebrow: 'The four plays',
    title: "You'll see these in every game.",
    body:
      'You learn one at a time so it sticks before the next one.',
    bullets: [
      'Backdoor Window · cut behind your defender.',
      'Empty-Space Cut · fill the empty spot on the floor.',
      'Advantage or Reset · attack, or pass it back.',
      'Skip the Rotation · throw it across the court.',
    ],
  },
  {
    id: 'pathways',
    eyebrow: 'The journey',
    title: '4 steps. Same for every play.',
    body:
      "Here's what every play looks like on CourtIQ:",
    bullets: [
      '1. Learn · we show you the play and explain it.',
      '2. Train · you try it. We tell you if you got it.',
      '3. Test · no more hints. This is the Boss round.',
      '4. Master · all the plays mixed up — the Final Mix.',
    ],
  },
  {
    id: 'start',
    eyebrow: 'Ready',
    title: 'Run your first play.',
    body:
      "Foundation is where everyone starts. About 25 minutes total. Your first play is two taps away.",
    ctaLabel: 'Start Foundation',
  },
] as const

/** Player-voice headline shown on the home page when the intro hasn't
 *  been seen yet. Coaching-voice; not a "tutorial" pitch. */
export const INTRO_HOME_BANNER = {
  eyebrow: 'New here',
  title: 'See how CourtIQ works.',
  body: '4 steps. Takes 30 seconds. Then we play.',
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
