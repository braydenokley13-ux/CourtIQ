import type { CoachRule, DefensiveBehaviorRule, LabConfig, PolicyCondition, ProblemDefinition, TeamAnswer } from './types'

export const COACH_RULE_BOUNDS = { depth: [2.5, 7], rise: [0.5, 3] } as const

/** Sentence composition is explicit. It is not free-text inference. */
export function coachRuleSentence(rule: CoachRule): string {
  return rule.kind === 'roller-depth'
    ? `After the screen, when the roller gets below ${rule.depth.toFixed(1)} m from the baseline, ${rule.response === 'low-man-tags' ? 'the low man tags and the big contains the ball' : 'the big takes the roller and the low man returns to the corner'}.`
    : `After the screen, when the weakside lift rises ${rule.rise.toFixed(1)} m during the roll, ${rule.response === 'stay-with-lift' ? 'the backside stays with the lift' : 'X-out: backside takes corner, low man takes lift, big takes roller'}.`
}

function checkRules(rules: CoachRule[]): void {
  if (!Array.isArray(rules) || rules.length > 2 || new Set(rules.map(rule => rule?.kind)).size !== rules.length) throw new Error('Use at most one coach rule for each supported observation.')
  for (const rule of rules) {
    const valid = rule?.kind === 'roller-depth'
      ? Number.isFinite(rule.depth) && rule.depth >= COACH_RULE_BOUNDS.depth[0] && rule.depth <= COACH_RULE_BOUNDS.depth[1] && ['low-man-tags', 'big-recovers'].includes(rule.response)
      : rule?.kind === 'lift-rise' && Number.isFinite(rule.rise) && rule.rise >= COACH_RULE_BOUNDS.rise[0] && rule.rise <= COACH_RULE_BOUNDS.rise[1] && ['stay-with-lift', 'x-out'].includes(rule.response)
    if (!valid) throw new Error('Unsupported coach rule or observation threshold.')
  }
}

/** Compile portable coaching sentences into the same observed predicates and
 * role obligations used by authored problem content. No positions are changed.
 * The rules apply while the handler owns the ball after an observed screen;
 * the ordinary team answer resumes when those conditions end. */
export function compileCoachRules(answer: TeamAnswer, problem: ProblemDefinition, config: LabConfig): DefensiveBehaviorRule[] {
  if (answer.coachRules === undefined) return []
  checkRules(answer.coachRules)
  if (!answer.coachRules.length) return []
  // A switch already transfers the roller to the point-of-attack defender.
  if (answer.coverage === 'switch') return []
  const rollerThreat: PolicyCondition = { kind: 'any', conditions: [
    { kind: 'coordinate', role: 'screener', axis: 'vz', below: -0.2 },
    { kind: 'coordinate', role: 'screener', axis: 'z', below: 5.5 },
  ] }
  const common: PolicyCondition[] = [{ kind: 'screen-used' }, { kind: 'possession', role: 'ballhandler' }, rollerThreat]
  // Order is a basketball decision: the explicit three-person exchange owns
  // the final assignment when both observations hold, regardless of UI order.
  const ordered = [...answer.coachRules].sort((a, b) => Number(a.kind === 'lift-rise') - Number(b.kind === 'lift-rise'))
  return ordered.map(rule => {
    const lowManCorner = { defender: 'lowMan', offense: 'weakCorner', threat: 'corner', kind: 'recover', gap: 0.9, priority: 1 } as const
    const bigRoll = { defender: 'big', offense: 'screener', threat: 'roll', kind: 'recover', gap: 0.8, priority: 1.5 } as const
    if (rule.kind === 'roller-depth') return {
      id: 'coach-roller-depth', label: coachRuleSentence(rule),
      when: { kind: 'all', conditions: [...common, { kind: 'coordinate', role: 'screener', axis: 'z', below: rule.depth }] },
      assignments: rule.response === 'low-man-tags' ? [
        { defender: 'lowMan', offense: 'screener', threat: 'roll', kind: 'tag', gap: 0.9, priority: 1.5, target: 'tag-depth' },
        { defender: 'big', offense: 'ballhandler', threat: 'drive', kind: 'contain', gap: 0.85, priority: 1.5 },
      ] : [bigRoll, lowManCorner],
    }
    const liftStart = config.startingPositions?.[problem.roles.weakLift] ?? problem.players.find(p => p.id === problem.roles.weakLift)!.start
    return {
      id: 'coach-lift-rise', label: coachRuleSentence(rule),
      when: { kind: 'all', conditions: [...common, { kind: 'coordinate', role: 'weakLift', axis: 'z', above: liftStart.z + rule.rise }] },
      assignments: rule.response === 'stay-with-lift' ? [
        { defender: 'backside', offense: 'weakLift', threat: 'lift', kind: 'guard', gap: 0.9, priority: 1.2 },
      ] : [
        { defender: 'backside', offense: 'weakCorner', threat: 'corner', kind: 'closeout', gap: 0.9, priority: 1.2 },
        { defender: 'lowMan', offense: 'weakLift', threat: 'lift', kind: 'closeout', gap: 0.9, priority: 1.2 },
        bigRoll,
      ],
    }
  })
}
