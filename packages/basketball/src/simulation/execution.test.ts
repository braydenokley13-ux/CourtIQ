import { describe, it, expect } from 'vitest'
import { compileExperiment, simulate, replayExecution, forkExecution, frameAt } from './facade'
import { createDefaultConfig, HIGH_PNR_PROBLEM } from '../content/highPnr/scenario'
import { createBaselineExecution } from '../content/baselineDrive/program'
import {
  canonicalInputFingerprint,
  contentHash,
  parseExecutionInput,
  parseStoredExecutionInput,
  executionCompatibility,
} from '../domain/execution'
import { getTagGuide, tagDepthFromFloorPoint } from '../queries/tagGuide'
import { analyze } from '../queries/analytics'
import type { ExecutionInput, ContentProgram } from '../domain/program'
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x))
const reseal = (input: ExecutionInput) => {
  input.content.id = input.program.id
  input.content.hash = contentHash(input.program)
  return input
}
function rename(input: ExecutionInput): ExecutionInput {
  const maps = new Map<string, string>()
  for (const p of input.program.players) maps.set(p.id, `actor-${maps.size}`)
  for (const key of Object.keys(input.program.roles)) maps.set(key, `role-${maps.size}`)
  for (const group of [
    input.program.actions,
    input.program.opportunities,
    input.program.reads,
    input.program.offenseRules,
    input.program.defenseRules,
    input.program.memoryRules,
    input.program.parameters,
    ...input.program.defenseRules.map((r) => r.obligations),
    input.program.initial.matchups,
  ])
    for (const r of group) if (!maps.has(r.id)) maps.set(r.id, `authored-${maps.size}`)
  maps.set(input.program.id, 'renamed-content')
  const keys = new Set([
    'id',
    'role',
    'player',
    'threat',
    'ballOwner',
    'readNode',
    'action',
    'activated',
    'encountered',
    'encounterTime',
    'activation',
    'actionActive',
    'memory',
    'railParameter',
    'parameter',
    'playerId',
  ])
  const walk = (x: any, key = ''): any => {
    if (typeof x === 'string') return keys.has(key) || ['options', 'excludes'].includes(key) ? (maps.get(x) ?? x) : x
    if (Array.isArray(x)) return x.map((v) => walk(v, key))
    if (x && typeof x === 'object')
      return Object.fromEntries(
        Object.entries(x).map(([k, v]) =>
          ['roles', 'continuations'].includes(key)
            ? [maps.get(k) ?? k, typeof v === 'string' ? (maps.get(v) ?? v) : walk(v, k)]
            : key === 'parameters' && !Array.isArray(x)
              ? [maps.get(k) ?? k, walk(v, k)]
              : [k, walk(v, k)],
        ),
      )
    return x
  }
  const renamed = walk(input)
  renamed.content.id = renamed.program.id
  return reseal(renamed)
}
const physical = (trace: ReturnType<typeof replayExecution>) => ({
  frames: trace.frames.map((f) => ({
    t: f.t,
    players: f.players.map((p) => [p.x, p.z, p.vx, p.vz, p.yaw, p.pose]),
    ball: [f.ball.x, f.ball.y, f.ball.z, f.ball.phase],
    tasks: f.responsibilities.map((r) => [
      trace.input.program.players.findIndex((p) => p.id === r.defenderId),
      trace.input.program.players.findIndex((p) => p.id === r.offensivePlayerId),
      trace.input.program.opportunities.findIndex((o) => o.id === r.threatId),
      r.kind,
      r.target,
      r.priority,
    ]),
  })),
  reads: trace.decisions.map((d) => [
    d.t,
    trace.input.program.players.findIndex((p) => p.id === d.actorId),
    trace.input.program.opportunities.findIndex((o) => o.id === d.selected),
  ]),
  events: trace.events.map((e) => [e.t, e.type]),
})

describe('portable deterministic execution', () => {
  it('round-trips materialized hero content without consulting a recipe or mutable catalog', () => {
    const recipe = createDefaultConfig(),
      input = compileExperiment(recipe),
      frozen = canonicalInputFingerprint(input),
      a = replayExecution(input),
      b = replayExecution(parseExecutionInput(JSON.parse(JSON.stringify(input))))
    expect(b).toEqual(a)
    recipe.answer.tagDepth = 0.1
    input.program.players[0].start.x = 7
    expect(canonicalInputFingerprint(a.input)).toBe(frozen)
    expect(simulate(createDefaultConfig()).events).toEqual(a.events)
  })
  it.each(['hero', 'baseline'] as const)(
    'executes renamed %s actors, roles, threats, parameters and rules with identical physical behavior',
    (family) => {
      const input = family === 'hero' ? compileExperiment(createDefaultConfig()) : createBaselineExecution()
      const a = replayExecution(input),
        b = replayExecution(parseExecutionInput(rename(input)))
      expect(physical(b)).toEqual(physical(a))
    },
  )
  it('forks by replaying the full frozen history and preserves every earlier state and event', () => {
    const input = createBaselineExecution(),
      baseline = replayExecution(input),
      tick = 60,
      at = tick * input.assumptions.dt,
      branch = forkExecution(input, tick, [
        { id: 'help-change', at, kind: 'parameters', values: { 'help.commitment': 0.15 } },
      ]),
      a = replayExecution(branch),
      b = replayExecution(JSON.parse(JSON.stringify(branch)))
    expect(a).toEqual(b)
    expect(a.frames.filter((f) => f.tick < tick)).toEqual(baseline.frames.filter((f) => f.tick < tick))
    expect(a.events.filter((e) => e.t < at)).toEqual(baseline.events.filter((e) => e.t < at))
    expect(a.frames[tick].players).toEqual(baseline.frames[tick].players)
    expect(a.frames[tick + 20].players).not.toEqual(baseline.frames[tick + 20].players)
    expect(() =>
      forkExecution(input, tick, [{ id: 'past', at: at - 0.1, kind: 'parameters', values: { 'help.enabled': false } }]),
    ).toThrow('prefix')
  })
  it('records exact delayed policy context and projects its committed tag rail', () => {
    const recipe = createDefaultConfig(),
      run = simulate(recipe),
      frame = frameAt(run, 0.75),
      evaluation = frame.policyEvaluations[0],
      primary = frame.responsibilities
        .filter((r) => r.defenderId === HIGH_PNR_PROBLEM.roles.lowMan)
        .sort((a, b) => b.priority - a.priority)[0],
      guide = getTagGuide(frame, recipe.answer, HIGH_PNR_PROBLEM, recipe)
    expect(evaluation.effectiveTick).toBe(frame.tick)
    expect(evaluation.observedTick).toBeLessThan(frame.tick)
    expect(evaluation.observedAt).toBe(run.frames[evaluation.observedTick].t)
    expect(evaluation.obligations).toEqual(frame.responsibilities)
    expect(guide.currentTarget).toEqual(primary.target)
    expect(guide.editable).toBe(true)
    expect(tagDepthFromFloorPoint(guide, guide.currentTarget)).toBeCloseTo(recipe.answer.tagDepth, 8)
    recipe.answer.tagDepth = 0
    expect(getTagGuide(frame, recipe.answer, HIGH_PNR_PROBLEM, recipe)).toEqual(guide)
  })
  it('keeps a held actor at a dragged starting position and keeps caller snapshots independent', () => {
    const c = createDefaultConfig()
    c.startingPositions = { O2: { x: 3.5, z: 1.4 } }
    const run = simulate(c)
    for (const f of run.frames.filter((f) => f.t < 1.5))
      expect(Math.abs(f.players.find((p) => p.id === 'O2')!.x - 3.5)).toBeLessThan(0.15)
    run.frames[0].policyEvaluations[0].parameterTargets[0].current.x = 999
    expect(run.frames[1].policyEvaluations[0].parameterTargets[0].current.x).not.toBe(999)
  })
})
describe('independent baseline content', () => {
  it('has native roles, opportunities, ball ownership, matchups and no screen or hero recipe', () => {
    const input = createBaselineExecution(),
      before = clone(input),
      run = replayExecution(input)
    expect(input).toEqual(before)
    expect(input.program.roles).toHaveProperty('driver')
    expect(input.program.roles).toHaveProperty('dunker')
    expect(input.program.roles).not.toHaveProperty('screener')
    expect(run.frames[0].ball.owner).toBe(input.program.roles.driver)
    expect(run.frames[0].responsibilities).toHaveLength(5)
    expect(run.events.some((e) => e.type === 'screen')).toBe(false)
    expect(run.frames.some((f) => f.responsibilities.some((r) => r.kind === 'switch'))).toBe(false)
    expect(run.decisions.some((d) => d.selected === 'drift')).toBe(true)
    expect(analyze(run).windows.map((w) => w.id)).toEqual(expect.arrayContaining(['finish', 'dump', 'drift', 'skip']))
    const early = run.frames[0],
      late = frameAt(run, 2.0)
    for (const role of ['driver', 'drifter', 'weakSpacer']) {
      const id = input.program.roles[role],
        a = early.players.find((p) => p.id === id)!,
        b = late.players.find((p) => p.id === id)!
      expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(0.15)
    }
  })
  it('executes genuinely different authored helper rules and player formation through the same runner', () => {
    const input = createBaselineExecution(),
      on = replayExecution(input),
      off = replayExecution({ ...input, parameters: { ...input.parameters, 'help.enabled': false } })
    expect(on.frames.some((f) => f.responsibilities.some((r) => r.sourceRuleId === 'rim-help'))).toBe(true)
    expect(off.frames.some((f) => f.responsibilities.some((r) => r.sourceRuleId === 'rim-help'))).toBe(false)
    expect(off.frames.map((f) => f.players)).not.toEqual(on.frames.map((f) => f.players))
    const other = clone(input)
    other.program.id = 'opposite-baseline'
    other.program.roles.driver = 'spacer-2'
    other.program.roles.strongSpacer = 'driver-1'
    other.program.initial.ballOwner = 'spacer-2'
    other.program.initial.readNode = 'baseline-read'
    other.program.actions[0].target = { x: -1.3, z: 1.2 }
    reseal(other)
    const r = replayExecution(other)
    expect(r.frames[0].ball.owner).toBe('spacer-2')
    expect(r.frames[30].players.find((p) => p.id === 'spacer-2')!.z).toBeLessThan(
      r.frames[0].players.find((p) => p.id === 'spacer-2')!.z,
    )
  })
})
describe('bounded codecs and executable references', () => {
  it('preserves unsupported future payloads for read/export while refusing replay', () => {
    const input: any = createBaselineExecution()
    input.schemaVersion = 3
    input.engineVersion = 'basketball-3.0.0'
    input.seed = 0xffffffff
    input.program.actions[0].kind = 'cut'
    const stored = parseStoredExecutionInput(input)
    expect(stored).toEqual(input)
    expect(executionCompatibility(stored).replayable).toBe(false)
    expect(() => parseExecutionInput(stored)).toThrow('unavailable')
    expect(() => replayExecution(stored as ExecutionInput)).toThrow('unavailable')
    expect(JSON.parse(JSON.stringify(stored))).toEqual(input)
  })
  it.each([
    'terminal',
    'roles',
    'launch',
    'node-owner',
    'unknown-role',
    'duplicate-task',
    'cyclic-actions',
    'expanded-actions',
  ] as const)('rejects malformed current %s before replay', (kind) => {
    const input = createBaselineExecution(),
      p = input.program
    switch (kind) {
      case 'terminal':
        delete (p.terminal as any).shotBaseDuration
        break
      case 'roles':
        delete p.roles.driver
        break
      case 'launch':
        p.opportunities.find((o) => o.kind === 'pass')!.launches = []
        break
      case 'node-owner':
        p.reads[0].actor = { role: 'strongSpacer' }
        break
      case 'unknown-role':
        p.actions[0].target = { actor: { role: 'toString' } }
        break
      case 'duplicate-task':
        p.initial.matchups[1].id = p.initial.matchups[0].id
        break
      case 'cyclic-actions':
        p.actions = [
          { ...p.actions[0], id: 'a', when: { actionActive: 'b' } },
          { ...p.actions[0], id: 'b', when: { actionActive: 'a' } },
        ]
        break
      case 'expanded-actions':
        p.actions = Array.from({ length: 13 }, (_, i) => ({
          ...p.actions[0],
          id: `a${i}`,
          when: i === 12 ? { all: [] } : { all: [{ actionActive: `a${i + 1}` }, { actionActive: `a${i + 1}` }] },
        }))
        break
    }
    expect(() => parseExecutionInput(reseal(input))).toThrow()
  })
  it('rejects overflowing authored arithmetic during bounded execution and never commits null numeric state', () => {
    const input = createBaselineExecution()
    input.program.actions[0].target = {
      components: {
        x: { op: 'multiply', values: Array(12).fill({ op: 'multiply', values: Array(12).fill(1e6) }) },
        z: 5,
      },
    }
    expect(() => replayExecution(reseal(input))).toThrow('finite')
    const bad = createBaselineExecution()
    bad.program.terminal.shotBaseDuration = 0
    bad.program.terminal.shotDistanceDuration = 0
    expect(() => parseExecutionInput(reseal(bad))).toThrow()
  })
  it('a keep opportunity belongs only to the current ball carrier', () => {
    const input = createBaselineExecution()
    input.program.opportunities.find((o) => o.kind === 'keep')!.actor = { role: 'strongSpacer' }
    const run = replayExecution(reseal(input))
    for (const frame of run.frames) {
      const keep = frame.options.find((o) => o.kind === 'keep')!
      if (keep.available) expect(keep.playerId).toBe(frame.ball.owner)
    }
    expect(run.decisions.some((d) => d.selected === 'finish' && d.actorId !== 'spacer-2')).toBe(false)
  })
  it('rejects unknown installed content without a hero fallback', () => {
    expect(() => compileExperiment({ ...createDefaultConfig(), problemId: 'missing-family' })).toThrow('not installed')
  })
})
