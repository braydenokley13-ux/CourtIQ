import type { Condition, ContentProgram, ExecutionInput } from './program'

export const EXECUTION_LIMITS = Object.freeze({
  players: 10,
  frames: 1201,
  commands: 64,
  actions: 96,
  rules: 96,
  reads: 48,
  opportunities: 48,
  expressionDepth: 40,
  jsonNodes: 60000,
  jsonText: 100000,
  string: 4096,
  label: 256,
  parameterString: 160,
  activeObligations: 24,
  obligationsPerDefender: 8,
  defenderAlternatives: 12,
  authoredObligations: 128,
  activations: 16,
  encounters: 16,
  evidence: 16,
  evidenceText: 384,
  traceBytes: 64 * 1024 * 1024,
  queryPairs: 400000,
  maxPasses: 8,
})

/** UTF-8 size of the actual JSON encoding, without browser or Node helpers. */
export function jsonBytes(value: unknown): number {
  let bytes = 0
  for (const char of JSON.stringify(value)) {
    const code = char.codePointAt(0)!
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4
  }
  return bytes
}

/** All predicates may succeed. Conditional replacements retain either outcome. */
export function maximumObligations(program: ContentProgram): number {
  const counts = new Map(program.players.filter((p) => p.team === 'defense').map((p) => [p.id, 0]))
  const id = (actor: ContentProgram['initial']['matchups'][number]['defender']): string => {
    if ('player' in actor) return actor.player
    if ('role' in actor && Object.hasOwn(program.roles, actor.role)) return program.roles[actor.role]
    throw new Error('Defensive ownership must resolve to an authored defender.')
  }
  const add = (defs: ContentProgram['initial']['matchups']): Map<string, number> => {
    const grouped = new Map<string, typeof defs>()
    for (const task of defs) {
      const defender = id(task.defender)
      grouped.set(defender, [...(grouped.get(defender) ?? []), task])
    }
    return new Map([...grouped].map(([defender, tasks]) => [defender, compatibleObligations(tasks)]))
  }
  const check = () => {
    if ([...counts.values()].some((n) => n > EXECUTION_LIMITS.obligationsPerDefender))
      throw new Error('Content exceeds its per-defender obligation budget.')
    if ([...counts.values()].reduce((sum, n) => sum + n, 0) > EXECUTION_LIMITS.activeObligations)
      throw new Error('Content exceeds its aggregate active obligation budget.')
  }
  for (const [defender, n] of add(program.initial.matchups)) counts.set(defender, n)
  check()
  for (const rule of program.defenseRules) {
    const replaced = new Set(rule.replaceFor.map(id)),
      added = add(rule.obligations)
    for (const [defender, previous] of counts) {
      const next = (replaced.has(defender) ? 0 : previous) + (added.get(defender) ?? 0)
      counts.set(defender, rule.when ? Math.max(previous, next) : next)
    }
    check()
  }
  return [...counts.values()].reduce((sum, n) => sum + n, 0)
}

/** A bounded sufficient proof of exclusion, not a general satisfiability solver. */
function compatibleObligations(tasks: ContentProgram['initial']['matchups']): number {
  if (tasks.length > EXECUTION_LIMITS.defenderAlternatives) return tasks.length
  const canonical = (x: unknown): string =>
    x && typeof x === 'object'
      ? Array.isArray(x)
        ? `[${x.map(canonical).join(',')}]`
        : `{${Object.keys(x)
            .sort()
            .map((k) => `${JSON.stringify(k)}:${canonical((x as Record<string, unknown>)[k])}`)
            .join(',')}}`
      : JSON.stringify(x)
  const predicates = tasks.map((task) => {
    const positive = new Set<string>(),
      negative = new Set<string>(),
      values = new Map<string, string>()
    const visit = (c: Condition) => {
      if ('not' in c) negative.add(canonical(c.not))
      else {
        positive.add(canonical(c))
        if ('all' in c) c.all.forEach(visit)
        if ('parameter' in c) values.set(c.parameter, canonical(c.equals))
      }
    }
    if (task.when) visit(task.when)
    return { positive, negative, values }
  })
  const compatible = (a: (typeof predicates)[number], b: (typeof predicates)[number]) =>
    ![...a.positive].some((v) => b.negative.has(v)) &&
    ![...b.positive].some((v) => a.negative.has(v)) &&
    ![...a.values].some(([id, value]) => b.values.has(id) && b.values.get(id) !== value)
  let maximum = 0
  const pairs = predicates.map((a) => predicates.map((b) => compatible(a, b)))
  // At most twelve alternatives per defender: 4096 subsets, with no reference expansion.
  for (let mask = 1; mask < 2 ** tasks.length; mask++) {
    const chosen = predicates.map((_, i) => i).filter((i) => mask & (1 << i))
    if (chosen.length <= maximum) continue
    if (chosen.every((a, i) => chosen.slice(i + 1).every((b) => pairs[a][b]))) maximum = chosen.length
  }
  return maximum
}

function evidenceBytes(condition: Condition): number[] {
  if ('all' in condition) return condition.all.flatMap(evidenceBytes).slice(0, EXECUTION_LIMITS.evidence)
  if ('any' in condition) {
    const candidates = condition.any.map(evidenceBytes)
    return Array.from({ length: Math.max(0, ...candidates.map((v) => v.length)) }, (_, i) =>
      Math.max(0, ...candidates.map((v) => v[i] ?? 0)),
    )
  }
  const idBytes = (id: string) => jsonBytes(id) + 48
  if ('parameter' in condition) return [idBytes(condition.parameter) + jsonBytes(condition.equals)]
  if ('memory' in condition) return [idBytes(condition.memory)]
  if ('encountered' in condition) return [idBytes(condition.encountered)]
  if ('activated' in condition) return [idBytes(condition.activated)]
  if ('actionActive' in condition) return [idBytes(condition.actionActive)]
  return [96]
}

/** Conservative output bound includes repeated policy snapshots and latched evidence. */
export function projectedReplayWork(input: ExecutionInput): { bytes: number; queryPairs: number; obligations: number } {
  const p = input.program,
    frames = Math.round(input.assumptions.duration / input.assumptions.dt) + 1
  const obligations = maximumObligations(p)
  const allTasks = [...p.initial.matchups, ...p.defenseRules.flatMap((r) => r.obligations)]
  const maxId = Math.max(
    32,
    ...p.players.flatMap((v) => [jsonBytes(v.id), jsonBytes(v.role)]),
    ...allTasks.map((v) => jsonBytes(v.id)),
    ...p.parameters.map((v) => jsonBytes(v.id)),
    ...p.defenseRules.map((v) => jsonBytes(v.id)),
    ...p.offenseRules.map((v) => jsonBytes(v.id)),
    ...p.reads.map((v) => jsonBytes(v.id)),
    ...p.actions.map((v) => jsonBytes(v.id)),
    ...input.commands.map((v) => jsonBytes(v.id)),
    ...p.opportunities.map((v) => jsonBytes(v.id)),
  )
  const maxLabel = Math.max(
    32,
    ...p.opportunities.map((o) => jsonBytes(o.label)),
    ...p.offenseRules.map((r) => jsonBytes(r.label)),
    ...p.defenseRules.map((r) => {
      let label = r.label
      for (const b of r.labelBindings ?? []) label = label.replaceAll(`{${b.token}}`, '-1000000.000')
      return Math.max(jsonBytes(r.label), jsonBytes(label))
    }),
  )
  const parameterBytes = p.parameters.reduce(
    (sum, d) =>
      sum +
      jsonBytes(d.id) +
      28 +
      Math.max(
        jsonBytes(input.parameters[d.id]),
        ...input.commands
          .filter((c) => c.kind === 'parameters' && Object.hasOwn(c.values, d.id))
          .map((c) => jsonBytes(c.kind === 'parameters' ? c.values[d.id] : null)),
      ),
    2,
  )
  const memoryBytes =
    120 +
    p.memoryRules.reduce((n, r) => n + jsonBytes(r.id) + 10, 0) +
    p.actions.filter((a) => a.screen).reduce((n, a) => n + jsonBytes(a.id) + 30, 0) +
    p.offenseRules.reduce((n, r) => n + jsonBytes(r.id) + 96 + evidenceBytes(r.when).reduce((s, b) => s + b + 1, 0), 0)
  const frameBytes =
    1800 +
    4 * maxId +
    p.players.reduce((n, player) => n + 800 + jsonBytes(player.id) + jsonBytes(player.role), 0) +
    2 * obligations * (600 + maxId * 7 + maxLabel) +
    p.opportunities.length * (500 + maxId * 3) +
    3 * memoryBytes +
    2 * parameterBytes +
    p.defenseRules.reduce((n, rule) => n + jsonBytes(rule.id) + 1, 0) +
    5 * (700 + 4 * maxId)
  // At most one decision per frame. Transfer/read/contact/cue events have bounded records.
  const decisionBytes = 600 + maxId * 3 + maxLabel + p.opportunities.length * (250 + maxId * 2)
  const eventCount =
    5 * frames +
    2 * input.commands.length +
    p.actions.filter((a) => a.screen).length +
    p.offenseRules.length +
    3 * p.terminal.maxPasses +
    4
  const eventBytes =
    eventCount * (600 + maxId * 3 + maxLabel) +
    p.offenseRules.reduce((n, r) => n + evidenceBytes(r.when).reduce((s, b) => s + b + 2, 0), 0)
  return {
    bytes: jsonBytes(input) + frames * (frameBytes + decisionBytes) + eventBytes,
    queryPairs: (frames * obligations * (obligations - 1)) / 2,
    obligations,
  }
}

export function validateReplayWork(input: ExecutionInput): void {
  const work = projectedReplayWork(input)
  if (work.bytes > EXECUTION_LIMITS.traceBytes)
    throw new Error('Replay exceeds its projected serialized output budget.')
  if (work.queryPairs > EXECUTION_LIMITS.queryPairs) throw new Error('Replay exceeds its aggregate query work budget.')
}
