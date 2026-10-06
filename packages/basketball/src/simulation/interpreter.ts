import type {
  ActorRef,
  Condition,
  ContentProgram,
  DefensiveRule,
  Observation,
  ParameterValues,
  PolicyMemory,
  Scalar,
  Target,
} from '../domain/program'
import type { PlayerId, PlayerState, Point2, Responsibility } from '../domain/types'
import { EXECUTION_LIMITS } from '../domain/executionBudget'
const ownValue = <T>(values: Record<string, T>, key: string): T | undefined =>
  Object.hasOwn(values, key) ? values[key] : undefined
const setOwn = <T>(values: Record<string, T>, key: string, value: T): void => {
  Object.defineProperty(values, key, { value, writable: true, configurable: true, enumerable: true })
}
export const RIM = { x: 0, y: 3.05, z: 1.575 }
export const clamp = (v: number, low: number, high: number) => Math.max(low, Math.min(high, v))
export const distance = (a: Point2, b: Point2) => Math.hypot(a.x - b.x, a.z - b.z)
export interface EvaluationContext {
  program: ContentProgram
  initialPositions?: Partial<Record<PlayerId, Point2>>
  observed: Observation
  parameters: ParameterValues
  memory: PolicyMemory
  owner: PlayerId
  reader: PlayerId
  budget?: { remaining: number }
  metrics?: Partial<Record<'passCount' | 'arrivalGap' | 'clearance' | 'time' | 'caughtAt', number>>
}
export function actorId(ref: ActorRef, ctx: EvaluationContext): PlayerId {
  if ('player' in ref) return ref.player
  if ('role' in ref) {
    const id = ownValue(ctx.observed.roleBindings, ref.role)
    if (!id) throw new Error(`Role ${ref.role} is absent from the observed world.`)
    return id
  }
  return ref.current === 'reader'
    ? ctx.reader
    : ref.current === 'receiver'
      ? (ctx.observed.ball.receiver ?? ctx.owner)
      : ctx.owner
}
export function actor(ref: ActorRef, ctx: EvaluationContext): PlayerState {
  const id = actorId(ref, ctx),
    p = ctx.observed.players.find((p) => p.id === id)
  if (!p) throw new Error(`Actor ${id} is absent from the observed world.`)
  return p
}
function consume(ctx: EvaluationContext): void {
  const budget = ctx.budget ?? (ctx.budget = { remaining: 8192 })
  if (--budget.remaining < 0) throw new Error('Frame expression evaluation exceeds its bounded work budget.')
}
export function scalar(value: Scalar, ctx: EvaluationContext): number {
  consume(ctx)
  const valueOut = evaluateScalar(value, ctx)
  if (!Number.isFinite(valueOut) || Math.abs(valueOut) > 1e6)
    throw new Error('Numeric expression exceeds its finite execution bounds.')
  return valueOut
}
function evaluateScalar(value: Scalar, ctx: EvaluationContext): number {
  if (typeof value === 'number') return value
  if ('parameter' in value) {
    const v = ctx.parameters[value.parameter]
    if (typeof v !== 'number') throw new Error(`Parameter ${value.parameter} is not numeric.`)
    return v
  }
  if ('coordinate' in value) return actor(value.coordinate, ctx)[value.axis]
  if ('encounterTime' in value) return ownValue(ctx.memory.encounters, value.encounterTime) ?? 1e6
  if ('metric' in value) return value.metric === 'time' ? ctx.observed.t : (ctx.metrics?.[value.metric] ?? 0)
  if ('choose' in value) return scalar(condition(value.choose, ctx).matches ? value.yes : value.no, ctx)
  if (value.op === 'sin' || value.op === 'cos') return Math[value.op](scalar(value.value, ctx))
  if (value.op === 'sign') return Math.sign(scalar(value.value, ctx)) || value.zero || 0
  if (value.op === 'clamp') return clamp(scalar(value.value, ctx), scalar(value.min, ctx), scalar(value.max, ctx))
  if (!('values' in value)) throw new Error('Unknown numeric expression.')
  const vs = value.values.map((v) => scalar(v, ctx))
  return value.op === 'add'
    ? vs.reduce((a, b) => a + b, 0)
    : value.op === 'subtract'
      ? vs.slice(1).reduce((a, b) => a - b, vs[0])
      : value.op === 'multiply'
        ? vs.reduce((a, b) => a * b, 1)
        : value.op === 'min'
          ? Math.min(...vs)
          : Math.max(...vs)
}
export function target(expr: Target, ctx: EvaluationContext): Point2 {
  consume(ctx)
  const point = evaluateTarget(expr, ctx)
  if (!Number.isFinite(point.x) || !Number.isFinite(point.z) || Math.abs(point.x) > 100 || Math.abs(point.z) > 100)
    throw new Error('Movement expression exceeds finite world bounds.')
  return point
}
function evaluateTarget(expr: Target, ctx: EvaluationContext): Point2 {
  if ('x' in expr) return { ...expr }
  if ('choose' in expr) return target(condition(expr.choose, ctx).matches ? expr.yes : expr.no, ctx)
  if ('actor' in expr) {
    const p = actor(expr.actor, ctx),
      lead = expr.lead === undefined ? 0 : scalar(expr.lead, ctx)
    return {
      x: p.x + p.vx * lead + (expr.offset ? scalar(expr.offset.x, ctx) : 0),
      z: p.z + p.vz * lead + (expr.offset ? scalar(expr.offset.z, ctx) : 0),
    }
  }
  if ('axes' in expr) return { x: target(expr.axes.x, ctx).x, z: target(expr.axes.z, ctx).z }
  if ('components' in expr) return { x: scalar(expr.components.x, ctx), z: scalar(expr.components.z, ctx) }
  if ('towardRim' in expr) {
    const p = target(expr.towardRim, ctx),
      d = distance(p, RIM) || 1,
      gap = scalar(expr.gap, ctx)
    return { x: p.x + ((RIM.x - p.x) / d) * gap, z: p.z + ((RIM.z - p.z) / d) * gap }
  }
  if ('mix' in expr) {
    const a = target(expr.mix[0], ctx),
      b = target(expr.mix[1], ctx),
      u = scalar(expr.amount, ctx)
    return { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u }
  }
  const p = target(expr.rotate, ctx),
    angle = scalar(expr.angle, ctx),
    dx = p.x - expr.pivot.x,
    dz = p.z - expr.pivot.z,
    c = Math.cos(angle),
    s = Math.sin(angle)
  return { x: expr.pivot.x + dx * c - dz * s, z: expr.pivot.z + dx * s + dz * c }
}
export function condition(
  expr: Condition,
  ctx: EvaluationContext,
  memo = new Map<string, { matches: boolean; evidence: string[] }>(),
): { matches: boolean; evidence: string[] } {
  consume(ctx)
  const yes = (matches: boolean, text: string) => ({
    matches,
    evidence: matches ? [text.slice(0, EXECUTION_LIMITS.evidenceText)] : [],
  })
  if ('all' in expr) {
    const evidence: string[] = []
    for (const x of expr.all) {
      const evaluated = condition(x, ctx, memo)
      if (!evaluated.matches) return { matches: false, evidence: [] }
      if (evidence.length < EXECUTION_LIMITS.evidence)
        evidence.push(...evaluated.evidence.slice(0, EXECUTION_LIMITS.evidence - evidence.length))
    }
    return { matches: true, evidence }
  }
  if ('any' in expr) {
    for (const x of expr.any) {
      const evaluated = condition(x, ctx, memo)
      if (evaluated.matches) return evaluated
    }
    return { matches: false, evidence: [] }
  }
  if ('not' in expr) return yes(!condition(expr.not, ctx, memo).matches, 'Excluded observation is absent')
  if ('compare' in expr) {
    const [a, op, b] = expr.compare,
      x = scalar(a, ctx),
      y = scalar(b, ctx)
    return yes(
      op === 'lt' ? x < y : op === 'lte' ? x <= y : op === 'gt' ? x > y : op === 'gte' ? x >= y : x === y,
      `Observed comparison: ${x.toFixed(3)} ${op} ${y.toFixed(3)}`,
    )
  }
  if ('parameter' in expr)
    return yes(ctx.parameters[expr.parameter] === expr.equals, `${expr.parameter} = ${String(expr.equals)}`)
  if ('distance' in expr) {
    const d = distance(actor(expr.distance[0], ctx), actor(expr.distance[1], ctx))
    return yes(d < scalar(expr.below, ctx), `Observed actor distance ${d.toFixed(2)} m`)
  }
  if ('possession' in expr)
    return yes(
      ctx.observed.ball.owner === actorId(expr.possession, ctx) &&
        ['handle', 'gather'].includes(ctx.observed.ball.phase),
      'Actor controls the ball',
    )
  if ('sameActor' in expr)
    return yes(actorId(expr.sameActor[0], ctx) === actorId(expr.sameActor[1], ctx), 'Actors resolve to the same player')
  if ('ballPhase' in expr)
    return yes(expr.ballPhase.includes(ctx.observed.ball.phase), `Observed ball phase ${ctx.observed.ball.phase}`)
  if ('memory' in expr)
    return yes(
      (ownValue(ctx.memory.flags, expr.memory) ?? false) === (expr.equals ?? true),
      `Observed memory ${expr.memory}`,
    )
  if ('encountered' in expr)
    return yes(
      Object.hasOwn(ctx.memory.encounters, expr.encountered) &&
        ctx.memory.encounters[expr.encountered] <= ctx.observed.t,
      `Observed encounter ${expr.encountered}`,
    )
  if ('activated' in expr) {
    const a = ctx.memory.activations.find((a) => a.ruleId === expr.activated)
    return yes(
      !!a && ctx.observed.t >= a.t + (expr.after === undefined ? 0 : scalar(expr.after, ctx)),
      `Continuation after ${expr.activated}`,
    )
  }
  if ('obligation' in expr)
    return yes(
      ctx.observed.responsibilities.some((r) => r.defenderId === actorId(expr.obligation, ctx) && r.kind === expr.kind),
      `Observed ${expr.kind} obligation`,
    )
  const cached = memo.get(expr.actionActive)
  if (cached) return cached
  const action = ctx.program.actions.find((a) => a.id === expr.actionActive)
  const evaluated = yes(
    !!action &&
      action.from <= ctx.observed.t &&
      (action.until === undefined || ctx.observed.t < action.until) &&
      (!action.when || condition(action.when, ctx, memo).matches),
    `Active action ${expr.actionActive}`,
  )
  memo.set(expr.actionActive, evaluated)
  return evaluated
}
export function observeActions(ctx: EvaluationContext): void {
  for (const action of ctx.program.actions) {
    if (
      !action.screen ||
      Object.hasOwn(ctx.memory.encounters, action.id) ||
      action.from > ctx.observed.t ||
      (action.until !== undefined && ctx.observed.t >= action.until) ||
      (action.when && !condition(action.when, ctx).matches)
    )
      continue
    const a = actor(action.actor, ctx),
      b = actor(action.screen.beneficiary, ctx)
    if (distance(a, b) < action.screen.encounterDistance && Math.hypot(b.vx, b.vz) > action.screen.minimumSpeed)
      setOwn(ctx.memory.encounters, action.id, ctx.observed.t)
  }
  for (const rule of ctx.program.memoryRules) {
    if (rule.latch && ownValue(ctx.memory.flags, rule.id) === rule.value) continue
    if (condition(rule.when, ctx).matches) setOwn(ctx.memory.flags, rule.id, rule.value)
  }
}
export function defensiveObligations(
  ctx: EvaluationContext,
  t: number,
  gather: number,
  influence: number,
): { obligations: Responsibility[]; activeRuleIds: string[] } {
  const activeRuleIds: string[] = [],
    obligations: Responsibility[] = []
  const add = (ruleId: string, label: string, defs: DefensiveRule['obligations']) => {
    for (const d of defs) {
      if (d.when && !condition(d.when, ctx).matches) continue
      const defenderId = actorId(d.defender, ctx),
        offensivePlayerId = 'actor' in d.subject ? actorId(d.subject.actor, ctx) : undefined
      obligations.push({
        id: d.id,
        defenderId,
        threatId: d.threat,
        ...(offensivePlayerId ? { offensivePlayerId } : {}),
        kind: d.kind,
        target: target(d.target, ctx),
        priority: d.priority,
        trigger: label,
        sourceRuleId: ruleId,
        startedAt: t,
        influenceRadius: d.influence === undefined ? influence : scalar(d.influence, ctx),
        observedAt: ctx.observed.t,
        ...(d.dueAfterPass && ['pass', 'gather', 'shot'].includes(ctx.observed.ball.phase)
          ? { dueAt: (ctx.observed.ball.flight?.end ?? t) + gather, availableAt: t }
          : {}),
      })
    }
  }
  add('initial-matchups', 'Initial matchup', ctx.program.initial.matchups)
  for (const rule of ctx.program.defenseRules) {
    if (rule.when && !condition(rule.when, ctx).matches) continue
    activeRuleIds.push(rule.id)
    const replaced = new Set(rule.replaceFor.map((a) => actorId(a, ctx)))
    for (let i = obligations.length - 1; i >= 0; i--)
      if (replaced.has(obligations[i].defenderId)) obligations.splice(i, 1)
    const label = (rule.labelBindings ?? []).reduce(
      (text, b) => text.replaceAll(`{${b.token}}`, scalar({ parameter: b.parameter }, ctx).toFixed(b.decimals)),
      rule.label,
    )
    if (label.length > EXECUTION_LIMITS.label) throw new Error('Rendered obligation label exceeds its text budget.')
    add(rule.id, label, rule.obligations)
    if (rule.adjust) {
      const a = rule.adjust,
        id = actorId(a.subject, ctx)
      for (const obligation of obligations) {
        if (obligation.offensivePlayerId !== id || a.excludeKinds.includes(obligation.kind)) continue
        obligation.target = target(a.target, ctx)
        obligation.priority = a.priority
        obligation.sourceRuleId = rule.id
        obligation.trigger = label
        if (a.first) break
      }
    }
  }
  if (obligations.length > EXECUTION_LIMITS.activeObligations)
    throw new Error('Policy exceeds its active obligation budget.')
  return { obligations, activeRuleIds }
}
export function advanceOffense(ctx: EvaluationContext, time: number): string[] {
  const added: string[] = []
  // Stable author order resolves ties; identifiers do not decide basketball behavior.
  for (const rule of [...ctx.program.offenseRules].sort((a, b) => b.priority - a.priority)) {
    if (
      time < rule.earliest ||
      (rule.latest !== undefined && time > rule.latest) ||
      ctx.memory.activations.some((a) => a.ruleId === rule.id || rule.excludes?.includes(a.ruleId))
    )
      continue
    const observed = condition(rule.when, ctx)
    if (observed.matches) {
      ctx.memory.activations.push({ ruleId: rule.id, t: time, observedAt: ctx.observed.t, evidence: observed.evidence })
      added.push(rule.id)
    }
  }
  return added
}
export function readAfter(program: ContentProgram, memory: PolicyMemory): number {
  return Math.max(
    0,
    ...memory.activations.map((a) => a.t + (program.offenseRules.find((r) => r.id === a.ruleId)?.deferReadFor ?? 0)),
  )
}
export function motionGoals(
  ctx: EvaluationContext,
  time: number,
): Map<PlayerId, { target: Point2; speed: number; action: string }> {
  const goals = new Map<PlayerId, { target: Point2; speed: number; action: string; priority?: number }>()
  for (const p of ctx.observed.players.filter((p) => p.team === 'offense')) {
    const source = ctx.program.players.find((q) => q.id === p.id)!
    goals.set(p.id, {
      target: { ...((ctx.initialPositions && ownValue(ctx.initialPositions, p.id)) ?? source.start) },
      speed: 3.4,
      action: 'hold',
      priority: -Infinity,
    })
  }
  for (const action of ctx.program.actions) {
    if (
      action.from > time ||
      (action.until !== undefined && time >= action.until) ||
      (action.when && !condition(action.when, ctx).matches)
    )
      continue
    const id = actorId(action.actor, ctx)
    if ((goals.get(id)?.priority ?? -Infinity) > (action.priority ?? 0)) continue
    if (action.delayedUntil) {
      const activation = ctx.memory.activations.find((a) => a.ruleId === action.delayedUntil!.activation)
      if (!activation || time < activation.t + scalar(action.delayedUntil.delay, ctx)) continue
    }
    goals.set(id, {
      target: target(action.target, ctx),
      speed: action.speed,
      action: action.kind,
      priority: action.priority ?? 0,
    })
  }
  for (const activation of ctx.memory.activations) {
    const rule = ctx.program.offenseRules.find((r) => r.id === activation.ruleId)!
    for (const motion of rule.motions) {
      const age = time - activation.t
      if (
        age < (motion.from === undefined ? 0 : scalar(motion.from, ctx)) ||
        (motion.until !== undefined && age >= scalar(motion.until, ctx))
      )
        continue
      const id = actorId(motion.actor, ctx)
      if ((goals.get(id)?.priority ?? -Infinity) > rule.priority) continue
      goals.set(id, {
        target: target(motion.target, ctx),
        speed: motion.speed,
        action: motion.kind,
        priority: rule.priority,
      })
    }
  }
  return goals
}
