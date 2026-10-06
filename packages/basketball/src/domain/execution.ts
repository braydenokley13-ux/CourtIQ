import { z } from 'zod'
import type { ActorRef, Condition, ContentProgram, ExecutionInput, Scalar, Target } from './program'
import { EXECUTION_LIMITS, maximumObligations, validateReplayWork } from './executionBudget'
export { EXECUTION_LIMITS, projectedReplayWork } from './executionBudget'

export const ENGINE_VERSION = 'basketball-2.0.0'
export const CONFIG_SCHEMA_VERSION = 2
export const QUERY_VERSION = 'basketball-queries-2.0.0'
const fail = (message: string): never => {
  throw new Error(message)
}
const object = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : fail('Expected a plain object.')
const finite = (v: unknown, low = -1e6, high = 1e6): number =>
  typeof v === 'number' && Number.isFinite(v) && v >= low && v <= high
    ? v
    : fail('Value lies outside its finite bounds.')
const identifier = (v: unknown): string =>
  typeof v === 'string' && v.length > 0 && v.length <= 160 ? v : fail('Invalid authored identifier.')
const text = (v: unknown, max: number = EXECUTION_LIMITS.label): string =>
  typeof v === 'string' && v.length <= max ? v : fail('Authored text exceeds its supported budget.')
const list = (v: unknown, max: number): unknown[] =>
  Array.isArray(v) && v.length <= max ? v : fail('List exceeds its supported budget.')
const point = (v: unknown): void => {
  const p = object(v)
  finite(p.x, -7.3, 7.3)
  finite(p.z, 0.4, 14)
}
const unique = (xs: unknown[], name: string): Set<string> => {
  const ids = xs.map((x) => identifier(object(x).id))
  if (new Set(ids).size !== ids.length) fail(`Duplicate ${name} identifier.`)
  return new Set(ids)
}

export function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(',')}]`
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalStringify((value as Record<string, unknown>)[key])}`)
    .join(',')}}`
}
/** Lossless input identity, not a cryptographic claim. Array author order is authoritative. */
export const canonicalInputFingerprint = (input: import('./program').StoredExecutionInput): string =>
  canonicalStringify(input)
export function contentHash(program: ContentProgram): string {
  let h = 2166136261
  for (const c of canonicalStringify(program)) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return `fnv1a-${(h >>> 0).toString(16).padStart(8, '0')}`
}

export function validateProgram(value: unknown): asserts value is ContentProgram {
  let nodes = 0,
    textChars = 0
  const json = (v: unknown, depth: number): void => {
    if (++nodes > EXECUTION_LIMITS.jsonNodes || depth > EXECUTION_LIMITS.expressionDepth)
      fail('Executable content exceeds the recursive expression budget.')
    if (typeof v === 'number') finite(v)
    else if (typeof v === 'string') {
      text(v, EXECUTION_LIMITS.string)
      if ((textChars += v.length) > EXECUTION_LIMITS.jsonText)
        fail('Executable content exceeds its aggregate text budget.')
    } else if (v !== null && typeof v === 'object') {
      if (Object.getPrototypeOf(v) !== Object.prototype && !Array.isArray(v))
        fail('Executable content must contain plain JSON values.')
      for (const [key, child] of Object.entries(v)) {
        if (['__proto__', 'prototype', 'constructor'].includes(key)) fail('Unsupported object key.')
        json(child, depth + 1)
      }
    } else if (!['string', 'boolean'].includes(typeof v) && v !== null)
      fail('Executable content must be serializable JSON.')
  }
  json(value, 0)
  const p = object(value),
    players = list(p.players, EXECUTION_LIMITS.players)
  if (players.length !== EXECUTION_LIMITS.players) fail('The supported world requires ten unique players.')
  const ids = unique(players, 'player'),
    teams = new Map(
      players.map((v) => {
        const x = object(v)
        if (!['offense', 'defense'].includes(String(x.team))) fail('Invalid player team.')
        identifier(x.role)
        finite(x.height, 1.5, 2.3)
        finite(x.number, 0, 99)
        point(x.start)
        for (const k of ['speed', 'acceleration', 'lateral', 'reach']) if (x[k] !== undefined) finite(x[k], 0.3, 1.5)
        return [x.id as string, x.team]
      }),
    )
  if (players.filter((x) => object(x).team === 'offense').length !== 5)
    fail('The supported world requires five players on each team.')
  identifier(p.id)
  identifier(p.version)
  text(p.title)
  text(p.description, EXECUTION_LIMITS.string)
  const roles = object(p.roles)
  for (const [role, id] of Object.entries(roles)) {
    identifier(role)
    if (!ids.has(identifier(id))) fail(`Role ${role} names an unknown player.`)
  }
  if (new Set(Object.values(roles)).size !== players.length)
    fail('Role bindings must cover the complete roster without aliases.')
  const parameters = list(p.parameters, 96),
    paramIds = unique(parameters, 'parameter')
  for (const raw of parameters) {
    const d = object(raw)
    if (!['number', 'boolean', 'string'].includes(typeof d.default)) fail('Invalid parameter default.')
    if (typeof d.default === 'string') text(d.default, EXECUTION_LIMITS.parameterString)
    if (d.min !== undefined) finite(d.min)
    if (d.max !== undefined) finite(d.max)
    if (d.choices !== undefined && !list(d.choices, 24).includes(d.default))
      fail('Parameter default is not a supported choice.')
    if (d.choices)
      for (const choice of list(d.choices, 24))
        if (typeof choice === 'string') text(choice, EXECUTION_LIMITS.parameterString)
  }
  const actions = list(p.actions, EXECUTION_LIMITS.actions),
    actionIds = unique(actions, 'action')
  const reads = list(p.reads, EXECUTION_LIMITS.reads),
    readIds = unique(reads, 'read')
  const opportunities = list(p.opportunities, EXECUTION_LIMITS.opportunities),
    opportunityIds = unique(opportunities, 'opportunity')
  const rules = list(p.offenseRules, EXECUTION_LIMITS.activations),
    ruleIds = unique(rules, 'offensive rule')
  const defenses = list(p.defenseRules, EXECUTION_LIMITS.rules)
  unique(defenses, 'defensive rule')
  const memory = list(p.memoryRules, 48),
    memoryIds = unique(memory, 'memory')
  const actor = (v: unknown, team?: string): void => {
    const a = object(v)
    let id: string | undefined
    if ('player' in a) {
      id = identifier(a.player)
      if (!ids.has(id)) fail(`Unknown player ${id}.`)
    } else if ('role' in a) {
      const role = identifier(a.role)
      if (!Object.hasOwn(roles, role)) fail(`Unknown role ${role}.`)
      id = String(roles[role])
    } else if (!['owner', 'receiver', 'reader'].includes(String(a.current))) fail('Invalid actor expression.')
    if (team && id && teams.get(id) !== team) fail(`An ${team} action has an incompatible actor.`)
  }
  const scalar = (v: unknown, depth = 0): void => {
    if (depth > 16) fail('Scalar expression is too deep.')
    if (typeof v === 'number') {
      finite(v)
      return
    }
    const s = object(v)
    if ('parameter' in s) {
      if (!paramIds.has(identifier(s.parameter))) fail('Unknown scalar parameter.')
      if (typeof object(parameters.find((x) => object(x).id === s.parameter)).default !== 'number')
        fail('Scalar parameter must be numeric.')
    } else if ('coordinate' in s) {
      actor(s.coordinate)
      if (!['x', 'z', 'vx', 'vz', 'height'].includes(String(s.axis))) fail('Unknown coordinate.')
    } else if ('encounterTime' in s) {
      if (!actionIds.has(identifier(s.encounterTime))) fail('Unknown encounter time.')
    } else if ('metric' in s) {
      if (!['passCount', 'arrivalGap', 'clearance', 'time', 'caughtAt'].includes(String(s.metric)))
        fail('Unknown read metric.')
    } else if ('choose' in s) {
      condition(s.choose, depth + 1)
      scalar(s.yes, depth + 1)
      scalar(s.no, depth + 1)
    } else if (['add', 'subtract', 'multiply', 'min', 'max'].includes(String(s.op))) {
      const vs = list(s.values, 12)
      if (!vs.length) fail('An arithmetic expression needs values.')
      vs.forEach((x) => scalar(x, depth + 1))
    } else if (s.op === 'clamp') {
      scalar(s.value, depth + 1)
      scalar(s.min, depth + 1)
      scalar(s.max, depth + 1)
    } else if (s.op === 'sin' || s.op === 'cos') {
      scalar(s.value, depth + 1)
    } else if (s.op === 'sign') {
      scalar(s.value, depth + 1)
      if (s.zero !== undefined) finite(s.zero, -1, 1)
    } else fail('Unsupported scalar expression.')
  }
  const condition = (v: unknown, depth = 0): void => {
    if (depth > 16) fail('Condition is too deep.')
    const c = object(v)
    if ('all' in c || 'any' in c) list(c.all ?? c.any, 24).forEach((x) => condition(x, depth + 1))
    else if ('not' in c) condition(c.not, depth + 1)
    else if ('compare' in c) {
      const xs = list(c.compare, 3)
      if (xs.length !== 3 || !['lt', 'lte', 'gt', 'gte', 'eq'].includes(String(xs[1]))) fail('Invalid comparison.')
      scalar(xs[0], depth + 1)
      scalar(xs[2], depth + 1)
    } else if ('parameter' in c) {
      if (!paramIds.has(identifier(c.parameter))) fail('Unknown condition parameter.')
      if (typeof c.equals !== typeof object(parameters.find((d) => object(d).id === c.parameter)).default)
        fail('Wrong condition parameter type.')
      if (typeof c.equals === 'string') text(c.equals, EXECUTION_LIMITS.parameterString)
    } else if ('distance' in c || 'sameActor' in c) {
      const xs = list(c.distance ?? c.sameActor, 2)
      if (xs.length !== 2) fail('Invalid actor pair.')
      xs.forEach((x) => actor(x))
      if ('distance' in c) scalar(c.below, depth + 1)
    } else if ('possession' in c) actor(c.possession)
    else if ('ballPhase' in c) {
      if (list(c.ballPhase, 5).some((x) => !['handle', 'pass', 'gather', 'shot', 'dead'].includes(String(x))))
        fail('Invalid ball phase.')
    } else if ('actionActive' in c || 'encountered' in c) {
      if (!actionIds.has(identifier(c.actionActive ?? c.encountered))) fail('Unknown action reference.')
    } else if ('activated' in c) {
      if (!ruleIds.has(identifier(c.activated))) fail('Unknown activation reference.')
      if (c.after !== undefined) scalar(c.after, depth + 1)
    } else if ('obligation' in c) {
      actor(c.obligation, 'defense')
      if (!['contain', 'chase', 'tag', 'guard', 'closeout', 'recover', 'switch', 'split'].includes(String(c.kind)))
        fail('Unsupported observed obligation.')
    } else if ('memory' in c) {
      if (!memoryIds.has(identifier(c.memory))) fail('Unknown policy memory.')
    } else fail('Unsupported observation condition.')
  }
  const target = (v: unknown, depth = 0): void => {
    if (depth > 16) fail('Target expression is too deep.')
    const t = object(v)
    if ('x' in t && 'z' in t) {
      point(t)
    } else if ('actor' in t) {
      actor(t.actor)
      if (t.offset) {
        const o = object(t.offset)
        scalar(o.x, depth + 1)
        scalar(o.z, depth + 1)
      }
      if (t.lead !== undefined) scalar(t.lead, depth + 1)
    } else if ('towardRim' in t) {
      target(t.towardRim, depth + 1)
      scalar(t.gap, depth + 1)
    } else if ('mix' in t) {
      const xs = list(t.mix, 2)
      if (xs.length !== 2) fail('Invalid mixed target.')
      xs.forEach((x) => target(x, depth + 1))
      scalar(t.amount, depth + 1)
    } else if ('axes' in t) {
      const a = object(t.axes)
      target(a.x, depth + 1)
      target(a.z, depth + 1)
    } else if ('components' in t) {
      const c = object(t.components)
      scalar(c.x, depth + 1)
      scalar(c.z, depth + 1)
    } else if ('choose' in t) {
      condition(t.choose, depth + 1)
      target(t.yes, depth + 1)
      target(t.no, depth + 1)
    } else if ('rotate' in t) {
      target(t.rotate, depth + 1)
      point(t.pivot)
      scalar(t.angle, depth + 1)
    } else fail('Unsupported movement target.')
  }
  const obligation = (v: unknown): void => {
    const o = object(v)
    identifier(o.id)
    actor(o.defender, 'defense')
    const s = object(o.subject)
    if (s.actor) actor(s.actor, 'offense')
    else if (s.region) {
      if (!Object.hasOwn(object(p.regions ?? {}), identifier(s.region))) fail('Unknown responsibility region.')
    } else if (s.rim !== true) fail('Unsupported responsibility subject.')
    if (!opportunityIds.has(identifier(o.threat))) fail('Unknown responsibility opportunity.')
    if (!['contain', 'chase', 'tag', 'guard', 'closeout', 'recover', 'switch', 'split'].includes(String(o.kind)))
      fail('Invalid responsibility kind.')
    target(o.target)
    finite(o.priority, -10, 10)
    if (o.influence !== undefined) scalar(o.influence)
    if (o.when) condition(o.when)
    if (o.railParameter && !paramIds.has(String(o.railParameter))) fail('Unknown rail parameter.')
  }
  const initial = object(p.initial)
  if (!ids.has(identifier(initial.ballOwner)) || teams.get(String(initial.ballOwner)) !== 'offense')
    fail('Invalid initial ball owner.')
  if (initial.readNode !== null && !readIds.has(identifier(initial.readNode))) fail('Unknown initial read node.')
  unique(list(initial.matchups, 32), 'initial obligation')
  list(initial.matchups, 32).forEach(obligation)
  for (const raw of actions) {
    const a = object(raw)
    actor(a.actor, 'offense')
    if (!['screen', 'drive', 'roll', 'pop', 'relocate', 'hold'].includes(String(a.kind))) fail('Unsupported action.')
    finite(a.from, 0, 12)
    if (a.until !== undefined && finite(a.until, 0, 12) <= Number(a.from)) fail('Action end precedes start.')
    target(a.target)
    finite(a.speed, 0, 8)
    if (a.when) condition(a.when)
    if (a.screen) {
      const s = object(a.screen)
      actor(s.beneficiary, 'offense')
      finite(s.encounterDistance, 0.4, 3)
      finite(s.minimumSpeed, 0, 3)
    }
    if (a.delayedUntil) {
      const d = object(a.delayedUntil)
      if (!ruleIds.has(identifier(d.activation))) fail('Unknown motion activation.')
      scalar(d.delay)
    }
  }
  for (const raw of rules) {
    const r = object(raw)
    text(r.label)
    finite(r.earliest, 0, 12)
    if (r.latest !== undefined && finite(r.latest, 0, 12) < Number(r.earliest)) fail('Rule end precedes start.')
    finite(r.priority, -10, 100)
    condition(r.when)
    if (r.excludes)
      list(r.excludes, 24).forEach((x) => {
        if (!ruleIds.has(identifier(x))) fail('Unknown exclusion rule.')
      })
    if (r.deferReadFor !== undefined) finite(r.deferReadFor, 0, 12)
    for (const rawMotion of list(r.motions, 12)) {
      const m = object(rawMotion)
      actor(m.actor, 'offense')
      target(m.target)
      finite(m.speed, 0, 8)
      if (m.from !== undefined) scalar(m.from)
      if (m.until !== undefined) scalar(m.until)
    }
  }
  for (const raw of defenses) {
    const d = object(raw)
    text(d.label)
    if (d.labelBindings)
      for (const rawBinding of list(d.labelBindings, 8)) {
        const b = object(rawBinding)
        identifier(b.token)
        if (
          !paramIds.has(identifier(b.parameter)) ||
          typeof object(parameters.find((p) => object(p).id === b.parameter)).default !== 'number'
        )
          fail('Label bindings need numeric parameters.')
        finite(b.decimals, 0, 3)
      }
    let rendered = String(d.label)
    for (const rawBinding of d.labelBindings ? list(d.labelBindings, 8) : []) {
      const b = object(rawBinding)
      rendered = rendered.replaceAll(`{${b.token}}`, '-1000000.000')
    }
    text(rendered)
    if (d.when) condition(d.when)
    list(d.replaceFor, 10).forEach((x) => actor(x, 'defense'))
    unique(list(d.obligations, 24), 'rule obligation')
    list(d.obligations, 24).forEach(obligation)
    if (d.adjust) {
      const a = object(d.adjust)
      actor(a.subject, 'offense')
      target(a.target)
      finite(a.priority, -10, 10)
      if (typeof a.first !== 'boolean') fail('Adjustment selection must be explicit.')
      if (
        list(a.excludeKinds, 8).some(
          (k) => !['contain', 'chase', 'tag', 'guard', 'closeout', 'recover', 'switch', 'split'].includes(String(k)),
        )
      )
        fail('Unknown adjustment task kind.')
    }
  }
  for (const raw of memory) {
    const m = object(raw)
    condition(m.when)
    if (typeof m.value !== 'boolean') fail('Memory must be a boolean.')
  }
  for (const raw of opportunities) {
    const o = object(raw)
    actor(o.actor, 'offense')
    if (!['keep', 'pass'].includes(String(o.kind))) fail('Unsupported opportunity kind.')
    text(o.label)
    if (o.when) condition(o.when)
    target(o.target)
    scalar(o.scoreBias)
    finite(o.laneWeight, 0, 1)
    if (o.kind === 'pass' && (!Array.isArray(o.launches) || o.launches.length === 0))
      fail('Pass opportunities need an authored launch.')
    if (o.launches)
      for (const [index, rawLaunch] of list(o.launches, 4).entries()) {
        const l = object(rawLaunch)
        if (l.timing !== undefined && !['iterative', 'extend-first'].includes(String(l.timing)))
          fail('Unsupported launch timing.')
        if (index === 0 && l.timing === 'extend-first')
          fail('The first authored launch cannot extend an absent first plan.')
        if (!['pocket', 'lob', 'skip', 'chest'].includes(String(l.kind))) fail('Invalid launch shape.')
        scalar(l.releaseHeight)
        finite(l.catchHeight, 0.5, 2.5)
        finite(l.minDuration, 0.1, 2)
        if (finite(l.maxDuration, 0.1, 2) < Number(l.minDuration)) fail('Invalid launch duration.')
        if (l.durationOffset !== undefined) finite(l.durationOffset, 0, 0.6)
      }
  }
  for (const raw of reads) {
    const r = object(raw)
    actor(r.actor, 'offense')
    finite(r.earliest, 0, 12)
    if (r.decisionAt !== undefined && finite(r.decisionAt, 0, 12) < Number(r.earliest))
      fail('Read deadline precedes permission.')
    list(r.options, 48).forEach((x) => {
      if (!opportunityIds.has(identifier(x))) fail('Unknown read opportunity.')
    })
    for (const [key, next] of Object.entries(object(r.continuations))) {
      if (!opportunityIds.has(key) || !readIds.has(identifier(next))) fail('Unknown graph continuation.')
    }
    const t = object(r.trigger)
    if (t.kind === 'encounter') {
      if (!actionIds.has(identifier(t.action))) fail('Unknown read encounter.')
    } else if (t.kind === 'condition') condition(t.when)
    else if (t.kind !== 'catch') fail('Unsupported read trigger.')
    if (r.when) condition(r.when)
    if (r.continuousWhen) condition(r.continuousWhen)
    if (r.initialOptionsWhen)
      for (const rawConstraint of list(r.initialOptionsWhen, 24)) {
        const c = object(rawConstraint)
        condition(c.when)
        list(c.options, 48).forEach((x) => {
          if (!opportunityIds.has(identifier(x))) fail('Unknown constrained opportunity.')
        })
      }
  }
  for (const raw of list(p.variations, 24)) {
    const v = object(raw)
    if (!paramIds.has(identifier(v.parameter))) fail('Unknown variation parameter.')
    if (v.toggle !== true) {
      finite(v.min)
      finite(v.max)
      finite(v.step, 0.001, 12)
    }
  }
  unique([...list(initial.matchups, 32), ...defenses.flatMap((d) => list(object(d).obligations, 24))], 'responsibility')
  if (
    list(initial.matchups, 32).length +
      defenses.reduce<number>((n, d) => n + list(object(d).obligations, 24).length, 0) >
    EXECUTION_LIMITS.authoredObligations
  )
    fail('Content exceeds its aggregate authored obligation budget.')
  if (actions.filter((raw) => object(raw).screen).length > EXECUTION_LIMITS.encounters)
    fail('Content exceeds its encounter memory budget.')
  maximumObligations(value as ContentProgram)
  const staticActor = (v: unknown): string | undefined => {
    const a = object(v)
    return 'player' in a ? String(a.player) : 'role' in a ? String(roles[String(a.role)]) : undefined
  }
  const first = reads.find((raw) => object(raw).id === initial.readNode)
  if (first && staticActor(object(first).actor) && staticActor(object(first).actor) !== initial.ballOwner)
    fail('Initial read actor must control the initial ball.')
  for (const raw of reads) {
    const r = object(raw)
    for (const [id, next] of Object.entries(object(r.continuations))) {
      const opportunity = opportunities.find((o) => object(o).id === id)!,
        following = reads.find((n) => object(n).id === next)!
      if (!list(r.options, 48).includes(id)) fail('A continuation must be one of this read’s permitted opportunities.')
      const to = staticActor(object(opportunity).actor),
        reader = staticActor(object(following).actor)
      if (to && reader && to !== reader) fail('A continuation actor must match its incoming receiver.')
    }
  }
  const dependencies = new Map(
    actions.map((raw) => {
      const a = object(raw),
        refs = new Set<string>()
      const scan = (x: unknown): void => {
        if (x && typeof x === 'object') {
          if (Object.hasOwn(x, 'actionActive')) refs.add(String((x as Record<string, unknown>).actionActive))
          for (const child of Object.values(x)) scan(child)
        }
      }
      scan(a.when)
      return [String(a.id), refs] as const
    }),
  )
  const visiting = new Set<string>(),
    visited = new Set<string>()
  const visit = (id: string): void => {
    if (visiting.has(id)) fail('Cyclic action condition reference.')
    if (visited.has(id)) return
    visiting.add(id)
    for (const next of dependencies.get(id) ?? []) visit(next)
    visiting.delete(id)
    visited.add(id)
  }
  for (const id of actionIds) visit(id)
  const heights = new Map<string, number>()
  const height = (id: string): number => {
    if (heights.has(id)) return heights.get(id)!
    const n = 1 + Math.max(0, ...[...(dependencies.get(id) ?? [])].map(height))
    if (n > 16) fail('Action condition dependency exceeds depth budget.')
    heights.set(id, n)
    return n
  }
  for (const id of actionIds) height(id)
  const costs = new Map<string, number>()
  const cost = (id: string, depth = 0): number => {
    if (depth > 16) fail('Action condition dependency exceeds depth budget.')
    if (costs.has(id)) return costs.get(id)!
    const a = actions.find((x) => object(x).id === id)!,
      walk = (x: unknown): number => {
        if (!x || typeof x !== 'object') return 1
        let n = 1
        if (Object.hasOwn(x, 'actionActive')) n += cost(String((x as Record<string, unknown>).actionActive), depth + 1)
        for (const child of Object.values(x)) n += walk(child)
        if (n > 4096) fail('Action condition exceeds expanded evaluation budget.')
        return n
      }
    const n = walk(object(a).when)
    costs.set(id, n)
    return n
  }
  if ([...actionIds].reduce((sum, id) => sum + cost(id), 0) > 8192)
    fail('Actions exceed their aggregate evaluation budget.')
  const terminal = object(p.terminal)
  for (const key of [
    'maxPasses',
    'keepDuration',
    'finishRadius',
    'keepGap',
    'keepSpeed',
    'keepHorizon',
    'patientPassLead',
    'patientKeepLead',
    'shotBaseDuration',
    'shotDistanceDuration',
    'shotReleaseHeight',
    'shotHeightReference',
    'shotHeightScale',
  ])
    finite(terminal[key], 0, 20)
  finite(terminal.shotBaseDuration, 0.1, 3)
  if (!Number.isInteger(terminal.maxPasses) || Number(terminal.maxPasses) > EXECUTION_LIMITS.maxPasses)
    fail('Invalid pass budget.')
  finite(p.editAt, 0, 12)
}

export function parseExecutionInput(value: unknown): ExecutionInput {
  let nodes = 0,
    chars = 0
  const scan = (x: unknown, depth = 0): void => {
    if (++nodes > EXECUTION_LIMITS.jsonNodes || depth > EXECUTION_LIMITS.expressionDepth)
      fail('Executable input exceeds its JSON work budget.')
    if (typeof x === 'number') {
      if (!Number.isFinite(x)) fail('Executable input must contain finite numbers.')
    } else if (typeof x === 'string') {
      text(x, EXECUTION_LIMITS.string)
      if ((chars += x.length) > EXECUTION_LIMITS.jsonText) fail('Executable input exceeds its aggregate text budget.')
    } else if (x && typeof x === 'object') {
      if (!Array.isArray(x) && Object.getPrototypeOf(x) !== Object.prototype)
        fail('Executable input must be plain JSON.')
      for (const [key, child] of Object.entries(x)) {
        if (key.length > 160 || ['__proto__', 'prototype', 'constructor'].includes(key))
          fail('Unsupported executable input key.')
        if ((chars += key.length) > EXECUTION_LIMITS.jsonText)
          fail('Executable input exceeds its aggregate text budget.')
        scan(child, depth + 1)
      }
    } else if (x !== null && typeof x !== 'boolean') fail('Executable input must be serializable JSON.')
  }
  scan(value)
  const v = object(value)
  finite(v.schemaVersion, 1, 100)
  identifier(v.engineVersion)
  if (v.schemaVersion !== CONFIG_SCHEMA_VERSION || v.engineVersion !== ENGINE_VERSION)
    fail('This execution needs an unavailable schema or engine codec.')
  const ref = object(v.content)
  identifier(ref.id)
  identifier(ref.version)
  identifier(ref.hash)
  validateProgram(v.program)
  const p = v.program as ContentProgram
  if (ref.id !== p.id || ref.version !== p.version || ref.hash !== contentHash(p))
    fail('Content reference does not match its materialized program.')
  const a = object(v.assumptions),
    bounds: Record<string, [number, number]> = {
      dt: [0.01, 0.05],
      duration: [2, 12],
      maxSpeed: [1, 8],
      acceleration: [1, 15],
      reactionDelay: [0, 0.8],
      passSpeed: [5, 20],
      ballRadius: [0.06, 0.2],
      bodyRadius: [0.18, 0.45],
      contestRadius: [0.5, 2],
      turnRate: [1, 10],
      gatherTime: [0.12, 0.6],
      readInterval: [0.05, 0.5],
      gravity: [8, 11],
      releaseHeight: [1.2, 2.4],
    }
  for (const [key, [low, high]] of Object.entries(bounds)) finite(a[key], low, high)
  if (Math.round(Number(a.duration) / Number(a.dt)) + 1 > EXECUTION_LIMITS.frames)
    fail('Replay exceeds its frame budget.')
  if (!Number.isInteger(v.seed)) fail('Seed must be an integer.')
  finite(v.seed, 0, 0xffffffff)
  const parameters = object(v.parameters),
    defs = new Map(p.parameters.map((x) => [x.id, x]))
  const parameter = (key: string, value: unknown): void => {
    const d = defs.get(key)
    if (!d) fail(`Unknown input parameter ${key}.`)
    if (typeof value !== typeof d!.default) fail(`Wrong parameter type: ${key}.`)
    if (typeof value === 'string') text(value, EXECUTION_LIMITS.parameterString)
    if (typeof value === 'number') finite(value, d!.min ?? -1e6, d!.max ?? 1e6)
    if (d!.choices && !d!.choices.includes(value as never)) fail(`Unsupported parameter value: ${key}.`)
  }
  for (const d of p.parameters) {
    if (!Object.hasOwn(parameters, d.id)) fail(`Missing input parameter ${d.id}.`)
  }
  for (const [key, value] of Object.entries(parameters)) parameter(key, value)
  const commands = list(v.commands, EXECUTION_LIMITS.commands)
  unique(commands, 'command')
  let last = -Infinity
  for (const raw of commands) {
    const c = object(raw),
      at = finite(c.at, 0, Number(a.duration))
    if (at < last) fail('Commands must be chronological; author order resolves ties.')
    last = at
    if (c.kind === 'parameters') for (const [key, value] of Object.entries(object(c.values))) parameter(key, value)
    else if (c.kind === 'move') {
      if (!p.players.some((x) => x.id === c.playerId)) fail('Movement names an unknown player.')
      point(c.target)
      if (c.until !== undefined && finite(c.until, 0, Number(a.duration)) <= at) fail('Movement end precedes start.')
      if (c.release) {
        const q = JSON.parse(JSON.stringify(p))
        q.defenseRules.push({ id: 'validation-only', label: '', when: c.release, replaceFor: [], obligations: [] })
        validateProgram(q)
      }
    } else fail('Unsupported execution command.')
  }
  for (const [id, start] of Object.entries(object(v.startingPositions ?? {}))) {
    if (!p.players.some((x) => x.id === id)) fail('Unknown starting player.')
    point(start)
  }
  for (const [id, raw] of Object.entries(object(v.personnel ?? {}))) {
    if (!p.players.some((x) => x.id === id)) fail('Personnel names an unknown player.')
    const person = object(raw)
    for (const [key, value] of Object.entries(person)) {
      const b =
        key === 'speed'
          ? [0.6, 1.4]
          : key === 'lateral'
            ? [0.4, 1.1]
            : key === 'height'
              ? [1.5, 2.3]
              : fail('Unknown personnel attribute.')
      finite(value, b[0], b[1])
    }
  }
  validateReplayWork(v as unknown as ExecutionInput)
  return JSON.parse(JSON.stringify(v)) as ExecutionInput
}
export const executionInputSchema: z.ZodType<ExecutionInput, z.ZodTypeDef, unknown> = z
  .unknown()
  .transform((value, ctx) => {
    try {
      return parseExecutionInput(value)
    } catch (error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: error instanceof Error ? error.message : 'Invalid executable input.',
      })
      return z.NEVER
    }
  })
export function executionCompatibility(input: import('./program').StoredExecutionInput): {
  replayable: boolean
  reason?: string
} {
  return input.schemaVersion === CONFIG_SCHEMA_VERSION && input.engineVersion === ENGINE_VERSION
    ? { replayable: true }
    : {
        replayable: false,
        reason: `This input uses schema ${input.schemaVersion} and engine ${input.engineVersion}; installed execution is schema ${CONFIG_SCHEMA_VERSION}, ${ENGINE_VERSION}.`,
      }
}
export type { ExecutionInput, ContentProgram, ActorRef, Condition, Scalar, Target }

export function parseStoredExecutionInput(value: unknown): import('./program').StoredExecutionInput {
  const v = object(value)
  finite(v.schemaVersion, 1, 100)
  identifier(v.engineVersion)
  const ref = object(v.content)
  identifier(ref.id)
  identifier(ref.version)
  identifier(ref.hash)
  if (v.schemaVersion === CONFIG_SCHEMA_VERSION && v.engineVersion === ENGINE_VERSION) return parseExecutionInput(value)
  let nodes = 0
  const scan = (x: unknown, depth: number): void => {
    if (++nodes > 60000 || depth > 40) fail('Stored execution exceeds its JSON budget.')
    if (typeof x === 'number') {
      if (!Number.isFinite(x)) fail('Stored numbers must be finite.')
    } else if (typeof x === 'string') {
      if (x.length > 100000) fail('Stored string exceeds its budget.')
    } else if (x && typeof x === 'object') {
      if (!Array.isArray(x) && Object.getPrototypeOf(x) !== Object.prototype)
        fail('Stored execution must be plain JSON.')
      for (const [key, child] of Object.entries(x)) {
        if (['__proto__', 'prototype', 'constructor'].includes(key)) fail('Unsupported stored execution key.')
        scan(child, depth + 1)
      }
    } else if (x !== null && !['string', 'boolean'].includes(typeof x))
      fail('Stored execution must be serializable JSON.')
  }
  scan(v, 0)
  return JSON.parse(JSON.stringify(v)) as import('./program').StoredExecutionInput
}
export type { StoredExecutionInput } from './program'
