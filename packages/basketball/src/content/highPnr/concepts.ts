/** Vocabulary. `plain` and `definition` must be understandable with no basketball jargon
 * (enforced by tests). `coach` is the word a coach would say. Names are bare nouns: compose with "the". */
export interface Concept {
  id: string
  plain: string
  coach: string
  /** One or two plain sentences. */
  definition: string
  /** What a coach might add; may use jargon. */
  coachNote?: string
}

export const CONCEPTS: readonly Concept[] = [
  {
    id: 'ball-screen',
    plain: 'ball screen',
    coach: 'ball screen',
    definition: 'A teammate stands in the way of the ball handler’s defender so the ball handler can get free.',
    coachNote: 'High, side, empty, Spain and drag are different versions.',
  },
  {
    id: 'poa',
    plain: 'ball defender',
    coach: 'point-of-attack defender',
    definition: 'The defender guarding the player with the ball.',
    coachNote: 'Often written POA.',
  },
  {
    id: 'screen-defender',
    plain: 'screener’s defender',
    coach: 'screen defender (big)',
    definition: 'The defender guarding the player who sets the screen.',
  },
  {
    id: 'roller',
    plain: 'screener diving to the basket',
    coach: 'roller',
    definition: 'The player who sets the screen, then cuts toward the basket to catch a pass.',
    coachNote: 'Roll, dive and slip are different routes.',
  },
  {
    id: 'pop',
    plain: 'screener stepping out for a shot',
    coach: 'pop',
    definition: 'The player who sets the screen, then moves away from the basket to catch a pass for a shot.',
  },
  {
    id: 'short-roll',
    plain: 'screener catching in the middle of the floor',
    coach: 'short roll',
    definition:
      'The screener stops in the middle of the floor and catches the ball, with defenders in front and behind him.',
    coachNote: 'The catcher becomes a second playmaker.',
  },
  {
    id: 'pocket-pass',
    plain: 'quick pass into the space between defenders',
    coach: 'pocket pass',
    definition: 'A short pass from the ball handler to the screener in the open space between the defenders.',
  },
  {
    id: 'reject',
    plain: 'ball handler refusing the screen',
    coach: 'reject',
    definition: 'The ball handler goes the other way and does not use the screen.',
  },
  {
    id: 'slip',
    plain: 'screener cutting before the screen',
    coach: 'slip',
    definition: 'The screener cuts to the basket before setting the screen, so your defenders have less time.',
  },
  {
    id: 'help',
    plain: 'help',
    coach: 'help',
    definition: 'A defender leaves his own player for a moment to stop someone else.',
  },
  {
    id: 'low-man',
    plain: 'helper under the basket',
    coach: 'low man',
    definition: 'The far-side defender closest to the basket, who is usually the first to help.',
    coachNote: 'A situational job, not a permanent player.',
  },
  {
    id: 'tag',
    plain: 'help step toward the diving screener',
    coach: 'tag',
    definition: 'The helper steps toward the player cutting to the basket and slows him down, then goes back.',
    coachNote: 'Programs differ on a bump, a stunt or a sustained tag.',
  },
  {
    id: 'stunt',
    plain: 'fake step toward the ball',
    coach: 'stunt',
    definition: 'A defender steps toward the ball as if to help, then goes back to his own player.',
  },
  {
    id: 'lift',
    plain: 'far-side shooter who slides up',
    coach: 'lift',
    definition: 'A shooter on the far side moves higher up the court to get open for a pass.',
    coachNote: 'Weak-side lift.',
  },
  {
    id: 'x-out',
    plain: 'far-side defenders swapping players',
    coach: 'X-out',
    definition:
      'When a helper leaves, the next defender covers the first open shooter, and the helper takes the other one.',
    coachNote: 'Exchange and peel chains vary by program.',
  },
  {
    id: 'skip-pass',
    plain: 'long pass across the court',
    coach: 'skip pass',
    definition: 'A pass thrown over the head of a defender to a player on the far side.',
  },
  {
    id: 'closeout',
    plain: 'run out at the shooter',
    coach: 'closeout',
    definition: 'A defender runs at a shooter who just caught the ball, to get a hand up.',
  },
  {
    id: 'rotation',
    plain: 'teammates moving over to cover for each other',
    coach: 'rotation',
    definition: 'When one defender helps, the others shift to cover the player he left.',
  },
  {
    id: 'recover',
    plain: 'get back to your own player',
    coach: 'recover',
    definition: 'After helping, go back to guard your own player.',
  },
  {
    id: 'weak-side',
    plain: 'far side of the court',
    coach: 'weak side',
    definition: 'The half of the court away from the ball.',
  },
  {
    id: 'strong-side',
    plain: 'ball side of the court',
    coach: 'strong side',
    definition: 'The half of the court where the ball is.',
  },
  {
    id: 'corner',
    plain: 'corner',
    coach: 'corner',
    definition:
      'The spot in the corner of the court, where a three-point shot is short but the defender is far from help.',
  },
  {
    id: 'nail',
    plain: 'middle of the free-throw line',
    coach: 'nail',
    definition: 'The spot in the middle of the free-throw line, where a defender can see both the ball and the lane.',
  },
  {
    id: 'drive',
    plain: 'drive to the basket',
    coach: 'drive',
    definition: 'The ball handler dribbles toward the basket.',
    coachNote: 'Penetration.',
  },
  {
    id: 'weak-corner',
    plain: 'far-corner shooter',
    coach: 'weak-side corner',
    definition: 'The player in the corner on the far side from the ball.',
  },
  {
    id: 'strong-corner',
    plain: 'near-corner shooter',
    coach: 'strong-side corner',
    definition: 'The player in the corner on the same side as the ball.',
  },
  {
    id: 'over',
    plain: 'chase over the screen',
    coach: 'go over',
    definition: 'The ball defender goes around the front of the screen.',
  },
  {
    id: 'under',
    plain: 'go under the screen',
    coach: 'go under',
    definition: 'The ball defender goes behind the screen and meets the ball on the other side.',
  },
  {
    id: 'peel',
    plain: 'nearest defender takes the ball handler',
    coach: 'peel',
    definition:
      'When the ball handler gets past his defender, the nearest teammate takes him and the beaten defender takes the teammate’s player.',
  },
]

export function conceptById(id: string): Concept | undefined {
  return CONCEPTS.find((c) => c.id === id)
}
