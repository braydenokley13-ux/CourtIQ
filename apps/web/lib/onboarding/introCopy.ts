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
    title: 'Watch the play. Pick the read.',
    body:
      'Basketball IQ is how fast you see what should happen next. We train it like a jumper — one rep at a time.',
    bullets: [
      'A real play freezes at the read.',
      'You pick what to do. We show you what would have happened.',
    ],
  },
  {
    id: 'decoders',
    eyebrow: 'The four reads',
    title: 'These show up every possession.',
    body:
      'You train one at a time so each read becomes second nature before the next.',
    bullets: [
      'Backdoor Window · cut behind the defender.',
      'Empty-Space Cut · fill the spot help just left.',
      'Advantage or Reset · attack the closeout or move it.',
      'Skip the Rotation · cross-court past the help.',
    ],
  },
  {
    id: 'pathways',
    eyebrow: 'The journey',
    title: 'Four steps. Same for every read.',
    body:
      "Here's exactly what your day-to-day looks like on CourtIQ:",
    bullets: [
      '1. Learn the read · short video breakdown.',
      '2. Train it · run reps until it clicks.',
      '3. Test it · the Boss removes the hints.',
      '4. Master it · the Final Mix takes the labels off completely.',
    ],
  },
  {
    id: 'start',
    eyebrow: 'Ready',
    title: 'Run your first rep.',
    body:
      "Foundation is your starting Pathway. About 25 min total — the first read is two taps away.",
    ctaLabel: 'Start Foundation',
  },
] as const

/** Player-voice headline shown on the home page when the intro hasn't
 *  been seen yet. Coaching-voice; not a "tutorial" pitch. */
export const INTRO_HOME_BANNER = {
  eyebrow: 'New here',
  title: 'See how CourtIQ trains your reads.',
  body: '4 steps, 30 seconds. Then your first rep.',
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
