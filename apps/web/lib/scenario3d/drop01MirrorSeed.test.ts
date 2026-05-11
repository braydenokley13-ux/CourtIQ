/**
 * Pack 2 (Phase δ-B.M) — DROP-01-MIRROR authoring lock.
 *
 * Parallels `drop01Seed.test.ts` for the left-side mirror. Locks the
 * same contracts as DROP-01 (decoder, difficulty, camera, single-
 * freeze, cue, choice grammar, wrongDemo coverage) plus a
 * mirror-specific block:
 *
 *   - The screener starts on the LEFT half of the floor (x < 0).
 *   - prerequisites resolve to ['DROP-01'] (you don't see the mirror
 *     until you've seen the base).
 *   - The manifest registers DROP-01-MIRROR with the expected file.
 *
 * The mirror is structurally a copy of DROP-01 reflected across the
 * y-axis; these assertions exist to ensure a future copy-paste
 * cannot accidentally regress the mirror back to the right side
 * without somebody noticing.
 */

import { describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { sceneSchema } from './schema'

const PACK_DIR = path.resolve(
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
  'pnr-coverage-v0',
)

const MIRROR_PATH = path.join(PACK_DIR, 'DROP-01-MIRROR.json')
const PACK_PATH = path.join(PACK_DIR, 'pack.json')

interface DropMirrorScenarioJson {
  id: string
  status: string
  decoder_tag?: string
  difficulty?: number
  user_role?: string
  progression_metadata?: { prerequisites?: string[]; unlocks?: string[] }
  choices: Array<{
    id: string
    quality?: 'best' | 'acceptable' | 'wrong'
    feedback_text: string
    label: string
    order: number
  }>
  scene?: {
    camera?: string
    beatSpec?: unknown
    players: Array<{ id: string; start: { x: number; z: number } }>
    preAnswerOverlays?: Array<{ kind: string; playerId?: string }>
    wrongDemos?: Array<{ choiceId: string }>
  }
}

async function loadMirror(): Promise<DropMirrorScenarioJson> {
  const raw = await fs.readFile(MIRROR_PATH, 'utf8')
  const arr = JSON.parse(raw) as DropMirrorScenarioJson[]
  return arr[0]!
}

describe('DROP-01-MIRROR — Pack 2 (Phase δ-B.M) mirror-variant authoring lock', () => {
  it('pack manifest registers DROP-01-MIRROR with prerequisite DROP-01', async () => {
    const manifestRaw = await fs.readFile(PACK_PATH, 'utf8')
    const manifest = JSON.parse(manifestRaw) as {
      slug: string
      scenarios: Array<{ id: string; file: string; prerequisites: string[] }>
    }
    expect(manifest.slug).toBe('pnr-coverage-v0')
    const entry = manifest.scenarios.find((s) => s.id === 'DROP-01-MIRROR')
    expect(entry).toBeDefined()
    expect(entry?.file).toBe('DROP-01-MIRROR.json')
    expect(entry?.prerequisites).toEqual(['DROP-01'])
  })

  it('parses through the runtime scene schema', async () => {
    const scenario = await loadMirror()
    expect(scenario.id).toBe('DROP-01-MIRROR')
    expect(scenario.scene).toBeDefined()
    expect(() => sceneSchema.parse(scenario.scene)).not.toThrow()
  })

  it('inherits the DROP-01 decoder + role contract at D1', async () => {
    const scenario = await loadMirror()
    expect(scenario.decoder_tag).toBe('READ_THE_COVERAGE')
    expect(scenario.difficulty).toBe(1)
    expect(scenario.user_role).toBe('pnr_ball_handler')
  })

  it('uses the DROP camera default (top_down)', async () => {
    const scenario = await loadMirror()
    expect(scenario.scene?.camera).toBe('top_down')
  })

  it('is single-freeze (no beatSpec) — same shape as DROP-01', async () => {
    const scenario = await loadMirror()
    expect(scenario.scene?.beatSpec).toBeUndefined()
  })

  it('places the screener on the LEFT half of the floor (mirrored from DROP-01)', async () => {
    const scenario = await loadMirror()
    const screener = scenario.scene?.players.find((p) => p.id === 'screener')
    expect(screener, 'screener must exist').toBeDefined()
    // DROP-01 puts the screener at x=+4 (right of the user). The mirror
    // must put it at x<0 (left of the user). A copy-paste regression
    // would land it back near +4 and this test fails.
    expect(screener!.start.x).toBeLessThan(0)
  })

  it('emits a chest_line or foot_arrow cue on the screen defender', async () => {
    const scenario = await loadMirror()
    const pre = scenario.scene?.preAnswerOverlays ?? []
    const cue = pre.find(
      (o) =>
        o.kind === 'defender_chest_line' || o.kind === 'defender_foot_arrow',
    )
    expect(cue).toBeDefined()
    expect(cue?.playerId).toBeDefined()
  })

  it('exposes one best read and a wrongDemo for every non-best choice', async () => {
    const scenario = await loadMirror()
    const best = scenario.choices.filter((c) => c.quality === 'best')
    expect(best).toHaveLength(1)
    const nonBestIds = scenario.choices
      .filter((c) => c.quality !== 'best')
      .map((c) => c.id)
    const demos = (scenario.scene?.wrongDemos ?? []).map((d) => d.choiceId)
    for (const id of nonBestIds) {
      expect(demos).toContain(id)
    }
  })

  it('inherits prerequisites = [DROP-01] in progression_metadata', async () => {
    const scenario = await loadMirror()
    expect(scenario.progression_metadata?.prerequisites).toEqual(['DROP-01'])
  })
})
