/**
 * Pack 2 (Phase γ) — DROP-02 base scenario authoring lock.
 *
 * Mirrors `drop01Seed.test.ts` for the new D2 deep-drop snake variant.
 * Loads DROP-02, parses through the runtime scene schema, and runs
 * LINT-DROP-01..05 against it so authoring drift surfaces here rather
 * than at seed time.
 */

import { describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { sceneSchema } from './schema'
import {
  lintDropFreezeTiming,
  lintDropHasBodyAngleCue,
  lintDropHasMisreadChoice,
  lintDropHasScreenDefender,
  lintDropNoSecondBeat,
  type DropLintScenarioInput,
} from './dropAuthoringLint'

const DROP_02_PATH = path.resolve(
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
  'DROP-02.json',
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

interface DropScenarioJson extends DropLintScenarioInput {
  status: string
  user_role?: string
  lesson_connection?: string
  scene?: DropLintScenarioInput['scene'] & {
    camera?: string
    secondBeatPreAnswerOverlays?: unknown[]
    secondBeatPostAnswerOverlays?: unknown[]
    consequenceOverlays?: unknown[]
    answerDemo?: unknown[]
    wrongDemos?: Array<{ choiceId: string }>
  }
}

describe('DROP-02 — Pack 2 (Phase γ) deep-drop snake authoring lock', () => {
  it('pack manifest declares DROP-02 with prerequisite DROP-01', async () => {
    const manifestRaw = await fs.readFile(PACK_PATH, 'utf8')
    const manifest = JSON.parse(manifestRaw) as {
      slug: string
      scenarios: Array<{ id: string; file: string; prerequisites: string[] }>
    }
    const entry = manifest.scenarios.find((s) => s.id === 'DROP-02')
    expect(entry).toBeDefined()
    expect(entry?.file).toBe('DROP-02.json')
    expect(entry?.prerequisites).toEqual(['DROP-01'])
  })

  it('parses through the runtime scene schema', async () => {
    const raw = await fs.readFile(DROP_02_PATH, 'utf8')
    const arr = JSON.parse(raw) as DropScenarioJson[]
    const scenario = arr[0]!
    expect(scenario.id).toBe('DROP-02')
    expect(scenario.scene).toBeDefined()
    expect(() => sceneSchema.parse(scenario.scene)).not.toThrow()
  })

  it('declares decoder=READ_THE_COVERAGE at D2 with the PnR ball-handler role', async () => {
    const raw = await fs.readFile(DROP_02_PATH, 'utf8')
    const arr = JSON.parse(raw) as DropScenarioJson[]
    const scenario = arr[0]!
    expect(scenario.decoder_tag).toBe('READ_THE_COVERAGE')
    expect(scenario.difficulty).toBe(2)
    expect(scenario.user_role).toBe('pnr_ball_handler')
  })

  it('is single-freeze — no secondBeat', async () => {
    const raw = await fs.readFile(DROP_02_PATH, 'utf8')
    const arr = JSON.parse(raw) as DropScenarioJson[]
    const scenario = arr[0]!
    expect(scenario.scene?.beatSpec).toBeUndefined()
  })

  it('passes LINT-DROP-01..05', async () => {
    const raw = await fs.readFile(DROP_02_PATH, 'utf8')
    const arr = JSON.parse(raw) as DropScenarioJson[]
    const scenario = arr[0]!
    const allIssues = [
      ...lintDropNoSecondBeat(scenario),
      ...lintDropHasScreenDefender(scenario),
      ...lintDropHasBodyAngleCue(scenario),
      ...lintDropFreezeTiming(scenario),
      ...lintDropHasMisreadChoice(scenario),
    ]
    expect(
      allIssues,
      `DROP-02 lint failures: ${allIssues.map((i) => `${i.rule}: ${i.message}`).join('\n')}`,
    ).toEqual([])
  })

  it('includes the D2 vision_cone cue alongside chest + foot', async () => {
    const raw = await fs.readFile(DROP_02_PATH, 'utf8')
    const arr = JSON.parse(raw) as DropScenarioJson[]
    const scenario = arr[0]!
    const pre = scenario.scene?.preAnswerOverlays ?? []
    const kinds = pre.map((o) => o.kind)
    expect(kinds).toContain('defender_chest_line')
    expect(kinds).toContain('defender_foot_arrow')
    expect(kinds).toContain('defender_vision_cone')
  })

  it('declares a wrongDemo for every non-best choice', async () => {
    const raw = await fs.readFile(DROP_02_PATH, 'utf8')
    const arr = JSON.parse(raw) as DropScenarioJson[]
    const scenario = arr[0]!
    const choices = scenario.choices ?? []
    const nonBestIds = choices
      .filter((c) => c.quality !== 'best')
      .map((c) => (c as { id: string }).id)
    const demos = (scenario.scene?.wrongDemos ?? []).map((d) => d.choiceId)
    for (const id of nonBestIds) {
      expect(demos).toContain(id)
    }
  })
})
