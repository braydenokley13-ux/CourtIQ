/**
 * Pack 2 (Phase δ) — DROP-03 base scenario authoring lock.
 *
 * Mirrors `drop02Seed.test.ts` for the new D3 low-man-tag variant.
 * Loads DROP-03, parses through the runtime scene schema, and runs
 * LINT-DROP-01..05 against it so authoring drift surfaces here rather
 * than at seed time. DROP-03 layers a second cue defender (the weak-
 * side low man) onto the existing screen-defender cue cluster; the
 * authoring contract is single-freeze (no secondBeat) plus a
 * help_pulse(role='tag') on a defender role-substring matching
 * `low_man_tag`.
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

const DROP_03_PATH = path.resolve(
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
  'DROP-03.json',
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
  choices?: ReadonlyArray<{
    id: string
    quality?: 'best' | 'acceptable' | 'wrong'
    label: string
    feedback_text?: string
  }>
  scene?: DropLintScenarioInput['scene'] & {
    camera?: string
    secondBeatPreAnswerOverlays?: unknown[]
    secondBeatPostAnswerOverlays?: unknown[]
    consequenceOverlays?: unknown[]
    answerDemo?: unknown[]
    wrongDemos?: Array<{ choiceId: string }>
  }
}

describe('DROP-03 — Pack 2 (Phase δ) low-man tag authoring lock', () => {
  it('pack manifest declares DROP-03 with prerequisites DROP-01 and DROP-02', async () => {
    const manifestRaw = await fs.readFile(PACK_PATH, 'utf8')
    const manifest = JSON.parse(manifestRaw) as {
      slug: string
      scenarios: Array<{ id: string; file: string; prerequisites: string[] }>
    }
    const entry = manifest.scenarios.find((s) => s.id === 'DROP-03')
    expect(entry).toBeDefined()
    expect(entry?.file).toBe('DROP-03.json')
    expect(entry?.prerequisites).toEqual(['DROP-01', 'DROP-02'])
  })

  it('parses through the runtime scene schema', async () => {
    const raw = await fs.readFile(DROP_03_PATH, 'utf8')
    const arr = JSON.parse(raw) as DropScenarioJson[]
    const scenario = arr[0]!
    expect(scenario.id).toBe('DROP-03')
    expect(scenario.scene).toBeDefined()
    expect(() => sceneSchema.parse(scenario.scene)).not.toThrow()
  })

  it('declares decoder=READ_THE_COVERAGE at D3 with the PnR ball-handler role', async () => {
    const raw = await fs.readFile(DROP_03_PATH, 'utf8')
    const arr = JSON.parse(raw) as DropScenarioJson[]
    const scenario = arr[0]!
    expect(scenario.decoder_tag).toBe('READ_THE_COVERAGE')
    expect(scenario.difficulty).toBe(3)
    expect(scenario.user_role).toBe('pnr_ball_handler')
  })

  it('is single-freeze — no secondBeat (D3 lands the two-cue cluster in one beat)', async () => {
    const raw = await fs.readFile(DROP_03_PATH, 'utf8')
    const arr = JSON.parse(raw) as DropScenarioJson[]
    const scenario = arr[0]!
    expect(scenario.scene?.beatSpec).toBeUndefined()
  })

  it('uses the DROP camera default (top_down)', async () => {
    const raw = await fs.readFile(DROP_03_PATH, 'utf8')
    const arr = JSON.parse(raw) as DropScenarioJson[]
    const scenario = arr[0]!
    expect(scenario.scene?.camera).toBe('top_down')
  })

  it('passes LINT-DROP-01..05', async () => {
    const raw = await fs.readFile(DROP_03_PATH, 'utf8')
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
      `DROP-03 lint failures: ${allIssues.map((i) => `${i.rule}: ${i.message}`).join('\n')}`,
    ).toEqual([])
  })

  it('declares a help_pulse(role=tag) on a low-man defender — the D3 second cue', async () => {
    const raw = await fs.readFile(DROP_03_PATH, 'utf8')
    const arr = JSON.parse(raw) as DropScenarioJson[]
    const scenario = arr[0]!
    const players = scenario.scene?.players ?? []
    const lowManId = players.find((p) => /low_man/i.test(p.role))?.id
    expect(lowManId, 'a player with role substring "low_man" is required').toBeDefined()
    const pre = scenario.scene?.preAnswerOverlays ?? []
    const tagPulse = pre.find(
      (o): o is { kind: 'help_pulse'; playerId: string; role?: string } =>
        o.kind === 'help_pulse',
    )
    expect(tagPulse).toBeDefined()
    expect(tagPulse?.playerId).toBe(lowManId)
    expect((tagPulse as { role?: string }).role).toBe('tag')
  })

  it('keeps the D1/D2 screen-defender body-cue trio alongside the new low-man cue', async () => {
    const raw = await fs.readFile(DROP_03_PATH, 'utf8')
    const arr = JSON.parse(raw) as DropScenarioJson[]
    const scenario = arr[0]!
    const pre = scenario.scene?.preAnswerOverlays ?? []
    const kinds = pre.map((o) => o.kind)
    expect(kinds).toContain('defender_chest_line')
    expect(kinds).toContain('defender_foot_arrow')
    expect(kinds).toContain('help_pulse')
  })

  it('exposes one best read and at least one wrong read that misreads the coverage', async () => {
    const raw = await fs.readFile(DROP_03_PATH, 'utf8')
    const arr = JSON.parse(raw) as DropScenarioJson[]
    const scenario = arr[0]!
    const choices = scenario.choices ?? []
    const best = choices.filter((c) => c.quality === 'best')
    expect(best).toHaveLength(1)
    const wrongs = choices.filter((c) => c.quality === 'wrong')
    expect(wrongs.length).toBeGreaterThanOrEqual(1)
  })

  it('declares a wrongDemo for every non-best choice', async () => {
    const raw = await fs.readFile(DROP_03_PATH, 'utf8')
    const arr = JSON.parse(raw) as DropScenarioJson[]
    const scenario = arr[0]!
    const choices = scenario.choices ?? []
    const nonBestIds = choices
      .filter((c) => c.quality !== 'best')
      .map((c) => c.id)
    const demos = (scenario.scene?.wrongDemos ?? []).map((d) => d.choiceId)
    for (const id of nonBestIds) {
      expect(demos).toContain(id)
    }
  })

  it('authors fully explicit delayMs + durationMs on every movement and demo step', async () => {
    const raw = await fs.readFile(DROP_03_PATH, 'utf8')
    const arr = JSON.parse(raw) as DropScenarioJson[]
    const scenario = arr[0]!
    const allMovements = [
      ...(scenario.scene?.movements ?? []),
      ...((scenario.scene as { answerDemo?: Array<{ delayMs?: number; durationMs?: number }> }).answerDemo ?? []),
      ...((scenario.scene?.wrongDemos ?? []).flatMap(
        (d) =>
          (d as { movements?: Array<{ delayMs?: number; durationMs?: number }> })
            .movements ?? [],
      )),
    ]
    for (const m of allMovements) {
      expect(typeof (m as { delayMs?: number }).delayMs).toBe('number')
      expect(typeof (m as { durationMs?: number }).durationMs).toBe('number')
    }
  })
})
