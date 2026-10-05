import { describe, expect, it } from 'vitest'
import { createDefaultConfig, HIGH_PNR_PROBLEM } from './scenario'
import { DEFAULT_OPPONENT, opponentAt } from './offensivePolicy'
import { frameAt, simulate, simulateProblem } from './simulation'
import { analyze, compare } from './analytics'
import type { LabConfig, ProblemDefinition } from './types'

const counterIds = (run: ReturnType<typeof simulate>) => run.frames.at(-1)?.policyActivations?.map(a => a.ruleId) ?? []
const coordinates = (frame: ReturnType<typeof simulate>['frames'][number]) => frame.players.map(p => [p.id, p.x, p.z, p.vx, p.vz])

describe('observed basketball systems', () => {
  it('the same offense rejects observed overplay, releases against two and withholds a tag-lift against switch', () => {
    const config = createDefaultConfig()
    const drop = simulate(config)
    const ice = simulate({ ...config, answer: { ...config.answer, coverage: 'ice' } })
    const blitz = simulate({ ...config, answer: { ...config.answer, coverage: 'blitz' } })
    const switched = simulate({ ...config, answer: { ...config.answer, coverage: 'switch' } })
    expect(counterIds(ice)).toContain('reject-overplay')
    expect(counterIds(drop)).not.toContain('reject-overplay')
    expect(counterIds(blitz)).toContain('release-two-on-ball')
    expect(counterIds(switched)).not.toContain('lift-behind-tag')
    expect(counterIds(drop)).toContain('lift-behind-tag')
    expect(switched.decisions.map(d => d.selected)).not.toEqual(drop.decisions.map(d => d.selected))
    const release = blitz.frames.at(-1)!.policyActivations!.find(a => a.ruleId === 'release-two-on-ball')!
    expect(release.evidence.some(e => e.includes('big to ballhandler'))).toBe(true)
    expect(release.observedAt).toBeLessThan(release.t)
  })

  it('the default active system exposes the first tag tradeoff through different actual reads and windows', () => {
    const config = createDefaultConfig(), deep = simulate(config)
    const shallow = simulate({ ...config, interventions: [{ id: 'shallow-tag', kind: 'answer', at: 0.75, patch: { tagDepth: 0.25 } }] })
    expect(deep.frames.filter(f => f.t < 0.75)).toEqual(shallow.frames.filter(f => f.t < 0.75))
    expect(deep.decisions.map(d => d.selected)).toEqual(['lift', 'corner', 'drive'])
    expect(shallow.decisions.map(d => d.selected)).toEqual(['roll', 'drive'])
    const paired = compare(deep, shallow)
    expect(paired.tradeoffs.find(t => t.id === 'lift')?.direction).toBe('closes')
    expect(paired.tradeoffs.find(t => t.id === 'roll')?.direction).toBe('opens')
    expect(paired.before.windows.find(w => w.id === 'lift')!.duration).toBeGreaterThan(0)
    expect(paired.after.windows.find(w => w.id === 'roll')!.duration).toBeGreaterThan(0)
    expect(paired.after.flightEvidence.find(f => f.to === 'O5')!.minClearance).toBeGreaterThan(0)
  })

  it('samples the actual committed snapshot at every decimal clock tick', () => {
    const run = simulate(createDefaultConfig())
    for (const frame of run.frames) {
      const sampled = frameAt(run, frame.t)
      expect(sampled.responsibilities).toEqual(frame.responsibilities)
      expect(sampled.options).toEqual(frame.options)
      expect(sampled.ball.phase).toBe(frame.ball.phase)
      expect(sampled.ball.owner).toBe(frame.ball.owner)
      expect(coordinates(sampled)).toEqual(coordinates(frame))
    }
    // The caller may calculate time rather than reading the frame's timestamp.
    expect(frameAt(run, 101 * 0.025).options).toEqual(run.frames[101].options)
  })

  it('never exposes graph options or analytical windows before their screen or custom condition occurs', () => {
    const config = createDefaultConfig()
    config.startingPositions = { O1: { x: 7, z: 14 } }
    const disconnected = simulate(config)
    expect(disconnected.events.some(e => e.type === 'screen')).toBe(false)
    expect(disconnected.decisions).toEqual([])
    expect(disconnected.frames.some(f => f.options.some(o => o.available))).toBe(false)
    expect(analyze(disconnected).windows.every(w => w.duration === 0)).toBe(true)
    const conditional: ProblemDefinition = { ...HIGH_PNR_PROBLEM, reads: HIGH_PNR_PROBLEM.reads.map(node => node.id === 'handler-read' ? { ...node, when: { kind: 'coordinate' as const, role: 'ballhandler' as const, axis: 'z' as const, below: 0 } } : node) }
    const unmet = simulateProblem(conditional, createDefaultConfig())
    expect(unmet.events.some(e => e.type === 'screen')).toBe(true)
    expect(unmet.decisions).toEqual([])
    expect(unmet.frames.some(f => f.options.some(o => o.available))).toBe(false)
  })

  it('permitted counters are conditional and chain without cycling', () => {
    const config = createDefaultConfig()
    config.opponent!.rescreen = true
    const run = simulate(config)
    expect(counterIds(run)).toContain('second-screen')
    expect(counterIds(run)).toContain('release-two-on-ball')
    expect(new Set(counterIds(run)).size).toBe(counterIds(run).length)
    const denied = simulate({ ...config, answer: { ...config.answer, coverage: 'ice' }, opponent: { ...DEFAULT_OPPONENT, reject: false, rescreen: false, shortRoll: false } })
    expect(counterIds(denied)).not.toContain('reject-overplay')
    expect(counterIds(denied)).not.toContain('second-screen')
    expect(counterIds(denied)).not.toContain('release-two-on-ball')
    const noTag = simulate({ ...config, answer: { ...config.answer, tag: false } })
    expect(counterIds(noTag)).not.toContain('lift-behind-tag')
    expect(noTag.frames.find(f => f.t === 1.5)!.players.find(p => p.id === 'O4')!.z).toBeLessThan(run.frames.find(f => f.t === 1.5)!.players.find(p => p.id === 'O4')!.z)
  })

  it('accounts for a committed re-screen in the opportunity release horizon', () => {
    const config = createDefaultConfig()
    config.opponent!.rescreen = true
    const run = simulate(config)
    const frame = run.frames.find(f => f.t === 1.2)!
    const option = frame.options.find(o => o.id === 'roll')!
    expect(option.readAvailableAt).toBeGreaterThan(2)
    const carrier = frame.players.find(p => p.id === frame.ball.owner)!
    const flightAndGather = Math.hypot(carrier.x - option.target.x, carrier.z - option.target.z) / run.config.assumptions.passSpeed + 0.12 + run.config.assumptions.gatherTime
    expect(option.timeToRelease).toBeCloseTo(flightAndGather + option.readAvailableAt! - frame.t, 8)
    expect(run.decisions[0].t).toBeGreaterThanOrEqual(option.readAvailableAt!)
  })

  it('opponent timing and spacing edits preserve their entire causal prefix and physical bounds', () => {
    const config = createDefaultConfig(), baseline = simulate(config)
    const edited = simulate({ ...config, interventions: [{ id: 'opponent-change', kind: 'opponent', at: 1.2, patch: { liftWidth: 0.7, liftDelay: 0.6, screenAngle: 0.35 } }] })
    expect(edited.frames.filter(f => f.t < 1.2)).toEqual(baseline.frames.filter(f => f.t < 1.2))
    expect(edited.events.filter(e => e.t < 1.2)).toEqual(baseline.events.filter(e => e.t < 1.2))
    expect(coordinates(edited.frames.find(f => f.t === 1.2)!)).toEqual(coordinates(baseline.frames.find(f => f.t === 1.2)!))
    expect(coordinates(edited.frames.at(-1)!)).not.toEqual(coordinates(baseline.frames.at(-1)!))
    for (let i = 1; i < edited.frames.length; i++) for (const p of edited.frames[i].players) {
      const old = edited.frames[i - 1].players.find(q => q.id === p.id)!
      expect(Math.hypot(p.vx - old.vx, p.vz - old.vz)).toBeLessThanOrEqual(config.assumptions.acceleration * config.assumptions.dt + 1e-8)
      expect(Math.hypot(p.vx, p.vz)).toBeLessThanOrEqual(config.assumptions.maxSpeed + 1e-8)
    }
  })

  it('a late opponent edit never steers an already released ball', () => {
    const config = createDefaultConfig(), baseline = simulate(config)
    const flight = baseline.frames.find(f => f.ball.flight && f.ball.flight.kind !== 'shot')!.ball.flight!
    const at = Math.ceil((flight.start + 0.1) / config.assumptions.dt) * config.assumptions.dt
    const changed = simulate({ ...config, interventions: [{ id: 'late-spacing', kind: 'opponent', at, patch: { liftWidth: -0.7, screenAngle: 0.65 } }] })
    for (const frame of changed.frames.filter(f => f.t >= at && f.t < flight.end)) expect(frame.ball.flight).toEqual(flight)
  })

  it('a demonstrated location releases on the observed pass and returns to the coach rules', () => {
    const config = createDefaultConfig()
    const cue = { id: 'show-tag', at: 0.75, kind: 'move' as const, playerId: 'D3' as const, target: { x: -1.5, z: 3.3 } }
    const released = simulate({ ...config, interventions: [{ ...cue, untilTrigger: 'ball-leaves' }] })
    const held = simulate({ ...config, interventions: [cue] })
    const release = released.events.find(e => e.label === 'Demonstrated position releases on the pass')!
    expect(release).toBeDefined()
    expect(released.frames.filter(f => f.t < release.t)).toEqual(held.frames.filter(f => f.t < release.t))
    expect(released.frames.at(-1)!.players.find(p => p.id === 'D3')).not.toEqual(held.frames.at(-1)!.players.find(p => p.id === 'D3'))
  })

  it('reuses position predicates and movement arbitration for a non-screen action without timed switching', () => {
    const problem: ProblemDefinition = { ...HIGH_PNR_PROBLEM, id: 'drive-reactivity-test',
      actions: [{ id: 'drive', kind: 'drive', playerId: 'O1', from: 0, target: { x: 3, z: 3 }, speed: 3.4 }],
      offenseRules: [{ id: 'space-away', label: 'Relocate against nearby help', earliest: 0, priority: 1,
        when: { kind: 'distance', a: 'strongSide', b: 'strongCorner', below: 2 },
        motions: [{ role: 'strongCorner', kind: 'relocate', target: { x: 6.5, z: 4 }, speed: 2.5 }],
      }], defenseRules: [{ id: 'stunt-on-penetration', label: 'Strong-side stunt on penetration',
        when: { kind: 'coordinate', role: 'ballhandler', axis: 'z', below: 7.7 },
        assignments: [{ defender: 'strongSide', offense: 'ballhandler', threat: 'drive', kind: 'contain', gap: 1.1, priority: 1.5 }],
      }], reads: [{ id: 'penetration', actorId: 'O1', earliest: 0.1, trigger: 'penetration', options: ['strong', 'drive'], continuations: {} }],
    }
    const config: LabConfig = { ...createDefaultConfig(), problemId: problem.id, answer: { ...createDefaultConfig().answer, coverage: 'switch' } }
    const run = simulateProblem(problem, config)
    expect(counterIds(run)).toEqual(['space-away'])
    expect(run.events.some(e => e.type === 'screen')).toBe(false)
    expect(run.frames.some(f => f.responsibilities.some(r => r.kind === 'switch'))).toBe(false)
    expect(run.decisions[0].t).toBeGreaterThan(0.1)
    expect(run.frames[0].responsibilities.some(r => r.trigger === 'Strong-side stunt on penetration')).toBe(false)
    expect(run.frames.some(f => f.responsibilities.some(r => r.defenderId === 'D2' && r.trigger === 'Strong-side stunt on penetration'))).toBe(true)
    expect(run.frames.find(f => f.t === 1)!.players.find(p => p.id === 'O2')!.z).toBeGreaterThan(HIGH_PNR_PROBLEM.players.find(p => p.id === 'O2')!.start.z)
  })

  it('validates strategy bounds, keeps legacy absence explicit and never backdates a new strategy', () => {
    const config = createDefaultConfig()
    expect(() => simulate({ ...config, opponent: { ...DEFAULT_OPPONENT, screenAngle: Infinity } })).toThrow('Invalid opponent')
    delete config.opponent
    config.interventions = [{ id: 'enable', kind: 'opponent', at: 1, patch: { liftWidth: 0.4 } }]
    expect(opponentAt(config, 0.99)).toBeUndefined()
    expect(opponentAt(config, 1)?.liftWidth).toBe(0.4)
  })
})
