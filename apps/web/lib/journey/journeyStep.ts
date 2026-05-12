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
    description: 'We show you a play and explain it.',
  },
  {
    id: 'train',
    label: 'Train',
    description: 'You practice the same play until it clicks.',
  },
  {
    id: 'test',
    label: 'Test',
    description: 'Boss round. No hints this time.',
  },
  {
    id: 'master',
    label: 'Master',
    description: 'All plays mixed together. Can you still call it?',
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
    headline = 'You finished Foundation!'
    sub = 'Replay any chapter to stay sharp.'
  } else if (masteredCount >= 1 && pathwayPct >= 50) {
    current = 'test'
    headline = 'Time to test what you know.'
    sub = 'Boss plays come with no hints. Just you and the play.'
  } else if (input.attemptsCount > 0 || inProgressCount > 0) {
    current = 'train'
    headline = 'Learn one play at a time.'
    sub = pathwayPct > 0 ? `Foundation · ${pathwayPct}% done.` : 'Pick up where you left off.'
  } else {
    current = 'learn'
    headline = 'Watch your first play.'
    sub = 'Two taps and you’re playing.'
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
