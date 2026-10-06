import type { BehaviorRule, DefensiveBehaviorRule, PolicyCondition, ProblemDefinition, TeamAnswer } from '../types'

/** BASELINE DRIVE → DRIFT / WEAKSIDE ROTATION. Pure content: a second, structurally
 * different problem (no screen, no roller) authored on the same primitives as
 * HIGH_PNR_PROBLEM. Role slots keep their ProblemDefinition names, so the mapping is:
 *   ballhandler = wing driver      screener = strong-side big ("dunker", dump-off)
 *   strongCorner = drifting corner weakCorner = weak-side short corner (kick-out)
 *   weakLift = weak wing (skip)    poa = on-ball defender (beaten baseline)
 *   lowMan = weak-side low man     big = defender of the dunker (rim help)
 *   backside = weak-wing defender (X-out)   strongSide = defender of the drifter
 * Threat ids: drive = finish, roll = dump-off to the big, strong = kick to the drift,
 * corner = kick to the weak short corner, lift = skip to the weak wing.
 *
 * TeamAnswer vocabulary (reused, not extended):
 *   tag: false            no help, trust the on-ball defender
 *   tag: true, coverage 'drop'   help from the weak-side low man (sink)
 *   tag: true, coverage 'hedge'  help from the big (stunt at the block; low man drops to the big)
 *   tag: true, coverage 'blitz'  the drifter's own defender sags into the gap (leaves the corner)
 *   rotationTiming 'early'  help starts on the first step of the drive; 'on-pass' waits until the drive has visibly beaten the on-ball defender
 *   backside 'x-out' | 'stay'   weak-wing defender sinks to fill the vacated corner, or stays home */
const passed: PolicyCondition = { kind: 'not', condition: { kind: 'possession', role: 'ballhandler' } }
const driving: PolicyCondition[] = [{ kind: 'possession', role: 'ballhandler' }, { kind: 'coordinate', role: 'ballhandler', axis: 'vz', below: -0.25 }]
const beaten: PolicyCondition = { kind: 'relative', a: 'poa', b: 'ballhandler', axis: 'z', above: 0.35 }

type Assignment = DefensiveBehaviorRule['assignments'][number]
const on = (defender: Assignment['defender'], offense: Assignment['offense'], threat: Assignment['threat'], kind: Assignment['kind'], gap: number, priority = 1): Assignment => ({ defender, offense, threat, kind, gap, priority })

/** One help rule per (helper × timing). Everything is the same DefensiveBehaviorRule shape the P&R uses. */
type HelpSource = 'low-man' | 'big' | 'strong-side'
const COVERAGE_OF: Record<HelpSource, TeamAnswer['coverage']> = { 'low-man': 'drop', big: 'hedge', 'strong-side': 'blitz' }
function helpRule(source: HelpSource, timing: TeamAnswer['rotationTiming'], backside: TeamAnswer['backside']): DefensiveBehaviorRule {
  const trigger: PolicyCondition[] = timing === 'early' ? driving : [...driving, beaten]
  const assignments = source === 'low-man'
    ? [on('lowMan', 'ballhandler', 'drive', 'tag', 1.0, 1.5), on('lowMan', 'weakCorner', 'corner', 'recover', 0.9, 0.35)]
    : source === 'big' ? [on('big', 'ballhandler', 'drive', 'tag', 1.0, 1.5), on('lowMan', 'screener', 'roll', 'closeout', 0.8, 1.2)]
    // The drifter's own defender helps at the ball and leaves the corner: the drift becomes the kick-out.
    : [on('strongSide', 'ballhandler', 'drive', 'tag', 1.0, 1.5)]
  // Weakside fill: the weak-wing defender sinks to the vacated corner during the help (early) or on the kick (late, see x-out rules).
  if (backside === 'x-out' && timing === 'early') assignments.push(on('backside', 'weakCorner', 'corner', 'closeout', 0.9, 1.2))
  return {
    id: `help-${source}-${timing}-${backside}`,
    label: source === 'low-man' ? 'Weak-side low man sinks to help at the block' : source === 'big' ? 'Big stunts at the block; low man drops to the dunker' : 'Strong-side defender sags into the gap; the drifter is left',
    answer: { tag: true, coverage: COVERAGE_OF[source], rotationTiming: timing, backside },
    when: { kind: 'all', conditions: trigger },
    assignments,
  }
}
/** After the ball leaves the driver, an X-out defender fills the corner and the helper takes the next shooter. */
const xOutOnKick = (source: 'low-man' | 'big'): DefensiveBehaviorRule => ({
  id: `x-out-on-kick-${source}`, label: 'X-out on the kick-out: weak wing fills the corner',
  answer: { tag: true, coverage: COVERAGE_OF[source], backside: 'x-out' },
  when: passed,
  assignments: [on('backside', 'weakCorner', 'corner', 'closeout', 0.9, 1.2), on('lowMan', 'weakLift', 'lift', 'closeout', 0.9, 1.2)],
})

export const BASELINE_DRIVE_PROBLEM: ProblemDefinition = {
  id: 'baseline-drive-drift', version: '1.0.0', title: 'Baseline drive → Drift / weakside rotation',
  description: 'The wing beats his man baseline. Who helps, how early, and who fills behind the help decides whether he finishes, dumps to the big, or kicks to the drift and the weak side.', stressAt: 0.9,
  players: [
    { id: 'O1', team: 'offense', role: 'ballhandler', number: 1, height: 1.88, start: { x: 4.6, z: 6.3 } },
    { id: 'O2', team: 'offense', role: 'strong-corner', number: 2, height: 1.9, start: { x: 6.4, z: 3.5 } },
    { id: 'O3', team: 'offense', role: 'weak-corner', number: 3, height: 1.92, start: { x: -3.7, z: 2.4 } },
    { id: 'O4', team: 'offense', role: 'weak-lift', number: 4, height: 1.94, start: { x: -5.6, z: 5.6 } },
    { id: 'O5', team: 'offense', role: 'screener', number: 5, height: 2.02, start: { x: 1.9, z: 2.1 } },
    { id: 'D1', team: 'defense', role: 'poa', number: 1, height: 1.87, start: { x: 4.1, z: 5.5 } },
    { id: 'D2', team: 'defense', role: 'strong-side', number: 2, height: 1.9, start: { x: 5.6, z: 3.4 } },
    { id: 'D3', team: 'defense', role: 'low-man', number: 3, height: 1.94, start: { x: -2.9, z: 2.7 } },
    { id: 'D4', team: 'defense', role: 'backside', number: 4, height: 1.96, start: { x: -4.8, z: 4.9 } },
    { id: 'D5', team: 'defense', role: 'big', number: 5, height: 2.03, start: { x: 1.2, z: 2.9 } },
  ],
  roles: { ballhandler: 'O1', strongCorner: 'O2', weakCorner: 'O3', weakLift: 'O4', screener: 'O5', poa: 'D1', strongSide: 'D2', lowMan: 'D3', backside: 'D4', big: 'D5' },
  actions: [
    { id: 'baseline-drive', kind: 'drive', playerId: 'O1', from: 0.15, target: { x: 4.5, z: 1.9 }, speed: 3.5 },
  ],
  offenseRules: [
    { id: 'corner-drift', label: 'Driver beats his man → strong-side player drifts to the corner', earliest: 0.25, priority: 10,
      when: { kind: 'all', conditions: driving }, motions: [{ role: 'strongCorner', kind: 'relocate', target: { x: 6.6, z: 1.4 }, speed: 2.6 }] },
    { id: 'weak-wing-lift', label: 'Weak-side help commits → weak wing lifts to the skip window', earliest: 0.3, priority: 5,
      when: { kind: 'all', conditions: [...driving, { kind: 'any', conditions: [{ kind: 'responsibility', role: 'lowMan', task: 'tag' }, { kind: 'responsibility', role: 'big', task: 'tag' }] }] },
      motions: [{ role: 'weakLift', kind: 'relocate', target: { x: -5.9, z: 6.3 }, speed: 2.6 }] },
  ] satisfies BehaviorRule[],
  defenseRules: [
    { id: 'home', label: 'Stay home: each defender keeps his own man', assignments: [
      on('poa', 'ballhandler', 'drive', 'contain', 0.9), on('strongSide', 'strongCorner', 'strong', 'guard', 0.9),
      on('lowMan', 'weakCorner', 'corner', 'guard', 0.9), on('backside', 'weakLift', 'lift', 'guard', 0.9), on('big', 'screener', 'roll', 'guard', 0.9),
    ] },
    { id: 'chase-baseline', label: 'On-ball defender is beaten and recovers behind the driver', when: { kind: 'all', conditions: [...driving, beaten] },
      assignments: [on('poa', 'ballhandler', 'drive', 'chase', -0.5)] },
    ...(['low-man', 'big', 'strong-side'] as const).flatMap(source => (['early', 'on-pass'] as const).flatMap(timing => (['x-out', 'stay'] as const).map(backside => helpRule(source, timing, backside)))),
    xOutOnKick('low-man'), xOutOnKick('big'),
  ],
  reads: [
    { id: 'baseline-read', actorId: 'O1', earliest: 0.5, decisionAt: 1.6, trigger: 'penetration', options: ['drive', 'roll', 'strong', 'corner', 'lift'], continuations: { roll: 'big-read', strong: 'drift-read', corner: 'weak-corner-read', lift: 'weak-wing-read' } },
    { id: 'big-read', actorId: 'O5', earliest: 0, trigger: 'catch', options: ['drive', 'strong', 'corner'], continuations: { strong: 'drift-read', corner: 'weak-corner-read' } },
    { id: 'drift-read', actorId: 'O2', earliest: 0, trigger: 'catch', options: ['drive', 'corner', 'lift'], continuations: { corner: 'weak-corner-read', lift: 'weak-wing-read' } },
    { id: 'weak-corner-read', actorId: 'O3', earliest: 0, trigger: 'catch', options: ['drive', 'lift'], continuations: { lift: 'weak-wing-read' } },
    { id: 'weak-wing-read', actorId: 'O4', earliest: 0, trigger: 'catch', options: ['drive', 'corner'], continuations: { corner: 'weak-corner-read' } },
  ],
}

/** Content presets for the answers the coach compares. */
export const BASELINE_DRIVE_ANSWERS: Record<string, Partial<TeamAnswer>> = {
  'low-man-sinks': { tag: true, coverage: 'drop', rotationTiming: 'on-pass', backside: 'x-out' },
  'low-man-sinks-early': { tag: true, coverage: 'drop', rotationTiming: 'early', backside: 'x-out' },
  'big-stunts': { tag: true, coverage: 'hedge', rotationTiming: 'early', backside: 'x-out' },
  'strong-side-sags': { tag: true, coverage: 'blitz', rotationTiming: 'early', backside: 'stay' },
  'no-help': { tag: false, coverage: 'drop', rotationTiming: 'on-pass', backside: 'stay' },
}
