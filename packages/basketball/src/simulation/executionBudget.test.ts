import { describe, expect, it } from 'vitest'
import { compileExperiment, replayExecution } from './facade'
import { createDefaultConfig } from '../content/highPnr/scenario'
import { createBaselineExecution } from '../content/baselineDrive/program'
import { contentHash, parseExecutionInput, parseStoredExecutionInput } from '../domain/execution'
import { EXECUTION_LIMITS, jsonBytes, projectedReplayWork } from '../domain/executionBudget'
import { createProgramCodec, acceptAnswer, emptySystem } from '../program/model'
import { analyze } from '../queries/analytics'
import type { ExecutionInput } from '../domain/program'

const reseal = (input: ExecutionInput) => {
  input.content.hash = contentHash(input.program)
  return input
}
const replaceStrings = <T>(value: T, substitutions: Map<string, string>): T => {
  const walk = (x: unknown): unknown => {
    if (typeof x === 'string') return substitutions.get(x) ?? x
    if (Array.isArray(x)) return x.map(walk)
    if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, walk(v)]))
    return x
  }
  return walk(value) as T
}

describe('aggregate executable work bounds', () => {
  it('rejects dense accumulating commitments before current program import or replay', () => {
    const input = createBaselineExecution()
    input.program.defenseRules = Array.from({ length: 96 }, (_, i) => ({
      id: `dense-${i}`,
      label: 'Guard',
      replaceFor: [],
      obligations: Array.from({ length: 24 }, (_, j) => ({
        id: `dense-${i}-${j}`,
        defender: { role: 'rimHelper' },
        subject: { actor: { role: 'drifter' } },
        threat: 'drift',
        kind: 'guard',
        target: { x: 0, z: 2 },
        priority: 1,
      })),
    }))
    input.assumptions.duration = 12
    input.assumptions.dt = 0.01
    reseal(input)
    expect(() => parseExecutionInput(input)).toThrow(/budget/)
    expect(() => replayExecution(input)).toThrow(/budget/)
    const program = acceptAnswer(emptySystem('p'), {
      entryId: 'dense',
      versionId: 'dense-v1',
      at: '2026-10-06T00:00:00.000Z',
      name: 'Dense answer',
      situationId: input.content.id,
      scope: 'varsity',
      when: 'baseline',
      presetIds: [],
      snapshot: { kind: 'executable', input },
      note: '',
      accepts: [],
      knownBreaks: [],
      evidence: { state: 'legacy-unknown' },
    }).program
    const codec = createProgramCodec({ execution: parseStoredExecutionInput })
    expect(() => codec.parse(program)).toThrow(/budget/)
  })

  it('rejects aggregate active growth even when every individual rule is small', () => {
    const input = createBaselineExecution(),
      defenders = input.program.players.filter((p) => p.team === 'defense')
    input.program.defenseRules = Array.from({ length: 5 }, (_, i) => ({
      id: `extra-${i}`,
      label: 'Guard',
      replaceFor: [],
      obligations: defenders.map((player, j) => ({
        id: `extra-${i}-${j}`,
        defender: { player: player.id },
        subject: { actor: { role: 'drifter' } },
        threat: 'drift',
        kind: 'guard',
        target: { x: 0, z: 2 },
        priority: 1,
      })),
    }))
    expect(() => parseExecutionInput(reseal(input))).toThrow(/aggregate active obligation budget/)
  })

  it('rejects replicated labels and long parameter values before execution', () => {
    const input = createBaselineExecution()
    input.program.defenseRules[0].label = 'x'.repeat(500000)
    expect(() => parseExecutionInput(reseal(input))).toThrow(/text.*budget/)
    const parameter = createBaselineExecution()
    parameter.program.parameters.push({ id: 'author.note', default: 'short' })
    parameter.parameters['author.note'] = 'x'.repeat(161)
    expect(() => parseExecutionInput(reseal(parameter))).toThrow(/text.*budget/)
  })

  it('rejects projected memory/evidence amplification without executing a maximum replay', () => {
    const input = createBaselineExecution(),
      id = 'parameter-'.padEnd(120, 'p'),
      value = 'v'.repeat(150)
    input.program.parameters.push({ id, default: value })
    input.parameters[id] = value
    input.program.offenseRules = Array.from({ length: 16 }, (_, i) => ({
      id: `remember-${i}`,
      label: 'Observed',
      earliest: 0,
      priority: 1,
      motions: [],
      when: { all: Array.from({ length: 6 }, () => ({ parameter: id, equals: value })) },
    }))
    input.assumptions.duration = 12
    input.assumptions.dt = 0.01
    expect(() => parseExecutionInput(reseal(input))).toThrow(/projected serialized output budget/)
  })

  it('accepts authored hero and baseline bounds, including the longest supported clock', () => {
    for (const input of [compileExperiment(createDefaultConfig()), createBaselineExecution()]) {
      const work = projectedReplayWork(input),
        run = replayExecution(input)
      expect(work.obligations).toBeLessThanOrEqual(EXECUTION_LIMITS.activeObligations)
      expect(Math.max(...run.frames.map((f) => f.responsibilities.length))).toBeLessThanOrEqual(work.obligations)
      expect(jsonBytes(run)).toBeLessThan(work.bytes)
      const maximum = { ...input, assumptions: { ...input.assumptions, duration: 12, dt: 0.01 } }
      expect(parseExecutionInput(maximum).assumptions).toEqual(maximum.assumptions)
    }
  })

  it('bounds direct analytical work on a supplied trace before pair enumeration', () => {
    const run = replayExecution(createBaselineExecution()),
      frame = run.frames[0]
    frame.responsibilities = Array.from({ length: 25 }, () => ({ ...frame.responsibilities[0] }))
    expect(() => analyze(run)).toThrow(/per-frame record budget/)
  })
})

describe('opaque authored identifiers and launch availability', () => {
  it.each(['toString', 'hasOwnProperty', '__proto__', 'constructor'])(
    'preserves encounters and latched memory for %s',
    (id) => {
      const config = createDefaultConfig()
      config.answer.coverage = 'switch'
      const input = compileExperiment(config),
        screen = input.program.actions.find((a) => a.screen)!,
        memory = input.program.memoryRules[0]
      const renamed = reseal(
        replaceStrings(
          input,
          new Map([
            [screen.id, id],
            [memory.id, id],
          ]),
        ),
      )
      const before = replayExecution(input),
        after = replayExecution(renamed)
      expect(after.frames.map((f) => ({ players: f.players, ball: f.ball }))).toEqual(
        before.frames.map((f) => ({ players: f.players, ball: f.ball })),
      )
      expect(after.decisions.map((d) => [d.t, d.selected])).toEqual(before.decisions.map((d) => [d.t, d.selected]))
      expect(after.events.filter((e) => e.type === 'screen').map((e) => e.t)).toEqual(
        before.events.filter((e) => e.type === 'screen').map((e) => e.t),
      )
      expect(after.frames.some((f) => Object.hasOwn(f.policyEvaluations[0].memoryAfter.encounters, id))).toBe(true)
      expect(after.frames.some((f) => Object.hasOwn(f.policyEvaluations[0].memoryAfter.flags, id))).toBe(true)
    },
  )

  it('rejects an extension before an initial launch plan exists', () => {
    const input = createBaselineExecution(),
      pass = input.program.opportunities.find((o) => o.kind === 'pass')!
    pass.launches![0].timing = 'extend-first'
    expect(() => parseExecutionInput(reseal(input))).toThrow(/first authored launch/)
  })
})
