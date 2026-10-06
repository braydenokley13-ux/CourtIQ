/** Default product regression gate. Coverage changes obligations and physical reactions;
 * equal sensible reads remain valid when two coverages expose the same opportunity. */
import { describe, it, expect } from 'vitest'
import { createDefaultConfig } from './scenario'
import { applyAnswers } from './answers'
import { simulate, frameAt } from '../../simulation/facade'
import { compare } from '../../queries/analytics'
import type { CoverageId, SimulationResult } from './types'
const coverages = ['drop', 'switch', 'blitz', 'hedge', 'ice'] as const,
  seeds = [2026, 11, 777]
const cache = new Map<string, SimulationResult>()
function run(coverage: CoverageId, seed: number) {
  const key = `${coverage}:${seed}`
  if (!cache.has(key)) {
    const c = createDefaultConfig()
    c.seed = seed
    c.answer = applyAnswers(c.answer, [coverage])
    cache.set(key, simulate(c))
  }
  return cache.get(key)!
}
const tasks = (r: SimulationResult, t: number, d: string) =>
  frameAt(r, t).responsibilities.filter((q) => q.defenderId === d)
const primary = (r: SimulationResult, t: number, d: string) => tasks(r, t, d).sort((a, b) => b.priority - a.priority)[0]
const pass = (r: SimulationResult) => r.events.find((e) => e.type === 'pass')!
const chain = (r: SimulationResult) =>
  r.decisions
    .filter((d) => d.selected !== 'hold')
    .map((d) => d.selected)
    .join('>')
const body = (r: SimulationResult, t: number, id: string) => frameAt(r, t).players.find((p) => p.id === id)!

describe.each(seeds)('coverage gate, seed %i', (seed) => {
  it('starts with identical players and has distinct authored defensive obligations for every coverage', () => {
    const results = coverages.map((c) => run(c, seed))
    for (const r of results) expect(r.frames[0].players).toEqual(results[0].frames[0].players)
    const signatures = results.map((r) =>
      JSON.stringify(
        [
          ...new Set(
            r.frames
              .filter((f) => f.t < pass(r).t + 0.3)
              .flatMap((f) => f.responsibilities.map((q) => `${q.defenderId}:${q.offensivePlayerId}:${q.kind}`)),
          ),
        ].sort(),
      ),
    )
    expect(new Set(signatures).size).toBe(coverages.length)
  })
  it('drop contains below the handler, chases the ball and draws the low-man tag', () => {
    const r = run('drop', seed)
    expect(primary(r, 1, 'D5')).toMatchObject({ kind: 'contain', offensivePlayerId: 'O1' })
    expect(primary(r, 1, 'D1')).toMatchObject({ kind: 'chase', offensivePlayerId: 'O1' })
    expect(primary(r, 1, 'D3')).toMatchObject({ kind: 'tag', offensivePlayerId: 'O5' })
    expect(body(r, 1, 'D5').z).toBeLessThan(body(r, 1, 'O1').z - 0.5)
    expect(pass(r).t).toBeGreaterThan(1.6)
  })
  it('switch exchanges only after the observed encounter and keeps the weak side home', () => {
    const r = run('switch', seed),
      encounter = r.events.find((e) => e.type === 'screen')!
    expect(
      r.frames.filter((f) => f.t < encounter.t).some((f) => f.responsibilities.some((q) => q.kind === 'switch')),
    ).toBe(false)
    expect(primary(r, 1, 'D1')).toMatchObject({ kind: 'switch', offensivePlayerId: 'O5' })
    expect(primary(r, 1, 'D5')).toMatchObject({ kind: 'switch', offensivePlayerId: 'O1' })
    expect(r.frames.some((f) => f.responsibilities.some((q) => q.kind === 'tag'))).toBe(false)
    expect(chain(r)).not.toBe(chain(run('drop', seed)))
  })
  it('blitz commits two to the ball, triggers the short-roll release and forces an earlier first pass than drop', () => {
    const r = run('blitz', seed)
    for (const d of ['D1', 'D5']) expect(primary(r, 0.8, d)).toMatchObject({ kind: 'contain', offensivePlayerId: 'O1' })
    expect(r.frames.at(-1)!.policyActivations!.some((a) => a.ruleId === 'release-two-on-ball')).toBe(true)
    expect(pass(r).targetId).toBe('O5')
    expect(pass(r).t).toBeLessThan(pass(run('drop', seed)).t - 0.4)
    expect(
      r.frames.some((f) =>
        f.responsibilities.some(
          (q) => q.sourceRuleId === 'stop-short-roll' && q.defenderId === 'D3' && q.offensivePlayerId === 'O5',
        ),
      ),
    ).toBe(true)
  })
  it('hedge shows then recovers while the handler still owns the ball', () => {
    const r = run('hedge', seed)
    expect(
      r.frames.some((f) =>
        f.responsibilities.some((q) => q.defenderId === 'D5' && q.kind === 'chase' && q.offensivePlayerId === 'O1'),
      ),
    ).toBe(true)
    expect(
      r.frames.some(
        (f) =>
          f.ball.owner === 'O1' &&
          f.ball.phase === 'handle' &&
          f.responsibilities.some((q) => q.defenderId === 'D5' && q.kind === 'recover' && q.offensivePlayerId === 'O5'),
      ),
    ).toBe(true)
    expect(pass(r).t).toBeLessThan(pass(run('drop', seed)).t)
  })
  it('ICE creates the directional contain and the offense rejects observed overplay', () => {
    const r = run('ice', seed),
      drop = run('drop', seed)
    expect(primary(r, 0.8, 'D1')).toMatchObject({ kind: 'contain', offensivePlayerId: 'O1' })
    expect(r.frames.at(-1)!.policyActivations!.some((a) => a.ruleId === 'reject-overplay')).toBe(true)
    expect(body(r, 1.6, 'O1').x).toBeGreaterThan(body(drop, 1.6, 'O1').x + 1)
    expect(primary(r, 0.75, 'D5').target.x).toBeGreaterThan(primary(drop, 0.75, 'D5').target.x + 0.5)
    expect(r.frames.some((f) => f.responsibilities.some((q) => q.sourceRuleId === 'nail-the-reject'))).toBe(true)
  })
  it('uses at least four different connected read chains and physically different screen defenders', () => {
    const rs = coverages.map((c) => run(c, seed))
    expect(new Set(rs.map(chain)).size).toBeGreaterThanOrEqual(4)
    for (let a = 0; a < rs.length; a++)
      for (let b = a + 1; b < rs.length; b++) {
        const rms = (id: string) =>
          Math.sqrt(
            Array.from({ length: 31 }, (_, i) => {
              const p = body(rs[a], 0.5 + i * 0.05, id),
                q = body(rs[b], 0.5 + i * 0.05, id)
              return (p.x - q.x) ** 2 + (p.z - q.z) ** 2
            }).reduce((x, y) => x + y, 0) / 31,
          )
        expect(Math.max(rms('D1'), rms('D5')), `${coverages[a]} vs ${coverages[b]}`).toBeGreaterThan(0.25)
      }
  })
  it('the same offense reads a shallow tag inside and a deep tag weakside, with actual window tradeoffs', () => {
    const c = createDefaultConfig()
    c.seed = seed
    const deep = run('drop', seed),
      shallow = simulate({
        ...c,
        interventions: [{ id: 'shallow-at-tag', kind: 'answer', at: 0.75, patch: { tagDepth: 0.25 } }],
      })
    expect(shallow.frames.filter((f) => f.t < 0.75)).toEqual(deep.frames.filter((f) => f.t < 0.75))
    expect(deep.decisions[0].selected).toBe('lift')
    expect(shallow.decisions[0].selected).toBe('roll')
    const difference = compare(deep, shallow)
    expect(difference.tradeoffs.find((t) => t.id === 'lift')!.direction).toBe('closes')
    expect(difference.tradeoffs.find((t) => t.id === 'roll')!.direction).toBe('opens')
  })
})
