/**
 * V6 Packet 8 — Cinematic stability contract.
 *
 * Pins the per-scenario cinematic timing budget so a future tuning
 * sweep cannot accidentally drift a scenario into a feels-too-long
 * or feels-too-short rhythm.
 *
 * Asserts:
 *  1. Setup phase total duration is in [800, 2200] ms.
 *  2. answerDemo total duration is in [600, 2000] ms (the user
 *     should always see a complete read in under 2 s).
 *  3. Every wrongDemos branch is in [300, 1500] ms (consequences
 *     are short enough to feel like a quick sting, long enough to
 *     read the cause).
 *  4. The catcher of every best-read pass ends inside a 4 ft
 *     radius of the ball's `to` point (so the rep never throws to
 *     a hole the cutter never reached).
 *  5. Every scenario's `freezeMarker.atMs` is at least 1300 ms
 *     and at most 1700 ms, so the freeze always lands in a
 *     readable cinematic window.
 *
 * Pure / deterministic JSON read.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const SCENARIOS_DIR = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'packages',
  'db',
  'seed',
  'scenarios',
  'packs',
  'founder-v0',
)

interface CourtPoint {
  x: number
  z: number
}
interface Movement {
  id: string
  playerId: string
  kind: string
  to: CourtPoint
  delayMs?: number
  durationMs?: number
}
interface FreezeMarker {
  kind: 'atMs' | 'beforeMovementId'
  atMs?: number
}
interface WrongDemo {
  choiceId: string
  movements: Movement[]
}
interface ScenePlayer {
  id: string
  start: CourtPoint
}
interface Scenario {
  id: string
  scene: {
    players: ScenePlayer[]
    movements: Movement[]
    freezeMarker: FreezeMarker
    answerDemo: Movement[]
    wrongDemos: WrongDemo[]
  }
}

const ALL_IDS = readdirSync(SCENARIOS_DIR)
  .filter((f) => f.endsWith('.json') && f !== 'pack.json')
  .map((f) => f.replace(/\.json$/, ''))

function loadScenario(id: string): Scenario {
  const file = join(SCENARIOS_DIR, `${id}.json`)
  const list = JSON.parse(readFileSync(file, 'utf8')) as Scenario[]
  const s = list[0]
  if (!s) throw new Error(`scenario ${id} has no entries`)
  return s
}

function totalDurationMs(movements: Movement[]): number {
  const ends = new Map<string, number>()
  for (const m of movements) {
    const dur = m.durationMs ?? 700
    const delay = m.delayMs ?? 0
    const start = (ends.get(m.playerId) ?? 0) + delay
    ends.set(m.playerId, start + dur)
  }
  return Math.max(0, ...ends.values())
}

describe('cinematic stability budget', () => {
  it('setup phase total duration is inside [800, 2200] ms', () => {
    for (const id of ALL_IDS) {
      const s = loadScenario(id)
      const t = totalDurationMs(s.scene.movements)
      expect(t, `${id}: setup total = ${t}`).toBeGreaterThanOrEqual(800)
      expect(t, `${id}: setup total = ${t}`).toBeLessThanOrEqual(2200)
    }
  })

  it('answerDemo total duration is inside [600, 2000] ms', () => {
    for (const id of ALL_IDS) {
      const s = loadScenario(id)
      const t = totalDurationMs(s.scene.answerDemo)
      expect(t, `${id}: answerDemo total = ${t}`).toBeGreaterThanOrEqual(
        600,
      )
      expect(t, `${id}: answerDemo total = ${t}`).toBeLessThanOrEqual(2000)
    }
  })

  it('every wrongDemos branch total duration is inside [300, 1500] ms', () => {
    for (const id of ALL_IDS) {
      const s = loadScenario(id)
      for (const d of s.scene.wrongDemos) {
        const t = totalDurationMs(d.movements)
        expect(
          t,
          `${id}: wrongDemo ${d.choiceId} total = ${t}`,
        ).toBeGreaterThanOrEqual(300)
        expect(
          t,
          `${id}: wrongDemo ${d.choiceId} total = ${t}`,
        ).toBeLessThanOrEqual(1500)
      }
    }
  })

  it('best-read pass endpoint lands within 4 ft of a player-mover endpoint', () => {
    for (const id of ALL_IDS) {
      const s = loadScenario(id)
      // Find pass / skip_pass movements in the answerDemo. Skip the
      // shot release case — when a user_release_pass goes to (0,
      // ~0.5), it is the user's shot at the rim, not a pass to a
      // teammate, so the catcher contract does not apply.
      const RIM = { x: 0, z: 0.5 }
      const passes = s.scene.answerDemo.filter((m) => {
        if (m.kind !== 'pass' && m.kind !== 'skip_pass') return false
        const isShot =
          Math.hypot(m.to.x - RIM.x, m.to.z - RIM.z) < 1.5
        return !isShot
      })
      for (const p of passes) {
        const moverEndpoints = s.scene.answerDemo
          .filter((m) => m.playerId !== 'ball')
          .map((m) => m.to)
        // A stationary catcher receives the ball at their authored
        // start (no movement leg), so include every player start
        // as a candidate too.
        const stationaryEndpoints = s.scene.players.map((pp) => pp.start)
        const candidates = [...moverEndpoints, ...stationaryEndpoints]
        const ok = candidates.some((c) => {
          const dx = c.x - p.to.x
          const dz = c.z - p.to.z
          return Math.hypot(dx, dz) <= 4
        })
        expect(
          ok,
          `${id}: pass ${p.id} -> (${p.to.x},${p.to.z}) has no catcher candidate within 4 ft`,
        ).toBe(true)
      }
    }
  })

  it('freezeMarker.atMs sits inside [1300, 1700] ms', () => {
    for (const id of ALL_IDS) {
      const s = loadScenario(id)
      const f = s.scene.freezeMarker
      if (f.kind !== 'atMs') continue
      const ms = f.atMs ?? 1500
      expect(ms, `${id}: freezeAtMs = ${ms}`).toBeGreaterThanOrEqual(1300)
      expect(ms, `${id}: freezeAtMs = ${ms}`).toBeLessThanOrEqual(1700)
    }
  })
})
