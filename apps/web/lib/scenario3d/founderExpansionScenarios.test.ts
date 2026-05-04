/**
 * Founder v0 — expansion-pack scenario seed validation.
 *
 * Locks the authoring shape of every Pack-1 expansion scenario added
 * after the original four (BDW-01 / AOR-01 / ESC-01 / SKR-01) so the
 * 20-scenario founder set has one parametrised authoring lock.
 *
 * The original four are covered by `founderScenarios.test.ts`. This
 * file mirrors those invariants for BDW-02..05, ESC-02..05,
 * SKR-02..05, and AOR-02..05.
 *
 *   - decoder_tag matches the founder decoder taxonomy
 *   - scene parses against the runtime sceneSchema
 *   - freeze marker lands inside the cue window
 *   - exactly one quality='best' choice; sequential order 1..N
 *   - every wrong / acceptable choice has a matching wrongDemos entry
 *   - pre-answer overlays are inside the schema's pre-answer allow-list
 *   - exactly one isUser; exactly one offensive hasBall
 *   - every overlay reference points at a real player id (or "ball")
 *   - all geometry is finite (no NaN/Infinity)
 *   - replay duration stays inside the 4 s budget
 *   - the scenario is registered in the pack manifest
 *   - clutter clusters are non-empty (cluster cap enforced softly)
 */

import { describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'

import { sceneSchema, type SceneInput } from './schema'
import {
  MAX_FREEZE_OVERLAYS_BEGINNER,
  MAX_REPLAY_OVERLAYS_BEGINNER,
} from './decoderOverlayPresets'

const SCENARIOS_DIR = path.resolve(
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

const PACK_PATH = path.join(SCENARIOS_DIR, 'pack.json')

interface FounderChoice {
  id: string
  quality?: 'best' | 'acceptable' | 'wrong'
  is_correct?: boolean
  order: number
}

interface FounderScenarioJson {
  id: string
  status: string
  decoder_tag?: string
  best_read?: string
  decoder_teaching_point?: string
  lesson_connection?: string
  feedback?: { correct: string; partial?: string; wrong: string }
  self_review_checklist?: string[]
  coach_validation?: {
    level: 'low' | 'medium' | 'high'
    status: 'not_needed' | 'needed' | 'reviewed' | 'approved'
  }
  choices: FounderChoice[]
  scene: unknown
}

async function loadFounder(
  filename: string,
  expectedId: string,
): Promise<FounderScenarioJson> {
  const raw = await fs.readFile(path.join(SCENARIOS_DIR, filename), 'utf8')
  const arr = JSON.parse(raw) as FounderScenarioJson[]
  expect(Array.isArray(arr)).toBe(true)
  const found = arr.find((r) => r.id === expectedId)
  expect(found, `${filename} must contain a record with id="${expectedId}"`).toBeDefined()
  return found as FounderScenarioJson
}

interface FounderSpec {
  id: string
  filename: string
  decoderTag:
    | 'BACKDOOR_WINDOW'
    | 'ADVANTAGE_OR_RESET'
    | 'EMPTY_SPACE_CUT'
    | 'SKIP_THE_ROTATION'
  freezeWindowMs: { min: number; max: number }
}

const EXPANSION: readonly FounderSpec[] = [
  // BDW-02..05 — Backdoor Window expansion.
  { id: 'BDW-02', filename: 'BDW-02.json', decoderTag: 'BACKDOOR_WINDOW', freezeWindowMs: { min: 1000, max: 2500 } },
  { id: 'BDW-03', filename: 'BDW-03.json', decoderTag: 'BACKDOOR_WINDOW', freezeWindowMs: { min: 1000, max: 2500 } },
  { id: 'BDW-04', filename: 'BDW-04.json', decoderTag: 'BACKDOOR_WINDOW', freezeWindowMs: { min: 1000, max: 2500 } },
  { id: 'BDW-05', filename: 'BDW-05.json', decoderTag: 'BACKDOOR_WINDOW', freezeWindowMs: { min: 1000, max: 2500 } },
  // ESC-02..05 — Empty-Space Cut expansion.
  { id: 'ESC-02', filename: 'ESC-02.json', decoderTag: 'EMPTY_SPACE_CUT', freezeWindowMs: { min: 1000, max: 2500 } },
  { id: 'ESC-03', filename: 'ESC-03.json', decoderTag: 'EMPTY_SPACE_CUT', freezeWindowMs: { min: 1000, max: 2500 } },
  { id: 'ESC-04', filename: 'ESC-04.json', decoderTag: 'EMPTY_SPACE_CUT', freezeWindowMs: { min: 1000, max: 2500 } },
  { id: 'ESC-05', filename: 'ESC-05.json', decoderTag: 'EMPTY_SPACE_CUT', freezeWindowMs: { min: 1000, max: 2500 } },
  // SKR-02..05 — Skip the Rotation expansion.
  { id: 'SKR-02', filename: 'SKR-02.json', decoderTag: 'SKIP_THE_ROTATION', freezeWindowMs: { min: 1000, max: 2500 } },
  { id: 'SKR-03', filename: 'SKR-03.json', decoderTag: 'SKIP_THE_ROTATION', freezeWindowMs: { min: 1000, max: 2500 } },
  { id: 'SKR-04', filename: 'SKR-04.json', decoderTag: 'SKIP_THE_ROTATION', freezeWindowMs: { min: 1000, max: 2500 } },
  { id: 'SKR-05', filename: 'SKR-05.json', decoderTag: 'SKIP_THE_ROTATION', freezeWindowMs: { min: 1000, max: 2500 } },
  // AOR-02..05 — Advantage or Reset expansion.
  { id: 'AOR-02', filename: 'AOR-02.json', decoderTag: 'ADVANTAGE_OR_RESET', freezeWindowMs: { min: 1000, max: 2500 } },
  { id: 'AOR-03', filename: 'AOR-03.json', decoderTag: 'ADVANTAGE_OR_RESET', freezeWindowMs: { min: 1000, max: 2500 } },
  { id: 'AOR-04', filename: 'AOR-04.json', decoderTag: 'ADVANTAGE_OR_RESET', freezeWindowMs: { min: 1000, max: 2500 } },
  { id: 'AOR-05', filename: 'AOR-05.json', decoderTag: 'ADVANTAGE_OR_RESET', freezeWindowMs: { min: 1000, max: 2500 } },
] as const

describe('Founder v0 — expansion-pack scenarios (16 reps)', () => {
  for (const spec of EXPANSION) {
    describe(spec.id, () => {
      it('parses as JSON and contains exactly one record with the matching id', async () => {
        const raw = await fs.readFile(path.join(SCENARIOS_DIR, spec.filename), 'utf8')
        const arr = JSON.parse(raw) as Array<{ id: string }>
        expect(Array.isArray(arr)).toBe(true)
        expect(arr.filter((r) => r.id === spec.id).length).toBe(1)
      })

      it('declares the matching decoder_tag', async () => {
        const s = await loadFounder(spec.filename, spec.id)
        expect(s.decoder_tag).toBe(spec.decoderTag)
      })

      it('is LIVE with coach_validation.status=approved', async () => {
        const s = await loadFounder(spec.filename, spec.id)
        expect(s.status).toBe('LIVE')
        expect(s.coach_validation, 'coach_validation must be authored').toBeDefined()
        expect(s.coach_validation?.status).toBe('approved')
      })

      it('ships every decoder authoring field required by the seed validator', async () => {
        const s = await loadFounder(spec.filename, spec.id)
        expect(s.best_read, 'best_read').toBeTruthy()
        expect(s.decoder_teaching_point, 'decoder_teaching_point').toBeTruthy()
        expect(s.lesson_connection, 'lesson_connection').toBeTruthy()
        expect(s.feedback?.correct, 'feedback.correct').toBeTruthy()
        expect(s.feedback?.wrong, 'feedback.wrong').toBeTruthy()
        expect(
          s.self_review_checklist && s.self_review_checklist.length >= 2,
          'self_review_checklist must have at least 2 entries',
        ).toBe(true)
      })

      it('has exactly one quality="best" choice; orders are sequential 1..N', async () => {
        const s = await loadFounder(spec.filename, spec.id)
        const best = s.choices.filter((c) => c.quality === 'best')
        expect(best.length).toBe(1)
        const ordered = [...s.choices].sort((a, b) => a.order - b.order)
        ordered.forEach((c, i) => {
          expect(c.order).toBe(i + 1)
        })
      })

      it('scene block parses against the runtime sceneSchema', async () => {
        const s = await loadFounder(spec.filename, spec.id)
        const result = sceneSchema.safeParse(s.scene)
        if (!result.success) {
          console.error(JSON.stringify(result.error.format(), null, 2))
        }
        expect(result.success).toBe(true)
      })

      it('freeze marker lands in the cue window', async () => {
        const s = await loadFounder(spec.filename, spec.id)
        const scene = sceneSchema.parse(s.scene)
        expect(scene.freezeMarker).toBeDefined()
        if (scene.freezeMarker?.kind === 'atMs') {
          expect(scene.freezeMarker.atMs).toBeGreaterThanOrEqual(spec.freezeWindowMs.min)
          expect(scene.freezeMarker.atMs).toBeLessThanOrEqual(spec.freezeWindowMs.max)
        }
      })

      it('every wrong / acceptable choice has a matching wrongDemos entry', async () => {
        const s = await loadFounder(spec.filename, spec.id)
        const scene = sceneSchema.parse(s.scene)
        const nonBestIds = s.choices.filter((c) => c.quality !== 'best').map((c) => c.id)
        const demoChoiceIds = new Set(scene.wrongDemos.map((d) => d.choiceId))
        for (const id of nonBestIds) {
          expect(demoChoiceIds.has(id), `wrongDemos missing entry for choice ${id}`).toBe(true)
        }
      })

      it('pre-answer overlays only use the schema allow-list kinds', async () => {
        const s = await loadFounder(spec.filename, spec.id)
        const scene = sceneSchema.parse(s.scene)
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

      it('cluster sizes fit the beginner clutter cap', async () => {
        const s = await loadFounder(spec.filename, spec.id)
        const scene = sceneSchema.parse(s.scene)
        expect(scene.preAnswerOverlays.length).toBeLessThanOrEqual(MAX_FREEZE_OVERLAYS_BEGINNER)
        expect(scene.postAnswerOverlays.length).toBeLessThanOrEqual(MAX_REPLAY_OVERLAYS_BEGINNER)
        expect(scene.preAnswerOverlays.length).toBeGreaterThan(0)
        expect(scene.postAnswerOverlays.length).toBeGreaterThan(0)
      })

      it('exactly one player is marked isUser; exactly one offensive player has hasBall', async () => {
        const s = await loadFounder(spec.filename, spec.id)
        const scene = sceneSchema.parse(s.scene)
        const users = scene.players.filter((p) => p.isUser)
        expect(users.length).toBe(1)
        const ballHolders = scene.players.filter((p) => p.team === 'offense' && p.hasBall)
        expect(ballHolders.length).toBe(1)
      })

      it('every overlay reference points at a real player id (or "ball")', async () => {
        const s = await loadFounder(spec.filename, spec.id)
        const scene: SceneInput = sceneSchema.parse(s.scene)
        const ids = new Set(scene.players.map((p) => p.id))
        const allowed = new Set<string>([...ids, 'ball'])
        const checkPlayerRef = (id: string, label: string) => {
          expect(allowed.has(id), `${label} references unknown id "${id}"`).toBe(true)
        }
        for (const ov of [...scene.preAnswerOverlays, ...scene.postAnswerOverlays]) {
          if ('playerId' in ov) checkPlayerRef(ov.playerId, `${ov.kind}.playerId`)
          if (ov.kind === 'passing_lane_open' || ov.kind === 'passing_lane_blocked') {
            checkPlayerRef(ov.from, `${ov.kind}.from`)
            checkPlayerRef(ov.to, `${ov.kind}.to`)
          }
          if (ov.kind === 'defender_vision_cone' && ov.targetId) {
            checkPlayerRef(ov.targetId, `${ov.kind}.targetId`)
          }
        }
      })

      it('all geometry is finite (no NaN / Infinity in starts, movements, overlays)', async () => {
        const s = await loadFounder(spec.filename, spec.id)
        const scene = sceneSchema.parse(s.scene)
        const numbers: number[] = []
        for (const p of scene.players) numbers.push(p.start.x, p.start.z)
        numbers.push(scene.ball.start.x, scene.ball.start.z)
        for (const m of scene.movements) numbers.push(m.to.x, m.to.z)
        for (const m of scene.answerDemo) numbers.push(m.to.x, m.to.z)
        for (const wd of scene.wrongDemos) {
          for (const m of wd.movements) numbers.push(m.to.x, m.to.z)
        }
        for (const ov of [...scene.preAnswerOverlays, ...scene.postAnswerOverlays]) {
          if ('anchor' in ov && typeof ov.anchor === 'object' && ov.anchor) {
            numbers.push(ov.anchor.x, ov.anchor.z)
          }
          if (ov.kind === 'drive_cut_preview') {
            for (const p of ov.path) numbers.push(p.x, p.z)
          }
        }
        for (const n of numbers) {
          expect(Number.isFinite(n)).toBe(true)
        }
      })

      it('replay duration stays inside the 4 s budget', async () => {
        const s = await loadFounder(spec.filename, spec.id)
        const scene = sceneSchema.parse(s.scene)
        let maxEnd = 0
        for (const m of scene.answerDemo) {
          const end = (m.delayMs ?? 0) + (m.durationMs ?? 0)
          if (end > maxEnd) maxEnd = end
        }
        expect(maxEnd).toBeLessThanOrEqual(4000)
      })

      it('is registered in the founder-v0 pack manifest', async () => {
        const raw = await fs.readFile(PACK_PATH, 'utf8')
        const manifest = JSON.parse(raw) as { scenarios: Array<{ id: string; file: string }> }
        const entry = manifest.scenarios.find((e) => e.id === spec.id)
        expect(entry).toBeDefined()
        expect(entry?.file).toBe(spec.filename)
      })
    })
  }

  it('the founder pack manifest covers the full 20-scenario expansion', () => {
    const expected = [
      'BDW-01',
      'BDW-02',
      'BDW-03',
      'BDW-04',
      'BDW-05',
      'ESC-01',
      'ESC-02',
      'ESC-03',
      'ESC-04',
      'ESC-05',
      'SKR-01',
      'SKR-02',
      'SKR-03',
      'SKR-04',
      'SKR-05',
      'AOR-01',
      'AOR-02',
      'AOR-03',
      'AOR-04',
      'AOR-05',
    ]
    return fs.readFile(PACK_PATH, 'utf8').then((raw) => {
      const manifest = JSON.parse(raw) as { scenarios: Array<{ id: string }> }
      const ids = new Set(manifest.scenarios.map((e) => e.id))
      for (const id of expected) {
        expect(ids.has(id), `pack.json missing ${id}`).toBe(true)
      }
      expect(manifest.scenarios.length).toBe(20)
    })
  })

  it('contains exactly 5 scenarios per decoder family', () => {
    return fs.readFile(PACK_PATH, 'utf8').then((raw) => {
      const manifest = JSON.parse(raw) as { scenarios: Array<{ id: string }> }
      const counts = { BDW: 0, ESC: 0, SKR: 0, AOR: 0 }
      for (const entry of manifest.scenarios) {
        const prefix = entry.id.split('-')[0] as keyof typeof counts
        if (prefix in counts) counts[prefix]++
      }
      expect(counts.BDW).toBe(5)
      expect(counts.ESC).toBe(5)
      expect(counts.SKR).toBe(5)
      expect(counts.AOR).toBe(5)
    })
  })
})
