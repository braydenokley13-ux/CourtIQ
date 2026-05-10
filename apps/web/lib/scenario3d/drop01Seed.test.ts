/**
 * Pack 2 (Phase β) — DROP-01 base scenario authoring lock.
 *
 * Mirrors `aor01Seed.test.ts` for the new Pack 2 DROP foundation.
 * Locks:
 *   - The pack manifest (`pnr-coverage-v0/pack.json`) declares DROP-01
 *     and the scenario file id matches.
 *   - DROP-01 parses through the runtime scene schema (so the scene's
 *     overlays, players, and freeze marker are all schema-valid).
 *   - Decoder tag is READ_THE_COVERAGE.
 *   - Difficulty is D1 (this pack ships D1 only in this slice).
 *   - Camera preset is `top_down` — matches the DROP authoring default.
 *   - Single-freeze contract: no `beatSpec.secondBeat`,
 *     `secondBeatPreAnswerOverlays`, `secondBeatPostAnswerOverlays`,
 *     or `consequenceOverlays`.
 *   - Pre-answer overlays include at least one screen-defender
 *     body-language cue (chest_line OR foot_arrow) — the lint anchor
 *     for LINT-DROP-03.
 *   - Choice menu includes at least one 'best' read AND at least one
 *     'wrong' read whose feedback names attacking into the big or
 *     missing the pocket — the LINT-DROP-05 anchor.
 */

import { describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { sceneSchema } from './schema'

const DROP_01_PATH = path.resolve(
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
  'DROP-01.json',
)

const PACK_PATH = path.resolve(
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
  'pack.json',
)

interface DropScenarioJson {
  id: string
  status: string
  decoder_tag?: string
  difficulty?: number
  user_role?: string
  best_read?: string
  decoder_teaching_point?: string
  lesson_connection?: string
  choices: Array<{
    id: string
    label: string
    quality?: 'best' | 'acceptable' | 'wrong'
    feedback_text: string
    order: number
  }>
  scene?: {
    camera?: string
    beatSpec?: unknown
    consequenceOverlays?: unknown[]
    secondBeatPreAnswerOverlays?: unknown[]
    secondBeatPostAnswerOverlays?: unknown[]
    preAnswerOverlays?: Array<{ kind: string; playerId?: string }>
    postAnswerOverlays?: Array<{ kind: string }>
    answerDemo?: unknown[]
    wrongDemos?: Array<{ choiceId: string }>
  }
}

describe('DROP-01 — Pack 2 (Phase β) base scenario authoring lock', () => {
  it('pack manifest declares DROP-01 and the file id matches', async () => {
    const manifestRaw = await fs.readFile(PACK_PATH, 'utf8')
    const manifest = JSON.parse(manifestRaw) as {
      slug: string
      scenarios: Array<{ id: string; file: string }>
    }
    expect(manifest.slug).toBe('pnr-coverage-v0')
    const entry = manifest.scenarios.find((s) => s.id === 'DROP-01')
    expect(entry).toBeDefined()
    expect(entry?.file).toBe('DROP-01.json')
  })

  it('parses through the runtime scene schema', async () => {
    const raw = await fs.readFile(DROP_01_PATH, 'utf8')
    const arr = JSON.parse(raw) as DropScenarioJson[]
    const scenario = arr[0]!
    // Manifest id must match scenario id (the seeder enforces the same).
    expect(scenario.id).toBe('DROP-01')
    expect(scenario.scene).toBeDefined()
    // sceneSchema parsing exercises overlay/player/movement integrity.
    expect(() => sceneSchema.parse(scenario.scene)).not.toThrow()
  })

  it('declares decoder=READ_THE_COVERAGE at D1 with the PnR ball-handler role', async () => {
    const raw = await fs.readFile(DROP_01_PATH, 'utf8')
    const arr = JSON.parse(raw) as DropScenarioJson[]
    const scenario = arr[0]!
    expect(scenario.decoder_tag).toBe('READ_THE_COVERAGE')
    expect(scenario.difficulty).toBe(1)
    expect(scenario.user_role).toBe('pnr_ball_handler')
  })

  it('uses the DROP camera default (top_down)', async () => {
    const raw = await fs.readFile(DROP_01_PATH, 'utf8')
    const arr = JSON.parse(raw) as DropScenarioJson[]
    const scenario = arr[0]!
    expect(scenario.scene?.camera).toBe('top_down')
  })

  it('is single-freeze — no secondBeat, no consequence overlays, no second-beat overlays', async () => {
    const raw = await fs.readFile(DROP_01_PATH, 'utf8')
    const arr = JSON.parse(raw) as DropScenarioJson[]
    const scenario = arr[0]!
    expect(scenario.scene?.beatSpec).toBeUndefined()
    expect(scenario.scene?.consequenceOverlays ?? []).toHaveLength(0)
    expect(scenario.scene?.secondBeatPreAnswerOverlays ?? []).toHaveLength(0)
    expect(scenario.scene?.secondBeatPostAnswerOverlays ?? []).toHaveLength(0)
  })

  it('emits at least one body/angle cue on the screen defender pre-answer', async () => {
    const raw = await fs.readFile(DROP_01_PATH, 'utf8')
    const arr = JSON.parse(raw) as DropScenarioJson[]
    const scenario = arr[0]!
    const pre = scenario.scene?.preAnswerOverlays ?? []
    const cue = pre.find(
      (o) =>
        o.kind === 'defender_chest_line' || o.kind === 'defender_foot_arrow',
    )
    expect(cue).toBeDefined()
    expect(cue?.playerId).toBeDefined()
  })

  it('exposes one best read and at least one wrong read that misreads the coverage', async () => {
    const raw = await fs.readFile(DROP_01_PATH, 'utf8')
    const arr = JSON.parse(raw) as DropScenarioJson[]
    const scenario = arr[0]!
    const best = scenario.choices.filter((c) => c.quality === 'best')
    expect(best).toHaveLength(1)
    const wrongs = scenario.choices.filter((c) => c.quality === 'wrong')
    expect(wrongs.length).toBeGreaterThanOrEqual(1)
    // At least one wrong read should attack into the big or miss the
    // pocket — the LINT-DROP-05 anchor.
    const misreads = wrongs.filter((c) =>
      /chest|paint|reset|drive|big/i.test(c.label + ' ' + c.feedback_text),
    )
    expect(misreads.length).toBeGreaterThanOrEqual(1)
  })

  it('declares a wrongDemo for every non-best choice', async () => {
    const raw = await fs.readFile(DROP_01_PATH, 'utf8')
    const arr = JSON.parse(raw) as DropScenarioJson[]
    const scenario = arr[0]!
    const nonBestIds = scenario.choices
      .filter((c) => c.quality !== 'best')
      .map((c) => c.id)
    const demos = (scenario.scene?.wrongDemos ?? []).map((d) => d.choiceId)
    for (const id of nonBestIds) {
      expect(demos).toContain(id)
    }
  })
})
