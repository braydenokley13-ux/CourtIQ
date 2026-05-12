/**
 * The 4-step CourtIQ journey, derived from data the home page already
 * fetches. One source of truth for "where am I" so the home page, the
 * intro cards, and the landing page can all tell the same story.
 *
 *   1. Learn   — see what a read looks like (no reps yet)
 *   2. Train   — run chapters, one decoder at a time
 *   3. Test    — Boss / Final Mix, hints come off
 *   4. Master  — Pathway clean, run it back to stay sharp
 */

export type JourneyStepId = 'learn' | 'train' | 'test' | 'master'

export interface JourneyStep {
  id: JourneyStepId
  /** Short label that sits inside the step pill. */
  label: string
  /** One-line player-voice description. */
  description: string
}

export const JOURNEY_STEPS: readonly JourneyStep[] = [
  {
    id: 'learn',
    label: 'Learn',
    description: 'See what a read looks like.',
  },
  {
    id: 'train',
    label: 'Train',
    description: 'Run reps, one read at a time.',
  },
  {
    id: 'test',
    label: 'Test',
    description: 'Boss check — no hints.',
  },
  {
    id: 'master',
    label: 'Master',
    description: 'Final Mix. Call it yourself.',
  },
] as const

export interface DecoderJourneyInput {
  state: 'new' | 'in_progress' | 'mastered'
  attempts: number
}

export interface PathwayJourneyInput {
  pathwayProgress: number
  pathwayMastered: boolean
}

export interface JourneyState {
  current: JourneyStepId
  /** Where each step sits relative to the player: done / current / next. */
  status: Record<JourneyStepId, 'done' | 'current' | 'next'>
  /** Coaching line tied to the current step. */
  headline: string
  /** Optional sub-line — what concretely happens if they tap. */
  sub: string
}

/**
 * Pick the current journey step.
 *
 * Cold-start (no reps) lands on "Learn" so the player sees the journey
 * before doing anything. Once they have any attempts they jump to
 * "Train". Hitting at least one mastered decoder unlocks "Test" framing.
 * A fully mastered pathway lands on "Master".
 */
export function deriveJourneyState(input: {
  attemptsCount: number
  decoders: readonly DecoderJourneyInput[]
  pathway: PathwayJourneyInput | null
}): JourneyState {
  const masteredCount = input.decoders.filter((d) => d.state === 'mastered').length
  const inProgressCount = input.decoders.filter((d) => d.state === 'in_progress').length
  const pathwayPct = Math.round((input.pathway?.pathwayProgress ?? 0) * 100)

  let current: JourneyStepId
  let headline: string
  let sub: string

  if (input.pathway?.pathwayMastered) {
    current = 'master'
    headline = 'Final Mix unlocked.'
    sub = 'Run a chapter back any time to stay sharp.'
  } else if (masteredCount >= 1 && pathwayPct >= 50) {
    current = 'test'
    headline = "You're ready to be tested."
    sub = 'Boss reps come without the decoder label.'
  } else if (input.attemptsCount > 0 || inProgressCount > 0) {
    current = 'train'
    headline = 'Train one read at a time.'
    sub = pathwayPct > 0 ? `Foundation · ${pathwayPct}% in.` : 'Pick up where you left off.'
  } else {
    current = 'learn'
    headline = 'See how the reads work.'
    sub = 'Two taps to your first rep.'
  }

  const status: Record<JourneyStepId, 'done' | 'current' | 'next'> = {
    learn: 'next',
    train: 'next',
    test: 'next',
    master: 'next',
  }
  const order: JourneyStepId[] = ['learn', 'train', 'test', 'master']
  const idx = order.indexOf(current)
  for (let i = 0; i < order.length; i++) {
    const step = order[i]!
    if (i < idx) status[step] = 'done'
    else if (i === idx) status[step] = 'current'
    else status[step] = 'next'
  }

  return { current, status, headline, sub }
}
