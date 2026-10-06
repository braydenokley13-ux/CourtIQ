import { describe, expect, it } from 'vitest'
import { findTeachingMoment, playerWindows, robustness, jitterConfig } from './explore'
import { createDefaultConfig, HIGH_PNR_PROBLEM } from './scenario'
import { simulate } from './simulation'
import type { CounterId, LabConfig } from './types'

const roles = HIGH_PNR_PROBLEM.roles
const cfg = (answer: Partial<LabConfig['answer']> = {}, rest: Partial<LabConfig> = {}): LabConfig => { const c = createDefaultConfig(); c.answer = { ...c.answer, ...answer }; return { ...c, ...rest } }
const chain = (c: LabConfig) => simulate(c).decisions.filter(d => d.selected !== 'hold').map(d => d.selected).join('>')

describe('closeouts survive the catcher keeping the ball', () => {
  it('after the weakside catch, D4 keeps closing out and D3 does not re-tag a parked roller', () => {
    const r = simulate(cfg()), keep = r.decisions.find(d => d.selected === 'drive' && d.actorId === roles.weakCorner)!
    expect(keep).toBeDefined()
    const after = r.frames.filter(f => f.t >= keep.t && f.t <= keep.t + 0.8)
    expect(after.length).toBeGreaterThan(10)
    for (const f of after) {
      expect(f.responsibilities.some(x => x.defenderId === roles.backside && x.kind === 'split'), `D4 split at ${f.t}`).toBe(false)
      expect(f.responsibilities.some(x => x.defenderId === roles.lowMan && x.kind === 'tag'), `D3 tag at ${f.t}`).toBe(false)
    }
  })
})

describe('honest finish and realized arrival', () => {
  it('reads what the actor did, not the threat id', () => {
    const m = findTeachingMoment(simulate(cfg()))!
    expect(['pull-up', 'catch-and-shoot', 'layup', 'pass']).toContain(m.finish)
    const r = simulate(cfg()), shot = r.events.find(e => e.type === 'shot' && e.playerId === m.receiverId && e.t >= m.t)!
    const body = r.frames.find(f => Math.abs(f.t - shot.t) < 1e-8)!.players.find(p => p.id === m.receiverId)!
    const rim = Math.hypot(body.x, body.z - 1.575)
    expect(m.finish === 'layup').toBe(rim <= 2.4)
    if (m.finish === 'pull-up') expect(m.dribbleMetres!).toBeGreaterThanOrEqual(1)
  })
  it('a roller who finishes at the rim is a layup, a corner shooter 5 m out is not', () => {
    const roller = findTeachingMoment(simulate(cfg({ tagDepth: 0.3 })))!
    expect(roller.receiverId).toBe(roles.screener)
    expect(roller.finish).toBe('layup')
    expect(findTeachingMoment(simulate(cfg()))!.finish).not.toBe('layup')
  })
  it('realizedLateBy is realizedArrival minus the release horizon, and null when the shot goes up uncontested', () => {
    for (const answer of [{}, { tagDepth: 0.3 }, { coverage: 'switch' as const }]) {
      const m = findTeachingMoment(simulate(cfg(answer)))!
      if (m.realizedArrival === null) expect(m.realizedLateBy).toBeNull()
      else expect(m.realizedLateBy!).toBeCloseTo(m.realizedArrival - m.releaseIn!, 9)
    }
  })
  it('names a pass by geometry: a long weakside drop-off is not a skip', () => {
    const r = simulate(cfg())
    const flights = r.frames.map(f => f.ball.flight).filter((f, i, a) => f && f.kind !== 'shot' && a.findIndex(g => g?.start === f.start) === i)
    const dropOff = flights.find(f => f!.from === roles.weakLift && f!.to === roles.weakCorner)!
    expect(Math.hypot(dropOff.b.x - dropOff.a.x, dropOff.b.z - dropOff.a.z)).toBeGreaterThan(5)
    expect(dropOff.kind).not.toBe('skip')
  })
})

describe('verdict robustness', () => {
  it('is deterministic, bounded and cheap enough for the worker', () => {
    const a = robustness(cfg(), { samples: 6 }), b = robustness(cfg(), { samples: 6 })
    expect({ ...a, ms: 0 }).toEqual({ ...b, ms: 0 })
    expect(a.samples).toBe(6)
    expect(a.opened).toBeGreaterThanOrEqual(0); expect(a.opened).toBeLessThanOrEqual(6)
    expect(a.verdictLabel).toMatch(/^(Opened|Held) in \d+ of 6 runs$/)
    expect(a.ms).toBeLessThan(10000)
  })
  it('jitter stays inside its bounds', () => {
    const base = cfg(), j = jitterConfig(base, 3)
    expect(Math.abs(j.assumptions.reactionDelay - base.assumptions.reactionDelay)).toBeLessThanOrEqual(0.05 + 1e-9)
    expect(Math.abs(j.assumptions.maxSpeed / base.assumptions.maxSpeed - 1)).toBeLessThanOrEqual(0.04 + 1e-9)
    for (const p of HIGH_PNR_PROBLEM.players) { const s = j.startingPositions![p.id]!; expect(Math.abs(s.x - p.start.x)).toBeLessThanOrEqual(0.25 + 1e-9); expect(Math.abs(s.z - p.start.z)).toBeLessThanOrEqual(0.25 + 1e-9) }
    expect(j.seed).not.toBe(base.seed)
  })
  it('a held reference reports how many runs held', () => {
    const r = robustness(cfg(), { samples: 3, moment: null })
    expect(r.verdictLabel).toMatch(/^Held in \d of 3 runs$/)
  })
})

describe('numerical convergence', () => {
  it('halving dt keeps the read chain and its timing for the default', () => {
    const at = (dt: number) => { const c = cfg(); c.assumptions.dt = dt; return simulate(c).decisions.filter(d => d.selected !== 'hold') }
    const coarse = at(0.025), fine = at(0.0125)
    expect(fine.map(d => d.selected)).toEqual(coarse.map(d => d.selected))
    fine.forEach((d, i) => expect(Math.abs(d.t - coarse[i].t)).toBeLessThanOrEqual(0.11))
    expect(findTeachingMoment(simulate(cfg()))!.cause).toBe('deep-tag')
  })
})

describe('the chosen counter constrains the first read', () => {
  it('roll, short-roll, pop, reject and slip give different possessions than reading the defense', () => {
    const auto = chain(cfg())
    const firsts = (['roll', 'pop', 'reject'] as CounterId[]).map(counter => simulate(cfg({}, { counter })).decisions.find(d => d.selected !== 'hold')!.selected)
    expect(firsts).toEqual(['roll', 'pop', 'drive'])
    expect(auto.startsWith('lift')).toBe(true)
    const chains = new Set((['auto', 'roll', 'pop', 'reject'] as CounterId[]).map(counter => chain(cfg({}, { counter }))))
    expect(chains.size).toBe(4)
  })
  it('a forced option is thrown honestly: a contested forced pass stops at the defender instead of being rescued', () => {
    const r = simulate(cfg({ coverage: 'blitz' }, { counter: 'roll' }))
    expect(r.decisions[0].selected).toBe('roll')
    expect(r.diagnostics.flightStops!.length + r.events.filter(e => e.type === 'catch').length).toBeGreaterThan(0)
  })
})

describe('counters create defensive obligations', () => {
  const sources = (c: LabConfig) => new Set(simulate(c).frames.flatMap(f => f.responsibilities.map(x => x.sourceRuleId).filter(Boolean)))
  it('a released short roll hands the low man the roller and the backside the corner', () => {
    const base = cfg({ coverage: 'blitz' })
    const on = simulate(base), off = simulate({ ...base, opponent: { ...base.opponent!, shortRoll: false } })
    expect(sources(base).has('stop-short-roll')).toBe(true)
    expect(new Set(off.frames.flatMap(f => f.responsibilities.map(x => x.sourceRuleId))).has('stop-short-roll')).toBe(false)
    const frame = on.frames.find(f => f.responsibilities.some(x => x.sourceRuleId === 'stop-short-roll'))!
    expect(frame.responsibilities.find(x => x.defenderId === roles.lowMan && x.sourceRuleId === 'stop-short-roll')).toMatchObject({ offensivePlayerId: roles.screener, kind: 'contain' })
    expect(frame.responsibilities.find(x => x.defenderId === roles.backside && x.sourceRuleId === 'stop-short-roll')).toMatchObject({ offensivePlayerId: roles.weakCorner, kind: 'closeout' })
  })
  it('a rejected screen brings the strong-side defender to the drive', () => {
    const c = cfg({ coverage: 'ice' })
    expect(sources(c).has('nail-the-reject')).toBe(true)
    const r = simulate(c), f = r.frames.find(g => g.responsibilities.some(x => x.sourceRuleId === 'nail-the-reject'))!
    expect(f.responsibilities.find(x => x.sourceRuleId === 'nail-the-reject')).toMatchObject({ defenderId: roles.strongSide, offensivePlayerId: roles.ballhandler })
    const noReject = { ...c, opponent: { ...c.opponent!, reject: false } }
    expect(sources(noReject).has('nail-the-reject')).toBe(false)
  })
})

describe('switch is not a free fix', () => {
  it('seals the smaller guard: a roll window exists against a switch, and it is closed against drop', () => {
    const roll = (c: LabConfig) => playerWindows(simulate(c)).find(w => w.threatId === 'roll' && w.playerId === roles.screener)?.duration ?? 0
    expect(roll(cfg({ coverage: 'switch' }))).toBeGreaterThanOrEqual(0.2)
    const drop = roll(cfg())
    expect(roll(cfg({ coverage: 'switch' }))).toBeGreaterThan(drop)
  })
  it('does not tag or rotate: the weak side stays home under a switch', () => {
    const r = simulate(cfg({ coverage: 'switch' }))
    expect(r.frames.some(f => f.responsibilities.some(x => (x.defenderId === roles.lowMan || x.defenderId === roles.backside) && (x.kind === 'tag' || x.offensivePlayerId === roles.screener)))).toBe(false)
  })
})

describe('personnel', () => {
  it('a slow low man changes lateBy and a quick one changes it the other way', () => {
    const lateBy = (speed: number) => findTeachingMoment(simulate(cfg({}, { personnel: { [roles.lowMan]: { speed } } })))!.lateBy!
    const normal = lateBy(1), slow = lateBy(0.8), quick = lateBy(1.15)
    expect(slow).not.toBeCloseTo(normal, 2)
    expect(slow - normal).toBeGreaterThan(0.05)
    expect(quick).toBeLessThan(normal + 1e-9)
  })
  it('a height override moves reach and the matchup', () => {
    const r = simulate(cfg({}, { personnel: { [roles.poa]: { height: 1.8 }, [roles.screener]: { height: 2.1 } } }))
    expect(r.frames[0].players.find(p => p.id === roles.poa)!.height).toBe(1.8)
    expect(r.frames[0].players.find(p => p.id === roles.poa)!.contest!).toBeLessThan(simulate(cfg()).frames[0].players.find(p => p.id === roles.poa)!.contest!)
  })
  it('validates bounds and names', () => {
    expect(() => simulate(cfg({}, { personnel: { D3: { speed: 3 } } }))).toThrow(/personnel speed/)
    expect(() => simulate(cfg({}, { personnel: { D3: { lateral: 0.1 } } }))).toThrow(/personnel lateral/)
    expect(() => simulate(cfg({}, { personnel: { D3: { height: 1.2 } } }))).toThrow(/personnel height/)
    expect(() => simulate(cfg({}, { personnel: { D9: { speed: 1 } } as never }))).toThrow(/unknown player/)
  })
})
