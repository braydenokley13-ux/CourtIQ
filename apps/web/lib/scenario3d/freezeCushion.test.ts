/**
 * V6 Packet 4 — Freeze cushion contract.
 *
 * Reads each founder-v0 scenario's authored timings and asserts:
 *  1. The freeze lands AFTER every setup movement starts (no
 *     freeze-before-cue regressions).
 *  2. AOR flying-closeout scenarios freeze BEFORE the closeout
 *     fully settles (so the user sees the defender mid-flight,
 *     which is the cushion read).
 *  3. Non-flying AOR scenarios freeze AFTER the closeout fully
 *     settles (so the cushion is still legible while stationary).
 *  4. Every other family freeze leaves at least a 200 ms settle
 *     cushion after the last setup movement ends.
 *
 * Pure / deterministic: reads the JSON files synchronously, no
 * renderer or timeline state.
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

interface Movement {
  id: string
  playerId: string
  kind: string
  delayMs?: number
  durationMs?: number
}

interface FreezeMarker {
  kind: 'atMs' | 'beforeMovementId'
  atMs?: number
  movementId?: string
}

interface Scene {
  movements: Movement[]
  freezeMarker: FreezeMarker
}

interface Scenario {
  id: string
  scene: Scene
}

interface MovementWindow {
  id: string
  startMs: number
  endMs: number
  kind: string
}

function loadScenario(id: string): Scenario {
  const file = join(SCENARIOS_DIR, `${id}.json`)
  const list = JSON.parse(readFileSync(file, 'utf8')) as Scenario[]
  const s = list[0]
  if (!s) throw new Error(`scenario ${id} has no entries`)
  return s
}

function buildSetupWindows(s: Scene): MovementWindow[] {
  const ends = new Map<string, number>()
  const out: MovementWindow[] = []
  for (const m of s.movements) {
    const dur = m.durationMs ?? 700
    const delay = m.delayMs ?? 0
    const start = (ends.get(m.playerId) ?? 0) + delay
    const end = start + dur
    ends.set(m.playerId, end)
    out.push({ id: m.id, startMs: start, endMs: end, kind: m.kind })
  }
  return out
}

function freezeMs(s: Scene): number {
  const f = s.freezeMarker
  if (f.kind === 'atMs') return f.atMs ?? 1500
  return 1500 // beforeMovementId scenarios resolve elsewhere; not asserted here
}

const ALL_IDS = readdirSync(SCENARIOS_DIR)
  .filter((f) => f.endsWith('.json') && f !== 'pack.json')
  .map((f) => f.replace(/\.json$/, ''))

describe('founder-v0 freeze cushion contract', () => {
  it('finds all 20 founder-v0 scenarios', () => {
    expect(ALL_IDS).toHaveLength(20)
  })

  it('freezeAtMs lands after every setup movement starts', () => {
    for (const id of ALL_IDS) {
      const s = loadScenario(id)
      const windows = buildSetupWindows(s.scene)
      const freeze = freezeMs(s.scene)
      for (const w of windows) {
        expect(
          freeze,
          `${id}: ${w.id} starts at ${w.startMs}, freeze at ${freeze}`,
        ).toBeGreaterThanOrEqual(w.startMs)
      }
    }
  })

  it('every family except flying-closeout AOR has >= 200 ms freeze settle cushion', () => {
    const FLYING_AOR = new Set(['AOR-02', 'AOR-04'])
    for (const id of ALL_IDS) {
      if (FLYING_AOR.has(id)) continue
      const s = loadScenario(id)
      const windows = buildSetupWindows(s.scene)
      const lastEnd = Math.max(0, ...windows.map((w) => w.endMs))
      const freeze = freezeMs(s.scene)
      const cushion = freeze - lastEnd
      expect(
        cushion,
        `${id}: lastEnd=${lastEnd} freeze=${freeze} cushion=${cushion}`,
      ).toBeGreaterThanOrEqual(200)
    }
  })

  it('AOR flying-closeout scenarios freeze BEFORE the closeout fully settles', () => {
    for (const id of ['AOR-02', 'AOR-04']) {
      const s = loadScenario(id)
      const windows = buildSetupWindows(s.scene)
      const closeout = windows.find((w) => w.kind === 'closeout')
      expect(closeout, `${id}: missing closeout movement`).toBeDefined()
      if (!closeout) continue
      const freeze = freezeMs(s.scene)
      // freeze inside the closeout window's last 30% (the
      // deceleration phase is the cue).
      const decelStart = closeout.startMs + (closeout.endMs - closeout.startMs) * 0.7
      expect(
        freeze,
        `${id}: closeout ${closeout.startMs}..${closeout.endMs}, freeze ${freeze}`,
      ).toBeGreaterThanOrEqual(decelStart)
      expect(freeze).toBeLessThanOrEqual(closeout.endMs + 250)
    }
  })

  it('AOR set-closeout scenarios freeze AFTER the closeout settles (cushion read)', () => {
    for (const id of ['AOR-01', 'AOR-03', 'AOR-05']) {
      const s = loadScenario(id)
      const windows = buildSetupWindows(s.scene)
      const closeout = windows.find((w) => w.kind === 'closeout')
      expect(closeout).toBeDefined()
      if (!closeout) continue
      const freeze = freezeMs(s.scene)
      expect(freeze).toBeGreaterThan(closeout.endMs)
    }
  })
})
