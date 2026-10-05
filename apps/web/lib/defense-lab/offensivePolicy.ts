import type { BehaviorRule, LabConfig, OpponentStrategy, PlayerId, Point2, PolicyActivation, PolicyCondition, ProblemDefinition, WorldFrame } from './types'

export const DEFAULT_OPPONENT: OpponentStrategy = { screenAngle: 0, liftDelay: 0, liftWidth: 0, reject: true, rescreen: false, shortRoll: true }
export const OPPONENT_BOUNDS = { screenAngle: [-0.65, 0.65], liftDelay: [-0.25, 0.6], liftWidth: [-0.7, 0.7] } as const
export function opponentAt(config: LabConfig, time: number): OpponentStrategy | undefined {
  let opponent = config.opponent ? { ...config.opponent } : undefined
  for (const cue of [...config.interventions].sort((a, b) => a.at - b.at)) if (cue.kind === 'opponent' && cue.at <= time + 1e-9) opponent = { ...(opponent ?? DEFAULT_OPPONENT), ...cue.patch }
  return opponent
}

export interface PolicyState { activations: PolicyActivation[] }
export interface PolicyGoal { target: Point2; speed: number; action: string; priority: number }

/** Evaluates basketball predicates against one historical observation. No access
 * to the configured defense, future trajectories, or analytic verdicts. */
export function evaluateCondition(condition: PolicyCondition, observed: WorldFrame, problem: ProblemDefinition, strategy: OpponentStrategy, state: PolicyState): { matches: boolean; evidence: string[] } {
  const get = (role: keyof ProblemDefinition['roles']) => observed.players.find(p => p.id === problem.roles[role])!
  const yes = (matches: boolean, text: string) => ({ matches, evidence: matches ? [text] : [] })
  switch (condition.kind) {
    case 'screen-used': return yes(observed.screenEngagedAt !== undefined && observed.screenEngagedAt <= observed.t, 'First screen encounter has been observed')
    case 'action-present': return yes(problem.actions.some(a => a.kind === condition.action && a.from <= observed.t), `${condition.action} action is present`)
    case 'all': { const children = condition.conditions.map(c => evaluateCondition(c, observed, problem, strategy, state)); return { matches: children.every(c => c.matches), evidence: children.flatMap(c => c.evidence) } }
    case 'any': { const child = condition.conditions.map(c => evaluateCondition(c, observed, problem, strategy, state)).find(c => c.matches); return child ?? { matches: false, evidence: [] } }
    case 'not': return yes(!evaluateCondition(condition.condition, observed, problem, strategy, state).matches, 'Excluded condition absent')
    case 'distance': { const a = get(condition.a), b = get(condition.b), d = Math.hypot(a.x - b.x, a.z - b.z); return yes(d < condition.below, `${condition.a} to ${condition.b}: ${d.toFixed(2)} m < ${condition.below} m`) }
    case 'coordinate': { const value = get(condition.role)[condition.axis]; return yes((condition.below === undefined || value < condition.below) && (condition.above === undefined || value > condition.above), `${condition.role} ${condition.axis}: ${value.toFixed(2)}`) }
    case 'relative': { const value = get(condition.a)[condition.axis] - get(condition.b)[condition.axis]; return yes((condition.below === undefined || value < condition.below) && (condition.above === undefined || value > condition.above), `${condition.a} relative to ${condition.b} ${condition.axis}: ${value.toFixed(2)} m`) }
    case 'responsibility': return yes(observed.responsibilities.some(r => r.defenderId === problem.roles[condition.role] && r.kind === condition.task), `${condition.role} is executing ${condition.task}`)
    case 'possession': return yes(observed.ball.owner === problem.roles[condition.role] && (observed.ball.phase === 'handle' || observed.ball.phase === 'gather'), `${condition.role} controls the ball`)
    case 'enabled': return yes(strategy[condition.key], `${condition.key} permitted by opponent strategy`)
    case 'activated': { const activation = state.activations.find(a => a.ruleId === condition.ruleId); return yes(!!activation && observed.t >= activation.t + (condition.after ?? 0), `Continuation after ${condition.ruleId}`) }
  }
}

/** Each rule can activate once per possession; content owns transitions and
 * destinations, the interpreter only arbitrates overlapping movement intents. */
export function advancePolicies(rules: BehaviorRule[], observed: WorldFrame, problem: ProblemDefinition, strategy: OpponentStrategy, state: PolicyState, time: number): PolicyActivation[] {
  const added: PolicyActivation[] = []
  for (const rule of [...rules].sort((a, b) => b.priority - a.priority)) {
    if (time < rule.earliest || rule.latest !== undefined && time > rule.latest || state.activations.some(a => a.ruleId === rule.id || rule.excludes?.includes(a.ruleId))) continue
    const result = evaluateCondition(rule.when, observed, problem, strategy, state)
    if (result.matches) { const activation = { ruleId: rule.id, t: time, observedAt: observed.t, evidence: result.evidence }; state.activations.push(activation); added.push(activation) }
  }
  return added
}
export function policyGoals(rules: BehaviorRule[], observed: WorldFrame, problem: ProblemDefinition, state: PolicyState, time: number): Map<PlayerId, PolicyGoal> {
  const goals = new Map<PlayerId, PolicyGoal>()
  for (const activation of state.activations) {
    const rule = rules.find(r => r.id === activation.ruleId)!
    for (const motion of rule.motions) {
      const age = time - activation.t
      if (age < (motion.from ?? 0) || motion.until !== undefined && age >= motion.until) continue
      const id = problem.roles[motion.role]
      if ((goals.get(id)?.priority ?? -Infinity) > rule.priority) continue
      const motionTarget = motion.target
      const anchor = 'relativeTo' in motionTarget ? observed.players.find(p => p.id === problem.roles[motionTarget.relativeTo])! : null
      const target = 'relativeTo' in motion.target ? { x: anchor!.x + motion.target.offset.x, z: anchor!.z + motion.target.offset.z } : { ...motion.target }
      goals.set(id, { target, speed: motion.speed, action: motion.kind, priority: rule.priority })
    }
  }
  return goals
}
export function policyReadAfter(rules: BehaviorRule[], state: PolicyState): number {
  return Math.max(0, ...state.activations.map(a => a.t + (rules.find(r => r.id === a.ruleId)?.deferReadFor ?? 0)))
}
