import type { TeamAnswer } from '../types'

/** Defensive answer presets for the high ball screen. `patch` fields are exactly engine TeamAnswer fields.
 * Presets compose: coverage presets set the screen response, helper presets set the weak-side rules.
 * Nothing here is "the right answer"; each preset states what it gives and what it takes. */
export type AnswerKind = 'coverage' | 'ball-defender' | 'helper'
export interface Bilingual { plain: string; coach: string }
export interface AnswerAlias { word: string; note?: string }
export interface AnswerPreset {
  id: string
  kind: AnswerKind
  plainName: string
  coachName: string
  /** Words programs really use. Several are program-specific; see COLLISIONS. */
  aliases: AnswerAlias[]
  plainDescription: string
  coachDescription: string
  gives: Bilingual
  takes: Bilingual
  patch: Partial<TeamAnswer>
  /** 'executed' = the engine's policy reads these fields; 'approximate' = engine only loosely models the idea. */
  fidelity: { level: 'executed' | 'approximate'; note: string }
}

/** bigDepth is metres from the attacked baseline: smaller means the big may sink closer to the basket. */
export const ANSWERS: readonly AnswerPreset[] = [
  { id: 'drop', kind: 'coverage', plainName: 'Keep the big back', coachName: 'Drop',
    aliases: [{ word: 'Drop' }, { word: 'Sink' }, { word: 'Contain' }, { word: 'Back' },
      { word: 'Down', note: 'Also the ICE call on many teams' }, { word: 'Blue', note: 'Also the ICE call on many teams' }],
    plainDescription: 'The screener’s defender stays back near the lane to stop the ball handler and the diving screener.',
    coachDescription: 'Big drops below the screen at a set depth; POA chases over and works back to the ball.',
    gives: { plain: 'Protects the basket and keeps everyone in front of the ball. Few easy layups.', coach: 'Rim protection with no switches; defenders stay in front; roll is contained by one body.' },
    takes: { plain: 'The ball handler gets more room for a shot off the dribble, and a screener who steps out can get an open shot.', coach: 'Concedes pull-up and pop; chaser must recover; pocket pass lands if the big is too deep.' },
    patch: { coverage: 'drop', poa: 'over', bigDepth: 3.2 },
    fidelity: { level: 'executed', note: 'Big targets a depth line; depth only binds once the handler attacks that line.' } },
  { id: 'drop-deep', kind: 'coverage', plainName: 'Keep the big way back', coachName: 'Deep drop',
    aliases: [{ word: 'Sink' }, { word: 'Deep drop' }],
    plainDescription: 'Same as keeping the big back, but he stays closer to the basket.',
    coachDescription: 'Drop with the big sinking to the restricted-area side of the lane.',
    gives: { plain: 'Almost no layups or lobs, and the helpers can stay home on shooters.', coach: 'Maximum rim protection; low man can stay on his corner more often.' },
    takes: { plain: 'The ball handler is open for a shot off the dribble, and a quick pass to the screener in the middle is easier.', coach: 'Free pull-up and pocket/short-roll passes; big starts the contest farther from the shooter.' },
    patch: { coverage: 'drop', poa: 'over', bigDepth: 2.2 },
    fidelity: { level: 'executed', note: 'Depth is a floor on how high the big stands; real programs also vary by handler shooting range.' } },
  { id: 'drop-high', kind: 'coverage', plainName: 'Keep the big a bit higher', coachName: 'High drop',
    aliases: [{ word: 'Level', note: 'Used on some teams for a level between drop and show' }],
    plainDescription: 'The screener’s defender stays back, but closer to the ball.',
    coachDescription: 'Drop with the big holding a higher line, closer to the level of the screen.',
    gives: { plain: 'The ball handler has less room to shoot and the big can step out sooner.', coach: 'Contests pull-ups; shortens big’s path to the handler.' },
    takes: { plain: 'More chance of a pass or drive behind the big toward the basket.', coach: 'Roller catches closer to the rim; more tag or recovery work behind the big.' },
    patch: { coverage: 'drop', poa: 'over', bigDepth: 4.4 },
    fidelity: { level: 'executed', note: 'Depth is a floor on how high the big stands; real programs also vary by handler shooting range.' } },
  { id: 'switch', kind: 'coverage', plainName: 'Switch it', coachName: 'Switch',
    aliases: [{ word: 'Switch' }, { word: 'Swap' }, { word: 'Green', note: 'Program-specific; not a standard call' }],
    plainDescription: 'The two defenders swap players, so nobody has to chase through the screen.',
    coachDescription: 'Screen defenders exchange assignments on contact; low man stays home.',
    gives: { plain: 'No one is chased through the screen, and everyone stays near their new player.', coach: 'Removes the screen; keeps the weak side home; no tag needed.' },
    takes: { plain: 'You may end up with a small player on a big one, or the reverse, near the basket.', coach: 'Size and speed mismatches; post-up or isolation; screener can seal after the switch.' },
    patch: { coverage: 'switch', poa: 'over' },
    fidelity: { level: 'approximate', note: 'Engine transfers responsibility, but does not model size mismatch, post seals or switch-back.' } },
  { id: 'blitz', kind: 'coverage', plainName: 'Trap the ball', coachName: 'Blitz',
    aliases: [{ word: 'Trap' }, { word: 'Double' }, { word: 'Show two' }, { word: 'Red', note: 'Program-specific' }, { word: 'Black', note: 'Program-specific; sometimes another coverage' }],
    plainDescription: 'Both defenders go at the ball handler to force him to give up the ball.',
    coachDescription: 'POA and big double the handler above the screen; the weak side rotates behind.',
    gives: { plain: 'The ball handler cannot shoot or drive, and a rushed pass can turn into a steal.', coach: 'Takes the handler’s options; can force a bad pass or a turnover.' },
    takes: { plain: 'It is four defenders against three, so one pass can leave someone open.', coach: '4-on-3 behind the ball; short roll and skip are open if the rotation is late.' },
    patch: { coverage: 'blitz', poa: 'over', rotationTiming: 'early' },
    fidelity: { level: 'executed', note: 'Big engages the ball; traps are not tuned to handler skill or sideline position.' } },
  { id: 'hedge', kind: 'coverage', plainName: 'Show and recover', coachName: 'Show and recover',
    aliases: [{ word: 'Show' }, { word: 'Flat show', note: 'Big stays flat, stops the ball turning the corner' }, { word: 'Hard hedge', note: 'Bigger, longer commitment than a show' }, { word: 'Hedge' }],
    plainDescription: 'The screener’s defender steps out to stop the ball handler for a moment, then runs back to the screener.',
    coachDescription: 'Big shows at the level of the screen to turn the ball, then recovers to the roller.',
    gives: { plain: 'The ball handler is slowed down, and the big gets back in front of the screener.', coach: 'Slows the handler and re-routes the dribble; buys time for the chaser.' },
    takes: { plain: 'The screener can get a step on the defender who is running back.', coach: 'Roller can slip behind the big; hedge-and-recover is tiring and timing-dependent.' },
    patch: { coverage: 'hedge', poa: 'over', recovery: 'on-pass' },
    fidelity: { level: 'executed', note: 'Show and recover are modelled as one pattern; flat show versus hard hedge is not split.' } },
  { id: 'ice', kind: 'coverage', plainName: 'Push it away from the screen', coachName: 'Ice (force away)',
    aliases: [{ word: 'Ice' }, { word: 'Push' }, { word: 'Down', note: 'Also Drop on many teams' }, { word: 'Blue', note: 'Also Drop on many teams' }, { word: 'Black', note: 'Program-specific' }],
    plainDescription: 'Your ball defender blocks the middle so the ball handler is pushed sideways, away from the screen.',
    coachDescription: 'POA denies the screen and forces the handler toward the sideline; big sits below the screen.',
    gives: { plain: 'The ball handler is pushed to the sideline, where the edge of the court helps you.', coach: 'Turns the screen away from the middle; handler is steered to the sideline.' },
    takes: { plain: 'If the ball handler gets around you toward the middle, the lane is open.', coach: 'Baseline/middle drive if the handler beats the force; screener can still slip.' },
    patch: { coverage: 'ice', poa: 'over' },
    fidelity: { level: 'approximate', note: 'Real ICE is a coverage for screens near the sideline. Here it is a middle-screen approximation, not a sideline clinic.' } },
  { id: 'over', kind: 'ball-defender', plainName: 'Chase over the screen', coachName: 'Go over',
    aliases: [{ word: 'Over' }, { word: 'Fight over' }],
    plainDescription: 'Your ball defender goes around the front of the screen to stay attached to the ball handler.',
    coachDescription: 'POA chases over the top and stays attached to the handler.',
    gives: { plain: 'The ball handler cannot shoot freely off the screen.', coach: 'Contests the pull-up; takes away the shot off the screen.' },
    takes: { plain: 'Your defender can be knocked off the path, giving the ball handler a path to the middle.', coach: 'Risk of getting screened; rejects and re-screens hurt more.' },
    patch: { poa: 'over' },
    fidelity: { level: 'executed', note: 'Chase target path only; contact and screen quality are not modelled in detail.' } },
  { id: 'under', kind: 'ball-defender', plainName: 'Go under the screen', coachName: 'Go under',
    aliases: [{ word: 'Under' }, { word: 'Duck' }],
    plainDescription: 'Your ball defender slides behind the screen and meets the ball handler on the other side.',
    coachDescription: 'POA goes under the screen to stay between handler and rim.',
    gives: { plain: 'No one gets blocked, and the defender stays between the ball and the basket.', coach: 'Avoids the screen; protects the rim side; gives the big a clean drop.' },
    takes: { plain: 'The ball handler gets room for a shot off the screen.', coach: 'Concedes the pull-up three unless the handler is a poor shooter.' },
    patch: { poa: 'under' },
    fidelity: { level: 'executed', note: 'Under is a path choice; shooting ability is not modelled.' } },
  { id: 'deep-tag', kind: 'helper', plainName: 'Helper commits all the way to the screener', coachName: 'Deep tag',
    aliases: [{ word: 'Deep tag' }, { word: 'Full tag' }, { word: 'Sink' }],
    plainDescription: 'The helper under the basket leaves his own player and fully stops the diving screener.',
    coachDescription: 'Low man tags the roller at full commitment, accepting a longer recovery.',
    gives: { plain: 'The diving screener has little room to catch and finish.', coach: 'Roll is heavily discouraged; big can stay higher or stay with the ball.' },
    takes: { plain: 'The helper’s player is wide open, and the next defender must cover more ground.', coach: 'Weak-side shooters get long closeouts; X-out must be early or the lift is open.' },
    patch: { tag: true, tagDepth: 0.95 },
    fidelity: { level: 'executed', note: 'Tag depth is an authored 0 to 1 target, not a biomechanics estimate.' } },
  { id: 'shallow-tag', kind: 'helper', plainName: 'Helper shows only a little', coachName: 'Shallow tag',
    aliases: [{ word: 'Shallow tag' }, { word: 'Stunt' }, { word: 'Early show' }],
    plainDescription: 'The helper steps toward the diving screener but stays close to his own player.',
    coachDescription: 'Low man bumps or shows at 25% commitment, then releases when the pass starts.',
    gives: { plain: 'The helper can get back to his own shooter quickly.', coach: 'Shorter recovery; weak-side pass is easier to defend.' },
    takes: { plain: 'The diving screener has more room to catch near the basket.', coach: 'Roller gets a cleaner window; relies on the big to contain.' },
    patch: { tag: true, tagDepth: 0.25 },
    fidelity: { level: 'executed', note: 'Shallow tag is a lower commitment target, not a separate rule.' } },
  { id: 'no-tag', kind: 'helper', plainName: 'Helper stays home', coachName: 'No tag',
    aliases: [{ word: 'Stay home' }, { word: 'No help' }, { word: 'Stay' }],
    plainDescription: 'The helper under the basket stays on his own player, no matter what the screener does.',
    coachDescription: 'Low man does not tag; the screen defender must handle the roller alone.',
    gives: { plain: 'No far-side shooter is ever left open by a helper.', coach: 'Preserves weak-side shooter coverage; rotations are minimal.' },
    takes: { plain: 'If the diving screener gets a step, nobody can help him except the screener’s defender.', coach: 'Roller depends entirely on the screen defender; lob and short roll are riskier.' },
    patch: { tag: false },
    fidelity: { level: 'executed', note: 'Disables the tag obligation.' } },
  { id: 'x-out-swap', kind: 'helper', plainName: 'Far-side defenders swap players', coachName: 'X-out',
    aliases: [{ word: 'X-out' }, { word: 'Cross' }, { word: 'Swap behind' }, { word: 'Help the helper' }],
    plainDescription: 'When the helper leaves, the next defender covers the first open shooter and the helper takes the other one.',
    coachDescription: 'Backside defender takes the first pass; low man recovers to the weak-side lift.',
    gives: { plain: 'The closest defender covers the first pass, so the open shooter is usually reached.', coach: 'First closeout is shorter; keeps the weak-side pair split on a pass.' },
    takes: { plain: 'The defender who swaps must cover someone new, and long passes are harder to guard.', coach: 'Skip pass and lift can beat the exchange; communication-heavy.' },
    patch: { backside: 'x-out' },
    fidelity: { level: 'executed', note: 'Two-player exchange only. Three-player peel/rotation chains are not modelled.' } },
  { id: 'stay-with-shooter', kind: 'helper', plainName: 'Far-side defender stays with his shooter', coachName: 'Stay (no X-out)',
    aliases: [{ word: 'Stay' }, { word: 'Stay on the lift' }, { word: 'No X' }],
    plainDescription: 'The far-side defender stays on his own shooter even when the helper leaves the corner.',
    coachDescription: 'Backside defender stays attached to the lift; the low man owns the corner closeout.',
    gives: { plain: 'Nobody has to switch players, and the shooter on the wing is never left alone.', coach: 'Lift is covered; fewer assignments change hands.' },
    takes: { plain: 'The helper may need to run a long way to the corner shooter.', coach: 'Longer low-man closeout; corner skip is the cost.' },
    patch: { backside: 'stay' },
    fidelity: { level: 'executed', note: 'Keeps the high weak-side defender with the lift through the tag.' } },
  { id: 'early-rotation', kind: 'helper', plainName: 'Swap before the pass', coachName: 'Early rotation',
    aliases: [{ word: 'Early X' }, { word: 'Anticipate' }, { word: 'Rotate early' }],
    plainDescription: 'The far-side defenders start moving as soon as the helper commits, not when the pass is thrown.',
    coachDescription: 'Rotation begins on the tag, not on the pass.',
    gives: { plain: 'You are already moving when the pass arrives, so the open shooter is reached sooner.', coach: 'Shorter closeouts; beats the lift or skip if the tag is deep.' },
    takes: { plain: 'If the offense does something different, you are moving the wrong way.', coach: 'Vulnerable to a pump, stop or counter; only works with a committed tag.' },
    patch: { rotationTiming: 'early' },
    fidelity: { level: 'executed', note: 'Engine only starts the early exchange when tag depth is above 0.45.' } },
  { id: 'tag-until-secured', kind: 'helper', plainName: 'Helper stays until the big is back', coachName: 'Tag until the roller is secured',
    aliases: [{ word: 'Stay until' }, { word: 'Hold the tag' }],
    plainDescription: 'The helper stays with the diving screener until his big is back, then returns to his own player.',
    coachDescription: 'Low man holds the tag until the big is in contest range, then recovers.',
    gives: { plain: 'The screener is covered until the big can take over.', coach: 'Roller is protected through the recovery; fewer lob windows.' },
    takes: { plain: 'The helper stays away from his own shooter longer.', coach: 'Longer corner exposure; pairs with Stay, not X-out.' },
    patch: { tag: true, recovery: 'roller-secured', backside: 'stay' },
    fidelity: { level: 'executed', note: 'Recovery fires when the big is within contest distance of the roller.' } },
]

/** Words that mean different things on different teams. Show this before using any alias. */
export interface AliasCollision { word: string; meanings: { answerId: string; note: string }[] }
export const COLLISIONS: readonly AliasCollision[] = [
  { word: 'Down', meanings: [{ answerId: 'drop', note: 'big drops (some teams)' }, { answerId: 'ice', note: 'force the ball down the sideline (many teams)' }] },
  { word: 'Blue', meanings: [{ answerId: 'drop', note: 'drop (some teams)' }, { answerId: 'ice', note: 'ICE or push (many teams)' }] },
  { word: 'Black', meanings: [{ answerId: 'blitz', note: 'trap (some teams)' }, { answerId: 'ice', note: 'ICE (some teams)' }] },
  { word: 'Sink', meanings: [{ answerId: 'drop', note: 'big sinks into the lane' }, { answerId: 'deep-tag', note: 'helper sinks to the roller' }] },
  { word: 'Stay', meanings: [{ answerId: 'no-tag', note: 'helper stays home' }, { answerId: 'stay-with-shooter', note: 'far-side defender stays with the lift' }] },
]

export function answerById(id: string): AnswerPreset | undefined { return ANSWERS.find(a => a.id === id) }

/** Merge presets onto a base answer; later ids win. Unknown ids are ignored. */
export function applyAnswers(base: TeamAnswer, ids: readonly string[]): TeamAnswer {
  return ids.reduce<TeamAnswer>((acc, id) => ({ ...acc, ...(answerById(id)?.patch ?? {}) }), { ...base })
}

/** Coverages whose engine behavior is distinct and verified by the coverage
 * gate (lib/defense-lab/coverageGate.test.ts). Anything else stays hidden in
 * the product until it is honestly modeled. Hedge currently reads like ICE. */
export const MODELED_COVERAGES = ['drop', 'switch', 'blitz', 'ice'] as const
export function isOfferable(answerId: string): boolean {
  const a = ANSWERS.find(x => x.id === answerId)
  if (!a) return false
  return a.kind !== 'coverage' || (MODELED_COVERAGES as readonly string[]).includes(a.patch.coverage ?? '')
}
