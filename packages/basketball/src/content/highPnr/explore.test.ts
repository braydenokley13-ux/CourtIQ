import { describe, expect, it } from 'vitest'
import { divergence, explore, findTeachingMoment, framingAt, playerWindows, proposeFixes, replayFix } from './explore'
import { analyze, isThreatOpen } from '../../queries/analytics'
import { createDefaultConfig, HIGH_PNR_PROBLEM } from './scenario'
import { frameAt, simulate } from '../../simulation/facade'
import type { LabConfig } from './types'

const roles = HIGH_PNR_PROBLEM.roles
const withAnswer = (patch: Partial<LabConfig['answer']>): LabConfig => {
  const c = createDefaultConfig()
  c.answer = { ...c.answer, ...patch }
  return c
}
const base = createDefaultConfig()
const baseResult = simulate(base)
const baseMoment = findTeachingMoment(baseResult)!
const fixes = proposeFixes(base, baseMoment, { baseline: baseResult })
const byId = (id: string) => fixes.find((f) => f.id === id)!
const delta = (fix: (typeof fixes)[number], id: string) =>
  (fix.comparison.tradeoffs.find((t) => t.id === id)?.after ?? 0) -
  (fix.comparison.tradeoffs.find((t) => t.id === id)?.before ?? 0)

describe('teaching moment on the default scenario', () => {
  it('freezes at a read the offense used, while the opening is truly open', () => {
    expect(baseMoment).not.toBeNull()
    expect(baseMoment.basis).toBe('used')
    const frame = baseResult.frames.find((f) => Math.abs(f.t - baseMoment.t) < 1e-8)!
    const option = frame.options.find((o) => o.id === baseMoment.threatId)!
    expect(isThreatOpen(option, frame, base.assumptions)).toBe(true)
    expect(
      baseResult.decisions.some((d) => Math.abs(d.t - baseMoment.t) < 1e-8 && d.selected === baseMoment.threatId),
    ).toBe(true)
    expect(baseMoment.defenderNeeds!).toBeGreaterThan(baseMoment.releaseIn!)
    expect(baseMoment.openFor).toBeGreaterThanOrEqual(0.05)
    const window = analyze(baseResult).windows.find((w) => w.id === baseMoment.threatId)!
    expect(window.intervals.some((i) => i.start === baseMoment.window.start && i.end === baseMoment.window.end)).toBe(
      true,
    )
  })
  it('explains the chain by what started it: the low man pulled to the roller, then the weakside shooters', () => {
    const used = baseResult.decisions.filter((d) => d.selected !== 'hold').map((d) => d.selected)
    expect(used.slice(0, 2)).toEqual(['lift', 'corner'])
    expect(baseMoment.cause).toBe('deep-tag')
    expect(baseMoment.pulledDefenderId).toBe(roles.lowMan)
    expect(baseMoment.involved).toEqual(expect.arrayContaining([roles.lowMan, baseMoment.receiverId, roles.screener]))
    expect(baseMoment.receiverId).not.toBe(roles.screener)
    expect(baseMoment.evidence.join(' ')).toContain(roles.lowMan)
    expect(baseMoment.evidence[0]).toContain('late by')
  })
  it('lateBy is the coach-facing number and agrees with the other two: defenderNeeds - releaseIn', () => {
    expect(baseMoment.lateBy!).toBeCloseTo(baseMoment.defenderNeeds! - baseMoment.releaseIn!, 9)
    expect(baseMoment.lateBy!).toBeGreaterThan(0.1)
    const biggest = Math.max(...[baseMoment].map((m) => m.lateBy!))
    expect(baseMoment.lateBy).toBe(biggest)
  })
  it('freezes at the most dangerous read it took, not merely the first', () => {
    const first = baseResult.decisions.find((d) => d.selected !== 'hold')!
    expect(baseMoment.t).toBeGreaterThan(first.t)
    expect(baseResult.decisions.some((d) => Math.abs(d.t - baseMoment.t) < 1e-8)).toBe(true)
  })
  it('does not call it deep-tag once the low man is not tagging (no tag)', () => {
    const m = findTeachingMoment(simulate(withAnswer({ tag: false })))
    expect(m?.cause).not.toBe('deep-tag')
  })
  it('names a real switch mismatch: the roller seals the smaller guard and finishes at the rim, or the handler beats the big', () => {
    const result = simulate(withAnswer({ coverage: 'switch' }))
    const m = findTeachingMoment(result)!
    expect(m).not.toBeNull()
    expect(m.cause).toBe('switch-mismatch')
    expect([roles.ballhandler, roles.screener]).toContain(m.receiverId)
    expect([roles.big, roles.poa]).toContain(m.pulledDefenderId)
    expect(m.openFor).toBeGreaterThanOrEqual(0.2)
    expect(m.finish).toBe('layup')
    // The roll window exists because the guard is shorter and behind the roller, not because of a clock.
    expect(
      playerWindows(result).find((w) => w.threatId === 'roll' && w.playerId === roles.screener)!.duration,
    ).toBeGreaterThanOrEqual(0.2)
    const even = simulate(withAnswer({ coverage: 'switch' })),
      guard = even.frames[0].players.find((p) => p.id === roles.poa)!,
      roller = even.frames[0].players.find((p) => p.id === roles.screener)!
    expect(roller.height - guard.height).toBeGreaterThanOrEqual(0.1)
  })
  it('returns null for a defense that holds', () => {
    const held = {
      ...baseResult,
      decisions: [],
      frames: baseResult.frames.map((f) => ({ ...f, options: f.options.map((o) => ({ ...o, available: false })) })),
    }
    expect(findTeachingMoment(held)).toBeNull()
  })
})

describe('blitz and tag depth, read by the offense', () => {
  const used = (c: LabConfig) =>
    simulate(c)
      .decisions.filter((d) => d.selected !== 'hold')
      .map((d) => d.selected)
  it('a blitz is read as two-on-ball: the short roll, 4-on-3', () => {
    const m = findTeachingMoment(simulate(withAnswer({ coverage: 'blitz' })))!
    expect(m.cause).toBe('two-on-ball')
    expect(m.involved).toEqual(expect.arrayContaining([roles.big, roles.poa]))
  })
  it('a deep tag is answered by the weakside, a shallow tag by the roller, and the offense takes the opening as it appears', () => {
    expect(used(withAnswer({ tagDepth: 1 }))[0]).toBe('lift')
    for (const tagDepth of [0.2, 0.4, 0.6]) expect(used(withAnswer({ tagDepth }))[0]).toBe('roll')
    const shallow = simulate(withAnswer({ tagDepth: 0.4 })),
      roll = shallow.decisions.find((d) => d.selected === 'roll')!
    expect(roll.t).toBeLessThan(shallow.config.assumptions.duration / 2)
    const m = findTeachingMoment(shallow)!
    expect(m.lateBy!).toBeGreaterThan(0.2)
  })
})

describe('framing', () => {
  it('contains every involved player and the ball and is minimal', () => {
    const { center, radius } = framingAt(baseResult, baseMoment.t, baseMoment.involved)
    const frame = frameAt(baseResult, baseMoment.t)
    const pts = [...frame.players.filter((p) => baseMoment.involved.includes(p.id)), frame.ball]
    for (const p of pts) expect(Math.hypot(p.x - center.x, p.z - center.z)).toBeLessThanOrEqual(radius + 1e-6)
    expect(pts.some((p) => Math.abs(Math.hypot(p.x - center.x, p.z - center.z) - radius) < 1e-6)).toBe(true)
    expect(radius).toBeGreaterThan(0)
    const farthest = Math.max(...pts.flatMap((a) => pts.map((b) => Math.hypot(a.x - b.x, a.z - b.z))))
    expect(radius).toBeGreaterThanOrEqual(farthest / 2 - 1e-6)
    expect(radius).toBeLessThanOrEqual(farthest)
  })
})

describe('fixes', () => {
  it('offers 4 to 6 options including keep-as-is first, with no changes for keep', () => {
    expect(fixes.length).toBeGreaterThanOrEqual(4)
    expect(fixes.length).toBeLessThanOrEqual(6)
    const keep = fixes[0]
    expect(keep.id).toBe('keep')
    expect(keep.patch).toEqual({})
    expect(keep.improves).toEqual([])
    expect(keep.opens).toEqual([])
    expect(keep.result).toBe(baseResult)
    expect(keep.comparison.tradeoffs.every((t) => t.direction === 'similar')).toBe(true)
    expect(new Set(fixes.map((f) => f.id)).size).toBe(fixes.length)
    expect(fixes.every((f) => f.plain && f.detail)).toBe(true)
  })
  it('simulates every patch for real, applied to the answer', () => {
    for (const fix of fixes) {
      expect(fix.result.config.answer).toEqual({ ...base.answer, ...fix.patch })
      expect(fix.result).toEqual(simulate({ ...base, answer: { ...base.answer, ...fix.patch } }))
      for (const c of [...fix.improves, ...fix.opens])
        expect(Math.abs(c.after - c.before)).toBeGreaterThanOrEqual(0.1 - 1e-6)
    }
  })
  it('help less closes the weakside shooters and sends the offense to the roller, who gets a late-by-0.4 s pocket (measured tradeoff)', () => {
    const fix = byId('help-less')
    expect(fix.patch.tagDepth!).toBeLessThan(base.answer.tagDepth)
    expect(delta(fix, 'corner')).toBeLessThanOrEqual(-0.25)
    expect(delta(fix, 'lift')).toBeLessThanOrEqual(-0.2)
    expect(fix.improves.map((c) => c.threatId)).toEqual(expect.arrayContaining(['corner', 'lift']))
    const finish = fix.opens.find((c) => c.threatId === 'drive' && c.playerId === roles.screener)
    expect(finish).toBeDefined()
    expect(finish!.after - finish!.before).toBeGreaterThanOrEqual(0.25)
    expect(fix.result.decisions[0].selected).toBe('roll')
    expect(baseResult.decisions[0].selected).toBe('lift')
    expect(fix.newMoment?.receiverId).toBe(roles.screener)
    expect(fix.newMoment!.lateBy!).toBeGreaterThan(0.3)
  })
  it('rotating earlier is not a free fix: the corner closes but the lift is read much sooner', () => {
    const fix = byId('rotate-early')
    expect(delta(fix, 'corner')).toBeLessThanOrEqual(-0.25)
    expect(fix.result.decisions[0].selected).toBe('lift')
    expect(fix.result.decisions[0].t).toBeLessThan(baseResult.decisions[0].t - 0.5)
    expect(fix.newMoment!.lateBy!).toBeGreaterThan(baseMoment.lateBy! - 0.01)
  })
  it('bigDepth moves the drop line: a deeper big concedes the roller the pocket early, a higher one does not', () => {
    const bigZ = (bigDepth: number) =>
      frameAt(simulate(withAnswer({ bigDepth })), 1.5).players.find((p) => p.id === roles.big)!.z
    expect(bigZ(1.6)).toBeLessThan(bigZ(3.2) - 0.8)
    expect(bigZ(3.2)).toBeLessThan(bigZ(5) - 0.8)
    const deep = simulate(withAnswer({ bigDepth: 1.6 })),
      standard = simulate(withAnswer({ bigDepth: 3.2 }))
    expect(deep.decisions[0].selected).toBe('roll')
    expect(deep.decisions[0].t).toBeLessThan(standard.decisions[0].t - 0.5)
    const finish = (r: typeof deep) =>
      playerWindows(r).find((w) => w.threatId === 'drive' && w.playerId === roles.screener)?.duration ?? 0
    expect(finish(deep)).toBeGreaterThanOrEqual(0.3)
    expect(finish(standard)).toBe(0)
  })
  it('lite explore drops frames but keeps every number; replayFix rebuilds the identical replay', () => {
    const full = explore(base),
      lite = explore(base, { withFrames: false })
    expect(lite.baseline.frames).toEqual([])
    expect(lite.fixes.map((f) => f.id)).toEqual(full.fixes.map((f) => f.id))
    expect(lite.fixes.every((f) => f.framesOmitted && f.result.frames.length === 0)).toBe(true)
    expect(JSON.stringify(lite.fixes.map((f) => [f.improves, f.opens, f.comparison.tradeoffs]))).toBe(
      JSON.stringify(full.fixes.map((f) => [f.improves, f.opens, f.comparison.tradeoffs])),
    )
    expect(replayFix(base, full.fixes[1])).toEqual(full.fixes[1].result)
    expect(JSON.stringify(lite).length).toBeLessThan(JSON.stringify(full).length / 5)
  })
  it('is deterministic and does not mutate its inputs', () => {
    const snapshot = JSON.stringify(base)
    const a = explore(base),
      b = explore(base)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(JSON.stringify(base)).toBe(snapshot)
    expect(proposeFixes(base, null).map((f) => f.id).length).toBeGreaterThanOrEqual(4)
  })
  it('simulates fixes for other causes without throwing', () => {
    for (const patch of [
      { coverage: 'blitz' },
      { coverage: 'hedge' },
      { coverage: 'switch' },
      { backside: 'stay' },
      { rotationTiming: 'early' },
      { tag: false },
    ] as const) {
      const config = withAnswer(patch)
      const result = simulate(config)
      const moment = findTeachingMoment(result)
      const list = proposeFixes(config, moment, { baseline: result })
      expect(list[0].id).toBe('keep')
      expect(list.length).toBeGreaterThanOrEqual(2)
      for (const fix of list) expect(fix.result.frames.length).toBeGreaterThan(0)
    }
  })
})

describe('divergence', () => {
  it('is empty for identical replays', () => {
    const d = divergence(baseResult, baseResult)
    expect(d.firstDivergenceAt).toBeNull()
    expect(Object.values(d.perPlayer).every((p) => p.maxGap === 0)).toBe(true)
    expect(d.windows.every((w) => w.before && w.after)).toBe(true)
  })
  it('shows where the help-less fix closed and opened windows', () => {
    const fix = byId('help-less')
    const d = divergence(baseResult, fix.result)
    expect(d.firstDivergenceAt).not.toBeNull()
    expect(d.perPlayer[roles.lowMan].maxGap).toBeGreaterThan(0.5)
    expect(d.perPlayer[roles.screener].maxGap).toBe(0)
    const corner = d.windows.find((w) => w.threatId === 'corner' && w.playerId === roles.weakCorner)!
    expect(corner.before).not.toBeNull()
    expect(corner.after).toBeNull()
    expect(corner.location.x).toBeLessThan(-5)
    const finish = d.windows.find((w) => w.threatId === 'drive' && w.playerId === roles.screener)!
    expect(finish.before).toBeNull()
    expect(finish.after).not.toBeNull()
    expect(finish.location.z).toBeLessThan(4)
  })
})
