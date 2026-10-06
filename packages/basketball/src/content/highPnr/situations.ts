/** Entry-screen problem families. Plain text first; `coachTitle` is the same idea in coaching words.
 * Only what the engine can run is 'ready'. Everything else is honest about being a preview. */
export type SituationStatus = 'ready' | 'preview'

export interface SubSituation {
  id: string
  plainTitle: string
  coachTitle: string
  plainDescription: string
  status: SituationStatus
  /** Engine problem installed for this sub-situation, only when status is 'ready'. */
  engineProblemId?: string
}
export interface Situation {
  id: string
  plainTitle: string
  coachTitle: string
  plainDescription: string
  status: SituationStatus
  subSituations?: SubSituation[]
  /** For "just explore": where the learner lands today. */
  fallbackSubSituationId?: string
}

export const ENGINE_PROBLEM_ID = 'high-pnr-weakside-lift'

export const SITUATIONS: readonly Situation[] = [
  {
    id: 'ball-screens',
    plainTitle: 'Ball screens',
    coachTitle: 'Ball screen defense (pick-and-roll)',
    plainDescription:
      'A teammate blocks your ball defender so the ball handler can get free. How do your five defenders share the job?',
    status: 'ready',
    subSituations: [
      {
        id: 'high-pnr-middle',
        plainTitle: 'Screen in the middle, up high',
        coachTitle: 'High middle P&R',
        plainDescription:
          'The screen is set near the top of the key. The far side can see everything and help from there.',
        status: 'ready',
        engineProblemId: ENGINE_PROBLEM_ID,
      },
      {
        id: 'side-pnr',
        plainTitle: 'Screen on the side of the court',
        coachTitle: 'Side P&R',
        plainDescription:
          'The screen is near the sideline, so the sideline is a second defender and the lane is on one side.',
        status: 'preview',
      },
      {
        id: 'empty-pnr',
        plainTitle: 'Screen with one side cleared out',
        coachTitle: 'Empty-side P&R',
        plainDescription:
          'Nobody is waiting on the far side, so help has nowhere to hide and the ball has fewer places to go.',
        status: 'preview',
      },
      {
        id: 'spain',
        plainTitle: 'Screen plus a second screen on the big',
        coachTitle: 'Spain P&R',
        plainDescription:
          'A third player blocks the screener’s defender, so the helper in the lane is under more pressure.',
        status: 'preview',
      },
      {
        id: 'drag',
        plainTitle: 'Quick screen while running up the floor',
        coachTitle: 'Drag screen',
        plainDescription:
          'The screen comes early, before your defense is set, with the screener trailing behind the ball.',
        status: 'preview',
      },
    ],
  },
  {
    id: 'driving-help',
    plainTitle: 'Stopping drives',
    coachTitle: 'Drive and help (gap, drift, rotations)',
    plainDescription: 'A player beats his man toward the basket. Who steps in, and who covers for them?',
    status: 'preview',
  },
  {
    id: 'off-ball-screens',
    plainTitle: 'Screens away from the ball',
    coachTitle: 'Off-ball screens (down, flare, pin-down)',
    plainDescription: 'A shooter runs off a screen to get open without the ball. How do you stay with him?',
    status: 'preview',
  },
  {
    id: 'post-defense',
    plainTitle: 'Defending a big near the basket',
    coachTitle: 'Post defense (front, three-quarter, double)',
    plainDescription: 'The ball goes inside to a big player. Do you guard him alone or send help?',
    status: 'preview',
  },
  {
    id: 'transition',
    plainTitle: 'Getting back on defense',
    coachTitle: 'Transition defense',
    plainDescription:
      'You just lost the ball and the other team is running. Who stops the ball and who protects the basket?',
    status: 'preview',
  },
  {
    id: 'zone',
    plainTitle: 'Guarding spots, not players',
    coachTitle: 'Zone defense',
    plainDescription: 'Each defender owns an area of the floor instead of one player.',
    status: 'preview',
  },
  {
    id: 'explore',
    plainTitle: 'Just let me explore',
    coachTitle: 'Open lab',
    plainDescription: 'No question to answer yet. Start with the one situation that works today and poke at it.',
    status: 'preview',
    fallbackSubSituationId: 'high-pnr-middle',
  },
]

export function situationById(id: string): Situation | undefined {
  return SITUATIONS.find((s) => s.id === id)
}
export function readySubSituations(): SubSituation[] {
  return SITUATIONS.flatMap((s) => s.subSituations ?? []).filter((s) => s.status === 'ready')
}
