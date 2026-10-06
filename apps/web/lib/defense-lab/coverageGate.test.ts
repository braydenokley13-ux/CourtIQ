/**
 * FOUNDER COVERAGE GATE. Spec: docs/defense-lab/v2/coverage-spec.md.
 * DROP / SWITCH / BLITZ / HEDGE / ICE must differ in policy, reads, responsibilities,
 * rotations and consequences, not in starting coordinates. Every assertion is relational
 * (position relative to ball/screen/rim, who owns whom over time, which reads were used,
 * pairwise distinctness) and is checked on several seeds. No exact numbers from today's output.
 *
 * Opt-in so the default suite stays green while the engine catches up:
 *   COVERAGE_GATE=1 pnpm exec vitest run lib/defense-lab/coverageGate
 */
import { describe, expect, it } from 'vitest'
import { applyAnswers } from './corpus/answers'
import { HIGH_PNR_PROBLEM, createDefaultConfig } from './scenario'
import { frameAt, simulate } from './simulation'
import type { PlayerId, Responsibility, SimulationResult, WorldFrame } from './types'

type Cov = 'drop' | 'switch' | 'blitz' | 'hedge' | 'ice'
const COVS: Cov[] = ['drop', 'switch', 'blitz', 'hedge', 'ice']
const SEEDS = [2026, 11, 777]
const RIM = { x: 0, z: 1.575 }
/** Handler reaches the screener when the roller's dive starts. Derived, not tuned. */
const S = HIGH_PNR_PROBLEM.actions.find(a => a.id === 'dive')!.from
const start = (id: PlayerId) => HIGH_PNR_PROBLEM.players.find(p => p.id === id)!
const height = (id: PlayerId) => start(id).height

const cache = new Map<string, SimulationResult>()
function run(cov: Cov, seed = 2026): SimulationResult {
  const key = `${cov}:${seed}`
  if (!cache.has(key)) {
    const c = createDefaultConfig()
    c.seed = seed
    c.answer = applyAnswers(c.answer, [cov])
    cache.set(key, simulate(c))
  }
  return cache.get(key)!
}
const at = (r: SimulationResult, t: number): WorldFrame => frameAt(r, t)
const P = (r: SimulationResult, t: number, id: PlayerId) => at(r, t).players.find(p => p.id === id)!
const dist = (r: SimulationResult, t: number, a: PlayerId, b: PlayerId) => Math.hypot(P(r, t, a).x - P(r, t, b).x, P(r, t, a).z - P(r, t, b).z)
const firstPass = (r: SimulationResult) => r.events.find(e => e.type === 'pass')
const passT = (r: SimulationResult) => firstPass(r)?.t ?? r.frames[r.frames.length - 1].t
const handlerHolds = (r: SimulationResult, t: number) => { const b = at(r, t).ball; return b.owner === 'O1' && b.phase === 'handle' }
const resp = (r: SimulationResult, t: number, d: PlayerId): Responsibility[] => at(r, t).responsibilities.filter(x => x.defenderId === d)
const primary = (r: SimulationResult, t: number, d: PlayerId) => [...resp(r, t, d)].sort((a, b) => b.priority - a.priority)[0]
const grid = (a: number, b: number, step = 0.1) => { const out: number[] = []; for (let t = a; t <= b + 1e-9; t += step) out.push(+t.toFixed(3)); return out }
const everySeed = (fn: (seed: number) => void) => { for (const seed of SEEDS) fn(seed) }
const selectedTarget = (r: SimulationResult, i: number) => { const d = r.decisions[i]; return d.selected === 'hold' ? 'hold' : `${d.selected}/${d.candidates.find(c => c.threatId === d.selected)?.playerId ?? '?'}` }
const readChain = (r: SimulationResult) => r.decisions.map((_, i) => selectedTarget(r, i)).filter(x => x !== 'hold').join('>')
const rms = (r1: SimulationResult, r2: SimulationResult, id: PlayerId, a: number, b: number) => { const ts = grid(a, b, 0.05); return Math.sqrt(ts.reduce((s, t) => s + (P(r1, t, id).x - P(r2, t, id).x) ** 2 + (P(r1, t, id).z - P(r2, t, id).z) ** 2, 0) / ts.length) }
const respSignature = (r: SimulationResult) => {
  const set = new Set<string>()
  for (const t of grid(S, Math.min(passT(r) + 0.6, S + 3), 0.1)) for (const d of ['D1', 'D3', 'D4', 'D5'] as PlayerId[]) for (const x of resp(r, t, d)) set.add(`${d}>${x.offensivePlayerId}:${x.kind}`)
  return [...set].sort().join(',')
}
/** Seconds D5 holds a non-recover obligation on `target` while O1 still has the ball. */
const d5OnTime = (r: SimulationResult, target: PlayerId) => grid(S, passT(r), 0.05).filter(t => handlerHolds(r, t) && resp(r, t, 'D5').some(x => x.offensivePlayerId === target && x.kind !== 'recover')).length * 0.05

describe.skipIf(!process.env.COVERAGE_GATE)('Coverage gate: drop / switch / blitz / hedge / ice are behaviorally distinct', () => {
  describe('DROP: contain below the screen, concede the pull-up', () => {
    it('D5 stays between ball and rim, below screen level, while O1 holds the ball', () => everySeed(seed => {
      const r = run('drop', seed)
      for (const t of grid(S + 0.3, Math.min(passT(r), S + 2.0))) {
        if (!handlerHolds(r, t)) continue
        const o1 = P(r, t, 'O1'), d5 = P(r, t, 'D5')
        expect(d5.z, `t=${t}`).toBeLessThanOrEqual(o1.z - 0.5)
        const lineX = RIM.x + (o1.x - RIM.x) * (d5.z - RIM.z) / (o1.z - RIM.z)
        expect(Math.abs(d5.x - lineX), `D5 off the ball-rim line at t=${t}`).toBeLessThanOrEqual(1.6)
      }
    }))
    it('handler gets a pull-up / floater window: D5 is >= 2 m from him for >= 0.3 s', () => everySeed(seed => {
      const r = run('drop', seed)
      const open = grid(S + 0.3, passT(r), 0.05).filter(t => handlerHolds(r, t) && dist(r, t, 'D5', 'O1') >= 2).length * 0.05
      expect(open).toBeGreaterThanOrEqual(0.3)
    }))
    it('D5 owns the handler (contain), D1 chases him, D3 tags the roller; nobody switches', () => everySeed(seed => {
      const r = run('drop', seed)
      for (const t of grid(S + 0.4, Math.min(passT(r) - 0.05, S + 1.5))) {
        expect(resp(r, t, 'D5').every(x => x.offensivePlayerId === 'O1' && x.kind !== 'switch'), `D5 at ${t}`).toBe(true)
        expect(primary(r, t, 'D1').offensivePlayerId).toBe('O1')
      }
      expect(grid(S, passT(r), 0.05).some(t => resp(r, t, 'D3').some(x => x.kind === 'tag' && x.offensivePlayerId === 'O5'))).toBe(true)
    }))
    it('trade-off: handler is not forced to pass early (first pass >= screen + 1.2 s)', () => everySeed(seed => {
      expect(passT(run('drop', seed))).toBeGreaterThanOrEqual(S + 1.2)
    }))
    it('trade-off: the pocket pass to O5 is either not thrown or caught with D5 within 2 m', () => everySeed(seed => {
      const r = run('drop', seed), p = firstPass(r)
      if (p?.targetId !== 'O5') return
      const catchT = r.events.find(e => e.type === 'catch' && e.playerId === 'O5')!.t
      expect(dist(r, catchT, 'D5', 'O5')).toBeLessThanOrEqual(2)
    }))
  })

  describe('SWITCH: responsibilities swap and the offense attacks the mismatch', () => {
    it('after the screen D5 owns only O1 and D1 owns only O5 (no chase, no tag)', () => everySeed(seed => {
      const r = run('switch', seed)
      for (const t of grid(S + 0.4, Math.min(passT(r) - 0.05, S + 2.0))) {
        expect(resp(r, t, 'D5').length, `D5 at ${t}`).toBeGreaterThan(0)
        expect(resp(r, t, 'D5').every(x => x.offensivePlayerId === 'O1'), `D5 at ${t}`).toBe(true)
        expect(resp(r, t, 'D1').every(x => x.offensivePlayerId === 'O5'), `D1 at ${t}`).toBe(true)
        expect(resp(r, t, 'D1').concat(resp(r, t, 'D5')).some(x => x.kind === 'chase' || x.kind === 'tag')).toBe(false)
      }
    }))
    it('the weak side stays home: D3 never tags, D3 and D4 never take O5', () => everySeed(seed => {
      const r = run('switch', seed)
      for (const t of grid(S, passT(r), 0.1)) for (const d of ['D3', 'D4'] as PlayerId[]) expect(resp(r, t, d).some(x => x.kind === 'tag' || x.offensivePlayerId === 'O5'), `${d} at ${t}`).toBe(false)
      expect(dist(r, S + 1.5, 'D3', 'O3')).toBeLessThanOrEqual(2.5)
    }))
    it('the mismatch is real in the content: D1 is shorter than O5 and D5 is taller than O1', () => {
      expect(height('D1')).toBeLessThan(height('O5'))
      expect(height('D5')).toBeGreaterThan(height('O1'))
    })
    it('small-on-big: O5 is attacked, by a pass to O5 where O5 holds rim-side position on D1', () => everySeed(seed => {
      const r = run('switch', seed)
      const catches = r.events.filter(e => e.type === 'catch' && e.playerId === 'O5' && e.t > S)
      expect(catches.length, 'O5 never receives against D1').toBeGreaterThan(0)
      const t = catches[0].t
      expect(P(r, t, 'O5').z, 'O5 is not closer to the rim than D1 at the catch').toBeLessThanOrEqual(P(r, t, 'D1').z - 0.3)
      expect(dist(r, t, 'D1', 'O5'), 'D1 should be on him (sealed), not rotating help').toBeLessThanOrEqual(1.6)
    }))
    it('big-on-guard: handler attacks D5 off the dribble and gets by him', () => everySeed(seed => {
      const r = run('switch', seed)
      const beat = grid(S + 0.6, S + 3).some(t => handlerHolds(r, t) && P(r, t, 'O1').z <= P(r, t, 'D5').z - 0.5 && dist(r, t, 'O1', 'D5') <= 2.5)
      const drive = r.decisions.some((d, i) => d.actorId === 'O1' && selectedTarget(r, i) === 'drive/O1')
      expect(beat || drive).toBe(true)
    }))
    it('the offense reads differ from drop: it reads the mismatch (O1 drive or O5), not the weakside chain', () => everySeed(seed => {
      const chain = readChain(run('switch', seed))
      expect(chain.split('>').filter(x => x === 'lift/O4' || x === 'corner/O3').length, `chain ${chain}`).toBeLessThan(2)
      expect(/drive\/O1|roll\/O5|pop\/O5/.test(chain), chain).toBe(true)
    }))
  })

  describe('BLITZ: two on the ball, 4-on-3 behind it', () => {
    it('D1 and D5 are both within 2 m of the handler shortly after the screen', () => everySeed(seed => {
      const r = run('blitz', seed)
      expect(grid(S + 0.3, S + 0.9, 0.05).some(t => handlerHolds(r, t) && dist(r, t, 'D1', 'O1') <= 2 && dist(r, t, 'D5', 'O1') <= 2), 'no trap frame').toBe(true)
    }))
    it('D5 stays at screen level (no deeper than 1.25 m below the handler) while trapping', () => everySeed(seed => {
      const r = run('blitz', seed)
      for (const t of grid(S + 0.4, Math.min(passT(r), S + 0.9))) expect(P(r, t, 'D5').z, `t=${t}`).toBeGreaterThanOrEqual(P(r, t, 'O1').z - 1.0)
    }))
    it('D5 keeps the handler as his obligation until the ball leaves; D5 holds him longer than in hedge', () => everySeed(seed => {
      const r = run('blitz', seed)
      for (const t of grid(S + 0.4, passT(r) - 0.05)) if (handlerHolds(r, t)) expect(resp(r, t, 'D5').every(x => x.offensivePlayerId === 'O1'), `t=${t}`).toBe(true)
      expect(d5OnTime(r, 'O1')).toBeGreaterThan(d5OnTime(run('hedge', seed), 'O1') + 0.3)
    }))
    it('handler is forced to pass out early (>= 0.4 s before drop) while still doubled', () => everySeed(seed => {
      const r = run('blitz', seed)
      expect(passT(r)).toBeLessThanOrEqual(S + 1.3)
      expect(passT(r)).toBeLessThanOrEqual(passT(run('drop', seed)) - 0.4)
      expect(dist(r, passT(r) - 0.1, 'D1', 'O1')).toBeLessThanOrEqual(2.5)
      expect(dist(r, passT(r) - 0.1, 'D5', 'O1')).toBeLessThanOrEqual(2.5)
    }))
    it('short roll: the first pass goes to O5, caught between the FT line and the top of the key with D5 behind the play', () => everySeed(seed => {
      const r = run('blitz', seed)
      expect(firstPass(r)?.targetId).toBe('O5')
      const catchT = r.events.find(e => e.type === 'catch' && e.playerId === 'O5')!.t
      const o5 = P(r, catchT, 'O5')
      expect(o5.z).toBeGreaterThanOrEqual(4.2)   // FT line is z=5.8; below ~4.2 is a deep roll, not a short roll
      expect(o5.z).toBeLessThanOrEqual(7.8)      // top of the key is ~z=8.8
      expect(Math.abs(o5.x)).toBeLessThanOrEqual(2.5)
      expect(dist(r, catchT, 'D5', 'O5'), '4-on-3: the trapper is not on the catcher').toBeGreaterThanOrEqual(1.5)
    }))
    it('low man (D3) first responsibility is the roller (tag) from the screen until the pass', () => everySeed(seed => {
      const r = run('blitz', seed)
      for (const t of grid(S + 0.5, passT(r) - 0.05)) { const p = primary(r, t, 'D3'); expect(`${p.offensivePlayerId}:${p.kind}`, `t=${t}`).toBe('O5:tag') }
    }))
    it('the backside rotates early: D4 owns O3 (X-out) by the time the ball is passed', () => everySeed(seed => {
      const r = run('blitz', seed)
      expect(resp(r, passT(r) + 0.05, 'D4').some(x => x.offensivePlayerId === 'O3')).toBe(true)
    }))
  })

  describe('HEDGE / SHOW (optional): step out, turn the ball, recover', () => {
    it('D5 steps to screen level within 2.5 m of the handler, then his job flips to O5 while O1 still has the ball', () => everySeed(seed => {
      const r = run('hedge', seed)
      expect(grid(S, S + 1.2, 0.05).some(t => P(r, t, 'D5').z >= P(r, t, 'O1').z - 1.5 && dist(r, t, 'D5', 'O1') <= 2.5), 'no show').toBe(true)
      expect(grid(S, passT(r), 0.05).some(t => handlerHolds(r, t) && resp(r, t, 'D5').some(x => x.offensivePlayerId === 'O5')), 'D5 never recovers to O5 before the pass').toBe(true)
    }))
    it('the show is shorter than a blitz and D5 is back below the handler by screen + 2 s', () => everySeed(seed => {
      const r = run('hedge', seed), t = Math.min(S + 2, passT(r))
      expect(d5OnTime(r, 'O1')).toBeLessThan(d5OnTime(run('blitz', seed), 'O1'))
      expect(P(r, t, 'D5').z).toBeLessThanOrEqual(P(r, t, 'O1').z - 0.8)
    }))
  })

  describe('ICE (middle-screen force-away; honest ICE needs a side screen, see spec)', () => {
    const screenSide = Math.sign(start('O5').start.x - start('O1').start.x) // -1: screener sits on the handler's -x side
    it('handler is steered AWAY from the screen side and never gets the middle', () => everySeed(seed => {
      const r = run('ice', seed), x0 = start('O1').start.x
      const dx = P(r, S + 1.5, 'O1').x - x0
      expect(Math.sign(dx), `dx=${dx}`).toBe(-screenSide)
      expect(Math.abs(dx)).toBeGreaterThanOrEqual(0.5)
      for (const t of grid(S, S + 2)) expect((P(r, t, 'O1').x - x0) * screenSide, `handler used the screen/middle at t=${t}`).toBeLessThanOrEqual(0.6)
    }))
    it('D1 plays the high side, on the screen side of the handler, level with him (not trailing)', () => everySeed(seed => {
      const r = run('ice', seed)
      for (const t of grid(S, S + 1.0)) {
        if (!handlerHolds(r, t)) continue
        expect((P(r, t, 'D1').x - P(r, t, 'O1').x) * screenSide, `t=${t}`).toBeGreaterThanOrEqual(0.3)
        expect(Math.abs(P(r, t, 'D1').z - P(r, t, 'O1').z), `t=${t}`).toBeLessThanOrEqual(1.5)
      }
    }))
    it('D5 walls off the forced side: below the ball and on the forced side of O5, shifted from his drop position', () => everySeed(seed => {
      const r = run('ice', seed), d = run('drop', seed), t = S + 1.0
      expect(P(r, t, 'D5').z).toBeLessThanOrEqual(P(r, t, 'O1').z - 0.8)
      expect((P(r, t, 'D5').x - P(r, t, 'O5').x) * -screenSide, 'D5 is not on the forced side of O5').toBeGreaterThanOrEqual(0.7)
      expect(Math.abs(P(r, t, 'D5').x - P(d, t, 'D5').x), 'D5 identical to drop').toBeGreaterThanOrEqual(0.5)
    }))
    it('the middle reads are taken away: no pocket pass to O5 in the lane as the first pass', () => everySeed(seed => {
      const r = run('ice', seed), p = firstPass(r)
      if (p?.targetId !== 'O5') return
      const o5 = P(r, r.events.find(e => e.type === 'catch' && e.playerId === 'O5')!.t, 'O5')
      expect(!(o5.z <= 6.5 && Math.abs(o5.x) <= 2), 'short roll in the middle was available').toBe(true)
    }))
    it('the weak side shrinks toward the forced side (D3 or D4 differ from drop in x by >= 0.5 m)', () => everySeed(seed => {
      const r = run('ice', seed), d = run('drop', seed), t = S + 1.0
      expect(Math.max(Math.abs(P(r, t, 'D3').x - P(d, t, 'D3').x), Math.abs(P(r, t, 'D4').x - P(d, t, 'D4').x))).toBeGreaterThanOrEqual(0.5)
    }))
  })

  describe('DISTINCTNESS MATRIX', () => {
    const pairs = COVS.flatMap((a, i) => COVS.slice(i + 1).map(b => [a, b] as const))
    it.each(pairs)('%s vs %s: D1/D5 trajectories differ by >= 0.75 m RMS (either) on every seed', (a, b) => everySeed(seed => {
      const A = run(a, seed), B = run(b, seed)
      const d1 = rms(A, B, 'D1', S, S + 2.5), d5 = rms(A, B, 'D5', S, S + 2.5)
      expect(Math.max(d1, d5), `D1 ${d1.toFixed(2)} D5 ${d5.toFixed(2)}`).toBeGreaterThanOrEqual(0.75)
    }))
    it.each(pairs)('%s vs %s: responsibility sets differ', (a, b) => {
      expect(respSignature(run(a)), `${a}=${b}`).not.toBe(respSignature(run(b)))
    })
    it.each(pairs)('%s vs %s: the offense uses a different read chain', (a, b) => {
      expect(readChain(run(a)), `${a}: ${readChain(run(a))} / ${b}: ${readChain(run(b))}`).not.toBe(readChain(run(b)))
    })
    it('at least 4 distinct read chains and 4 distinct first-pass timings (>= 0.2 s apart) across the five coverages', () => {
      expect(new Set(COVS.map(c => readChain(run(c)))).size).toBeGreaterThanOrEqual(4)
      const ts = COVS.map(c => passT(run(c))).sort((x, y) => x - y)
      expect(ts.filter((t, i) => i === 0 || t - ts[i - 1] >= 0.2).length).toBeGreaterThanOrEqual(4)
    })
    it('a coverage is not "drop plus an offset": for every non-drop coverage, D1 or D5 obligations differ in kind or target from drop', () => {
      const dropSig = respSignature(run('drop'))
      for (const c of COVS.filter(x => x !== 'drop')) {
        const sig = (s: string) => s.split(',').filter(x => x.startsWith('D1') || x.startsWith('D5')).join(',')
        expect(sig(respSignature(run(c))), c).not.toBe(sig(dropSig))
      }
    })
  })
})
