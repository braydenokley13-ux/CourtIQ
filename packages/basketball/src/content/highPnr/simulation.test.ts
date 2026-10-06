import { describe, expect, it } from 'vitest'
import { analyze, compare } from '../../queries/analytics'
import { createDefaultConfig, HIGH_PNR_PROBLEM } from './scenario'
import { simulate, simulateProblem } from '../../simulation/facade'
import type { LabConfig, HighPnrRecipeDefinition } from './types'

describe('coupled basketball simulation', () => {
  it('repeats physical history and opponent reads exactly with identical inputs', () => {
    const config = createDefaultConfig()
    config.counter = 'auto'
    const input = JSON.stringify(config)
    const first = simulate(config)
    const second = simulate(config)
    expect(second.frames).toEqual(first.frames)
    expect(second.events).toEqual(first.events)
    expect(second.decisions).toEqual(first.decisions)
    expect(JSON.stringify(config)).toBe(input)
  })

  it('preserves every prior frame/event and the edit-boundary physical state', () => {
    const config = createDefaultConfig()
    const baseline = simulate(config)
    const edited = simulate({
      ...config,
      interventions: [{ id: 'shallow-at-1.2', kind: 'answer', at: 1.2, patch: { tagDepth: 0.2 } }],
    })
    expect(edited.frames.filter((frame) => frame.t < 1.2)).toEqual(baseline.frames.filter((frame) => frame.t < 1.2))
    expect(edited.events.filter((event) => event.t < 1.2)).toEqual(baseline.events.filter((event) => event.t < 1.2))
    const beforeBoundary = baseline.frames.find((frame) => frame.t === 1.2)!
    const afterBoundary = edited.frames.find((frame) => frame.t === 1.2)!
    expect(afterBoundary.players.map((player) => [player.id, player.x, player.z, player.vx, player.vz])).toEqual(
      beforeBoundary.players.map((player) => [player.id, player.x, player.z, player.vx, player.vz]),
    )
    expect(afterBoundary.answer.tagDepth).toBe(0.2)
    expect(edited.frames.at(-1)?.players.find((player) => player.id === 'D3')).not.toEqual(
      baseline.frames.at(-1)?.players.find((player) => player.id === 'D3'),
    )
  })

  it('changes a movement target while obeying acceleration and speed bounds', () => {
    const config = createDefaultConfig()
    const run = simulate({
      ...config,
      interventions: [
        { id: 'close-corner', kind: 'move', at: 1.2, playerId: 'D3', target: { x: -6.2, z: 1.5 }, until: 3 },
      ],
    })
    const { dt, maxSpeed, acceleration } = config.assumptions
    for (let index = 1; index < run.frames.length; index++) {
      const previous = run.frames[index - 1]
      for (const player of run.frames[index].players) {
        const old = previous.players.find((candidate) => candidate.id === player.id)!
        expect(Math.hypot(player.vx, player.vz)).toBeLessThanOrEqual(maxSpeed + 1e-7)
        expect(Math.hypot(player.vx - old.vx, player.vz - old.vz)).toBeLessThanOrEqual(acceleration * dt + 1e-7)
        expect(Math.hypot(player.x - old.x, player.z - old.z)).toBeLessThanOrEqual(maxSpeed * dt + 1e-7)
      }
    }
  })

  it('changes option geometry and the actual adaptive continuation when a help rule changes', () => {
    const config = createDefaultConfig()
    config.counter = 'auto'
    const shallow = simulate({ ...config, answer: { ...config.answer, tagDepth: 0.2 } })
    const deep = simulate({ ...config, answer: { ...config.answer, tagDepth: 0.95 } })
    const firstReadAt = shallow.decisions[0]?.t ?? 1.5
    const a = shallow.frames.find((frame) => frame.t === firstReadAt)!
    const b = deep.frames.find((frame) => frame.t === firstReadAt)!
    expect(a.options.map((option) => option.influenceDistance)).not.toEqual(
      b.options.map((option) => option.influenceDistance),
    )
    expect(shallow.decisions.map((decision) => decision.selected)).not.toEqual(
      deep.decisions.map((decision) => decision.selected),
    )
    expect(compare(shallow, deep).tradeoffs.some((tradeoff) => tradeoff.direction !== 'similar')).toBe(true)
    expect(analyze(shallow).modelVersion).toBe(shallow.modelVersion)
  })

  it('preserves the legacy timed shallow-tag tradeoff and actual-body launch preview', () => {
    const config = createDefaultConfig()
    delete config.opponent
    const baseline = simulate(config)
    const edited = simulate({
      ...config,
      interventions: [
        { id: 'shallow-at-tag', kind: 'answer', at: HIGH_PNR_PROBLEM.stressAt, patch: { tagDepth: 0.25 } },
      ],
    })
    expect(edited.frames.filter((frame) => frame.t < HIGH_PNR_PROBLEM.stressAt)).toEqual(
      baseline.frames.filter((frame) => frame.t < HIGH_PNR_PROBLEM.stressAt),
    )
    expect(baseline.decisions[0]?.selected).toBe('lift')
    expect(edited.decisions[0]?.selected).toBe('roll')
    const change = compare(baseline, edited)
    expect(change.tradeoffs.find((tradeoff) => tradeoff.id === 'lift')?.direction).toBe('closes')
    // The slower, longer-reaching big leaves a brief pocket window on the roll even against the
    // deep tag in the no-opponent replay, so the shallow tag keeps it open rather than creating it.
    expect(change.tradeoffs.find((tradeoff) => tradeoff.id === 'roll')?.direction).not.toBe('closes')
    expect(change.after.windows.find((window) => window.id === 'roll')!.duration).toBeGreaterThan(0.1)
    const launched = change.after.flightEvidence.find((flight) => flight.to === 'O5')
    expect(launched?.kind).toBe('lob')
    expect(launched?.minClearance).toBeGreaterThan(0)
    expect(launched?.conditionalAfterContact).toBe(false)
    expect(change.after.warnings).toEqual([])
  })

  it('cannot re-aim a launched pass after a future receiver instruction', () => {
    const config = createDefaultConfig()
    const baseline = simulate(config)
    const flight = baseline.frames.find((frame) => frame.ball.flight?.kind !== 'shot' && frame.ball.flight)?.ball.flight
    expect(flight).toBeTruthy()
    if (!flight || !flight.to) throw new Error('Fixture did not produce a pass.')
    const at = Math.ceil((flight.start + 0.1) / config.assumptions.dt) * config.assumptions.dt
    const edited = simulate({
      ...config,
      interventions: [{ id: 'receiver-after-release', kind: 'move', at, playerId: flight.to, target: { x: 6, z: 12 } }],
    })
    expect(edited.frames.filter((frame) => frame.t < at)).toEqual(baseline.frames.filter((frame) => frame.t < at))
    for (const world of edited.frames.filter((frame) => frame.t >= flight.start && frame.t < flight.end)) {
      expect(world.ball.flight?.a).toEqual(flight.a)
      expect(world.ball.flight?.b).toEqual(flight.b)
      const original = baseline.frames.find((frame) => frame.t === world.t)!
      expect([world.ball.x, world.ball.y, world.ball.z]).toEqual([original.ball.x, original.ball.y, original.ball.z])
    }
  })
})
