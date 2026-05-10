/**
 * Pack 2 (Phase γ) — HUNT pack base-scenario authoring lock.
 *
 * Mirrors `drop01Seed.test.ts` for the new Pack 2 HUNT foundation
 * (`hunt-decoder-v0`). Loads each shipped HUNT scenario, parses it
 * through `sceneSchema`, and runs `lintHuntVariant` against it so the
 * authoring lint failure surfaces here instead of at seed time.
 *
 * The test deliberately keeps narrow assertions on each scenario —
 * decoder/difficulty/role + the chained-read structural contract
 * (beatSpec.firstBeat + secondBeat, cognition hold ≤ 1200ms, mismatch
 * pulse on both beats). Scenario-level prose checks (best/wrong arrays,
 * coach validation copy) live in the dropping seed test pattern and
 * are mirrored here for HUNT-01 / HUNT-02.
 */

import { describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { sceneSchema } from './schema'
import {
  lintHuntVariant,
  type HuntLintSceneInput,
  type HuntLintVariantMeta,
} from './huntAuthoringLint'

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
  'hunt-decoder-v0',
)

const PACK_PATH = path.join(PACK_DIR, 'pack.json')

interface HuntScenarioJson {
  id: string
  status: string
  decoder_tag?: string
  difficulty?: number
  user_role?: string
  lesson_connection?: string
  concept_tags?: string[]
  coach_validation?: HuntLintVariantMeta['coach_validation']
  choices: Array<{
    id: string
    label: string
    quality?: 'best' | 'acceptable' | 'wrong'
    feedback_text: string
    order: number
  }>
  scene?: HuntLintSceneInput & {
    camera?: string
    secondBeatPreAnswerOverlays?: unknown[]
    secondBeatPostAnswerOverlays?: unknown[]
    consequenceOverlays?: unknown[]
    answerDemo?: unknown[]
    wrongDemos?: Array<{ choiceId: string }>
  }
}

async function loadScenario(file: string): Promise<HuntScenarioJson> {
  const raw = await fs.readFile(path.join(PACK_DIR, file), 'utf8')
  const arr = JSON.parse(raw) as HuntScenarioJson[]
  return arr[0]!
}

describe('hunt-decoder-v0 pack manifest', () => {
  it('lists HUNT-01 and HUNT-02 with the expected files', async () => {
    const raw = await fs.readFile(PACK_PATH, 'utf8')
    const manifest = JSON.parse(raw) as {
      slug: string
      scenarios: Array<{ id: string; file: string; prerequisites: string[] }>
    }
    expect(manifest.slug).toBe('hunt-decoder-v0')
    const ids = manifest.scenarios.map((s) => s.id)
    expect(ids).toEqual(['HUNT-01', 'HUNT-02'])
    expect(manifest.scenarios[0]!.file).toBe('HUNT-01.json')
    expect(manifest.scenarios[1]!.file).toBe('HUNT-02.json')
    expect(manifest.scenarios[1]!.prerequisites).toEqual(['HUNT-01'])
  })
})

for (const id of ['HUNT-01', 'HUNT-02'] as const) {
  describe(`${id} — Pack 2 (Phase γ) HUNT base scenario authoring lock`, () => {
    it('parses through the runtime scene schema', async () => {
      const scenario = await loadScenario(`${id}.json`)
      expect(scenario.id).toBe(id)
      expect(() => sceneSchema.parse(scenario.scene)).not.toThrow()
    })

    it('declares decoder=HUNT_THE_ADVANTAGE and lesson_connection=chained-reads-intro', async () => {
      const scenario = await loadScenario(`${id}.json`)
      expect(scenario.decoder_tag).toBe('HUNT_THE_ADVANTAGE')
      expect(scenario.lesson_connection).toBe('chained-reads-intro')
    })

    it('authors both beatSpec.firstBeat and beatSpec.secondBeat', async () => {
      const scenario = await loadScenario(`${id}.json`)
      const beatSpec = scenario.scene?.beatSpec
      expect(beatSpec?.firstBeat).toBeDefined()
      expect(beatSpec?.secondBeat).toBeDefined()
      expect(typeof beatSpec!.firstBeat!.atMs).toBe('number')
      expect(typeof beatSpec!.secondBeat!.atMs).toBe('number')
      expect(beatSpec!.secondBeat!.atMs!).toBeGreaterThan(beatSpec!.firstBeat!.atMs!)
    })

    it('compresses cognitionHoldMs to the HUNT ceiling (≤1200)', async () => {
      const scenario = await loadScenario(`${id}.json`)
      const hold = scenario.scene?.timingOverrides?.cognitionHoldMs
      expect(typeof hold).toBe('number')
      expect(hold!).toBeLessThanOrEqual(1200)
    })

    it('tags both beat 1 and beat 2 with a mismatch help_pulse', async () => {
      const scenario = await loadScenario(`${id}.json`)
      const pre = scenario.scene?.preAnswerOverlays ?? []
      const beat1Pulse = pre.find(
        (o) =>
          o.kind === 'help_pulse' &&
          (o as { beat?: number }).beat === 1,
      )
      const beat2Pulse = pre.find(
        (o) =>
          o.kind === 'help_pulse' &&
          (o as { beat?: number }).beat === 2,
      )
      expect(beat1Pulse).toBeDefined()
      expect(beat2Pulse).toBeDefined()
    })

    it('passes lintHuntVariant LINT-HUNT-01..05', async () => {
      const scenario = await loadScenario(`${id}.json`)
      const result = lintHuntVariant(
        scenario.scene as HuntLintSceneInput,
        {
          id: scenario.id,
          decoder_tag: scenario.decoder_tag,
          coach_validation: scenario.coach_validation,
        },
        scenario.difficulty ?? 1,
      )
      expect(
        result.ok,
        `HUNT lint failures for ${id}: ${result.failures
          .map((f) => `${f.rule}: ${f.message}`)
          .join('\n')}`,
      ).toBe(true)
    })

    it('exposes one best read and a wrongDemo for every non-best choice', async () => {
      const scenario = await loadScenario(`${id}.json`)
      const best = scenario.choices.filter((c) => c.quality === 'best')
      expect(best).toHaveLength(1)
      const nonBestIds = scenario.choices
        .filter((c) => c.quality !== 'best')
        .map((c) => c.id)
      const demos = (scenario.scene?.wrongDemos ?? []).map((d) => d.choiceId)
      for (const choiceId of nonBestIds) {
        expect(demos).toContain(choiceId)
      }
    })
  })
}
