/**
 * P1.5 — AOR-01 founder scenario seed validation.
 *
 * Phase P §6 (decoder mapping) and the P1.5 packet require an
 * Advantage-or-Reset scenario seed that ships:
 *   - A `decoder_tag` of `ADVANTAGE_OR_RESET`.
 *   - At least one defender movement of `kind: 'closeout'` driving
 *     the AOR cue (the closeout itself is the read).
 *   - A freeze marker that lands on the catch-and-read moment.
 *   - Choices in the standard 4-quality shape (best / acceptable /
 *     wrong / wrong) so the existing trainer + decoder UI can route
 *     each branch.
 *   - A `wrongDemos` entry for every wrong / acceptable choice so
 *     the consequence-replay path is exercised on every branch.
 *
 * This test is the smallest possible authoring lock on those rules.
 * It parses the bundled AOR-01.json against the runtime scene
 * schema (mirroring the strict validation the seeder applies) and
 * asserts the AOR-specific authoring discipline above. If a future
 * edit drops the closeout movement, breaks the freeze marker, or
 * regresses the decoder authoring fields, this test fires before
 * the seed reaches Prisma.
 *
 * The test does NOT round-trip the JSON through Prisma — that lives
 * in `scripts/seed-scenarios.ts` and runs at seed time. The job here
 * is to lock the file's shape in CI.
 */

import { describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { sceneSchema } from './schema'

const AOR_01_PATH = path.resolve(
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
  'AOR-01.json',
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
  'founder-v0',
  'pack.json',
)

interface AorScenarioJson {
  id: string
  status: string
  decoder_tag?: string
  best_read?: string
  decoder_teaching_point?: string
  lesson_connection?: string
  feedback?: { correct: string; partial?: string; wrong: string }
  self_review_checklist?: string[]
  choices: Array<{
    id: string
    label: string
    quality?: 'best' | 'acceptable' | 'wrong'
    is_correct?: boolean
    feedback_text: string
    order: number
  }>
  scene: unknown
}

async function loadAor01(): Promise<AorScenarioJson> {
  const raw = await fs.readFile(AOR_01_PATH, 'utf8')
  const arr = JSON.parse(raw) as AorScenarioJson[]
  expect(arr.length).toBeGreaterThan(0)
  const aor = arr.find((r) => r.id === 'AOR-01')
  expect(aor, 'AOR-01.json must contain a record with id="AOR-01"').toBeDefined()
  return aor as AorScenarioJson
}

describe('P1.5 — AOR-01 founder scenario seed', () => {
  it('AOR-01.json parses as JSON and contains exactly one record with id "AOR-01"', async () => {
    const raw = await fs.readFile(AOR_01_PATH, 'utf8')
    const arr = JSON.parse(raw) as Array<{ id: string }>
    expect(Array.isArray(arr)).toBe(true)
    const ids = arr.map((r) => r.id)
    expect(ids).toContain('AOR-01')
    // Only one — multi-record files would silently mask an id typo.
    expect(arr.filter((r) => r.id === 'AOR-01').length).toBe(1)
  })

  it('declares decoder_tag = ADVANTAGE_OR_RESET', async () => {
    const aor = await loadAor01()
    expect(aor.decoder_tag).toBe('ADVANTAGE_OR_RESET')
  })

  it('ships every decoder authoring field required by the seed validator', async () => {
    // Mirrors the `decoderRequired` block in scripts/seed-scenarios.ts.
    // If this test passes but the seeder rejects the file, the seeder's
    // contract has drifted from this test and one of the two needs to
    // catch up.
    const aor = await loadAor01()
    expect(aor.best_read, 'best_read').toBeTruthy()
    expect(aor.decoder_teaching_point, 'decoder_teaching_point').toBeTruthy()
    expect(aor.lesson_connection, 'lesson_connection').toBeTruthy()
    expect(aor.feedback?.correct, 'feedback.correct').toBeTruthy()
    expect(aor.feedback?.wrong, 'feedback.wrong').toBeTruthy()
    expect(
      aor.self_review_checklist && aor.self_review_checklist.length >= 2,
      'self_review_checklist must have at least 2 entries',
    ).toBe(true)
  })

  it('has exactly one choice with quality="best" and sequential order starting at 1', async () => {
    const aor = await loadAor01()
    // The seed validator's superRefine requires one and only one
    // quality='best'. Acceptable and wrong choices are unconstrained.
    const best = aor.choices.filter((c) => c.quality === 'best')
    expect(best.length, 'exactly one quality=best choice').toBe(1)
    // Order must be sequential 1..N.
    const ordered = [...aor.choices].sort((a, b) => a.order - b.order)
    ordered.forEach((c, i) => {
      expect(c.order, `choice ${c.id}.order must equal ${i + 1}`).toBe(i + 1)
    })
  })

  it('scene block parses against the runtime sceneSchema', async () => {
    const aor = await loadAor01()
    const result = sceneSchema.safeParse(aor.scene)
    if (!result.success) {
      // Print the formatted error so a CI failure surfaces the actual
      // schema violation instead of a generic assertion message.
      console.error(JSON.stringify(result.error.format(), null, 2))
    }
    expect(result.success).toBe(true)
  })

  it('has at least one defender movement with kind="closeout"', async () => {
    // P1.5 hard requirement. The closeout is the AOR read — without
    // it, the scenario teaches nothing that distinguishes AOR from
    // a generic catch-and-shoot. The defender's id begins with `x`
    // by convention; the team check is the load-bearing assertion.
    const aor = await loadAor01()
    const result = sceneSchema.parse(aor.scene)
    const defenderIds = new Set(
      result.players.filter((p) => p.team === 'defense').map((p) => p.id),
    )
    const closeouts = result.movements.filter(
      (m) => m.kind === 'closeout' && defenderIds.has(m.playerId),
    )
    expect(closeouts.length, 'at least one defender closeout').toBeGreaterThanOrEqual(1)
  })

  it('freeze marker lands on the catch-and-read moment (atMs in the 1.0–2.5 s window)', async () => {
    // Phase P §7 calls for the freeze to land on the cue moment.
    // For AOR that is the catch — ball arrived, defender mid-closeout.
    // The window is generous so future iteration on timing does not
    // require a test edit, but freezes outside [1000, 2500] ms are
    // almost certainly authoring mistakes.
    const aor = await loadAor01()
    const scene = sceneSchema.parse(aor.scene)
    expect(scene.freezeMarker, 'scene.freezeMarker must be set').toBeDefined()
    if (scene.freezeMarker?.kind === 'atMs') {
      expect(scene.freezeMarker.atMs).toBeGreaterThanOrEqual(1000)
      expect(scene.freezeMarker.atMs).toBeLessThanOrEqual(2500)
    } else {
      // beforeMovementId is allowed but not the v1 authoring choice.
      // If a future edit switches to it, that movement must still
      // land in the catch window — this assertion intentionally
      // does not lock that, but the test will need a follow-up.
      expect(scene.freezeMarker?.kind).toBe('beforeMovementId')
    }
  })

  it('every wrong / acceptable choice has a matching wrongDemos entry', async () => {
    // The seed validator already enforces the choiceId → wrongDemos
    // referential integrity, but this test asserts the inverse:
    // every non-best choice ships a consequence demo so the trainer's
    // wrong-read playback never falls back to "no demo authored".
    const aor = await loadAor01()
    const scene = sceneSchema.parse(aor.scene)
    const nonBestIds = aor.choices
      .filter((c) => c.quality !== 'best')
      .map((c) => c.id)
    const demoChoiceIds = new Set(scene.wrongDemos.map((d) => d.choiceId))
    for (const id of nonBestIds) {
      expect(demoChoiceIds.has(id), `wrongDemos missing entry for choice ${id}`).toBe(true)
    }
  })

  it('pre-answer overlays do not reveal the answer (only allow-listed kinds)', async () => {
    // Section 4.5 of the seed validator. The runtime schema enforces
    // the same; this is a belt-and-suspenders check at the seed file
    // boundary so an authoring mistake is caught before runtime.
    const aor = await loadAor01()
    const scene = sceneSchema.parse(aor.scene)
    const allowed = new Set([
      'defender_vision_cone',
      'defender_hip_arrow',
      'defender_foot_arrow',
      'defender_chest_line',
      'defender_hand_in_lane',
      'help_pulse',
      'label',
    ])
    for (const ov of scene.preAnswerOverlays) {
      expect(allowed.has(ov.kind), `pre-answer overlay ${ov.kind} not in allow-list`).toBe(
        true,
      )
    }
  })

  it('AOR-01 is registered in the founder-v0 pack manifest', async () => {
    const raw = await fs.readFile(PACK_PATH, 'utf8')
    const manifest = JSON.parse(raw) as {
      scenarios: Array<{ id: string; file: string }>
    }
    const entry = manifest.scenarios.find((s) => s.id === 'AOR-01')
    expect(entry, 'pack.json must list AOR-01').toBeDefined()
    expect(entry?.file).toBe('AOR-01.json')
  })

  it('does not flip any animation feature flag by default', async () => {
    // Authoring discipline: the AOR-01 seed does not get to flip
    // USE_GLB_ATHLETE_PREVIEW or USE_IMPORTED_CLOSEOUT_CLIP. Those
    // are runtime flags. If this test ever imports those flags and
    // they are not `false`, the P1.5 acceptance criteria failed.
    const { USE_GLB_ATHLETE_PREVIEW, USE_IMPORTED_CLOSEOUT_CLIP } = await import(
      '../../components/scenario3d/imperativeScene'
    )
    expect(USE_GLB_ATHLETE_PREVIEW).toBe(false)
    expect(USE_IMPORTED_CLOSEOUT_CLIP).toBe(false)
  })
})
