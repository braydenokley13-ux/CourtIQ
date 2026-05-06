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
 * The four-card explainer + a final "start" card. Each card answers a
 * single question a brand-new player might have:
 *   1. What is CourtIQ?
 *   2. What is a decoder?
 *   3. What is a Pathway?
 *   4. What is the Film Room (a rep)?
 *   5. Start your Pathway.
 *
 * The `start` card carries the CTA so the surface always ends on an
 * action, not on more reading.
 */
export const INTRO_CARDS: readonly IntroCard[] = [
  {
    id: 'welcome',
    eyebrow: 'Welcome to CourtIQ',
    title: 'Train the reads, not just the reps.',
    body:
      'Basketball IQ is the speed at which you read a play and pick the right next move. CourtIQ trains it the same way you train a jumper — one rep at a time.',
    bullets: [
      'Watch a real play freeze at the decision moment.',
      'Pick the read. See what would have happened.',
      'Your IQ score moves with every rep.',
    ],
  },
  {
    id: 'decoders',
    eyebrow: 'Decoders',
    title: 'Four reads. Recognize the pattern, win the play.',
    body:
      'A decoder is a pattern you learn to recognize. CourtIQ starts with four — the reads that show up on every possession.',
    bullets: [
      'Backdoor Window — cut behind a defender who blocks the pass.',
      'Empty-Space Cut — fill the spot a helper just left.',
      'Advantage or Reset — attack the closeout or move the ball.',
      'Skip the Rotation — beat the help with the cross-court pass.',
    ],
  },
  {
    id: 'pathways',
    eyebrow: 'Pathways',
    title: 'Your training route.',
    body:
      'A Pathway is a chapter-by-chapter map. Each chapter teaches one decoder, ends with a Boss Challenge, and stacks toward the Final Mix — where you read plays without the decoder label on screen.',
    bullets: [
      'Start with Complete IQ Foundation.',
      'Each chapter = one decoder, mastered.',
      'Boss & Final Mix = no hints, just reads.',
    ],
  },
  {
    id: 'film-room',
    eyebrow: 'Film Room',
    title: 'One rep. One read. Real basketball.',
    body:
      'Every rep plays out on a 3D court. The clip freezes at the read. You pick. The play resolves the way it would in a real game.',
    bullets: [
      'Watch the play, freeze, decide.',
      'Right read = mastery moves up.',
      'Wrong read = see the consequence, run it back.',
    ],
  },
  {
    id: 'start',
    eyebrow: 'Ready',
    title: 'Start with Foundation.',
    body:
      'Foundation builds your reads from the ground up — about 25 minutes of training spread across four chapters and a Final Mix capstone.',
    ctaLabel: 'Start Foundation',
  },
] as const

/** Player-voice headline shown on the home page when the intro hasn't
 *  been seen yet. Kept short — the cards do the heavy lifting. */
export const INTRO_HOME_BANNER = {
  eyebrow: 'New here',
  title: '60 seconds to learn how CourtIQ works.',
  body: 'Quick walkthrough — what it is, what you train, what to do first.',
  ctaLabel: 'Show me',
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
