import { describe, expect, it } from 'vitest'
import { divergence, explore, findTeachingMoment, framingAt, playerWindows, proposeFixes, replayFix } from './explore'
import { analyze, isThreatOpen } from './analytics'
import { findAttackWitness } from './attackCore'
import { createDefaultConfig, HIGH_PNR_PROBLEM } from './scenario'
import { frameAt, simulate } from './simulation'
import type { LabConfig } from './types'

const roles = HIGH_PNR_PROBLEM.roles
const withAnswer = (patch: Partial<LabConfig['answer']>): LabConfig => { const c = createDefaultConfig(); c.answer = { ...c.answer, ...patch }; return c }
const base = createDefaultConfig()
const baseResult = simulate(base)
const baseMoment = findTeachingMoment(baseResult)!
const fixes = proposeFixes(base, baseMoment, { baseline: baseResult })
const byId = (id: string) => fixes.find(f => f.id === id)!
const delta = (fix: (typeof fixes)[number], id: string) => (fix.comparison.tradeoffs.find(t => t.id === id)?.after ?? 0) - (fix.comparison.tradeoffs.find(t => t.id === id)?.before ?? 0)

describe('teaching moment on the default scenario', () => {
  it('freezes at a read the offense used, while the opening is truly open', () => {
    expect(baseMoment).not.toBeNull()
    expect(baseMoment.basis).toBe('used')
    const frame = baseResult.frames.find(f => Math.abs(f.t - baseMoment.t) < 1e-8)!
    const option = frame.options.find(o => o.id === baseMoment.threatId)!
    expect(isThreatOpen(option, frame, base.assumptions)).toBe(true)
    expect(baseResult.decisions.some(d => Math.abs(d.t - baseMoment.t) < 1e-8 && d.selected === baseMoment.threatId)).toBe(true)
    expect(baseMoment.defenderNeeds!).toBeGreaterThan(baseMoment.releaseIn!)
    expect(baseMoment.openFor).toBeGreaterThanOrEqual(0.05)
    const window = analyze(baseResult).windows.find(w => w.id === baseMoment.threatId)!
    expect(window.intervals.some(i => i.start === baseMoment.window.start && i.end === baseMoment.window.end)).toBe(true)
  })
  it('names the low man pulled to the roller and a weakside shooter, cause deep-tag', () => {
    expect(['lift', 'corner']).toContain(baseMoment.threatId)
    expect(baseMoment.pulledDefenderId).toBe(roles.lowMan)
    expect(baseMoment.cause).toBe('deep-tag')
    expect(baseMoment.involved).toEqual(expect.arrayContaining([roles.lowMan, baseMoment.receiverId, roles.screener]))
    expect(baseMoment.receiverId).not.toBe(roles.screener)
    expect(baseMoment.evidence.join(' ')).toContain(roles.lowMan)
  })
  it('does not call it deep-tag once the low man is not tagging (no tag)', () => {
    const m = findTeachingMoment(simulate(withAnswer({ tag: false })))
    expect(m?.cause).not.toBe('deep-tag')
  })
  it('names a real switch mismatch: the big caught on the ball handler, with the slow lateral big as the cause', () => {
    const result = simulate(withAnswer({ coverage: 'switch' }))
    const m = findTeachingMoment(result)!
    expect(m).not.toBeNull()
    expect(m.cause).toBe('switch-mismatch')
    expect(m.threatId).toBe('drive')
    expect(m.receiverId).toBe(roles.ballhandler)
    expect(m.pulledDefenderId).toBe(roles.big)
    expect(m.openFor).toBeGreaterThanOrEqual(0.2)
    expect(m.defenderNeeds!).toBeGreaterThan(m.releaseIn!)
  })
  it('returns null when nothing meaningful is open (ice approximation holds here)', () => {
    expect(findTeachingMoment(simulate(withAnswer({ coverage: 'ice' })))).toBeNull()
  })
  it('never contradicts the attack witness when it falls back to it', () => {
    const w = findAttackWitness(baseResult)
    if (w) expect(baseMoment.t).toBeLessThanOrEqual(w.at + 1e-8)
  })
})

describe('framing', () => {
  it('contains every involved player and the ball and is minimal', () => {
    const { center, radius } = framingAt(baseResult, baseMoment.t, baseMoment.involved)
    const frame = frameAt(baseResult, baseMoment.t)
    const pts = [...frame.players.filter(p => baseMoment.involved.includes(p.id)), frame.ball]
    for (const p of pts) expect(Math.hypot(p.x - center.x, p.z - center.z)).toBeLessThanOrEqual(radius + 1e-6)
    expect(pts.some(p => Math.abs(Math.hypot(p.x - center.x, p.z - center.z) - radius) < 1e-6)).toBe(true)
    expect(radius).toBeGreaterThan(0)
    const farthest = Math.max(...pts.flatMap(a => pts.map(b => Math.hypot(a.x - b.x, a.z - b.z))))
    expect(radius).toBeGreaterThanOrEqual(farthest / 2 - 1e-6)
    expect(radius).toBeLessThanOrEqual(farthest)
  })
})

describe('fixes', () => {
  it('offers 4 to 6 options including keep-as-is first, with no changes for keep', () => {
    expect(fixes.length).toBeGreaterThanOrEqual(4)
    expect(fixes.length).toBeLessThanOrEqual(6)
    const keep = fixes[0]
    expect(keep.id).toBe('keep'); expect(keep.patch).toEqual({})
    expect(keep.improves).toEqual([]); expect(keep.opens).toEqual([])
    expect(keep.result).toBe(baseResult)
    expect(keep.comparison.tradeoffs.every(t => t.direction === 'similar')).toBe(true)
    expect(new Set(fixes.map(f => f.id)).size).toBe(fixes.length)
    expect(fixes.every(f => f.plain && f.detail)).toBe(true)
  })
  it('simulates every patch for real, applied to the answer', () => {
    for (const fix of fixes) {
      expect(fix.result.config.answer).toEqual({ ...base.answer, ...fix.patch })
      expect(fix.result).toEqual(simulate({ ...base, answer: { ...base.answer, ...fix.patch } }))
      for (const c of [...fix.improves, ...fix.opens]) expect(Math.abs(c.after - c.before)).toBeGreaterThanOrEqual(0.1 - 1e-6)
    }
  })
  it('help less closes the weakside shooters and gives the roller the ball near the rim (measured tradeoff)', () => {
    const fix = byId('help-less')
    expect(fix.patch.tagDepth!).toBeLessThan(base.answer.tagDepth)
    expect(delta(fix, 'corner')).toBeLessThanOrEqual(-0.25)
    expect(delta(fix, 'lift')).toBeLessThanOrEqual(-0.05)
    expect(delta(fix, 'roll')).toBeGreaterThanOrEqual(0.05)
    expect(fix.improves.map(c => c.threatId)).toEqual(expect.arrayContaining(['corner']))
    // The roller's catch-and-finish at the rim is the larger cost (0.3 s), per receiver, so the merged 'drive' id cannot hide it.
    const finish = fix.opens.find(c => c.threatId === 'drive' && c.playerId === roles.screener)
    expect(finish).toBeDefined()
    expect(finish!.after - finish!.before).toBeGreaterThanOrEqual(0.25)
    expect(fix.newMoment?.threatId).toBe('roll')
    expect(fix.newMoment?.mechanism).toBe('shallow-tag')
  })
  it('rotating earlier is not a free fix: it closes the corner and enlarges the lift window', () => {
    const fix = byId('rotate-early')
    expect(delta(fix, 'corner')).toBeLessThan(-0.1)
    expect(delta(fix, 'lift')).toBeGreaterThan(0.1)
  })
  it('bigDepth moves the drop line: deeper concedes the handler a pull-up window, higher takes it away', () => {
    const handlerWindow = (bigDepth: number) => playerWindows(simulate(withAnswer({ bigDepth }))).find(w => w.threatId === 'drive' && w.playerId === roles.ballhandler)?.duration ?? 0
    const deep = handlerWindow(1.6), standard = handlerWindow(3.2), high = handlerWindow(4.4)
    expect(deep).toBeGreaterThanOrEqual(0.5)
    expect(deep).toBeGreaterThan(standard + 0.2)
    expect(standard).toBeGreaterThanOrEqual(high)
    // The deep drop's pull-up is explained by the big's depth, not by anything else.
    const m = findTeachingMoment(simulate(withAnswer({ bigDepth: 1.6 })))
    expect(m).not.toBeNull()
  })
  it('lite explore drops frames but keeps every number; replayFix rebuilds the identical replay', () => {
    const full = explore(base), lite = explore(base, { withFrames: false })
    expect(lite.baseline.frames).toEqual([])
    expect(lite.fixes.map(f => f.id)).toEqual(full.fixes.map(f => f.id))
    expect(lite.fixes.every(f => f.framesOmitted && f.result.frames.length === 0)).toBe(true)
    expect(JSON.stringify(lite.fixes.map(f => [f.improves, f.opens, f.comparison.tradeoffs]))).toBe(JSON.stringify(full.fixes.map(f => [f.improves, f.opens, f.comparison.tradeoffs])))
    expect(replayFix(base, full.fixes[1])).toEqual(full.fixes[1].result)
    expect(JSON.stringify(lite).length).toBeLessThan(JSON.stringify(full).length / 5)
  })
  it('is deterministic and does not mutate its inputs', () => {
    const snapshot = JSON.stringify(base)
    const a = explore(base), b = explore(base)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(JSON.stringify(base)).toBe(snapshot)
    expect(proposeFixes(base, null).map(f => f.id).length).toBeGreaterThanOrEqual(4)
  })
  it('simulates fixes for other causes without throwing', () => {
    for (const patch of [{ coverage: 'blitz' }, { coverage: 'hedge' }, { coverage: 'switch' }, { backside: 'stay' }, { rotationTiming: 'early' }, { tag: false }] as const) {
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
    expect(Object.values(d.perPlayer).every(p => p.maxGap === 0)).toBe(true)
    expect(d.windows.every(w => w.before && w.after)).toBe(true)
  })
  it('shows where the help-less fix closed and opened windows', () => {
    const fix = byId('help-less')
    const d = divergence(baseResult, fix.result)
    expect(d.firstDivergenceAt).not.toBeNull()
    expect(d.perPlayer[roles.lowMan].maxGap).toBeGreaterThan(0.5)
    expect(d.perPlayer[roles.screener].maxGap).toBe(0)
    const corner = d.windows.find(w => w.threatId === 'corner')!
    expect(corner.before).not.toBeNull(); expect(corner.after).toBeNull()
    expect(corner.location.x).toBeLessThan(-5)
    const roll = d.windows.find(w => w.threatId === 'roll')!
    expect(roll.before).toBeNull(); expect(roll.after).not.toBeNull()
    expect(roll.location.z).toBeLessThan(4)
  })
})
