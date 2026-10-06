/** "What are you trying to stop?" Each goal lists answers that serve it, best fit first, with an honest plain why.
 * A goal never says one answer is correct; it says what each choice tends to protect. */
export interface GoalAnswer {
  answerId: string
  why: string
}
export interface Goal {
  id: string
  plain: string
  coach: string
  /** Plain one-line explanation of what the goal means. */
  meaning: string
  answers: GoalAnswer[]
  /** 'custom' goals let the coach build their own rules instead of picking a preset. */
  mode?: 'presets' | 'custom'
}

export const GOALS: readonly Goal[] = [
  {
    id: 'keep-away-from-basket',
    plain: 'Keep them away from the basket',
    coach: 'Protect the rim',
    meaning: 'No layups, no dunks, no passes to a player under the basket.',
    answers: [
      { answerId: 'drop-deep', why: 'The big stays closest to the basket, so there are few easy shots inside.' },
      { answerId: 'deep-tag', why: 'A helper meets the diving screener early, so the basket is covered twice.' },
      { answerId: 'drop', why: 'The big stays between the ball and the basket without going all the way back.' },
      {
        answerId: 'switch',
        why: 'Nobody is left behind the screen, though the new matchup can be a problem near the basket.',
      },
    ],
  },
  {
    id: 'stay-with-shooters',
    plain: 'Stay with the shooters',
    coach: 'Protect the three-point line',
    meaning: 'Never leave a good shooter alone, even if it costs help at the basket.',
    answers: [
      { answerId: 'stay-with-shooter', why: 'The far-side defender never leaves his shooter.' },
      { answerId: 'shallow-tag', why: 'The helper only steps a little toward the screener and gets back fast.' },
      { answerId: 'no-tag', why: 'Nobody leaves his own player, but the screener’s defender is on his own.' },
      { answerId: 'switch', why: 'Every defender stays on a player the whole time.' },
    ],
  },
  {
    id: 'take-away-roller',
    plain: 'Take away the screener cutting to the basket',
    coach: 'Stop the roller',
    meaning: 'The player who sets the screen and dives to the basket gets nothing.',
    answers: [
      { answerId: 'hedge', why: 'The big stays close to the screener the whole time.' },
      { answerId: 'blitz', why: 'The screener catches the ball in a crowd, but you give up numbers behind.' },
      { answerId: 'deep-tag', why: 'A second defender is already near the screener.' },
      { answerId: 'switch', why: 'One defender is on the screener right away.' },
    ],
  },
  {
    id: 'ball-out-of-hands',
    plain: 'Get the ball out of the guard’s hands',
    coach: 'Take the handler out of the play',
    meaning: 'Make someone else beat you instead of the best ball handler.',
    answers: [
      { answerId: 'blitz', why: 'Two defenders go at the ball handler and force a pass.' },
      { answerId: 'hedge', why: 'The big slows the ball handler for a moment, then returns to the screener.' },
    ],
  },
  {
    id: 'force-sideways',
    plain: 'Force it sideways, away from the middle',
    coach: 'Direct the ball to the sideline',
    meaning: 'Keep the ball handler on the edge of the court, where help is easier.',
    answers: [
      { answerId: 'ice', why: 'The ball defender blocks the middle, so the ball handler goes sideways.' },
      { answerId: 'hedge', why: 'The big steps out and turns the ball handler away from the middle.' },
    ],
  },
  {
    id: 'show-options',
    plain: 'Show me my options',
    coach: 'Compare coverages',
    meaning: 'Try the common choices side by side and see what each one gives up.',
    answers: [
      { answerId: 'drop', why: 'Protects the basket, gives up the shot off the dribble.' },
      { answerId: 'switch', why: 'Nobody chases, but the new matchup may be a problem.' },
      { answerId: 'blitz', why: 'Takes the ball away, but you are a defender short behind it.' },
      { answerId: 'hedge', why: 'Slows the ball handler, but the big has to run back.' },
      { answerId: 'ice', why: 'Pushes the ball to the side, but the middle is open if you lose him.' },
    ],
  },
  {
    id: 'know-my-coverage',
    plain: 'I already know my coverage',
    coach: 'Build my coverage',
    meaning: 'Set each rule yourself and use your own words for it.',
    mode: 'custom',
    answers: [],
  },
]

export function goalById(id: string): Goal | undefined {
  return GOALS.find((g) => g.id === id)
}
